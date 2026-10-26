#!/usr/bin/env node
/**
 * Plan §9.3 — alerts E2E: place an alert, prove it fires EXACTLY ONCE, prove the ack.
 *
 * HEADLINE FINDING (graded, not guessed): THE ALERTS BELL IS DEAD UI.
 * Clicking it does state-change and load its chunk, yet nothing renders:
 *   - src/widget/VNInvestCharts.tsx:2944  every portalRoot fallback ends in `?? null`
 *   - src/widget/hooks/usePortalAdapter.ts:16-24  portalTarget is set ONLY from an injected
 *     `portalAdapter` prop or `contextPortalRoot`; there is no document.body default
 *   - src/widget/components/settings/AlertsModal.tsx:156  `if (!open || !portalTarget) return null`
 * No demo in src/demo/** passes `portalAdapter` or `portalRoot` (0 hits), so portalTarget is
 * always null and the modal is unreachable. Confirmed at runtime: the chunk
 * src_widget_components_settings_AlertsModal_tsx.*.js returns 200, the click is registered,
 * and the modal's form is absent from the DOM.
 *
 * So the whole alert lifecycle is currently ungradeable through the UI, and the plan's
 * "draw a trendline, place a price alert" flow is unreachable for a SECOND, independent
 * reason as well: the drawing-alert host is pro-gated
 *   - src/widget/VNInvestCharts.tsx:2873  tierGated.allows("alert_drawing") && ...
 *   - src/widget/alerts/DrawingAlertsHost.tsx:31  returns null when disabled
 *
 * GR1 UPDATE: ALERT-01/02 pass, so the flow now runs. ALERT-03 was FAILING because
 * THIS SCRIPT read `alert.sourceBValue` — a key that is not a member of
 * `AlertCondition` and that nothing in the repo writes. The threshold is
 * `sourceB.value` (see the formAsTyped comment below for the four agreeing call
 * sites). The predicate was corrected; no product code was changed to satisfy it,
 * and the modal was separately fixed for a real NaN->0 fabrication the step never
 * exercised. The self-test below now REJECTS the old top-level shape, so the
 * correction cannot silently regress.
 *
 * This script is written so it UPGRADES ITSELF: the moment ALERT-01 passes, the same run
 * falls through and grades the full lifecycle — create, data ticks, fires exactly once, ack,
 * no refire. The predicates are not decoration; the flow below is the one that will run.
 *
 * What the lifecycle will assert once reachable:
 *   - the alert persisted with the fields the script typed, re-read from localStorage
 *     (STORE) rather than from the form, so a mis-targeted control fails loudly
 *   - a real data tick: AlertManager is re-run from the effect at VNInvestCharts.tsx:789-801,
 *     whose deps include the active timeframe, so switching a footer timeframe chip
 *     (button[data-timeframe]) is a genuine re-evaluation, not a timer sleep
 *   - fires EXACTLY ONCE: AlertManager.ts:52-54 filters `!a.isTriggered`, so once acked the
 *     alert cannot re-fire; a counter of 2 is a FAIL
 *   - the ack is observable in the persisted record and in the list (Reset control +
 *     line-through, AlertsModal.tsx:415,435)
 *
 * OBSERVABILITY CAVEAT: a firing surfaces as a NATIVE dialog, not a DOM toast —
 * engine .../react/src/adapters/NotificationAdapter.ts:13-17 calls window.alert. The plan
 * says "toast"; the shipped adapter is a dialog. Counted via a Playwright `dialog`
 * listener so the page never blocks.
 *
 * Run:  npm run build:css && npm run watch
 *       node scripts/verify-alerts.cjs
 *       node scripts/verify-alerts.cjs --self-test   (negative cases only, no browser)
 */
"use strict";

const { chromium } = require("playwright");

const WATCH_URL = process.env.VN_WATCH_URL || "http://localhost:3000/?standalone=1";
const STORE = "vninvestcharts-widget_alerts"; // src/lib/alerts/AlertManager.ts:126
const BELL = '[data-testid="menu-alerts-btn"]';
// Selector is a data-testid, NOT the placeholder. The modal renders in the surface
// locale, so an English placeholder matched nothing on a Vietnamese surface and the
// suite reported "the modal never opens" while it had in fact been open the whole time.
// That is the same trap as `verify-export.cjs` hitting once already: match on text and
// the check silently stops testing anything.
const FORM = '[data-testid="alert-message"]';
const MSG = "d3e2e once-only probe";

let passed = 0;
let failed = 0;
let blocked = 0;
let gaps = 0;
/**
 * Set when the build under test cannot be Pro at all (a production bundle eliminates the
 * dev-only trust anchor by design). Every downstream step then reports THIS reason rather
 * than the generic "no alert can be created", so a blocked production run cannot be
 * misread as a broken product — which is exactly what the previous wording caused.
 */
