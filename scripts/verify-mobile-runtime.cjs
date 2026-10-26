// UX-04/UX-03 runtime proof in a real browser (not jsdom).
//
// What jsdom could NOT prove, and this script does:
//   - a 390px container really resolves viewportMode === "mobile" and the FAB
//     really appears (the container breakpoint, UX-04);
//   - tapping the FAB really opens the flyout WITHOUT React throwing
//     "Rendered more hooks than during the previous render" — the P0 fixed in
//     MobileToolbar (useDialogFocus sat after `if (!isOpen) return null`);
//   - the flyout really contains the timeframe section (workspace-driven, with
//     a timeframe the workspace owns and MobileToolbar's defaults do not) and
//     the Pine/Strategy section, which used to be missing on mobile;
//   - in a 2-chart workspace the a11y summary ids are unique and every
//     aria-describedby resolves to its OWN summary (they were all hardcoded to
//     one id, so chart #2 announced chart #1's data).
//
// Usage:
//   npm run watch                                   # in another shell
//   node scripts/verify-mobile-runtime.cjs
// Exit 0 = all steps PASS.
//
// The mobile FAB lives in VNInvestMultiCharts, so the mobile steps run against
// the multi-chart demo (the demo root). `?standalone=1` renders the SINGLE
// chart, which has no FAB at all.
const { chromium } = require("playwright");

const WATCH_URL = process.env.WATCH_URL || "http://localhost:3000/";
const results = [];
const pageErrors = [];
const consoleErrors = [];

