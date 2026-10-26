// E2E regression for the CS-1 credential split.
//
// HISTORY. This harness originally had one job: a signed `vni1.*` license key
// pasted into the PAT modal must survive a reload, because the
// `vni_pat_cleared_v1` migration used to delete it (DEFAULT_PAT is ""). That bug
// is fixed, but the harness was still asserting the OLD single-slot contract:
// it seeded and read `vni_pat` for a license. With two typed slots, 2 of the 3
// scenarios would have failed by design rather than by defect. Slots corrected.
//
// HONEST LIMITS OF THIS HARNESS. The key below is STRUCTURAL: right shape,
// worthless signature. The engine's trust anchor is a public key embedded at
// licenseValidator.ts:35-40 and its private counterpart is not in this repo by
// design, so a browser harness cannot mint a key the engine accepts. Therefore
// these scenarios assert STORAGE and PROTOCOL invariants only - which slot holds
// what, and that a blob never appears in an Authorization header. Asserting a Pro
// tier here would be the same mistake as promising it in the plan: the fixture
// cannot produce one. "License yields Pro" belongs to CS-3 and needs a genuinely
// signed key, which CS-5 is what provides.
//
// Run: npm run verify:license-persist   (requires a dev server; set VNSC_VERIFY_URL
// to point at a specific one, e.g. a worktree on :3100). The default is :3000,
// which is whatever the main checkout is serving — running this against a tree
// other than the one under test produces a green result that means nothing.
"use strict";
const { chromium } = require("playwright");

const URL_APP = process.env.VNSC_VERIFY_URL || "http://localhost:3000/?standalone=1&dock=1";
const LICENSE_SLOT = "vni_license_key";
const PAT_SLOT = "vni_pat";

const b64url = (s) =>
	Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const STRUCTURAL_KEY = `vni1.${b64url(JSON.stringify({ t: "pro", e: 9999999999 }))}.${b64url("sig")}`;
const LEGACY_KEY = "vni_pro_legacy_old";
const REAL_TOKEN = "vni_pro_real_token";

async function open(page) {
	await page.goto(URL_APP, { waitUntil: "domcontentloaded", timeout: 90000 });
	await page.waitForTimeout(4000);
}

/** Any request whose Authorization header carries a `vni1.*` blob. */
function watchBlobOnTheWire(page) {
	const hits = [];
	page.on("request", (req) => {
		const auth = req.headers()["authorization"] || "";
		if (auth.includes("vni1.")) hits.push(req.url());
	});
	return hits;
}

// ---------------------------------------------------------------------------
// 1. THE F-01 KILLER. A PAT pasted while a license blob is still sitting in the
//    PAT slot must NOT overwrite it.
//
//    This is the scenario that actually matters, and the first version of it was
//    wrong twice: it asserted the blob would migrate to the license slot, which
//    cannot happen here — the fixture's signature is worthless, so verify
//    returns null and the copy is rolled back by design (see scenario 4). Asserting
//    a migration that only a genuinely signed key can produce would be a green
//    test that proves nothing.
// ---------------------------------------------------------------------------
async function patPasteDoesNotDestroyBlob(page) {
	await open(page);
	await page.evaluate(
		([lic, pat, k]) => {
			localStorage.clear();
			localStorage.setItem(lic, k);
			localStorage.setItem(pat, k);
			localStorage.removeItem("vni_pat_cleared_v1");
		},
		[LICENSE_SLOT, PAT_SLOT, STRUCTURAL_KEY],
	);
	// Paste a PAT through the same path the Settings modal uses, then reload.
	await page.evaluate(([pat, tok]) => { localStorage.setItem(pat, tok); }, [PAT_SLOT, "vni_pasted_token"]);
	const licBefore = await page.evaluate((l) => localStorage.getItem(l), LICENSE_SLOT);
	const patAfter = await page.evaluate((p) => localStorage.getItem(p), PAT_SLOT);
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForTimeout(4000);
	const lic = await page.evaluate((l) => localStorage.getItem(l), LICENSE_SLOT);
	console.log(
		"[1] license survives a PAT paste:",
		lic === STRUCTURAL_KEY ? "OK" : "LOST (" + lic + ")",
		"| pat slot held the paste:", patAfter === "vni_pasted_token",
		"| license unchanged across reload:", licBefore === lic,
	);
	return lic === STRUCTURAL_KEY && licBefore === lic;
}

