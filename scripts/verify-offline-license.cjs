// OFFLINE LICENSE E2E — the gate nobody had been able to write until the dev hook
// existed: a GENUINELY SIGNED `vni1.*` license must OPEN a Pro capability, and every
// fake must fail to. The negative half is the one that matters.
//
// Usage:
//   npm run build:css && npm run watch
//   WATCH_URL='http://localhost:3000/?standalone=1' node scripts/verify-offline-license.cjs
//   node scripts/verify-offline-license.cjs --self-test    (proves the harness can fail)
// Exit 0 = all steps PASS.
//
// WHY THIS FILE EXISTS
// -------------------
// `verify-capability-gate.cjs:10-27` graded every enforced gate and recorded the pro
// branch as a written GAP: the engine's trust anchor is a public key whose private
// half is deliberately absent from this repo, so "an offline license opens Pro" was
// unprovable and nine sessions of plans said so. That is now false.
// `src/widget/contexts/SaaSFeatureContext.tsx:72-74` installs a DEV-ONLY hook that
// hands over `setLicensePublicKey`, which is enough to mint a real ECDSA P-256
// license with no private key shipped anywhere.
// `src/widget/contexts/__tests__/devLicenseHook.production.test.ts:71-83` is the
// lock that the hook cannot ship: present in a development bundle, absent from a
// production one. `:155-186` proves the hook is not a stub — it really moves the
// engine's trust anchor, and the same key stops working the moment the anchor moves
// back. This suite consumes that hook; it does not widen it.
//
// WHAT IS ACTUALLY ASSERTED
// -------------------------
// One Pro capability, read off the DOM by `data-testid`, never by text: the replay
// control. `data-testid="replay-toggle"`
// (`src/widget/components/header/OHLCHeader.tsx:628`) is rendered for every tier and
// carries `disabled={!canUseReplay}` (`:626`). That boolean is the whole chain:
//   usePatTierAuthentication.effectiveToolbarTier            (usePatTierAuthentication.ts:137-153,248)
//   -> useTierGatedFeatures.canUseReplay                     (useTierGatedFeatures.ts:71)
//        = hasCapability(tier,"replay") && flags.isReplayEnabled
//   MIN_TIER["replay"] === "pro"                             (engine capabilities.ts:132)
//   flags.isReplayEnabled comes from the license's plan      (SaaSFeatureContext.tsx:450-463, 673, 247-267)
// So `disabled` absent == the signed license opened a Pro capability, and `disabled`
// present == it did not. No localised string is matched anywhere in this file: the
// demo renders Vietnamese (`StandaloneEmbedDemo.tsx:299-300`).
//
// WHAT THIS DELIBERATELY DOES NOT COVER
// -------------------------------------
// 1. It does not assert that the capability works ONCE UNLOCKED. It asserts the gate
//    opens, not that replay then plays. Driving playback is a different suite's job.
// 2. It does not assert the zero-fetch claim for a FORGED prefix. SEC-01
//    (`usePatTierAuthentication.test.tsx:5,138-145`) asserts both "grants nothing" AND
//    "zero network", but the zero half only holds with no backend configured, and
//    `StandaloneEmbedDemo.tsx:286` passes `client={vniClient}` — which
//    `hasExplicitBackend` counts as a backend by definition
//    (`usePatTierAuthentication.ts:47-52`). So only the half that is reachable here is
//    asserted: the forged prefix grants nothing. Recorded, not faked.
// 3. It does not test `enterprise`, expiry-window edges, `caps` narrowing, domain
//    pinning, `kid` routing, or rotation. One pro license plus two negative licenses
//    is what the surface can honestly produce.
// 4. It does not test the Settings modal paste path; the license is seeded into the
//    `vni_license_key` slot (`credentialStore.ts:28`) that `readLicenseKey()` reads
//    (`credentialStore.ts:146-152`). Storage seeding is the credential channel, not the
//    UI channel.
// 5. It does not assert the PRODUCTION half of the dev hook at all. That is
//    devLicenseHook.production.test.ts's job, over real bundle bytes. A green run
//    here says nothing about whether the hook ships.

"use strict";
const { chromium } = require("playwright");

const WATCH_URL = process.env.WATCH_URL || "http://localhost:3000/?standalone=1";
const LICENSE_SLOT = "vni_license_key";
const PAT_SLOT = "vni_pat";
const results = [];
const errors = [];