function step(name, ok, detail = "") {
	results.push({ name, ok });
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

/** Both locales, because the component resolves its own locale at runtime. */
const LABELS = {
	timeframe: ["Timeframe", "Khung thời gian"],
	features: ["Features", "Tính năng"],
	pine: ["Pine Editor", "Trình soạn Pine"],
	strategy: ["Strategy Tester", "Thử nghiệm"],
};

const hasAny = (scopeText, keys) => keys.some((k) => scopeText.includes(k));

async function openDemo(browser, viewport) {
	const page = await browser.newPage({ viewport });
	page.on("pageerror", (e) => pageErrors.push(e.message));
	page.on("console", (m) => {
		if (m.type() === "error") consoleErrors.push(m.text());
	});
	await page.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
	// Give the engine time to mount and paint.
	await page.waitForSelector("canvas", { timeout: 30000 }).catch(() => {});
	await page.waitForTimeout(2500);
	return page;
}

async function stepMobileFlyout(browser) {
	const page = await openDemo(browser, { width: 390, height: 740 });

	const fab = await page.$("button.vnsc-mobile-fab");
	step("MX-01 mobile FAB visible at 390px", Boolean(fab));
	if (!fab) {
		await page.close();
		return;
	}

	const before = pageErrors.length;
	await fab.click();
	await page.waitForTimeout(1200);

	const hookErrors = pageErrors
		.slice(before)
		.filter((m) => /Rendered more hooks|Hooks called|Minified React error/i.test(m));
	step(
		"MX-02 opening the flyout throws no React hook error",
		hookErrors.length === 0,
		hookErrors.join(" | "),
	);

	// The workspace must not be replaced by the error card.
	const alertVisible = await page.evaluate(() => {
		const el = document.querySelector('[role="alert"]');
		return Boolean(el && el.textContent && el.textContent.trim().length > 0);
	});
	step("MX-03 no error card after opening the flyout", !alertVisible);

	const dialog = await page.evaluate(() => {
		const d = document.querySelector('[role="dialog"]');
		if (!d) return null;
		return { text: d.textContent || "", buttons: d.querySelectorAll("button").length };
	});
	step("MX-04 mobile flyout opened", Boolean(dialog), dialog ? `${dialog.buttons} buttons` : "no dialog");

	if (dialog) {
		step(
			"MX-05 timeframe section present (onTimeframeChange forwarded)",
			hasAny(dialog.text, LABELS.timeframe),
		);
		// "30m" is contributed by the workspace union only; MobileToolbar's own
		// default list has no 30m, so its presence proves the prop was forwarded.
		const has30m = await page.evaluate(() => {
			const d = document.querySelector('[role="dialog"]');
			if (!d) return false;
			return Array.from(d.querySelectorAll("button")).some((b) => (b.textContent || "").trim() === "30m");
		});
		step("MX-06 workspace timeframe 30m offered", has30m);
		step(
			"MX-07 Pine/Strategy section present (onTabChange forwarded)",
			hasAny(dialog.text, LABELS.features) && hasAny(dialog.text, LABELS.pine) && hasAny(dialog.text, LABELS.strategy),
		);
	}

	// Close, then reopen: the closed -> open -> closed hook cycle must be stable.
	await page.keyboard.press("Escape");
	await page.waitForTimeout(600);
	await page.click("button.vnsc-mobile-fab");
	await page.waitForTimeout(1000);
	const afterCycle = pageErrors.filter((m) => /Rendered more hooks|Hooks called/i.test(m));
	step("MX-08 reopen after close stays stable", afterCycle.length === 0, afterCycle.join(" | "));

	// A container that is narrow must not be treated as the viewport.
	const fabAtDesktopViewport = await page.evaluate(() => {
		const root = document.querySelector(".vnsc-multicharts-root");
		return root ? Math.round(root.getBoundingClientRect().width) : -1;
	});
	step("MX-09 container width is the phone width, not the window", fabAtDesktopViewport > 0 && fabAtDesktopViewport < 768, `${fabAtDesktopViewport}px`);

	await page.close();
}

async function stepDesktopA11yIds(browser) {
	const page = await openDemo(browser, { width: 1440, height: 900 });
	const info = await page.evaluate(() => {
		const summaries = Array.from(document.querySelectorAll('[data-testid="chart-a11y-summary"]'));
		const ids = summaries.map((s) => s.id);
		const regions = Array.from(document.querySelectorAll("[aria-describedby]"));
		const resolved = regions.map((r) => {
			const id = r.getAttribute("aria-describedby");
			const el = document.getElementById(id);
			return {
				id,
				found: Boolean(el),
				insideSameRegion: el ? r.contains(el) : false,
				text: el ? (el.textContent || "").slice(0, 40) : "",
			};
		});
		return { count: summaries.length, uniqueIds: new Set(ids).size, ids, resolved };
	});
	step("A11Y-01 a11y summary present", info.count > 0, `${info.count} summary node(s)`);
	step(
		"A11Y-02 every a11y summary id is unique",
		info.count === 0 || info.uniqueIds === info.count,
		`${info.uniqueIds}/${info.count} unique`,
	);
	const allResolved = info.resolved.every((r) => r.found);
	step("A11Y-03 every aria-describedby resolves to a real element", allResolved, JSON.stringify(info.resolved.map((r) => r.id)));
	const allOwn = info.resolved.every((r) => r.insideSameRegion);
	step("A11Y-04 each region points at ITS OWN summary (multi-chart)", allOwn);

	const canvas = await page.evaluate(() => {
		const c = document.querySelector("canvas");
		if (!c) return null;
		const r = c.getBoundingClientRect();
		return { w: Math.round(r.width), h: Math.round(r.height) };
	});
	step("A11Y-05 chart canvas has real size", Boolean(canvas && canvas.w > 50 && canvas.h > 50), JSON.stringify(canvas));

	await page.close();
}

(async () => {
	const browser = await chromium.launch();
	try {
		await stepMobileFlyout(browser);
		await stepDesktopA11yIds(browser);

		const realErrors = pageErrors.filter((e) => !/ResizeObserver loop|favicon/i.test(e));
		step("RT-01 zero page errors across both viewports", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
		const realConsole = consoleErrors.filter((e) => !/getContext|Download the React DevTools|WebGL|SwiftShader/i.test(e));
		step("RT-02 zero console errors (canvas/DevTools noise filtered)", realConsole.length === 0, realConsole.slice(0, 3).join(" | "));

		const ok = results.filter((r) => r.ok).length;
		console.log(`\nRESULT: ${ok}/${results.length} ${ok === results.length ? "PASS" : "FAIL"}`);
		process.exitCode = ok === results.length ? 0 : 1;
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(`FATAL: ${e.message}`);
	process.exitCode = 1;
});
