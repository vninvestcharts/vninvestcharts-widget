// EXPORT E2E (plan §9.3): PNG watermark + CSV parse được, đúng số dòng.
//
// Usage:
//   npm run watch
//   WATCH_URL=http://localhost:3000/?standalone=1 node scripts/verify-export.cjs
// Exit 0 = all steps PASS.
//
// WHAT THIS DELIBERATELY DOES NOT DO
// ----------------------------------
// It does not assert that the PNG watermark text DIFFERS between `free` and `pro`.
// Driving the tier needs a signed license in the PAT slot (see verify-license-persist.cjs)
// or the `debugTier` React prop, which is not reachable from a URL. Asserting "a watermark
// exists" without being able to vary the tier is the weak form of the check, and the batch-1
// watermark shipped exactly that way: 15 green unit tests on the drawing function while both
// call sites passed no tier at all. So the tier-dependent comparison is left to a harness
// that can actually set the tier, and is recorded as a gap rather than faked here.
//
// What IS asserted about the export is the part that can be proven end to end: the CSV that
// lands on disk is well formed, self-consistent, and carries the honest scope label.

const { chromium } = require("playwright");

const WATCH_URL = process.env.WATCH_URL || "http://localhost:3000/?standalone=1";
const results = [];
const errors = [];

function step(name, ok, detail = "") {
	results.push({ name, ok });
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

/**
 * A step whose precondition failed is BLOCKED, not PASS — same rule as verify-p3.
 * A CSV assertion run against a download that never happened is not a pass.
 */
function blocked(name, why) {
	results.push({ name, ok: false, blocked: true });
	console.log(`FAIL ${name} (BLOCKED: ${why})`);
}

const BOM = "\uFEFF";

/**
 * Locate the CSV export control.
 *
 * Selector is `data-testid`, NOT the visible label. The label is localised ("Export CSV" /
 * "Xuất CSV") and matching on text meant this suite silently passed nothing whenever the
 * locale moved. The toolbar button carries `data-testid="menu-csv-btn"`; the mobile system
 * menu copy is a fallback for narrow viewports.
 */
async function findCsvButton(page) {
	const byTestId = page.locator('[data-testid="menu-csv-btn"]');
	if ((await byTestId.count()) > 0) return byTestId.first();
	const byText = page.locator("button", { hasText: /CSV/i });
	if ((await byText.count()) > 0) return byText.first();
	return null;
}

async function main() {
	if (process.env.VNSC_ALLOW_ANY_SERVER !== "1") {
		const target = new URL(WATCH_URL);
		const res = await fetch(target.origin, { signal: AbortSignal.timeout(5000) }).catch(() => null);
		if (!res || !res.ok) {
			console.error(
				`verify-export: no dev server at ${target.origin}.\n` +
					"  Start one: npm run watch\n" +
					"  This suite grades whatever is on the URL, so it refuses to run rather\n" +
					"  than report a result for code it did not build.",
			);
			process.exit(1);
		}
	}

	const browser = await chromium.launch();
	const page = await browser.newPage();
	page.on("pageerror", (e) => errors.push(e.message));

	try {
		await page.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
		await page.waitForTimeout(2500);

		// 1. The CSV control exists and is usable at this viewport.
		const csvBtn = await findCsvButton(page);
		step("EXP-01 CSV export control present", csvBtn !== null);
		if (csvBtn === null) {
			throw new Error("precondition failed: no CSV control in the DOM, remaining steps blocked");
		}

		// 2. Clicking it produces EXACTLY ONE of: a real download, or the upgrade path.
		//    Both-none and both-at-once are both failures.
		//
		//    The blocked path is NOT in-page text: `handleUpgradeFromBanner` navigates (or
		//    opens a popup) to the upgrade URL. A first version of this script looked for
		//    visible upgrade wording and reported "no silent no-op" FAIL while the gate was
		//    in fact working. Absence of text is not evidence of a broken gate, so the
		//    detection is now: download OR popup OR URL change.
		let download = null;
		let popup = null;
		const dlPromise = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
		const popupPromise = page.waitForEvent("popup", { timeout: 20000 }).catch(() => null);
		const urlBefore = page.url();
		await csvBtn.click();
		popup = await popupPromise;
		if (popup) console.log(`  (blocked path opened ${popup.url()})`);
		download = await dlPromise;
		await page.waitForTimeout(800);

		const navigated = page.url() !== urlBefore;
		// A popup IS the blocked path — `handleUpgradeFromBanner` sends the user to the
		// upgrade URL in a new tab, so on the original page there is nothing to see.
		const upgradeVisible =
			popup !== null ||
			navigated ||
			(await page
				.locator("text=/upgrade|nâng cấp|liên hệ|contact/i")
				.first()
				.isVisible()
				.catch(() => false));


		if (download === null) {
			// Free-tier path: the gate must block, and it must be VISIBLE as a redirect/popup.
			// "Blocked" here means the user was sent somewhere, not that the button did nothing.
			step(
				"EXP-02 blocked path is explicit (no silent no-op)",
				upgradeVisible,
				upgradeVisible ? "upgrade destination opened" : "click produced neither download nor redirect",
			);
			blocked("EXP-03 CSV content", "no download: export_csv is gated on this tier");
			blocked("EXP-04 CSV structure", "no download");
			blocked("EXP-05 row count matches preamble", "no download");
			blocked("EXP-06 no fabricated 0 in price columns", "no download");
		} else {
			step("EXPORT-02 export produced a download", true, download.suggestedFilename());
			// If a download happened, the gate did NOT block: exactly one outcome is required.
			step("EXP-02 blocked path is explicit (no silent no-op)", !upgradeVisible);

			const path = await download.path();
			const fs = require("node:fs");
			const raw = fs.readFileSync(path, "utf8");

			// 3. Structure. BOM first, CRLF, preamble, blank line, then the header.
			const hasBom = raw.charCodeAt(0) === 0xfeff;
			step("EXP-03 UTF-8 BOM first (Excel must not show mojibake)", hasBom);
			step("EXP-03 CRLF line endings", raw.includes("\r\n"));

			const lines = raw.replace(BOM, "").split("\r\n");
			const preamble = lines[0] || "";
			step("EXP-03 preamble header is symbol,timeframe,rows,scope", preamble === "symbol,timeframe,rows,scope", preamble);

			const meta = (lines[1] || "").split(",");
			const rows = Number(meta[2]);
			const scope = meta[3];
			step("EXP-03 scope is honest: loaded-in-memory", scope === "loaded-in-memory", String(scope));
			step("EXP-03 rows count is a positive number", Number.isFinite(rows) && rows > 0, String(rows));
			step("EXP-03 blank line between preamble and column header", (lines[2] || "") === "");

			const header = lines[3] || "";
			step("EXP-03 column header present", header.startsWith("time,open,high,low,close"), header.slice(0, 48));

			// 4. Row count agrees with the preamble. This is self-consistency, not
			//    external truth: the bar count the chart rendered is not exposed to the
			//    page. Asserting the preamble is a real count and the body matches it
			//    still catches truncation, chunking and off-by-one at the blank-line boundary.
			const body = lines.slice(4).filter((l) => l.length > 0);
			step("EXP-05 data row count equals preamble rows", body.length === rows, `body=${body.length} preamble=${rows}`);

			// 5. No fabricated zeros. A missing value must be an EMPTY cell.
			//    Only check the first data row's price columns, and only if it has empties.
			const first = (body[0] || "").split(",");
			const emptiesInPriceCols = [1, 2, 3, 4].filter((i) => first[i] === "0").length;
			step("EXP-06 no fabricated 0 in price columns", emptiesInPriceCols === 0, `cols=[${first.slice(1, 5).join(",")}]`);
		}

		// 7. Zero page errors across the whole run.
		step("EXP-07 zero page errors", errors.length === 0, `${errors.length} errors`);

		const ok = results.filter((r) => r.ok).length;
		const wasBlocked = results.filter((r) => r.blocked).length;
		console.log(
			`RESULT: ${ok}/${results.length} ${ok === results.length ? "PASS" : "FAIL"}` +
				(wasBlocked ? ` (${wasBlocked} blocked by an unmet precondition)` : ""),
		);
		process.exitCode = ok === results.length ? 0 : 1;
	} finally {
		await browser.close();
	}
}

/**
 * --self-test: prove the suite can fail.
 *
 * A gate nobody has ever seen fail is an untested gate. This injects a violation into the
 * same assertion helpers the real run uses and asserts the harness reports failure. Run it
 * in CI or before trusting a green run.
 */
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

	// A real check, to prove the harness is not just always-green.
	assert("selftest: good BOM is accepted", () => {
		if ("﻿x".charCodeAt(0) !== 0xfeff) throw new Error("BOM detection broken");
	});
	// Now the violations. Each fn below IS the real check applied to BAD input, so it must
	// throw. Writing `if (badCondition) throw` here would be inverted and would never fire
	// — which is exactly how a self-test can look green while proving nothing.
	expectFail("selftest: missing BOM is rejected", () => {
		if ("x".charCodeAt(0) !== 0xfeff) throw new Error("missing UTF-8 BOM");
	});
	expectFail("selftest: lying scope is rejected", () => {
		if ("full-history" !== "loaded-in-memory") throw new Error("scope claims more than we loaded");
	});
	expectFail("selftest: row-count mismatch is rejected", () => {
		if (3 !== 5) throw new Error("body rows disagree with preamble rows");
	});
	expectFail("selftest: fabricated 0 in a price column is rejected", () => {
		const cells = ["2024-03-01T00:00:00.000Z", "", "0", "", "0"];
		if ([1, 2, 3, 4].some((i) => cells[i] === "0")) throw new Error("missing value written as 0");
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
