// G-PINE-E2E — the runtime proof for Pine Stage 1 (plan W4/W5/W6/W8), W-04 rewrite.
//
// WHAT CHANGED vs the first version (plan §0.5 — traced live, not guessed):
//  1. `?standalone=1&uncontrolled=1`: the demo no longer passes controlled `panes`, so
//     `useWidgetSettings` never fires `localReplaceLayout` over the seeded layout.
//     (Old PINE-04/PINE-12 failed on the controlled surface, not on restore.)
//  2. `vn._scripts` is seeded in the REAL schema — Record (not array) + integrity
//     checksums + a valid lastActiveId — and asserted in Node BEFORE boot as PINE-01.
//     (Old PINE-13 failed because an array seed made `scripts[lastActiveId]` undefined.)
//  3. One load, no reload, no key discovery, no phase-2: the key is the deterministic
//     bare `rsc-pane-layout-v2` (the demo passes no `props.id`, so the scope is bare).
//  4. The free-tier page uses the SAME URL and the SAME seed. The two pages differ ONLY
//     in P-256 arming (licence + dev-key hook); otherwise PINE-14 stays a vacuous pass
//     on controlled defaults.
//  5. Equality assertions throughout: PINE-11 compares the FULL editor text to the
//     expected source (`===` after whitespace stripping); PINE-07 requires the Pine
//     keys to exist before comparing samples (kills the `0===0` vacuous pass); PINE-08
//     reads the ENGINE's `getPaneSnapshots()`, never localStorage. NOTE on PINE-08:
//     engine snapshots carry NO series list (`PaneRuntimeSnapshot` = paneId + bounds +
//     scale slots only), so placement is proven by pane-set exactness plus the own
//     pane's scale domain containing Pine B's value range — still 100% engine data.
//  6. Cannot run (no server / no browser) prints `SKIP <reason>` and exits 2.
//     A row that cannot run NEVER passes (hazard 8).
//
// USAGE (needs `npm run watch` already serving THIS worktree):
//   WATCH_URL="http://localhost:3000/?standalone=1&uncontrolled=1" node scripts/verify-pine-add-to-chart.cjs
// The resolved URL is printed on line 1 so a run can never be misattributed to another checkout.

const { chromium } = require("playwright");
const { stagingLicense, mode: licenseMode } = require("./e2e-license.cjs");

const WATCH_URL = process.env.WATCH_URL || "http://localhost:3000/?standalone=1&uncontrolled=1";
const STORAGE_SCRIPTS = "vn._scripts";
const LAYOUT_KEY = "rsc-pane-layout-v2";
const LICENSE_SLOT = "vni_license_key";
// DEMO-MODE (2026-10-17): tombstone tắt installer license demo của trang demo —
// phải khớp `DEMO_LICENSE_OPTOUT_KEY` trong `src/demo/demoLicense.ts`. PINE-12
// (free page) relies on this: staging giờ mặc định PRO qua demo licence, và
// "free tier" chỉ còn đo được khi installer bị chặn.
const DEMO_LICENSE_OPTOUT_KEY = "vnsc_demo_license_off";

const SCRIPT_A = {
	id: "pine_e2eoverlaya",
	name: "e2e overlay on",
	source: 'study("e2e overlay on", overlay=true)\nval = ta.sma(close, 5)\nplot(val)',
};
const SCRIPT_B = {
	id: "pine_e2eownpane",
	name: "e2e own pane",
	source: 'study("e2e own pane", overlay=false)\nval = ta.ema(close, 7)\nplot(val)',
};

// Stored layout that already references BOTH Pine types: script A on the price pane
// and script B in its own pane — the state a user is in after using the editor once
// and reloading. Identical for both pages.
const LAYOUT = {
	version: 1,
	panes: [
		{
			id: "price", label: "Price", pinned: true, visible: true, heightRatio: 3,
			series: [
				{ id: "Candlestick", type: "Candlestick", yAxis: "left" },
				{ id: SCRIPT_A.id, type: SCRIPT_A.id, yAxis: "right", overlay: true },
			],
			splitScale: false, tooltip: "ohlc",
		},
		{
			id: "volume", label: "Volume", pinned: false, visible: true, heightRatio: 1,
			series: [{ id: "Volume", type: "Volume", yAxis: "left" }],
			splitScale: false, tooltip: "ohlc",
		},
		{
			id: "pine-e2e-own", label: "Pine", pinned: false, visible: true, heightRatio: 1,
			series: [{ id: SCRIPT_B.id, type: SCRIPT_B.id, yAxis: "right", overlay: false }],
			splitScale: false, tooltip: "ohlc",
		},
	],
};