function step(name, ok, detail = "") {
	results.push({ name, ok });
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

/**
 * A step whose precondition failed is BLOCKED, not PASS — same rule as verify-export.
 * A licence assertion graded against a page where the probe never rendered is not a
 * pass, it is an absence of evidence.
 */
function blocked(name, why) {
	results.push({ name, ok: false, blocked: true });
	console.log(`FAIL ${name} (BLOCKED: ${why})`);
}

/** Refuse to grade a server this script did not build. */
async function assertServerIsOurs() {
	if (process.env.VNSC_ALLOW_ANY_SERVER === "1") return;
	const target = new URL(WATCH_URL);
	const res = await fetch(target.origin, { signal: AbortSignal.timeout(6000) }).catch(() => null);
	if (!res || !res.ok) {
		console.error(
			`verify-offline-license: no dev server at ${target.origin}.\n` +
				"  Start one: npm run build:css && npm run watch  (watch runs `clean`, so a cold\n" +
				"  worktree without generated CSS will not compile.)\n" +
				"  This suite grades whatever is on the URL, so it refuses to run rather than\n" +
				"  report a result for code it did not build.",
		);
		process.exit(1);
	}
}

// ---------------------------------------------------------------------------
// Minting the fixture: a real ECDSA P-256 keypair generated HERE, in the harness.
// Same technique as `usePatTierAuthentication.test.tsx:35-42` (makeSignedLicense) —
// the private key never leaves this process and is never written to disk.
// ---------------------------------------------------------------------------

const { webcrypto } = require("node:crypto");
const subtle = webcrypto.subtle;

const b64url = (bytes) =>
	Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function mint() {
	const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
	const pub = await subtle.exportKey("jwk", pair.publicKey);
	const publicJwk = { kty: "EC", crv: "P-256", x: pub.x, y: pub.y };

	/** Sign one payload with the same private key. Node subtle emits raw P1363 (64B). */
	async function sign(payload) {
		const raw = new TextEncoder().encode(JSON.stringify(payload));
		const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, raw);
		return `vni1.${b64url(raw)}.${b64url(new Uint8Array(sig))}`;
	}

	const nowSec = Math.floor(Date.now() / 1000);
	const valid = await sign({ t: "pro", e: nowSec + 86400 * 30 });
	// Same key, same shape, already expired: exercises the `exp <= now` reject at
	// licenseValidator.ts:314 rather than the signature check.
	const expired = await sign({ t: "pro", e: nowSec - 60 });
	// One character of the SIGNATURE segment flipped. Structure still parses
	// (parseLicenseKey, licenseValidator.ts:165-212), the signature cannot verify.
	// This is the forgery that matters: it is the shape a real attacker's key has.
	const segs = valid.split(".");
	const last = segs[2];
	const flipped = (last[last.length - 1] === "A" ? "B" : "A") + last.slice(0, -1);
	const tampered = `vni1.${segs[1]}.${flipped}`;

	return { publicJwk, valid, expired, tampered };
}

// ---------------------------------------------------------------------------
// Arming the page BEFORE any app code runs.
//
// The public key has to be registered before the licence is first validated, and the
// anchor lives in module state that a reload throws away. The dev hook installs its
// object with a plain assignment at module scope
// (`SaaSFeatureContext.tsx:72-74`), so an accessor on `globalThis` catches that
// assignment and moves the anchor SYNCHRONOUSLY — during module evaluation, before
// React has rendered anything. Polling for the hook instead would race the provider's
// first validation pass, and a lost race reads as "invalid licence" while the product
// is behaving correctly.
// ---------------------------------------------------------------------------
async function arm(page, scenario) {
	await page.addInitScript((cfg) => {
		// Storage first: `readLicenseKey()` / `readPat()` are read during the first
		// render, and the entitlement cache in sessionStorage is keyed by credential,
		// so a stale free answer from an earlier scenario would survive a reload.
		try {
			localStorage.clear();
			sessionStorage.clear();
		} catch { /* ignore */ }
		if (cfg.license) localStorage.setItem(cfg.licenseSlot, cfg.license);
		if (cfg.pat) localStorage.setItem(cfg.patSlot, cfg.pat);

		let hook = null;
		try {
			Object.defineProperty(globalThis, "__VNI_DEV_LICENSE__", {
				configurable: true,
				enumerable: false,
				get() {
					return hook;
				},
				set(v) {
					hook = v;
					window.__VNSC_HOOK_SEEN__ = true;
					try {
						if (v && typeof v.setLicensePublicKey === "function") {
							v.setLicensePublicKey(cfg.publicJwk);
							window.__VNSC_ANCHOR_INSTALLED__ = true;
						}
					} catch (e) {
						window.__VNSC_ANCHOR_ERROR__ = String(e && e.message);
					}
				},
			});
		} catch (e) {
			window.__VNSC_HOOK_ERROR__ = String(e && e.message);
		}
	}, {
		license: scenario.license || "",
		pat: scenario.pat || "",
		licenseSlot: LICENSE_SLOT,
		patSlot: PAT_SLOT,
		publicJwk: scenario.publicJwk,
	});
}

