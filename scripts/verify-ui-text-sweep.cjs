// General runtime defect sweep: crawl the real UI and report anything a user
// would consider broken.
//
// Catches, per surface:
//   - raw i18n keys leaking into visible text (e.g. "drawingTool.priceLabel").
//     `t()` returns the key when a translation is missing, and no static gate
//     can see a *dynamic* key, so this is only observable in a real browser.
//   - error cards ([role="alert"]) left on screen by a crashed subtree.
//   - untranslated-but-visible text that still looks like an identifier.
//
// Surfaces: single chart (?standalone=1), multi chart (/), plus the settings
// modal and the shortcut-help modal opened through their real triggers.
//
// Usage:
//   npm run watch
//   node scripts/verify-ui-text-sweep.cjs
// Exit 0 = clean.
const { chromium } = require("playwright");

const BASE = process.env.WATCH_URL || "http://localhost:3000";
const findings = [];
const pageErrors = [];
const consoleErrors = [];

// A leaked key looks like `namespace.camelCase` with no spaces. Kept tight so
// real sentences are not flagged.
const KEY_LIKE = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/;
// Known i18n namespaces: a hit inside one of these is certainly a leaked key.
const NAMESPACES = [
	"mobile", "tool", "tools", "drawingTool", "premium", "advisory", "widget", "pane",
	"library", "footer", "systemMenu", "settings", "error", "saas", "a11y", "toast",
	"order", "trade", "trading", "replay", "pine", "strategy", "watchlist", "alert",
	"news", "timeframe", "chart", "indicator", "compare", "drawing", "dock", "search",
	"shortcut", "theme", "language", "license", "licensing", "tenant", "help",
];

function isLeakedKey(text) {
	if (!KEY_LIKE.test(text)) return false;
	const ns = text.split(".")[0];
	return NAMESPACES.includes(ns);
}

async function auditPage(page, label) {
	const texts = await page.evaluate(() => {
		const out = [];
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		let n;
		while ((n = walker.nextNode())) {
			const el = n.parentElement;
			if (!el) continue;
			// Skip anything not visible to the user.
			const style = window.getComputedStyle(el);
			if (style.display === "none" || style.visibility === "hidden") continue;
			const v = (n.nodeValue || "").trim();
			if (v) out.push({ text: v, tag: el.tagName, testid: el.getAttribute("data-testid") || "" });
		}
		return out;
	});

	for (const t of texts) {
		if (isLeakedKey(t.text)) {
			findings.push(`${label}: leaked i18n key "${t.text}" (<${t.tag.toLowerCase()}${t.testid ? ` data-testid="${t.testid}"` : ""}>)`);
		}
	}

	const alerts = await page.evaluate(() =>
		Array.from(document.querySelectorAll('[role="alert"]'))
			.map((el) => (el.textContent || "").trim().slice(0, 120))
			.filter((t) => t.length > 0),
	);
	for (const a of alerts) findings.push(`${label}: error card on screen -> "${a}"`);

	const canvases = await page.evaluate(() =>
		Array.from(document.querySelectorAll("canvas")).map((c) => {
			const r = c.getBoundingClientRect();
			return { w: Math.round(r.width), h: Math.round(r.height) };
		}),
	);
	const sized = canvases.filter((c) => c.w > 20 && c.h > 20);
	console.log(`${label}: ${texts.length} visible text nodes, ${canvases.length} canvas (${sized.length} sized), ${alerts.length} alert(s)`);
}

async function openSurface(browser, url, label, { viewport = { width: 1440, height: 900 } } = {}) {
	const page = await browser.newPage({ viewport });
	page.on("pageerror", (e) => pageErrors.push(`${label}: ${e.message}`));
	page.on("console", (m) => {
		if (m.type() === "error") consoleErrors.push(`${label}: ${m.text()}`);
	});
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForTimeout(3500);
	await auditPage(page, label);
	return page;
}