let proBlockedReason = null;
const step = (name, ok, detail = "") => {
	ok ? passed++ : failed++;
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};
const why = (name, reason) => {
	blocked++;
	console.log(`BLOCK ${name} — ${reason}`);
};
const gap = (name, reason) => {
	gaps++;
	console.log(`GAP  ${name} — ${reason}`);
};

/** An alert must have fired, and must not have fired a second time. */
const firedOnce = (n) => n === 1;
const isAcked = (a) => a != null && a.isTriggered === true;
/**
 * The persisted record must match what the form was told to store.
 *
 * GR1: the threshold key is `sourceB.value`, NOT a top-level `sourceBValue`.
 * `AlertCondition` (src/lib/alerts/types.ts:15-33) has no such member,
 * `AlertEvaluator.getValue` (AlertEvaluator.ts:38-40) reads `source.value`, and
 * `AlertManager.saveAlerts` (AlertManager.ts:136) stringifies the array verbatim.
 * So the old `a.sourceBValue` was structurally guaranteed to be `undefined` —
 * ALERT-03 was the SUITE reading a key nothing writes, not the modal dropping
 * the field. Proof that no top-level `sourceBValue` can be produced:
 *   src/lib/alerts/__tests__/AlertsModal.buildAlert.test.ts
 *
 * `typeof === "number"` is load-bearing rather than belt-and-braces:
 * `Number(null)` is 0 and `Number(undefined)` is NaN, so the previous
 * `Number(a.sourceB?.value) === 0` would have ACCEPTED a record whose
 * threshold was never written. A fabricated zero must fail this step.
 */
const formAsTyped = (a) =>
	a != null &&
	a.condition === "greater_than" &&
	a.sourceB != null &&
	a.sourceB.type === "value" &&
	typeof a.sourceB.value === "number" &&
	Number.isFinite(a.sourceB.value) &&
	a.sourceB.value === 0 &&
	a.frequency === "once";
/** After an ack, further ticks must not produce further dialogs. */
const noRefire = (before, after) => after === before;

/**
 * ALERT-10: the modal stored a usable indicator source.
 *
 * `indicatorId` must be a NON-EMPTY id and `key` must be present. The bug this step
 * exists for was never a wrong value here — it was that the id was unresolvable
 * downstream, which ALERT-11 grades. So this step deliberately does NOT try to be clever
 * about what the id looks like; it only refuses a record with nothing to resolve.
 */
const indSourceStored = (a) =>
	a != null &&
	a.sourceA != null &&
	a.sourceA.type === "indicator" &&
	typeof a.sourceA.indicatorId === "string" &&
	a.sourceA.indicatorId.length > 0;

/**
 * ALERT-11: the indicator alert fired, i.e. its instance id WAS resolved to a canonical
 * key that exists in `indicatorValues`.
 *
 * `isAcked` is not reusable here: it would accept a PRICE alert too, and a price alert
 * is exactly what this step must not be satisfied by. Requiring the stored source to
 * still be `type: "indicator"` keeps the grade tied to the branch under test.
 */
const indFired = (a) => a != null && a.sourceA?.type === "indicator" && a.isTriggered === true;

/** ALERT-12: the resolver never reported an unresolvable indicator id. */
const noResolveErrors = (list) =>
	!list.some((e) => /indicator id .* is not among|has no canonical/.test(e));

const IND_MSG = "d3e2e indicator probe";
/** Threshold below any RSI value, so "fired" measures resolution and not market direction. */
const IND_THRESHOLD = -1;

/**
 * ALERT-09: ONE page error is a transport artifact of the dev proxy, not a defect.
 *
 * The widget's own teardown is correct and cannot be the fix: `subscribeKline` returns a
 * disposer that closes the socket only while it is CONNECTING or OPEN
 * (`BinanceAdapter.ts:401-405`), never when it is already closing or closed. "Ping
 * received after close" is the BROWSER reporting that the SERVER sent a ping frame that
 * was already in flight when the page sent Close — RFC 6455 forbids sending it, but the
 * dev proxy at `/binance-ws-proxy` does, and the browser raises `error` for it. The
 * client did nothing wrong and cannot prevent it without leaking sockets.
 *
 * The only trigger in this suite is teardown: every timeframe switch unsubscribes the
 * previous stream, which closes a live socket. More switches, more artifacts — which is
 * why this step became flakier as ALERT-10..12 were added.
 *
 * The match is anchored and total, deliberately. A socket that never opened is a real
 * defect and still fails: "Connection refused", a bare `failed`, an empty message, and
 * anything merely CONTAINING the phrase are all refused by the classifier below. This is
 * not a websocket-shaped blanket pass, and the discounted ones are counted and printed in
 * the step detail so they can never accumulate unnoticed.
 */