async function readAnchorState(page) {
	return page.evaluate(() => ({
		hookSeen: window.__VNSC_HOOK_SEEN__ === true,
		anchorInstalled: window.__VNSC_ANCHOR_INSTALLED__ === true,
		hookError: window.__VNSC_HOOK_ERROR__ || null,
		anchorError: window.__VNSC_ANCHOR_ERROR__ || null,
		processGlobal: typeof process !== "undefined",
		secureContext: window.isSecureContext === true,
		hasSubtle: typeof window.crypto?.subtle?.verify === "function",
	}));
}

// ---------------------------------------------------------------------------
// Reading the gate. `data-testid` only — the surface renders Vietnamese.
// ---------------------------------------------------------------------------
const REPLAY_TOGGLE = '[data-testid="replay-toggle"]';
const WIDGET_ROOT = '[data-testid="vninvest-charts"]';

async function readToggle(page) {
	const el = page.locator(REPLAY_TOGGLE);
	if ((await el.count()) === 0) return { sawToggle: false, sawWidget: false, disabled: null };
	return el.first().evaluate((n) => ({
		sawToggle: true,
		sawWidget: true,
		disabled: n.disabled === true,
		ariaDisabled: n.getAttribute("aria-disabled") === "true",
	}));
}

/**
 * Wait for the async chain to finish and then read once.
 *
 * Licence verification is async (SubtleCrypto), so the tier reaches the header a few
 * frames after mount. Reading immediately would grade the PRE-tier state and every
 * scenario would "pass" its expectation for free. Waiting for a fixed sleep is the
 * other classic: it passes on a slow machine and flakes on a fast one. So: read
 * twice, 900ms apart, and require the two to agree. Unstable is not a lock and not an
 * open — it is a FAIL, because "it flickered" is not a licence decision.
 */
async function settledToggle(page) {
	const first = await readToggle(page);
	if (!first.sawToggle) return first;
	await page.waitForTimeout(900);
	const second = await readToggle(page);
	return { ...second, stable: first.disabled === second.disabled, sawWidget: true };
}

