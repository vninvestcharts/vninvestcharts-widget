/**
 * Gate: multi right dock (workspaceDock) KHONG bi bottom panel de khi ca hai mo.
 *
 * Bug user report 2026-10-18 (2 anh): mo bottom panel -> nua duoi right dock bi
 * panel ve de (z-order), hover/click khong toi. Fix `fb395474`: `.workspaceDock`
 * z-index 20 -> `var(--vnsc-z-sidebar, 48)` (> `--vnsc-z-bottom-panel` 40) trong
 * cung stacking context `.workspaceBody`.
 *
 * Gate kiem 4 dieu tren runtime that (multi layout = trang goc, khong standalone):
 *   Z1: bottom panel mo duoc bang tab footer "Giao dich mo phong"
 *   Z2: hover strip phai o diem NAM TRONG vung panel (y = panel.top + 40) van mo
 *       duoc drawer (truoc fix: vung strip nay bi panel de -> hover khong toi)
 *   Z3: hit-test diem giao (trong ca drawer lan vung panel): elementFromPoint
 *       tra ve DOCK (closest role="complementary" — build prod hash class nen
 *       khong the dinh danh bang class), KHONG phai bottom panel; z-index > 40
 *   Z4: control falsification — ha z ve 20 trong trang -> hit-test PHAI tra ve
 *       bottom panel (chung minh phep do khong vacuous), roi khoi phuc
 *
 * Usage:
 *   node scripts/verify-dock-zorder.cjs
 *   WATCH_URL=https://charts.edusuccess.vn/ node scripts/verify-dock-zorder.cjs
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

	await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });
	await page.waitForSelector("canvas", { timeout: 30000 }).catch(() => {});
	await page.waitForTimeout(4000);

	// 1) Focus mot chart (footer tab bi `disabled` khi chua co chart focused).
	const canvasBox = await page.evaluate(() => {
		const c = document.querySelector("canvas");
		if (!c) return null;
		const r = c.getBoundingClientRect();
		return r.width > 50 && r.height > 50 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
	});
	if (canvasBox) {
		await page.mouse.click(canvasBox.x, canvasBox.y);
		await page.waitForTimeout(500);
	}

	// 2) Mo bottom panel qua tab footer.
	const tab = page.locator("button", { hasText: "Giao dịch mô phỏng" }).last();
	if ((await tab.count()) > 0) {
		await tab.click({ timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(1500);
	}

	const panel = await page.evaluate(() => {
		const host = document.querySelector('[data-vnsc-bottom-panel="host"]');
		if (!host) return null;
		const r = host.getBoundingClientRect();
		return { top: Math.round(r.top), height: Math.round(r.height) };
	});
	record("Z1 bottom panel mo duoc (tab footer)", !!panel && panel.height > 50, JSON.stringify(panel));
	if (!panel) {
		await page.screenshot({ path: path.join(os.tmpdir(), "dock-zorder-fail-no-panel.png") });
		await browser.close();
		process.exit(1);
	}

	// 3) Hover strip tai diem NAM TRONG vung panel (y = panel.top + 40).
	const hoverY = panel.top + 40;
	await page.mouse.move(1920 - 5, hoverY);
	await page.waitForTimeout(450);

	const probe = await page.evaluate(() => {
		// Class CSS module tren build production la hash-only (khong chua "workspaceDock")
		// → dinh danh bang attribute on dinh: wrapper = role="complementary"
		// (WorkspaceRightDockSlot render), flyout = firstElementChild.
		const wrapper =
			document.querySelector('[role="complementary"]') ||
			Array.from(document.querySelectorAll('[class*="workspaceDock"]')).find(
				(el) => !/Flyout|Pinned/.test(String(el.className)),
			);
		const flyout = wrapper ? wrapper.firstElementChild : null;
		const host = document.querySelector('[data-vnsc-bottom-panel="host"]');
		if (!wrapper || !flyout || !host) return { error: "no dock wrapper/flyout or panel host" };
		const fr = flyout.getBoundingClientRect();
		const hr = host.getBoundingClientRect();
		const x = Math.min(fr.left + 40, window.innerWidth - 12);
		const y = hr.top + 40;
		const el = document.elementFromPoint(x, y);
		return {
			zIndex: getComputedStyle(wrapper).zIndex,
			flyoutVisible: getComputedStyle(flyout).visibility === "visible",
			flyoutRect: { left: Math.round(fr.left), right: Math.round(fr.right) },
			point: { x: Math.round(x), y: Math.round(y) },
			hitClass: el ? String(el.className).slice(0, 120) : null,
			hitIsPanel: !!(el && el.closest('[data-vnsc-bottom-panel="host"]')),
			hitIsDock: !!(el && el.closest('[role="complementary"]')),
		};
	});

	if (probe.error) {
		record("Z2/Z3 probe duoc dock + panel", false, probe.error);
		await browser.close();
		process.exit(1);
	}

	record("Z2 hover trong vung panel mo duoc drawer", probe.flyoutVisible === true, `flyout=${JSON.stringify(probe.flyoutRect)}`);
	record("Z3 hit-test: dock nam TREN bottom panel", probe.hitIsDock === true && probe.hitIsPanel === false, `point=${JSON.stringify(probe.point)} z=${probe.zIndex} hit=${probe.hitClass}`);
	const zNumeric = Number(probe.zIndex);
	record("Z3b z-index dock > 40 (--vnsc-z-bottom-panel)", Number.isFinite(zNumeric) && zNumeric > 40, `z=${probe.zIndex}`);

	// 4) Control falsification: ha z ve 20 -> hit-test PHAI tra ve panel.
	const control = await page.evaluate(() => {
		const wrapper = document.querySelector('[role="complementary"]');
		const flyout = wrapper ? wrapper.firstElementChild : null;
		const host = document.querySelector('[data-vnsc-bottom-panel="host"]');
		const fr = flyout.getBoundingClientRect();
		const hr = host.getBoundingClientRect();
		const x = Math.min(fr.left + 40, window.innerWidth - 12);
		const y = hr.top + 40;
		const before = getComputedStyle(wrapper).zIndex;
		wrapper.style.zIndex = "20";
		const el = document.elementFromPoint(x, y);
		const hitIsPanel = !!(el && el.closest('[data-vnsc-bottom-panel="host"]'));
		wrapper.style.zIndex = "";
		const after = getComputedStyle(wrapper).zIndex;
		return { before, after, hitIsPanel };
	});
	record("Z4 control: z=20 -> hit-test tra ve bottom panel (do khong vacuous)", control.hitIsPanel === true, `before=${control.before} after=${control.after}`);

	// Khoi phuc xong phai quay ve dung (hit-test lai).
	await page.waitForTimeout(200);
	const post = await page.evaluate(() => {
		const wrapper = document.querySelector('[role="complementary"]');
		const flyout = wrapper ? wrapper.firstElementChild : null;
		const host = document.querySelector('[data-vnsc-bottom-panel="host"]');
		const fr = flyout.getBoundingClientRect();
		const hr = host.getBoundingClientRect();
		const el = document.elementFromPoint(Math.min(fr.left + 40, window.innerWidth - 12), hr.top + 40);
		return !!(el && el.closest('[role="complementary"]'));
	});
	record("Z5 sau khoi phuc: hit-test van la dock", post === true);

	const shot = path.join(os.tmpdir(), "dock-zorder-staging.png");
	await page.screenshot({ path: shot });
	console.log(`Screenshot: ${shot}`);
	console.log(`page errors: ${pageErrors.length}${pageErrors.length ? ` — ${pageErrors[0]}` : ""}`);
	record("Z6 khong page error", pageErrors.length === 0);

	await browser.close();
	const failed = results.filter((r) => !r.pass).length;
	console.log(`\nverify-dock-zorder: ${results.length - failed}/${results.length} PASS`);
	process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
	console.error("probe failed:", e.message);
	process.exit(1);
});