const isTransportTeardownArtifact = (msg) =>
	typeof msg === "string" &&
	/^WebSocket connection to '\S+' failed: Ping received after close$/.test(msg);

/** Graded list is "everything not discounted" — so the discount cannot accumulate. */
const pageErrorsAreClean = (list) => (Array.isArray(list) ? list : []).filter((e) => !isTransportTeardownArtifact(e)).length === 0;

let PASSED = 0;
const fail = (m) => {
	console.error(`FAIL selftest: ${m}`);
	process.exit(1);
};
const mustBe = (cond, m) => {
	if (!cond) fail(m);
	PASSED++;
};

// ---------------------------------------------------------------- self-test
if (process.argv.includes("--self-test")) {
	mustBe(firedOnce(1), "rejected a single firing");
	mustBe(!firedOnce(0), "accepted zero firings");
	mustBe(!firedOnce(2), "accepted a double firing");
	mustBe(isAcked({ isTriggered: true }), "rejected an acked alert");
	mustBe(!isAcked({ isTriggered: false }), "accepted an unacked alert");
	mustBe(!isAcked(null), "accepted a missing alert");
	mustBe(!isAcked({ isTriggered: "true" }), "accepted a stringly-typed ack");
	// The real persisted shape.
	mustBe(formAsTyped({ condition: "greater_than", sourceB: { type: "value", value: 0 }, frequency: "once" }), "rejected the real persisted shape");
	mustBe(formAsTyped({ condition: "greater_than", sourceB: { type: "value", value: 0 }, frequency: "once", message: MSG }), "rejected the real shape with extra fields");
	// GR1 REGRESSION LOCK: the shape the old predicate was fed. The top-level
	// sourceBValue is not a member of AlertCondition, so a record carrying it and
	// nothing under sourceB MUST now fail — otherwise this step is a no-op.
	mustBe(!formAsTyped({ condition: "greater_than", sourceBValue: 0, frequency: "once" }), "accepted the never-written top-level sourceBValue");
	mustBe(!formAsTyped({ condition: "greater_than", sourceBValue: "0", frequency: "once" }), "accepted a stringly-typed top-level sourceBValue");
	// Missing / null / undefined / NaN must NOT read as 0.
	mustBe(!formAsTyped({ condition: "greater_than", sourceB: { type: "value" }, frequency: "once" }), "accepted a missing threshold");
	mustBe(!formAsTyped({ condition: "greater_than", sourceB: { type: "value", value: null }, frequency: "once" }), "accepted a null threshold as 0");
	mustBe(!formAsTyped({ condition: "greater_than", sourceB: { type: "value", value: undefined }, frequency: "once" }), "accepted an undefined threshold as 0");
	mustBe(!formAsTyped({ condition: "greater_than", sourceB: { type: "value", value: NaN }, frequency: "once" }), "accepted a NaN threshold");
	mustBe(!formAsTyped({ condition: "greater_than", sourceB: { type: "value", value: "0" }, frequency: "once" }), "accepted a stringly-typed threshold");
	// Wrong value, wrong condition, wrong frequency, wrong sourceB type.
	mustBe(!formAsTyped({ condition: "greater_than", sourceB: { type: "value", value: 1 }, frequency: "once" }), "accepted the wrong threshold");
	mustBe(!formAsTyped({ condition: "crossing", sourceB: { type: "value", value: 0 }, frequency: "once" }), "accepted a crossing condition");
	mustBe(!formAsTyped({ condition: "greater_than", sourceB: { type: "value", value: 0 }, frequency: "continuous" }), "accepted a continuous frequency");
	mustBe(!formAsTyped({ condition: "greater_than", sourceB: { type: "price", key: "close", value: 0 }, frequency: "once" }), "accepted a price sourceB carrying a value");
	mustBe(!formAsTyped({ condition: "greater_than", sourceB: null, frequency: "once" }), "accepted a null sourceB");
	mustBe(!formAsTyped(null), "accepted a missing alert record");
	mustBe(!formAsTyped(undefined), "accepted an undefined alert record");
	mustBe(noRefire(1, 1), "rejected a stable counter");
	mustBe(!noRefire(1, 2), "accepted a refire after ack");

	// --- indicator branch (S3). Every negative below must fail, or the step is vacuous.
	// A price alert MUST NOT satisfy indFired: that is the whole reason indFired is a
	// separate predicate from isAcked rather than a reuse of it.
	mustBe(indSourceStored({ sourceA: { type: "indicator", indicatorId: "rsi-1", key: "line" } }), "rejected a real indicator source");
	mustBe(!indSourceStored({ sourceA: { type: "price", key: "close" } }), "accepted a price source as an indicator source");
	mustBe(!indSourceStored({ sourceA: { type: "indicator", indicatorId: "" } }), "accepted an empty indicator id");
	mustBe(!indSourceStored({ sourceA: { type: "indicator" } }), "accepted a missing indicator id");
	mustBe(!indSourceStored({ sourceA: { type: "indicator", indicatorId: 42 } }), "accepted a numeric indicator id");
	mustBe(!indSourceStored(null), "accepted a missing record");

	mustBe(indFired({ sourceA: { type: "indicator", indicatorId: "rsi-1" }, isTriggered: true }), "rejected a fired indicator alert");
	mustBe(!indFired({ sourceA: { type: "indicator", indicatorId: "rsi-1" }, isTriggered: false }), "accepted an UNFIRED indicator alert — the S3 defect would pass this");
	mustBe(!indFired({ sourceA: { type: "price", key: "close" }, isTriggered: true }), "a PRICE alert satisfied the indicator grade");
	mustBe(!indFired(null), "accepted a missing record");

	mustBe(noResolveErrors([]), "rejected an empty error list");
	mustBe(noResolveErrors(["Unrelated: websocket ping received after close"]), "rejected an unrelated page error");
	mustBe(!noResolveErrors(['Alert "x": indicator id rsi-9 is not among the 5 series the evaluator was given.']), "accepted a C2 unresolved-id report");
	mustBe(!noResolveErrors(['Alert "x": series StrengthElder (se-1) has no canonical indicator key']), "accepted a C3 no-canonical-key report");

	// --- ALERT-09's classifier. Narrow on purpose.
	//
	// A socket that never opened is a real defect and must still fail this suite. Only
	// the one signature that means "the page had already closed a live socket" is
	// discounted. "Connection refused", "failed to open", a bare socket error: none of
	// them are discounted, so this cannot become a websocket-shaped blanket pass.
	const ARTIFACT = "WebSocket connection to 'ws://localhost:3000/binance-ws-proxy/ws/btcusdt@kline_15m' failed: Ping received after close";
	mustBe(isTransportTeardownArtifact(ARTIFACT), "rejected the exact teardown artifact it exists for");
	mustBe(isTransportTeardownArtifact(ARTIFACT.replace("kline_15m", "kline_5m")), "rejected the same artifact on another stream");
	// Every near-miss below must NOT be discounted.
	mustBe(!isTransportTeardownArtifact("WebSocket connection to 'ws://x/ws/a' failed: Ping received after close. Extra trailing text."), "discounted a longer message that merely contains the phrase");
	mustBe(!isTransportTeardownArtifact("WebSocket connection to 'ws://x/ws/a' failed: Connection refused"), "discounted a refused connection");
	mustBe(!isTransportTeardownArtifact("WebSocket connection to 'ws://x/ws/a' failed"), "discounted an unclassified socket failure");
	mustBe(!isTransportTeardownArtifact("TypeError: cannot read x of undefined"), "discounted an ordinary page error");
	mustBe(!isTransportTeardownArtifact('Alert "x": indicator id rsi-9 is not among the 5 series'), "discounted a C2 report");
	mustBe(!isTransportTeardownArtifact(""), "discounted an empty string");
	mustBe(!isTransportTeardownArtifact(null), "discounted null");

	// The classification must not be able to hide a whole class on its own: the graded
	// list is "everything not discounted", so two artifacts plus one real error is still
	// a failure.
	mustBe(!pageErrorsAreClean([ARTIFACT, ARTIFACT, "TypeError: boom"]), "passed with two artifacts and a real error");

	console.log(`RESULT: ${PASSED}/${PASSED} PASS`);
	process.exit(0);
}