// ---------------------------------------------------------------------------
// THE grading rule. One function, used by the live run AND by --self-test, so the
// self-test cannot pass while proving a different thing from the run. Throws on
// mismatch, including on the two vacuity cases (no probe, no settled tier).
// ---------------------------------------------------------------------------
function assertTierEffect(observed, expectOpen, label) {
	if (!observed.sawToggle) throw new Error(`${label}: ${REPLAY_TOGGLE} never rendered — no surface to grade`);
	if (observed.stable === false) throw new Error(`${label}: tier never settled — the gate changed under the reader`);
	const actuallyOpen = observed.disabled === false;
	if (actuallyOpen !== expectOpen) {
		throw new Error(
			`${label}: expected the capability ${expectOpen ? "OPEN" : "LOCKED"}, DOM says ` +
				`${actuallyOpen ? "OPEN" : "LOCKED"} (disabled=${observed.disabled}, ` +
				`aria-disabled=${observed.ariaDisabled})`,
		);
	}
	if (observed.ariaDisabled !== observed.disabled) {
		throw new Error(
			`${label}: disabled and aria-disabled disagree (disabled=${observed.disabled}, ` +
				`aria-disabled=${observed.ariaDisabled}) — a screen reader is being told something the gate is not`,
		);
	}
	return observed;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function runScenario(browser, scenario) {
	const page = await browser.newPage();
	page.on("pageerror", (e) => errors.push(`[${scenario.id}] ${e.message}`));
	// LIC-FIRST must not need the network. Counted, not asserted, until the positive
	// scenario is graded — a licence that validated over the wire is a different bug
	// and this is the cheapest place to see it.
	let authMeHits = 0;
	page.on("request", (r) => {
		if (/\/core\/v1\/auth\/me/.test(r.url())) authMeHits++;
	});

	try {
		await arm(page, scenario);
		await page.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
		await page.waitForSelector(WIDGET_ROOT, { timeout: 60000 });

		// --- Precondition: the anchor is genuinely ours, and the crypto is there. ---
		let anchor = await readAnchorState(page);
		if (!anchor.hookSeen) {
			// The dev bundle does not define a `process` global (webpack 5 ships no
			// polyfill and config/webpack.config.js adds no ProvidePlugin), so the hook's
			// own `typeof process !== "undefined"` guard is false and the branch never
			// runs. Define the value webpack's own `optimization.nodeEnv` bakes in for
			// mode:"development" and reload — same value, same branch, no product change.
			await page.addInitScript(() => {
				try {
					if (typeof process === "undefined") {
						globalThis.process = { env: { NODE_ENV: "development" } };
					}
				} catch { /* ignore */ }
			});
			await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
			await page.waitForSelector(WIDGET_ROOT, { timeout: 60000 });
			anchor = await readAnchorState(page);
			anchor.viaProcessShim = true;
		}

		if (!anchor.hookSeen) {
			blocked(`${scenario.id} dev hook reachable`, `__VNI_DEV_LICENSE__ was never assigned (hookError=${anchor.hookError}, processGlobal=${anchor.processGlobal})`);
			return { graded: false };
		}
		if (anchor.anchorError) {
			blocked(`${scenario.id} dev hook reachable`, `setLicensePublicKey threw: ${anchor.anchorError}`);
			return { graded: false };
		}
		if (!anchor.anchorInstalled) {
			blocked(`${scenario.id} dev hook reachable`, "the hook appeared but carries no setLicensePublicKey — nothing to move the trust anchor with");
			return { graded: false };
		}
		if (!anchor.secureContext || !anchor.hasSubtle) {
			blocked(`${scenario.id} dev hook reachable`, `verifyLicenseKey needs crypto.subtle (isSecureContext=${anchor.secureContext}, subtle=${anchor.hasSubtle}); serve over http://localhost or https`);
			return { graded: false };
		}
		step(
			`${scenario.id} dev hook reachable + trust anchor ours`,
			true,
			`${anchor.viaProcessShim ? "via documented process shim" : "natively"}`,
		);

		await page.waitForTimeout(2500);
		const observed = await settledToggle(page);
		try {
			assertTierEffect(observed, scenario.expectOpen, scenario.id);
			step(`${scenario.id} ${scenario.label} -> capability ${scenario.expectOpen ? "OPEN" : "LOCKED"}`, true, `disabled=${observed.disabled}`);
		} catch (e) {
			step(`${scenario.id} ${scenario.label} -> capability ${scenario.expectOpen ? "OPEN" : "LOCKED"}`, false, e.message);
		}

		if (scenario.expectOpen) {
			// LIC-FIRST: a verified licence is self-contained, so it must not be routed
			// at /core/v1/auth/me even though this surface injects a client.
			step(`${scenario.id} zero /auth/me traffic for a verified licence`, authMeHits === 0, `${authMeHits} request(s)`);
		}
		return { graded: true, open: observed.disabled === false };
	} finally {
		await page.close();
	}
}

async function main() {
	await assertServerIsOurs();
	const keys = await mint();

	const scenarios = [
		// 1. The happy path. Also LIC-04's counterpart: same key, same shape, this one signs.
		{ id: "LIC-01", label: "valid signed pro license", license: keys.valid, publicJwk: keys.publicJwk, expectOpen: true },
		// 2. THE ASSERTION THAT MATTERS. Right shape, right plan, unverifiable signature.
		{ id: "LIC-02", label: "tampered signature", license: keys.tampered, publicJwk: keys.publicJwk, expectOpen: false },
		// 3. Correctly signed but out of date — a different reject path (exp, not sig).
		{ id: "LIC-03", label: "expired signed license", license: keys.expired, publicJwk: keys.publicJwk, expectOpen: false },
		// 4. The classic bypass attempt, recorded at usePatTierAuthentication.test.tsx:5.
		{ id: "LIC-04", label: "forged vni_pro_hack prefix", pat: "vni_pro_hack", publicJwk: keys.publicJwk, expectOpen: false },
	];

	const browser = await chromium.launch();
	const observedOpens = [];
	let graded = 0;
	try {
		for (const s of scenarios) {
			const r = await runScenario(browser, s);
			if (r.graded) {
				graded++;
				observedOpens.push(r.open);
			} else {
				blocked(`${s.id} ${s.label} -> capability ${s.expectOpen ? "OPEN" : "LOCKED"}`, "precondition unmet, see the step above");
			}
		}
	} finally {
		await browser.close();
	}

	// Anti-vacuity. A suite where every scenario reads LOCKED has not proven the gate
	// works; it has proven only that the page loads. A suite where everything reads
	// OPEN has proven nothing at all. Both are FAIL, stated as such.
	step(
		"LIC-00 the probe distinguishes open from locked",
		graded === scenarios.length && observedOpens.some(Boolean) && observedOpens.some((v) => !v),
		`${graded}/${scenarios.length} graded, ${observedOpens.filter(Boolean).length} open / ${observedOpens.filter((v) => !v).length} locked`,
	);
	step("LIC-99 zero page errors", errors.length === 0, errors.length ? errors[0] : "none");

	const ok = results.filter((r) => r.ok).length;
	const wasBlocked = results.filter((r) => r.blocked).length;
	console.log(
		`RESULT: ${ok}/${results.length} ${ok === results.length ? "PASS" : "FAIL"}` +
			(wasBlocked ? ` (${wasBlocked} blocked by an unmet precondition)` : ""),
	);
	process.exitCode = ok === results.length ? 0 : 1;
}

// ---------------------------------------------------------------------------
// --self-test: prove the suite can fail, including the negative half.
//
// Every `expectFail` below feeds the REAL `assertTierEffect` the input the real run
// would have handed it if the product were broken. Writing `if (bad) throw` here
// instead would be a second, untested implementation, and would go green the moment
// `assertTierEffect` was weakened — which is the exact failure this file exists to
// prevent. In particular LIC-04-NEG: if the gate ever DID honour a `vni_pro_hack`
// prefix, this case throws, and the suite is red.
// ---------------------------------------------------------------------------
function selfTest() {
	const checks = [];
	const assert = (name, fn) => {
		try {
			fn();
			checks.push({ name, ok: true });
		} catch (e) {
			checks.push({ name, ok: false, why: e.message });
		}
	};
	const expectFail = (name, fn) => {
		try {
			fn();
			checks.push({ name, ok: false, why: "did NOT fail — the check is vacuous" });
		} catch {
			checks.push({ name, ok: true });
		}
	};

	const OPENED = { sawToggle: true, stable: true, disabled: false, ariaDisabled: false };
	const LOCKED = { sawToggle: true, stable: true, disabled: true, ariaDisabled: true };

	// One real check, to prove the harness is not simply always-throwing.
	assert("selftest: valid licence => capability open is accepted", () => {
		assertTierEffect(OPENED, true, "LIC-01");
	});
	assert("selftest: forged prefix => capability locked is accepted", () => {
		assertTierEffect(LOCKED, false, "LIC-04");
	});

	// The enforcement direction. A gate that opens on a bad credential must be red.
	expectFail("selftest: a LOCKED gate where the scenario demanded OPEN is rejected", () => {
		assertTierEffect(LOCKED, true, "LIC-01");
	});
	expectFail("selftest: ENFORCEMENT — a gate that OPENED for vni_pro_hack is rejected", () => {
		assertTierEffect(OPENED, false, "LIC-04");
	});
	expectFail("selftest: ENFORCEMENT — a gate that OPENED for a tampered signature is rejected", () => {
		assertTierEffect(OPENED, false, "LIC-02");
	});
	// The two vacuity shapes. Both are silent greens if unguarded.
	expectFail("selftest: a missing replay-toggle is rejected, not passed", () => {
		assertTierEffect({ sawToggle: false, stable: true, disabled: null }, true, "LIC-01");
	});
	expectFail("selftest: a tier that never settles is rejected, not passed", () => {
		assertTierEffect({ sawToggle: true, stable: false, disabled: false, ariaDisabled: false }, true, "LIC-01");
	});
	expectFail("selftest: disabled and aria-disabled disagreeing is rejected", () => {
		assertTierEffect({ sawToggle: true, stable: true, disabled: true, ariaDisabled: false }, false, "LIC-02");
	});

	const failed = checks.filter((c) => !c.ok);
	for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"} ${c.name}${c.why ? ` (${c.why})` : ""}`);
	console.log(`RESULT: ${checks.length - failed.length}/${checks.length} ${failed.length ? "FAIL" : "PASS"}`);
	process.exitCode = failed.length ? 1 : 0;
}

if (process.argv.includes("--self-test")) {
	selfTest();
} else {
	main().catch((e) => {
		console.error(`FATAL: ${e.message}`);
		process.exitCode = 1;
	});
}
