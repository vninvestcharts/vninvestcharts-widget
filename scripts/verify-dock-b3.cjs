/**
 * verify-dock-b3.cjs — staging probe cho PLAN_DOCK_SSOT_B3 (Rule 17).
 *
 * Invariant CO DINH giua 2 deploy (probe LUON assert trang thai MONG MUON — khong doi assertion):
 *   B3-RD10         : multi `?rightpanel=1`, dock DONG (fresh context) →
 *                     `[data-testid="demo-right-panel"]` PHAI VANG trong DOM.
 *                     Deploy A (truoc fix): FAIL = RED evidence — bug stacked luon render
 *                     (`RightSidebarDockHost.tsx:254-259`) du dock dong (`:248-253` ep 40px).
 *                     Deploy B (sau fix): PASS. Khi node con hien → in width dock (evidence `40px`).
 *   B3-RD10-CONTROL : click `dock-tab-watchlist` → panel mo → node PHAI HIEN (chong vacuous:
 *                     neu mo ma node van vang thi B3-RD10 vo nghia).
 *
 *   B3-S2-* (S2 single, surface `?standalone=1` → StandaloneEmbedDemo, KHONG param dock):
 *     MOUNT   : strip `dock-tab-watchlist` PHAI ATTACH du khong set `?dock=1` (RD-02 default-on).
 *               Deploy A/B truoc S2: strip vang = RED evidence cho quyet dinh default-on.
 *     OPEN/CLOSE/D1-CLOSED/D1-RESTORE: click tab mo panel; dong persist `vnsc_dock_open=false`
 *               + strip con; reload van dong; mo lai + reload → panel tu mo (D1 restore).
 *
 * Usage (Rule 17 — staging, khong dung localhost):
 *   WATCH_URL=https://charts.edusuccess.vn/ node scripts/verify-dock-b3.cjs
 *   node scripts/verify-dock-b3.cjs   (mac dinh localhost:3000 cho smoke 1 lan)
 */
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright");

const BASE = process.env.WATCH_URL || process.env.URL || "http://localhost:3000/";