/** FNV-1a, 32-bit — byte-identical copy of `scriptChecksum` in useScriptPersistence.ts. */
function fnv1a(source) {
	let h = 0x811c9dc5;
	for (let i = 0; i < source.length; i += 1) {
		h ^= source.charCodeAt(i);
		h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
	}
	return `${h.toString(16).padStart(8, "0")}:${source.length}`;
}

function mkScript(id, name, source) {
	const now = new Date().toISOString();
	return {
		id, name, source, created: now, lastModified: now,
		integrity: { checksum: fnv1a(source), sourceLength: source.length },
	};
}

function buildSeed() {
	const scripts = {
		[SCRIPT_A.id]: mkScript(SCRIPT_A.id, SCRIPT_A.name, SCRIPT_A.source),
		[SCRIPT_B.id]: mkScript(SCRIPT_B.id, SCRIPT_B.name, SCRIPT_B.source),
	};
	return {
		json: JSON.stringify({ formatVersion: 1, scripts, lastActiveId: SCRIPT_B.id }),
		layoutJson: JSON.stringify(LAYOUT),
	};
}

function b64url(bytes) {
	return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const results = [];
function step(id, ok, detail = "") {
	results.push({ id, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Arm a Pro entitlement, in whichever mode the environment can actually honour.
 *
 * production (VNI_E2E_LICENSE set): seed the signed licence and install NO hook. The staging
 *   build folds `__VNI_DEV_LICENSE__` to `&& false`, so a hook there proves nothing; the
 *   production bundle verifies the licence against the key embedded in the engine, which is the
 *   same path a paying customer takes.
 * development (env unset): unchanged - mint a throwaway keypair and hand it over through the
 *   dev-only hook.
 *
 * The two modes are printed, never inferred, because a script that fell back to the dev hook on
 * staging would report a green run that measured nothing.
 */
async function armProTier(page, seed, armed) {
	let license = null;
	let jwk = null;
	let useDevHook = false;
	if (armed) {
		license = stagingLicense();
		if (license) {
			jwk = null; // no hook in production mode, so no public key travels
		} else {
			useDevHook = true;
			const { publicKey, privateKey } = await crypto.subtle.generateKey(
				{ name: "ECDSA", namedCurve: "P-256" },
				true,
				["sign", "verify"],
			);
			jwk = await crypto.subtle.exportKey("jwk", publicKey);
			const payload = new TextEncoder().encode(
				JSON.stringify({ t: "pro", e: Math.floor(Date.now() / 1000) + 86400 * 30 }),
			);
			const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, payload);
			license = `vni1.${b64url(payload)}.${b64url(new Uint8Array(sig))}`;
		}
	}

	// Single deterministic seed: clear, then write the licence (armed page only),
	// the Record-schema scripts and the bare layout key. No reload afterwards, so
	// no phase flag and no key discovery can race. On the free page the demo-licence
	// tombstone is also written so the staging demo-mode installer (DEMO-MODE
	// 2026-10-17, src/demo/demoLicense.ts) cannot silently promote this page to PRO
	// — without it PINE-12 stops measuring the free tier at all.
	await page.addInitScript(
		([slot, lic, pub, scriptsKey, layoutKey, scriptsJson, layoutJson, isArmed, devHook, optOutKey]) => {
			try {
				if (typeof process === "undefined") {
					globalThis.process = { env: { NODE_ENV: "development" } };
				}
			} catch { /* ignore */ }
			try {
				localStorage.clear();
				sessionStorage.clear();
			} catch { /* ignore */ }
			if (isArmed && lic) localStorage.setItem(slot, lic);
			if (!isArmed) localStorage.setItem(optOutKey, "1");
			localStorage.setItem(scriptsKey, scriptsJson);
			localStorage.setItem(layoutKey, layoutJson);
			// Production mode: the licence is already in storage and the bundle verifies it
			// itself. Installing the dev hook here would be a no-op on a real build and a
			// false sense of entitlement on a dev one.
			if (!isArmed || !devHook) return;
			let hook = null;
			try {
				Object.defineProperty(globalThis, "__VNI_DEV_LICENSE__", {
					configurable: true,
					enumerable: false,
					get() { return hook; },
					set(v) {
						hook = v;
						window.__VNSC_ANCHOR_INSTALLED__ = true;
						if (v && typeof v.setLicensePublicKey === "function") v.setLicensePublicKey(pub);
					},
				});
			} catch { /* ignore */ }
		},
		[LICENSE_SLOT, license, jwk, STORAGE_SCRIPTS, LAYOUT_KEY, seed.json, seed.layoutJson, armed, useDevHook, DEMO_LICENSE_OPTOUT_KEY],
	);
	return license;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readEngineSeries(page) {
	return page.evaluate(() => {
		const engine = window.__VN_ENGINE__;
		const ds = engine?.dataSource;
		if (!ds?.seriesData) return { keys: [], data: {}, detail: "no dataSource.seriesData" };
		const out = {};
		for (const [k, v] of Object.entries(ds.seriesData)) {
			const arr = Array.isArray(v) ? v : [];
			const finite = arr.filter((x) => typeof x === "number" && Number.isFinite(x));
			out[k] = { length: arr.length, finiteCount: finite.length, sample: finite.slice(-4) };
		}
		return { keys: Object.keys(ds.seriesData), data: out, detail: "" };
	});
}

/** Poll until BOTH Pine series are in the engine, or the budget runs out. */
async function waitForPineSeries(page, budgetMs) {
	const deadline = Date.now() + budgetMs;
	let last = { keys: [], data: {}, detail: "not polled yet" };
	while (Date.now() < deadline) {
		last = await readEngineSeries(page);
		if (last.keys.includes("pine_e2eoverlaya") && last.keys.includes("pine_e2eownpane")) return last;
		await sleep(500);
	}
	return last;
}

const openTab = async (page, ...labels) => {
	for (const label of labels) {
		const btn = page.locator(`button:has-text("${label}")`).first();
		if ((await btn.count()) === 0) continue;
		await btn.click();
		await page.waitForTimeout(1800);
		return true;
	}
	return false;
};

function skip(reason) {
	console.log(`SKIP ${reason}`);
	process.exit(2);
}

async function main() {
	console.log(`WATCH_URL=${WATCH_URL}`);
	// Printed, not inferred: a reader must be able to tell which entitlement path produced the
	// rows below without reading the source. This script does more than the shared helper
	// describes — with no licence it mints its own keypair — so it says so here.
	console.log(`ENTITLEMENT=${licenseMode()}${stagingLicense() ? "" : " + throwaway dev keypair via the dev anchor"}`);
	const seed = buildSeed();

	// PINE-01 — the seed parses in the REAL schema before anything boots. An array
	// here (the old bug) fails this row instead of failing PINE-11 downstream.
	let seedOk = false;
	let seedDetail = "";
	try {
		const parsed = JSON.parse(seed.json);
		const keys = parsed?.scripts && !Array.isArray(parsed.scripts) ? Object.keys(parsed.scripts) : null;
		const checks = [];
		checks.push(["formatVersion===1", parsed?.formatVersion === 1]);
		checks.push(["scripts-is-Record", keys !== null]);
		checks.push(["exact-keys", keys !== null && keys.sort().join() === "pine_e2eoverlaya,pine_e2eownpane"]);
		checks.push(["lastActiveId-valid", parsed?.lastActiveId === SCRIPT_B.id && Boolean(parsed?.scripts?.[SCRIPT_B.id])]);
		for (const k of keys ?? []) {
			const s = parsed.scripts[k];
			checks.push([`${k}-checksum`, s?.integrity?.checksum === fnv1a(s?.source ?? "") && s?.integrity?.sourceLength === (s?.source ?? "").length]);
		}
		const bad = checks.filter(([, ok]) => !ok).map(([n]) => n);
		seedOk = bad.length === 0;
		seedDetail = seedOk ? `keys=${keys.sort().join()} checksums-match` : `bad=${bad.join()}`;
	} catch (e) {
		seedDetail = `seed JSON.parse threw: ${String(e && e.message || e)}`;
	}
	step("PINE-01 harness seed is a valid Record store (pre-boot self-check)", seedOk, seedDetail);
	if (!seedOk) {
		console.log(`RESULT: 0/13 PASS`);
		process.exit(1);
	}

	// Preflight: no server -> SKIP (exit 2), never a false PASS/FAIL.
	try {
		const res = await fetch(WATCH_URL, { signal: AbortSignal.timeout(15000) });
		if (!res.ok) skip(`no server at ${WATCH_URL} (HTTP ${res.status})`);
	} catch (e) {
		skip(`no server at ${WATCH_URL} (${String(e && e.message || e)})`);
	}

	let browser;
	try {
		browser = await chromium.launch();
	} catch (e) {
		skip(`no browser (chromium.launch threw: ${String(e && e.message || e)})`);
	}

	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	const pageErrors = [];
	page.on("pageerror", (e) => pageErrors.push(`uncaught: ${String(e)}`));
	page.on("console", (m) => {
		if (m.type() === "error") pageErrors.push(`console.error: ${m.text()}`);
	});

	await armProTier(page, seed, true);
	try {
		await page.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
	} catch (e) {
		await browser.close().catch(() => {});
		skip(`navigation failed (${String(e && e.message || e)})`);
	}

	// PINE-02 is mode-dependent, and saying so is the point.
	//   development: the APP itself must install the anchor - a shim that only pretends to is the
	//     bug this assertion exists for.
	//   production: the anchor MUST NOT EXIST. `check-bundle-mode` proves the symbol is absent from
	//     the shipped files, but this asserts it at runtime, on the page the public is served.
	//     On staging that is the most valuable thing this line can say.
	if (stagingLicense()) {
		step(
			"PINE-02 production bundle exposes NO dev licence anchor (licence comes from storage)",
			await page.evaluate(() => !("__VNI_DEV_LICENSE__" in window)),
		);
	} else {
		step(
			"PINE-02 the dev licence anchor was installed by the APP, not just by the shim",
			await page.evaluate(() => window.__VNSC_ANCHOR_INSTALLED__ === true),
		);
	}
	step("PINE-03 the fork engine host is mounted", (await page.locator("[data-vn-kline-engine-host]").count()) > 0);

	// W8 / BLOCKER B-1: a plain LOAD must restore the saved scripts. No Pine control
	// has been touched at this point — `seriesData` is empty here iff restore is broken.
	const reloaded = await waitForPineSeries(page, 30000);
	const hasA = reloaded.keys.includes(SCRIPT_A.id);
	const hasB = reloaded.keys.includes(SCRIPT_B.id);
	step("PINE-04 after a plain load, BOTH saved Pine series reach the engine (W8 / blocker B-1)", hasA && hasB, `keys=${JSON.stringify(reloaded.keys)} ${reloaded.detail}`);

	const dA = reloaded.data?.[SCRIPT_A.id];
	const dB = reloaded.data?.[SCRIPT_B.id];
	const lenOk = Boolean(dA) && Boolean(dB) && dA.length === dB.length && dA.length > 100;
	step("PINE-05 BOTH series are global-indexed (equal full length, not windowed)", lenOk, dA && dB ? `A.len=${dA.length} B.len=${dB.length}` : "missing series");
	const finOk = Boolean(dA) && Boolean(dB) && dA.finiteCount >= 2 && dB.finiteCount >= 2;
	step("PINE-06 BOTH series carry finite values, not NaN (BUG-01 signature)", finOk, dA && dB ? `A.finite=${dA.finiteCount} B.finite=${dB.finiteCount} A~${JSON.stringify(dA.sample)} B~${JSON.stringify(dB.sample)}` : "missing series");

	// sma(5) vs ema(7) on the same bars must differ. Both keys are required to exist
	// first — comparing two empty samples (`0===0`) is the vacuous pass this kills.
	const samplesDiffer = hasA && hasB && JSON.stringify(dA.sample) !== JSON.stringify(dB.sample);
	step("PINE-07 the two scripts produce DIFFERENT values (not one script registered twice)", samplesDiffer, hasA && hasB ? `A~${JSON.stringify(dA.sample)} B~${JSON.stringify(dB.sample)}` : "a Pine key never reached the engine");

	// W5 placement, read from the ENGINE — never localStorage. Snapshots carry no
	// series list, so: exact pane set + every pane really laid out + the own pane's
	// scale domain containing Pine B's value range (only B lives in that pane, so a
	// misplaced-or-dropped B collapses this row).
	//
	// POLLED, not sampled (Stage 6 measured 4/5 runs green — a single sample raced the
	// engine's scale-domain settle). Same discipline as waitForPineSeries above: the row
	// reports the LAST observed state and fails if the condition never became true.
	// A timeout is a FAIL, never a silent pass.
	const readPlacement = () =>
		page.evaluate((ownId) => {
			const eng = window.__VN_ENGINE__;
			if (!eng || typeof eng.getPaneSnapshots !== "function") return { error: "no engine.getPaneSnapshots" };
			const snaps = eng.getPaneSnapshots();
			const bVals = ((eng.dataSource?.seriesData ?? {})[ownId] ?? []).filter((x) => typeof x === "number" && Number.isFinite(x));
			const panes = snaps.map((s) => {
				const slots = {};
				for (const [k, v] of Object.entries(s.scaleSlotStates ?? {})) slots[k] = v?.domain ?? null;
				const pb = s.plotBounds ?? {};
				return { id: s.paneId, slots, boundsKeys: Object.keys(pb), w: pb.width, h: pb.height };
			});
			const sorted = [...bVals].sort((a, b) => a - b);
			const q = (p) => (sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);
			return { panes, bCount: bVals.length, bp5: q(0.05), bp95: q(0.95) };
		}, SCRIPT_B.id);

	const gradePlacement = (placement) => {
		if (placement.error) return { ok: false, detail: placement.error };
		const ids = placement.panes.map((p) => p.id).sort().join();
		const idsOk = ids === "pine-e2e-own,price,volume";
		const laidOut = placement.panes.every((p) => Number.isFinite(p.w) && Number.isFinite(p.h) && p.w > 0 && p.h > 0);
		const own = placement.panes.find((p) => p.id === "pine-e2e-own");
		const doms = Object.values(own?.slots ?? {}).filter((d) => Array.isArray(d) && d.length === 2 && d.every(Number.isFinite));
		const containsB = placement.bp5 !== null && doms.some(([lo, hi]) => lo <= placement.bp5 && hi >= placement.bp95);
		return {
			ok: idsOk && laidOut && containsB,
			detail: `panes=${ids} laidOut=${laidOut} ownDomains=${JSON.stringify(doms)} B[5,95]=[${placement.bp5},${placement.bp95}]`,
		};
	};

	let placement = await readPlacement();
	let graded = gradePlacement(placement);
	const PLACEMENT_TIMEOUT_MS = 30000;
	const placementDeadline = Date.now() + PLACEMENT_TIMEOUT_MS;
	let placementAttempts = 1;
	while (!graded.ok && Date.now() < placementDeadline) {
		await page.waitForTimeout(750);
		placement = await readPlacement();
		graded = gradePlacement(placement);
		placementAttempts += 1;
	}
	step(
		"PINE-08 the overlay=false script drives its OWN engine pane (W5 placement)",
		graded.ok,
		graded.ok ? `${graded.detail} (settled after ${placementAttempts} poll(s))` : `${graded.detail} — never settled in ${PLACEMENT_TIMEOUT_MS}ms over ${placementAttempts} poll(s)`,
	);

	// The editor, now that restoration is proven — the seeded ACTIVE script (B) must
	// be on screen with its EXACT text. No typing: this is restore reaching the editor.
	const openedPine = await openTab(page, "Pine");
	step("PINE-09 the Pine tab opens at the armed Pro tier", openedPine);
	const monacoUp = openedPine && (await page.locator(".monaco-editor").count()) > 0;
	if (openedPine) {
		await page.waitForSelector(".monaco-editor", { timeout: 30000 }).catch(() => {});
	}
	const monacoNow = (await page.locator(".monaco-editor").count()) > 0;
	step("PINE-10 the Pine editor (Monaco) actually mounted", openedPine && monacoNow, openedPine ? "" : "tab never opened");
	let editorOk = false;
	let editorDetail = "";
	const norm = (s) => s.replace(/\s+/g, "");
	const readEditor = () =>
		page.evaluate(() =>
			Array.from(document.querySelectorAll(".monaco-editor .view-line"))
				.map((l) => l.textContent || "")
				.join("\n"),
		);
	if (openedPine && monacoNow) {
		// POLLED for the same reason as PINE-08: Monaco paints view-lines after mount, so a
		// single read can catch a partially-rendered buffer. A timeout is a FAIL.
		const EDITOR_TIMEOUT_MS = 20000;
		const deadline = Date.now() + EDITOR_TIMEOUT_MS;
		let model = await readEditor();
		let attempts = 1;
		while (norm(model) !== norm(SCRIPT_B.source) && Date.now() < deadline) {
			await page.waitForTimeout(500);
			model = await readEditor();
			attempts += 1;
		}
		editorOk = norm(model) === norm(SCRIPT_B.source);
		editorDetail = editorOk
			? `exact match (${SCRIPT_B.source.length} chars, settled after ${attempts} poll(s))`
			: `never matched in ${EDITOR_TIMEOUT_MS}ms over ${attempts} poll(s); got ${JSON.stringify(model.replace(/\s+/g, " ").slice(0, 120))}`;
	} else {
		editorDetail = monacoUp ? "monaco vanished before read" : "no editor to read";
	}
	step("PINE-11 the editor shows the RESTORED overlay=false script, exact text", editorOk, editorDetail);

	// W6: the tier gate at free tier — SAME URL, SAME seed, only the arming differs.
	// Absence of the Pine keys is only meaningful if the free page actually booted.
	const freePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	const freeErrors = [];
	freePage.on("pageerror", (e) => freeErrors.push(`uncaught: ${String(e)}`));
	freePage.on("console", (m) => {
		if (m.type() === "error") freeErrors.push(`console.error: ${m.text()}`);
	});
	await armProTier(freePage, seed, false);
	try {
		await freePage.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
	} catch (e) {
		await browser.close().catch(() => {});
		skip(`free-page navigation failed (${String(e && e.message || e)})`);
	}
	let freeHost = false;
	{
		const deadline = Date.now() + 20000;
		while (Date.now() < deadline) {
			if ((await freePage.locator("[data-vn-kline-engine-host]").count()) > 0) { freeHost = true; break; }
			await sleep(500);
		}
	}
	await freePage.waitForTimeout(3000);
	const freeLeak = await freePage.evaluate(() => {
		const ds = window.__VN_ENGINE__?.dataSource;
		return { seriesDataKeys: ds?.seriesData ? Object.keys(ds.seriesData) : [], hasDataSource: Boolean(ds) };
	});
	const freeAbsent = !freeLeak.seriesDataKeys.includes(SCRIPT_A.id) && !freeLeak.seriesDataKeys.includes(SCRIPT_B.id);
	step("PINE-12 W6: at FREE tier no Pine series reaches the engine (page booted)", freeHost && freeAbsent, `host=${freeHost} seriesData=${JSON.stringify(freeLeak.seriesDataKeys)}`);
	await freePage.close();

	// Errors, split by CAUSE. Uncaught is always a product defect. `console.error`
	// about the network is the sandbox's egress policy (Binance answers 451 here),
	// not this change — counted separately, never dropped, narrow allowlist.
	const ENV_NOISE = /(status of 451|WebSocket connection to|Failed to load resource|net::ERR_|ERR_NETWORK|ERR_BLOCKED_BY_CLIENT)/;
	const allErrors = [...pageErrors, ...freeErrors.map((e) => `free: ${e}`)];
	const uncaught = allErrors.filter((e) => e.includes("uncaught"));
	const productErrors = allErrors.filter((e) => !e.includes("uncaught") && !ENV_NOISE.test(e));
	const envErrors = allErrors.filter((e) => ENV_NOISE.test(e));
	const errorsOk = uncaught.length === 0 && productErrors.length === 0;
	step("PINE-13 zero uncaught + zero product console.error on BOTH pages", errorsOk, errorsOk ? `env-noise-counted=${envErrors.length}` : `uncaught=${JSON.stringify(uncaught.slice(0, 2))} product=${JSON.stringify(productErrors.slice(0, 2))}`);
	if (!errorsOk) console.log(`ENV-NOISE (counted, not hidden): ${envErrors.length} network-level messages`);

	await browser.close();
	const failed = results.filter((r) => !r.ok);
	console.log("-".repeat(90));
	console.log(`RESULT: ${results.length - failed.length}/${results.length} PASS`);
	if (failed.length > 0) console.log("FAILED:", failed.map((f) => f.id).join(", "));
	process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error("HARNESS ERROR:", err && err.message ? err.message : err);
	process.exit(2);
});
