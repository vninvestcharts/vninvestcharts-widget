// UX-05: error / empty / loading states must be understandable and RECOVERABLE.
//
// Measured on the real widget with the real backend, by controlling the network
// from the browser side:
//
//   fail  -> the API is aborted. Assert: a translated message (no raw JS error
//            text such as "Failed to fetch"), and a retry button that exists.
//   heal  -> the API is restored and retry is clicked. Assert: the chart
//            recovers on its own, with no page reload.
//
// Both directions used to fail:
//   - WidgetEmptyState rendered `${t("widget.error")}: ${error.message}`, so
//     users saw an untranslated "Failed to fetch" inside the Vietnamese UI;
//   - the error state offered no recovery at all, despite the copy saying
//     "check your connection and retry" — the only way out was a page reload.
//
// Usage:
//   npm run watch
//   node scripts/verify-ux05-recovery.cjs
// Exit 0 = all steps PASS.
const { chromium } = require("playwright");

const BASE = process.env.WATCH_URL || "http://localhost:3000";
const results = [];
const pageErrors = [];

function step(name, ok, detail = "") {
	results.push({ name, ok });
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

const state = (page) =>
	page.evaluate(() => {
		const visible = (el) => {
			const s = window.getComputedStyle(el);
			return s.display !== "none" && s.visibility !== "hidden" && el.offsetParent !== null;
		};
		const alerts = Array.from(document.querySelectorAll('[role="alert"]'))
			.filter(visible)
			.map((el) => (el.textContent || "").trim());
		const retryButtons = Array.from(document.querySelectorAll("button"))
			.filter(visible)
			.filter((b) => /thử lại|retry/i.test((b.getAttribute("aria-label") || b.textContent || "").trim()));
		const errorCodes = Array.from(document.querySelectorAll("[data-error-code]"))
			.filter(visible)
			.map((el) => el.getAttribute("data-error-code"));
		return {
			alerts,
			retryCount: retryButtons.length,
			errorCodes,
			bodyText: document.body.innerText,
			canvases: document.querySelectorAll("canvas").length,
		};
	});

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	page.on("pageerror", (e) => pageErrors.push(e.message));

	// --- 1. break the network -------------------------------------------------
	let broken = true;
	await page.route("**/core/v1/**", (r) => (broken ? r.abort("failed") : r.continue()));
	await page.route("**/api/**", (r) => (broken ? r.abort("failed") : r.continue()));
	await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForTimeout(7000);

	const failed = await state(page);
	const joined = failed.alerts.join(" | ");
	step("UX05-1 an error state is shown when data cannot load", failed.errorCodes.length > 0, failed.alerts.join(" | ").slice(0, 90));
	step(
		"UX05-2 the message is translated, not a raw JS/network error",
		failed.alerts.length > 0 && !/Failed to fetch|NetworkError|undefined|null/i.test(failed.alerts.join(" ")),
		failed.alerts.join(" | ").slice(0, 120),
	);
	step("UX05-3 the error state offers a retry action", failed.retryCount > 0, `${failed.retryCount} retry button(s)`);
	step("UX05-4 the error state carries a machine-readable code", failed.errorCodes.length > 0, failed.errorCodes.join(","));

	// --- 2. restore the network and retry ------------------------------------
	broken = false;
	// Click EVERY retry button: the workspace renders one error state per chart,
	// and each owns its own reload. Clicking only the first left the second
	// chart stuck, which looked like a failed recovery.
	const retryButtons = await page.$$("[data-error-code] button");
	for (const b of retryButtons) {
		await b.click().catch(() => {});
		await page.waitForTimeout(200);
	}
	// Give the reload effect time to fetch and paint. Assert on the ERROR STATE
	// ([data-error-code]), not on every [role="alert"]: the transient toast also
	// uses role=alert and legitimately lingers for a few seconds after the
	// failure, so counting it would fail a correct recovery.
	let recovered = false;
	for (let i = 0; i < 24; i += 1) {
		await page.waitForTimeout(1000);
		const s = await state(page);
		if (s.errorCodes.length === 0) {
			recovered = true;
			step("UX05-5 retry recovers without a page reload", true, `after ~${i + 1}s, ${s.canvases} canvas`);
			step("UX05-6 the chart is painting again", s.canvases > 0, `${s.canvases} canvas`);
			break;
		}
	}
	if (!recovered) {
		step("UX05-5 retry recovers without a page reload", false, `still ${(await state(page)).errorCodes.length} error state(s) after 24s`);
	}

	const realErrors = pageErrors.filter((e) => !/ResizeObserver loop|favicon/i.test(e));
	step("UX05-7 no page errors during the whole cycle", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));

	const ok = results.filter((r) => r.ok).length;
	console.log(`\nRESULT: ${ok}/${results.length} ${ok === results.length ? "PASS" : "FAIL"}`);
	process.exitCode = ok === results.length ? 0 : 1;
	await browser.close();
})().catch((e) => {
	console.error(`FATAL: ${e.message}`);
	process.exitCode = 1;
});