// ---------------------------------------------------------------- browser run
(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	const errors = [];
	let dialogs = 0;
	let modalChunk = 0;
	page.on("pageerror", (e) => errors.push(String(e).split("\n")[0].slice(0, 160)));
	page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
	page.on("response", (r) => {
		if (/AlertsModal_tsx/.test(r.url())) modalChunk = r.status();
	});
	// Native alerts: count them, then dismiss so the page never blocks.
	page.on("dialog", async (d) => {
		if (d.type() === "alert") dialogs++;
		await d.dismiss().catch(() => {});
	});
	await page.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
	await page.waitForSelector('[data-testid="vninvest-charts"]', { timeout: 60000 });
	await page.waitForTimeout(2500);
	step("ALERT-00 widget mounted", true);

	const readAlerts = () =>
		page.evaluate((key) => {
			try {
				return JSON.parse(localStorage.getItem(key) || "[]");
			} catch {
				return null;
			}
		}, STORE);
	await page.evaluate((key) => localStorage.removeItem(key), STORE);

	/**
	 * Re-open the modal over whatever is already stored.
	 *
	 * The alert list only exists while the modal is mounted, so any step that grades the
	 * LIST has to open it first. ALERT-06 fails today for exactly this reason: the script
	 * presses Escape after creating and then asserts against a list that is not in the
	 * DOM. That is a harness bug, not a product one — measured: closed modal yields 0
	 * matching rows, reopened yields 6, and the row's buttons are ["Đặt lại", "Xóa"].
	 */
	const reopenModal = async () => {
		await page.locator(BELL).first().click();
		await page.waitForSelector(FORM, { timeout: 20000 });
		await page.waitForTimeout(400);
	};

	const storedAlerts = () => readAlerts();

	/**
	 * Close the alerts modal and WAIT for it to actually go away.
	 *
	 * The bare `keyboard.press("Escape")` plus a fixed sleep was intermittently leaving the
	 * modal mounted. Its backdrop is `position: fixed; inset: 0`, so the next timeframe-chip
	 * click then failed with `locator.click: Timeout 10000ms exceeded` — an error that names a
	 * chip, when the real cause was a dialog the script had not finished dismissing. That is
	 * the same defect as grading the alert list while the modal was closed: the assertion was
	 * aimed at a surface whose state the script had not actually established.
	 *
	 * So the close is asserted, not assumed. A failure here says the modal stayed open, which
	 * is a real product finding, instead of surfacing later as a click timeout somewhere else.
	 */
	const closeModal = async () => {
		// How many Escapes does it actually take? Measured rather than assumed, because a lost
		// event and a broken handler look identical from here.
		let presses = 0;
		for (let attempt = 1; attempt <= 3; attempt++) {
			presses = attempt;
			await page.keyboard.press("Escape").catch(() => {});
			if ((await page.locator(FORM).count()) === 0) {
				if (presses > 1) {
					console.log(`[harness] NOTE: the modal needed ${presses} Escape presses to close`);
				}
				await page.waitForTimeout(200);
				return;
			}
			await page.waitForTimeout(300);
		}
		throw new Error(
			`the alerts modal survived ${presses} Escape presses while the form stayed in the DOM — ` +
				"its fixed backdrop would swallow every later click, so this must be reported here " +
				"rather than as a timeout somewhere else",
		);
	};

	/**
	 * Address one form control by its data-testid, asserting it is actually on screen.
	 *
	 * Every select used to be found two wrong ways, both of which fail silently. By INDEX
	 * (`selects.nth(2..4)`): correct by luck, because picking `value` for source B renders an
	 * `<input>` instead of a `<select>`, so every select after it shifts — the day the form
	 * changes shape these retarget a different control while still reporting green. Then by
	 * translated text: `verify-export.cjs` hit that once and the header records it.
	 *
	 * The assertion matters as much as the selector. Without it a renamed or removed testid
	 * degrades into `.first()` picking something else present, which is exactly how a harness
	 * ends up green while testing nothing.
	 */
	const requireField = async (id, value) => {
		const sel = `[data-testid="${id}"]`;
		if ((await page.locator(sel).count()) === 0) {
			throw new Error(`no control rendered with data-testid="${id}"`);
		}
		const control = page.locator(sel).first();
		if (value !== undefined) await control.selectOption(value);
		return control;
	};


	// -- the bell, and whether it does anything
	const b64url = (buf) => Buffer.from(buf).toString("base64url");

	/**
	 * Mint a signed Pro licence and install it BEFORE any app code runs.
	 *
	 * `alert_local` is Pro (`minTierFor` — engine `capabilities.ts:135`) and the widget now
	 * gates the surface on it, so the functional half of this suite can only run at Pro.
	 * This is the same mechanism `verify-offline-license.cjs` uses and which ledger §4 of
	 * batch 6 settled: the engine exposes `setLicensePublicKey` behind a dev-only global, so
	 * a harness can generate its own P-256 pair, register the public half, and sign a licence
	 * nothing else could have signed. Minting is the only way in; there is no `?tier=pro`.
	 *
	 * The accessor on `globalThis` must be installed in an init script, not polled. The
	 * provider assigns its hook object with a plain assignment at module scope
	 * (`SaaSFeatureContext.tsx:72-74`), so an accessor catches it SYNCHRONOUSLY — during
	 * module evaluation, before React renders. Polling would race the provider's first
	 * validation pass, and a lost race reads as "invalid licence" while the product is
	 * behaving correctly.
	 */
	async function armProTier(page) {
		const { publicKey, privateKey } = await crypto.subtle.generateKey(
			{ name: "ECDSA", namedCurve: "P-256" },
			true,
			["sign", "verify"],
		);
		const jwk = await crypto.subtle.exportKey("jwk", publicKey);
		const payload = new TextEncoder().encode(
			JSON.stringify({ t: "pro", e: Math.floor(Date.now() / 1000) + 86400 * 30 }),
		);
		const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, payload);
		const license = `vni1.${b64url(payload)}.${b64url(new Uint8Array(sig))}`;

		await page.addInitScript(
			([slot, lic, pub]) => {
				// The dev hook is gated on `typeof process !== "undefined" && process.env.NODE_ENV !== "production"`
				// (SaaSFeatureContext.tsx), and `process` does not exist in a browser bundle unless
				// webpack injects it. Without this shim the hook is never assigned at all — measured:
				// the licence sits in storage, `__VNI_DEV_LICENSE__` is undefined, and the tier stays
				// free. This defines the value webpack's own `optimization.nodeEnv` bakes in for
				// mode:"development", so the same branch runs with no product change. Same shim, same
				// reasoning, as verify-offline-license.cjs.
				try {
					if (typeof process === "undefined") {
						globalThis.process = { env: { NODE_ENV: "development" } };
					}
				} catch { /* ignore */ }
				try {
					localStorage.clear();
					sessionStorage.clear();
				} catch { /* ignore */ }
				localStorage.setItem(slot, lic);
				let hook = null;
				try {
					Object.defineProperty(globalThis, "__VNI_DEV_LICENSE__", {
						configurable: true,
						enumerable: false,
						get() { return hook; },
						set(v) {
							hook = v;
							// Record that the APP assigned it. Checking `"__VNI_DEV_LICENSE__" in
							// globalThis` instead would always be true — the init script below
							// defines the property itself, so that test measures the harness, not the
							// bundle. Same flag name verify-offline-license.cjs uses.
							window.__VNSC_ANCHOR_INSTALLED__ = true;
							if (v && typeof v.setLicensePublicKey === "function") v.setLicensePublicKey(pub);
						},
					});
				} catch { /* ignore */ }
			},
			["vni_license_key", license, jwk],
		);
		return license;
	}

	const bell = page.locator(BELL);
	step("ALERT-01 the alerts bell is rendered and enabled", (await bell.count()) > 0 && (await bell.first().isEnabled()));

	// -- free tier: the surface must NOT be usable ------------------------------
	//
	// Graded BEFORE arming Pro, because at Pro this is all true by design and the assertion
	// would be vacuous. `alert_drawing` moves here too, because it is also Pro: at Pro the
	// DrawingAlertsHost mounts, so keeping that row in the Pro phase would fail by
	// construction.
	if ((await bell.count()) > 0) {
		const [popup] = await Promise.all([
			page.waitForEvent("popup", { timeout: 8000 }).catch(() => null),
			bell.first().click(),
		]);
		const stillClosed = (await page.locator(FORM).count()) === 0;
		step("ALERT-13 the alerts surface is locked at free tier (alert_local is Pro)", stillClosed,
			stillClosed
				? `modal stayed closed${popup ? ", click redirected to the upgrade page" : ""}`
				: "PRODUCT BUG: the alerts form rendered at free tier");
	} else {
		step("ALERT-13 the alerts surface is locked at free tier (alert_local is Pro)", false,
			"the bell is not in the DOM, so neither is the gate");
	}
	step("ALERT-08 drawing-alert toast is blocked at free",
		(await page.locator(".vnsc-alert-host").count()) === 0,
		"DrawingAlertsHost unmounted at free [alert_drawing is Pro]");

	// -- Pro tier: the real flow ------------------------------------------------
	await armProTier(page);
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="vninvest-charts"]', { timeout: 60000 });
	await page.waitForTimeout(2500);

	if ((await bell.count()) === 0) {
		step("ALERT-02 clicking the bell opens the alerts modal", false, "the bell is not in the DOM at all");
	} else {
		await bell.first().click();
		const opened = await page
			.waitForSelector(FORM, { timeout: 15000 })
			.then(() => true)
			.catch(() => false);

		if (!opened) {
			// Distinguish "the product is broken" from "this build cannot be Pro at all".
			//
			// The harness reaches Pro by minting a licence and registering the public half
			// through the engine's dev-only `__VNI_DEV_LICENSE__` global. A real production build
			// ELIMINATES that branch, by design — `devLicenseHook.production.test.ts` fails the
			// build if it ever reappears. So on a production bundle the tier stays free, the
			// `alert_local` gate holds, and the modal correctly does not open.
			//
			// Reporting that as "PRODUCT BUG ... portalRoot defaults to null" — which is what
			// this step used to say — points the next reader at a portal bug that does not exist.
			// So check for the anchor and say which of the two it is.
			const anchorInstalled = await page.evaluate(() => window.__VNSC_ANCHOR_INSTALLED__ === true);
			if (!anchorInstalled) {
				proBlockedReason =
					"this build has no dev-only trust anchor (__VNI_DEV_LICENSE__ is absent, which a " +
					"production build does on purpose - see devLicenseHook.production.test.ts), so the " +
					"harness cannot arm Pro and alert_local correctly stays locked at free";
				why("ALERT-02 clicking the bell opens the alerts modal (Pro)", proBlockedReason);
			} else {
				step("ALERT-02 clicking the bell opens the alerts modal (Pro)", false,
					`PRODUCT BUG at Pro: no form in the DOM although the chunk answered ${modalChunk || "never requested"} — ` +
						"VNInvestCharts.tsx defaults portalRoot to null, usePortalAdapter.ts:16-24 " +
						"never sets a target, so AlertsModal.tsx:156 returns null");
			}
		} else {
			step("ALERT-02 clicking the bell opens the alerts modal (Pro)", true, "modal rendered");
		}
	}

	// Everything below is the real flow. It runs only once the modal exists, so this script
	// grades the lifecycle the day the portal root is fixed instead of being rewritten.
	if (await page.locator(FORM).count()) {
		// Every select is addressed by data-testid. They used to be `selects.nth(2..4)`, which
		// was correct BY LUCK: picking `value` for source B renders an <input> instead of a
		// <select>, so every select after it shifts by one, and the day the form changes shape
		// these locators would silently retarget a different control while still reporting green.
		// That is the family of failure `verify-export.cjs` hit once, recorded in the header above.
		// Every field is still re-asserted from the persisted record rather than trusted.
		await requireField("alert-condition", "greater_than");
		await requireField("alert-source-b-type", "value");
		await page.locator('[data-testid="alert-threshold"]').first().fill("0");
		// Graded as a SET, not just a value: an option that cannot be honoured is the same
		// defect as the form rendering "Close" while storing "line". `once_per_bar_close` is
		// absent because it behaved identically to `once_per_bar` and the bar-close flag it
		// would need does not exist on the enriched datum.
		const offeredFrequencies = await page.locator('[data-testid="alert-frequency"] option').evaluateAll((os) => os.map((o) => o.value));
		step("ALERT-14 the frequency dropdown offers only honoured options",
			!offeredFrequencies.includes("once_per_bar_close") && offeredFrequencies.length === 3,
			`offered: ${JSON.stringify(offeredFrequencies)}`);

		await requireField("alert-frequency", "once");
		await page.fill(FORM, MSG);
		await page.locator('[data-testid="alert-create"]').click();
		await page.waitForTimeout(1200);

		const mine = (await readAlerts() || []).find((a) => a.message === MSG);
		step("ALERT-03 the alert persisted with the fields the script typed", formAsTyped(mine),
			mine
				? `condition=${mine.condition} sourceB=${JSON.stringify(mine.sourceB)} freq=${mine.frequency}`
				: "no stored alert");

		await closeModal();

		const tick = async (tf) => {
			const chip = page.locator(`[data-testid="timeframe-footer"] button[data-timeframe="${tf}"]`);
			if ((await chip.count()) === 0) return false;
			await chip.click({ timeout: 10000 });
			await page.waitForTimeout(2500);
			return true;
		};
		const ticks = [];
		for (const tf of ["5m", "15m", "1m", "5m"]) {
			if (await tick(tf)) ticks.push(tf);
			await page.waitForTimeout(500);
		}
		step("ALERT-04 the alert fires exactly once across data ticks", firedOnce(dialogs),
			`${dialogs} dialog(s) over ${ticks.length} ticks [${ticks.join(">")}]`);

		const fired = (await readAlerts() || []).find((a) => a.message === MSG);
		step("ALERT-05 the fired alert is acked in the persisted state", isAcked(fired),
			fired ? `isTriggered=${fired.isTriggered}` : "alert vanished");
		// The list only exists while the modal is mounted, and the script closed it after
		// creating the alert — so this assertion was grading a list that was not in the DOM.
		// Measured: closed modal => 0 matching rows, reopened => 6, row buttons
		// ["Đặt lại", "Xóa"]. Reopen, grade, then close again: the modal's backdrop is
		// `position: fixed; inset: 0` and would swallow the timeframe clicks ALERT-07 needs.
		await reopenModal();
		const reset = page.locator("div", { hasText: MSG }).filter({ hasText: /Đặt lại|Reset/ }).first();
		step("ALERT-06 the ack is visible in the alert list", (await reset.count()) > 0, "row offers a Reset control");
		await closeModal();


		const before = dialogs;
		for (const tf of ["15m", "1m", "15m"]) {
			await tick(tf);
			await page.waitForTimeout(400);
		}
		step("ALERT-07 an acked alert does not re-fire", noRefire(before, dialogs), `${before} -> ${dialogs} dialog(s)`);

		// ---- ALERT-10: the indicator branch (S3) --------------------------------------
		//
		// This is the only lock for the WIRING. Everything else in the alert unit tests
		// `AlertManager`, which behaves identically whether or not it is handed a usable
		// series list: AlertManager.test.ts:143 calls checkAlerts with `activeSeries: []`
		// against a PRICE alert and passes either way. The defect was never in AlertManager
		// — it was in which series the widget decided to hand it, so it can only be caught
		// from a browser.
		//
		// Before S3 that list was built from `settings.visiblePanes` minus a type blacklist.
		// The demo's indicators live in momentum/orderflow/strength, all `visible: false`, so
		// the list was empty on every tick and 100% of indicator-sourced alerts were inert:
		// the modal persisted an instance uuid that nothing could resolve to a canonical key.
		// Measured at the time: `resolveSource {"seriesCount":0,"found":false}` per tick.
		//
		// The alert below is created through the modal on purpose. Seeding one in
		// localStorage would test AlertManager, which is the mistake that let this ship.
		await reopenModal(page);
		await requireField("alert-source-a-type", "indicator"); // source A -> indicator
		await page.waitForTimeout(400);
		await requireField("alert-condition", "greater_than");
		await requireField("alert-source-b-type", "value"); // source B -> literal threshold
		await page.locator('[data-testid="alert-threshold"]').first().fill(String(IND_THRESHOLD));
		await requireField("alert-frequency", "once");
		await page.fill(FORM, IND_MSG);
		await page.locator('[data-testid="alert-create"]').click();
		await page.waitForTimeout(600);

		const indStored = await storedAlerts(page);
		const indAlert = indStored.find((a) => a.message === IND_MSG);
		step("ALERT-10 an indicator-sourced alert is created and stored",
			indSourceStored(indAlert),
			indAlert ? `indicatorId=${indAlert.sourceA?.indicatorId} key=${indAlert.sourceA?.key}` : "not stored");

		// An alert is only evaluated when the enriched data changes, so a freshly created
		// one needs a tick exactly like the price alert does. Reading straight after the
		// click measures nothing but the absence of a tick.
		await closeModal();

		for (const tf of ["5m", "15m"]) {
			await tick(tf);
			await page.waitForTimeout(400);
		}
		const indFiredRec = (await storedAlerts(page)).find((a) => a.message === IND_MSG);
		step("ALERT-11 the indicator alert resolves its instance id and fires",
			indFired(indFiredRec),
			indFiredRec ? `isTriggered=${indFiredRec.isTriggered} sourceA=${JSON.stringify(indFiredRec.sourceA)}` : "alert vanished");

		// And the console must not have been told the id could not be resolved. A silent
		// unresolvable id is the exact failure S3 removed; C2 now reports it, so an absence
		// of this error is a positive signal rather than a vacuous one.
		step("ALERT-12 no unresolved-indicator error was reported", noResolveErrors(errors),
			errors.length ? `${errors.filter((e) => /is not among|has no canonical/.test(e)).length} of ${errors.length} page error(s)` : `checked ${errors.length} page error(s)`);
	} else {
		for (const n of ["ALERT-03 the alert persisted with the fields the script typed",
			"ALERT-04 the alert fires exactly once across data ticks",
			"ALERT-05 the fired alert is acked in the persisted state",
			"ALERT-06 the ack is visible in the alert list",
			"ALERT-07 an acked alert does not re-fire",
			"ALERT-10 an indicator-sourced alert is created and stored",
			"ALERT-11 the indicator alert resolves its instance id and fires",
			"ALERT-12 no unresolved-indicator error was reported",
			"ALERT-14 the frequency dropdown offers only honoured options"]) {
			why(n, proBlockedReason || "no alert can be created: the modal never renders, so the flow cannot start");
		}
	}

	gap("drawing-alert toast fires at pro and acks from the toast",
		"alert_drawing is Pro and this run now REACHES Pro, but drawing the shape and reading " +
		"its toast is a separate flow this suite does not drive");
	gap("price alert shown as a DOM toast rather than a native dialog",
		"engine NotificationAdapter.ts:13-17 calls window.alert; the plan wording says toast");

	const artifacts = errors.filter((e) => isTransportTeardownArtifact(e));
	const real = errors.filter((e) => !isTransportTeardownArtifact(e));
	step("ALERT-09 zero unclassified page errors", pageErrorsAreClean(errors),
		`${real.length} real, ${artifacts.length} transport teardown artifact(s) discounted` +
			(real.length ? `: ${real.slice(0, 2).join(" | ")}` : ""));
	await browser.close();
	console.log(
		`RESULT: ${passed}/${passed + failed} ${failed ? "FAIL" : "PASS"} | ` +
		`${blocked} blocked | ${gaps} recorded gap(s)`,
	);
	process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
	console.error(`HARNESS ERROR: ${e && e.stack ? e.stack.split("\n")[0] : e}`);
	process.exit(1);
});