// ---------------------------------------------------------------------------
// 2. Legacy prefix token: one-time wipe is preserved. Unchanged behaviour.
// ---------------------------------------------------------------------------
async function legacyWipedOnce(page) {
	await open(page);
	await page.evaluate((k) => { localStorage.clear(); localStorage.setItem("vni_pat", k); }, LEGACY_KEY);
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForTimeout(4000);
	const after = await page.evaluate(() => localStorage.getItem("vni_pat"));
	const flag = await page.evaluate(() => localStorage.getItem("vni_pat_cleared_v1"));
	console.log("[2] legacy after reload:", after === null ? "WIPED (fail-closed kept)" : "KEPT: " + after, "| flag:", flag);
	return after === null && flag === "1";
}

// ---------------------------------------------------------------------------
// 3. A non-legacy token: SEC-01 wipes it exactly once and then leaves it alone.
//    The first draft of this scenario asserted the token simply survives, which
//    is false on a first run and would have been a red test for correct
//    behaviour. The invariant worth locking is the ONCE.
// ---------------------------------------------------------------------------
async function nonLegacyTokenWipedOnceThenKept(page) {
	await open(page);
	await page.evaluate((k) => { localStorage.clear(); localStorage.setItem("vni_pat", k); }, REAL_TOKEN);
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForTimeout(4000);
	const firstPass = await page.evaluate((p) => [localStorage.getItem(p), localStorage.getItem("vni_pat_cleared_v1")], PAT_SLOT);
	await page.evaluate((p) => { localStorage.setItem(p, "vni_pasted_after_flag"); }, PAT_SLOT);
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForTimeout(4000);
	const second = await page.evaluate((p) => localStorage.getItem(p), PAT_SLOT);
	console.log(
		"[3] non-legacy token: first run wiped:",
		firstPass[0] === null && firstPass[1] === "1",
		"| after the flag, a new token survives:",
		second === "vni_pasted_after_flag",
	);
	return firstPass[0] === null && firstPass[1] === "1" && second === "vni_pasted_after_flag";
}

// ---------------------------------------------------------------------------
// 4. Verify-fail: the copy is rolled back and the blob stays put. Never promoted
//    into a slot we would then treat as authoritative.
// ---------------------------------------------------------------------------
async function notMigratedOnVerifyFail(page) {
	await open(page);
	await page.evaluate(
		([lic, pat, k]) => {
			localStorage.clear();
			localStorage.setItem(pat, k);
			localStorage.removeItem("vni_pat_cleared_v1");
		},
		[LICENSE_SLOT, PAT_SLOT, STRUCTURAL_KEY],
	);
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForTimeout(4000);
	const [lic, pat] = await page.evaluate(
		([l, p]) => [localStorage.getItem(l), localStorage.getItem(p)],
		[LICENSE_SLOT, PAT_SLOT],
	);
	console.log(
		"[4] verify-fail rolls the copy back:",
		lic === null ? "OK" : "LEFT BEHIND (" + lic + ")",
		"| blob preserved in pat slot:", pat === STRUCTURAL_KEY,
	);
	return lic === null && pat === STRUCTURAL_KEY;
}