const results = [];
function record(name, pass, detail) {
	results.push({ name, pass });
	console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1920, height: 940 } });
	const pageErrors = [];
	page.on("pageerror", (e) => pageErrors.push(String(e)));

	const url = new URL(BASE);
	url.searchParams.set("rightpanel", "1");
	await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 90000 });
	await page.waitForSelector("canvas", { timeout: 30000 }).catch(() => {});
	// Strip nam trong flyout — `visibility: hidden` den khi hover dock (CSS multi),
	// nen chi cho ATTACHED, khong doi visible (doi visible = treo 30s).
	await page.waitForSelector('[data-testid="dock-tab-watchlist"]', { state: "attached", timeout: 30000 });
	await page.waitForTimeout(3000);

	// 1) Trang thai DONG (fresh context — khong localStorage): node PHAI vang.
	const closed = await page.evaluate(() => {
		const nodes = document.querySelectorAll('[data-testid="demo-right-panel"]');
		const closeCount = document.querySelectorAll('[data-testid="dock-panel-close"]').length;
		// Do width khung: di nguoc len element co inline style width (Host dat `width: 40px`
		// khi dong — RightSidebarDockHost.tsx:252). Prod hash class nen khong dung class.
		let el = nodes[0] || null;
		let inlineWidth = null;
		while (el) {
			if (el.style && el.style.width) { inlineWidth = el.style.width; break; }
			el = el.parentElement;
		}
		const node = nodes[0] || null;
		return {
			nodeCount: nodes.length,
			closeCount,
			inlineWidth,
			nodeRect: node ? { w: Math.round(node.getBoundingClientRect().width), h: Math.round(node.getBoundingClientRect().height) } : null,
		};
	});

	record("B3-CLOSED panel dong mac dinh (close count 0)", closed.closeCount === 0, `closeCount=${closed.closeCount}`);
	const shotClosed = path.join(os.tmpdir(), "dock-b3-closed.png");
	await page.screenshot({ path: shotClosed });
	if (closed.nodeCount > 0) {
		console.log(`  [RED evidence] demo-right-panel HIEN khi dock dong: count=${closed.nodeCount} inlineWidth=${closed.inlineWidth} nodeRect=${JSON.stringify(closed.nodeRect)} — screenshot: ${shotClosed}`);
	}
	record("B3-RD10 node VANG khi dock dong", closed.nodeCount === 0, `nodeCount=${closed.nodeCount} inlineWidth=${closed.inlineWidth}`);

	// 2) CONTROL: mo panel bang tab that tren strip (strip luon render ke ca khi dong — `:329-366`).
	// Hover sat mep phai de flyout hien (CSS hover-open cua multi — pattern `verify-dock-zorder.cjs` Z2).
	await page.mouse.move(1920 - 5, 470);
	await page.waitForTimeout(400);
	await page.click('[data-testid="dock-tab-watchlist"]', { timeout: 10000 }).catch(() => {});
	await page.waitForSelector('[data-testid="dock-panel-close"]', { timeout: 15000 }).catch(() => {});
	await page.waitForTimeout(800);

	const open = await page.evaluate(() => ({
		closeCount: document.querySelectorAll('[data-testid="dock-panel-close"]').length,
		nodeCount: document.querySelectorAll('[data-testid="demo-right-panel"]').length,
	}));
	record("B3-CONTROL panel mo duoc (click tab watchlist)", open.closeCount > 0, `closeCount=${open.closeCount}`);
	record("B3-RD10-CONTROL node HIEN khi dock mo", open.nodeCount > 0, `nodeCount=${open.nodeCount}`);

	const shotOpen = path.join(os.tmpdir(), "dock-b3-open.png");
	await page.screenshot({ path: shotOpen });
	console.log(`Screenshot: ${shotClosed} · ${shotOpen}`);
	console.log(`page errors: ${pageErrors.length}${pageErrors.length ? ` — ${pageErrors[0]}` : ""}`);
	record("B3-NOERR khong page error", pageErrors.length === 0);

	// ── S2 SINGLE (RD-02 default-on + D1 close-persist/restore) ──────────────
	// Surface rieng, context rieng (LS sach). Khong tham so dock nao duoc set —
	// chinh la dieu kien default-on can chung minh.
	const single = await browser.newPage({ viewport: { width: 1920, height: 940 } });
	const singleErrors = [];
	single.on("pageerror", (e) => singleErrors.push(String(e)));
	const singleUrl = new URL(BASE);
	singleUrl.searchParams.set("standalone", "1");
	await single.goto(singleUrl.toString(), { waitUntil: "domcontentloaded", timeout: 90000 });
	await single.waitForSelector("canvas", { timeout: 30000 }).catch(() => {});
	// Strip trong flyout (an den khi hover) → chi cho ATTACHED (pattern multi o tren).
	const stripAttached = await single
		.waitForSelector('[data-testid="dock-tab-watchlist"]', { state: "attached", timeout: 20000 })
		.then(() => true)
		.catch(() => false);
	record("B3-S2-MOUNT single mac dinh hien rail (khong param)", stripAttached, stripAttached ? "" : "strip vang — default-on chua co hieu luc (RED truoc S2)");
	await single.waitForTimeout(2000);

	// Mo panel bang tab that tren strip (hover mep phai truoc — flyout CSS).
	await single.mouse.move(1920 - 5, 470);
	await single.waitForTimeout(400);
	await single.click('[data-testid="dock-tab-watchlist"]', { timeout: 10000 }).catch(() => {});
	await single.waitForSelector('[data-testid="dock-panel-close"]', { timeout: 15000 }).catch(() => {});
	await single.waitForTimeout(600);
	const s2Opened = await single.evaluate(() => document.querySelectorAll('[data-testid="dock-panel-close"]').length > 0);
	record("B3-S2-OPEN click tab mo panel", s2Opened);

	if (s2Opened) {
		// Dong → panel vang + LS open=false + strip con (strip-only).
		await single.click('[data-testid="dock-panel-close"]', { timeout: 10000 }).catch(() => {});
		await single.waitForTimeout(700);
		const afterClose = await single.evaluate(() => ({
			closeCount: document.querySelectorAll('[data-testid="dock-panel-close"]').length,
			open: window.localStorage.getItem("vnsc_dock_open"),
			strip: document.querySelectorAll('[data-testid="dock-tab-watchlist"]').length,
		}));
		record(
			"B3-S2-CLOSE dong: panel vang + LS open=false + strip con",
			afterClose.closeCount === 0 && afterClose.open === "false" && afterClose.strip > 0,
			`closeCount=${afterClose.closeCount} open=${afterClose.open} strip=${afterClose.strip}`,
		);

		// Reload → van dong (D1 close-persist).
		await single.reload({ waitUntil: "domcontentloaded" });
		await single.waitForSelector("canvas", { timeout: 30000 }).catch(() => {});
		await single.waitForSelector('[data-testid="dock-tab-watchlist"]', { state: "attached", timeout: 20000 }).catch(() => {});
		await single.waitForTimeout(2500);
		const reloadedClosed = await single.evaluate(() => document.querySelectorAll('[data-testid="dock-panel-close"]').length);
		record("B3-S2-D1-CLOSED reload van dong", reloadedClosed === 0, `closeCount=${reloadedClosed}`);

		// Mo lai → reload → panel tu mo (D1 restore).
		await single.mouse.move(1920 - 5, 470);
		await single.waitForTimeout(400);
		await single.click('[data-testid="dock-tab-watchlist"]', { timeout: 10000 }).catch(() => {});
		await single.waitForSelector('[data-testid="dock-panel-close"]', { timeout: 15000 }).catch(() => {});
		await single.waitForTimeout(400);
		await single.reload({ waitUntil: "domcontentloaded" });
		await single.waitForSelector("canvas", { timeout: 30000 }).catch(() => {});
		await single.waitForSelector('[data-testid="dock-panel-close"]', { timeout: 20000 }).catch(() => {});
		await single.waitForTimeout(400);
		const restored = await single.evaluate(() => document.querySelectorAll('[data-testid="dock-panel-close"]').length);
		record("B3-S2-D1-RESTORE reload tu mo lai tab da luu", restored > 0, `closeCount=${restored}`);
	} else {
		record("B3-S2-CLOSE dong: panel vang + LS open=false + strip con", false, "panel khong mo duoc");
		record("B3-S2-D1-CLOSED reload van dong", false, "panel khong mo duoc");
		record("B3-S2-D1-RESTORE reload tu mo lai tab da luu", false, "panel khong mo duoc");
	}
	record("B3-S2-NOERR khong page error (single)", singleErrors.length === 0, singleErrors.length ? singleErrors[0] : undefined);
	const shotSingle = path.join(os.tmpdir(), "dock-b3-single.png");
	await single.screenshot({ path: shotSingle });
	console.log(`Screenshot single: ${shotSingle}`);
	await single.close();

	await browser.close();
	const failed = results.filter((r) => !r.pass).length;
	console.log(`\nverify-dock-b3: ${results.length - failed}/${results.length} PASS`);
	process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
	console.error("probe failed:", e.message);
	process.exit(1);
});