/** Click a trigger by several strategies so a label/i18n change cannot silently skip the check. */
async function clickAny(page, selectors) {
	for (const sel of selectors) {
		const el = await page.$(sel);
		if (el) {
			await el.click().catch(() => {});
			await page.waitForTimeout(1200);
			return true;
		}
	}
	return false;
}

(async () => {
	const browser = await chromium.launch();
	try {
		// 1. Single chart, then open its settings + shortcut help modals.
		const single = await openSurface(browser, `${BASE}/?standalone=1`, "single");
		const dialogCount = async (p) => p.evaluate(() => document.querySelectorAll('[role="dialog"]').length);

		const openedSettings = await clickAny(single, [
			'[data-testid="settings-button"]',
			'button[aria-label*="settings" i]',
			'button[aria-label*="cài đặt" i]',
			'button[title*="settings" i]',
		]);
		if (openedSettings && (await dialogCount(single)) > 0) {
			await auditPage(single, "single/settings");
			// Close before the next modal, otherwise the second audit would just
			// re-read the first modal's DOM and report a false clean.
			await single.keyboard.press("Escape").catch(() => {});
			await single.waitForTimeout(700);
		} else {
			findings.push("single/settings: settings modal did not open (no [role=dialog] after click)");
		}

		const beforeHelp = await single.evaluate(() => document.body.innerText.length);
		const openedHelp = await clickAny(single, [
			'[data-testid="shortcut-help-button"]',
			'button[aria-label*="shortcut" i]',
			'button[aria-label*="phím tắt" i]',
		]);
		const afterHelp = await single.evaluate(() => document.body.innerText.length);
		if (openedHelp && (await dialogCount(single)) > 0 && afterHelp > beforeHelp) {
			await auditPage(single, "single/shortcut-help");
		} else {
			findings.push(
				`single/shortcut-help: did not open (clicked=${openedHelp} dialogs=${await dialogCount(single)} text ${beforeHelp}->${afterHelp})`,
			);
		}
		await single.close();

		// 2. Multi chart at desktop, tablet and phone widths.
		for (const [w, h, name] of [[1440, 900, "multi-desktop"], [820, 1180, "multi-tablet"], [390, 740, "multi-phone"]]) {
			const page = await openSurface(browser, BASE, name, { viewport: { width: w, height: h } });
			if (name === "multi-phone") {
				const fab = await page.$("button.vnsc-mobile-fab");
				if (fab) {
					await fab.click();
					await page.waitForTimeout(1200);
					const open = await page.evaluate(() => document.querySelectorAll('[role="dialog"]').length);
					if (open > 0) await auditPage(page, "multi-phone/flyout");
					else findings.push("multi-phone/flyout: FAB clicked but no [role=dialog] appeared");
				} else {
					findings.push("multi-phone: mobile FAB missing at 390px");
				}
			}
			await page.close();
		}

		const realPageErrors = pageErrors.filter((e) => !/ResizeObserver loop|favicon/i.test(e));
		const realConsole = consoleErrors.filter(
			(e) => !/getContext|React DevTools|WebGL|SwiftShader|Failed to load resource/i.test(e),
		);
		if (realPageErrors.length) findings.push(`page errors:\n    ${realPageErrors.slice(0, 5).join("\n    ")}`);
		if (realConsole.length) findings.push(`console errors:\n    ${realConsole.slice(0, 5).join("\n    ")}`);

		console.log(`\n${"=".repeat(60)}`);
		if (findings.length === 0) {
			console.log("RESULT: 0 findings — no leaked i18n keys, no error cards, no runtime errors");
			process.exitCode = 0;
		} else {
			console.log(`RESULT: ${findings.length} finding(s):`);
			for (const f of findings) console.log(`  * ${f}`);
			process.exitCode = 1;
		}
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(`FATAL: ${e.message}`);
	process.exitCode = 1;
});