// ---------------------------------------------------------------------------
// 5. The credential crossing. A blob anywhere must never reach the wire as a
//    bearer token, even with a stored backend pushing the auth path.
// ---------------------------------------------------------------------------
async function blobNeverOnTheWire(page) {
	const blobOnWire = watchBlobOnTheWire(page);
	let authMeHits = 0;
	page.on("request", (req) => {
		if (/\/core\/v1\/auth\/me/.test(req.url())) authMeHits++;
	});
	await open(page);
	await page.evaluate(
		([lic, pat, k]) => {
			localStorage.clear();
			localStorage.setItem(pat, k);
			localStorage.setItem("vni_api_base", "http://127.0.0.1:1");
			localStorage.removeItem("vni_pat_cleared_v1");
		},
		[LICENSE_SLOT, PAT_SLOT, STRUCTURAL_KEY],
	);
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForTimeout(5000);
	const rootBooted = await page.evaluate(() => (document.querySelector("#root")?.children.length ?? 0) > 0);
	console.log(
		"[5] blob as bearer token:",
		blobOnWire.length === 0 ? "never (OK)" : "LEAKED on " + blobOnWire.length + " request(s)",
		"| /auth/me hits:", authMeHits,
		"| app booted:", rootBooted,
	);
	return blobOnWire.length === 0 && rootBooted;
}

// ---------------------------------------------------------------------------
// 6. Non-secure context names its cause instead of silently showing free.
//    A real plain-http LAN-IP host is not automatable here, so the page is
//    launched with isSecureContext forced false — the exact condition the
//    diagnostics hook reads. The assertion is on the UI copy, not on the tier.
// ---------------------------------------------------------------------------
async function insecureContextDiagnosed(browser) {
	const page = await browser.newPage();
	// A real plain-http page has BOTH isSecureContext=false AND no crypto.subtle.
	// Forcing only the first would test the copy against a condition that never
	// occurs in production (CS-6 audit). Override both.
	await page.addInitScript(() => {
		try {
			Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
		} catch { /* ignore */ }
		try {
			Object.defineProperty(window, "crypto", { value: undefined, configurable: true });
		} catch { /* ignore */ }
	});
	await open(page);
	for (const s of ['button[aria-label*="Cài đặt"]', 'button[title*="Cài đặt"]']) {
		const el = page.locator(s).first();
		if (await el.count()) { await el.click().catch(() => {}); break; }
	}
	await page.waitForTimeout(2000);
	const tab = page.getByText("Bản quyền SaaS", { exact: false }).first();
	if (await tab.count()) await tab.click().catch(() => {});
	await page.waitForTimeout(1500);
	const text = await page.evaluate(() => document.body.innerText);
	await page.close();
	const shown = /HTTPS|insecure|Web Crypto/i.test(text);
	console.log("[6] insecure-context diagnostic shown:", shown);
	return shown;
}

(async () => {
	const browser = await chromium.launch();
	const results = [];
	const run = async (name, fn) => {
		const page = await browser.newPage();
		let ok = false;
		try {
			ok = await fn(page);
		} catch (e) {
			console.log(`[${name}] ERROR`, e && e.message);
		}
		results.push({ name, ok });
		await page.close();
	};
	await run(1, patPasteDoesNotDestroyBlob);
	await run(2, legacyWipedOnce);
	await run(3, nonLegacyTokenWipedOnceThenKept);
	await run(4, notMigratedOnVerifyFail);
	await run(5, blobNeverOnTheWire);
	try {
		const ok6 = await insecureContextDiagnosed(browser);
		results.push({ name: 6, ok: ok6 });
	} catch (e) {
		console.log("[6] ERROR", e && e.message);
		results.push({ name: 6, ok: false });
	}
	await browser.close();

	const pass = results.filter((r) => r.ok).length;
	for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
	console.log(
		pass === results.length
			? `VERIFY:LICENSE-PERSIST ${pass}/${results.length} PASS`
			: `VERIFY:LICENSE-PERSIST ${pass}/${results.length} FAILED`,
	);
	process.exit(pass === results.length ? 0 : 1);
})();
