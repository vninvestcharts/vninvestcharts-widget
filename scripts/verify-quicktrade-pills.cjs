/**
 * Gate: quick-trade strip kiểu 2-pill (QUICKTRADE_PILLS Option A) trên paper trading.
 *
 * Thay thế verify-quicktrade-collapse.cjs (đã xoá — orphan, thiết kế collapse không còn).
 * Khoá các hành vi: declutter (bỏ stepper/toggle/chip), compact width, hold-drag từ PILL,
 * ticket mở khi oneClick=false, tooltip bps, eye round-trip, dock góc dưới-phải (A6),
 * one-click qua CONFIG persist (A4) + đối chứng không-vacuous, backward-compat pos cũ.
 *
 * Usage:
 *   node scripts/verify-quicktrade-pills.cjs                      (dev server :3000)
 *   WATCH_URL=https://charts.edusuccess.vn/?standalone=1 node scripts/verify-quicktrade-pills.cjs
 */
const { chromium } = require("playwright");

const URL = process.env.WATCH_URL || "http://localhost:3000/?standalone=1&whale=0";

/** Kéo bằng hold: press, move từ từ, release. `fromEl` xác định điểm bắt đầu. */
async function holdDrag(page, fromEl, dx, dy) {
	const before = await fromEl.boundingBox();
	if (!before) return null;
	const sx = before.x + before.width / 2;
	const sy = before.y + before.height / 2;
	await page.mouse.move(sx, sy);
	await page.mouse.down();
	await page.mouse.move(sx + dx, sy + dy, { steps: 12 });
	await page.mouse.up();
	await page.waitForTimeout(400);
	return before;
}

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
	const errors = [];
	page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
	await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
	await page.waitForTimeout(4000);

	const results = [];
	const check = (name, ok, detail = "") => {
		results.push({ name, ok });
		console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
	};

	const surface = page.locator('[data-testid="paper-header-surface"]').first();
	const strip = page.locator('[data-testid="quick-trading-header"]').first();

	// --- 1. Strip render + declutter (không còn stepper/toggle/chip) ---
	check("strip 2-pill render", (await strip.count()) > 0 && (await strip.isVisible()), "");
	check(
		"sell-btn + buy-btn hiện diện",
		(await page.locator('[data-testid="sell-btn"]').count()) > 0 &&
			(await page.locator('[data-testid="buy-btn"]').count()) > 0,
		"",
	);
	const dead = ["quicktrade-collapse", "quicktrade-expand", "collapsed-quote", "qty-input", "qty-inc", "qty-dec", "oneclick-toggle", "spread-chip", "synthetic-hint"];
	for (const id of dead) {
		const n = await page.locator(`[data-testid="${id}"]`).count();
		check(`declutter: ${id} = 0`, n === 0, `count=${n}`);
	}
	const collapsedAttr = await strip.getAttribute("data-collapsed");
	check("strip không còn data-collapsed", collapsedAttr === null, `attr=${collapsedAttr}`);

	// --- 2. Compact: bbox width < 260px (đo thật, ghi số) ---
	const stripBox = await strip.boundingBox();
	const stripW = stripBox ? Math.round(stripBox.width) : -1;
	check("compact: strip width < 260px", stripW > 0 && stripW < 260, `width=${stripW}px`);

	// --- 3. Hold-drag bắt đầu từ PILL vẫn kéo được (regression 2026-09-30) ---
	const buyBtn = page.locator('[data-testid="buy-btn"]').first();
	const before3 = await holdDrag(page, buyBtn, -160, -110);
	const after3 = await surface.boundingBox();
	const dx3 = before3 && after3 ? Math.round(after3.x - before3.x) : 0;
	const dy3 = before3 && after3 ? Math.round(after3.y - before3.y) : 0;
	check("hold-drag từ PILL kéo được (không nuốt click)", Math.abs(dx3) > 80 && Math.abs(dy3) > 50, `dx=${dx3} dy=${dy3}`);

	// --- 4. oneClick=false mặc định ⇒ click buy MỞ TICKET (đối chứng cho check 8) ---
	await buyBtn.click();
	await page.waitForTimeout(600);
	const overlayCount = await page.locator('[data-testid="order-ticket-overlay"]').count();
	const qtyValue = overlayCount > 0 ? await page.locator('[data-testid="ticket-qty"]').first().inputValue().catch(() => "") : "";
	check("oneClick=false: click buy mở ticket", overlayCount > 0, `overlays=${overlayCount}`);
	check("ticket-qty có lot mặc định", Number(qtyValue) > 0, `qty=${qtyValue}`);
	await page.locator('[data-testid="ticket-close"]').first().click().catch(() => {});
	await page.waitForTimeout(300);
	if ((await page.locator('[data-testid="order-ticket-overlay"]').count()) > 0) {
		await page.keyboard.press("Escape");
		await page.waitForTimeout(300);
	}

	// --- 5. Tooltip bps trên pill (spread gộp vào title — A2) ---
	const buyTitle = (await buyBtn.getAttribute("title")) ?? "";
	check("tooltip pill chứa bps", /bps/.test(buyTitle), `title="${buyTitle.slice(0, 90)}"`);

	// --- 6. Eye round-trip: OFF chỉ còn chip 🚫; ON khôi phục strip ---
	const eye = page.locator('[data-testid="paper-visibility-toggle"]').first();
	await eye.click();
	await page.waitForTimeout(900);
	const stripOff = await page.locator('[data-testid="quick-trading-header"]').count();
	check("eye OFF: strip ẩn, chỉ còn chip", stripOff === 0, `strip=${stripOff}`);
	await page.locator('[data-testid="paper-visibility-toggle"]').first().click();
	await page.waitForTimeout(900);
	const stripOn = await page.locator('[data-testid="quick-trading-header"]').count();
	check("eye ON: strip khôi phục", stripOn > 0, `strip=${stripOn}`);

	// --- 7. Dock corner nửa-DƯỚI (A6): xoá pos → reload → bottom-anchor; dblclick → reset ---
	await page.evaluate(() => localStorage.removeItem("vnsc.paperHeader.pos"));
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForTimeout(3500);
	const readCorner = () =>
		page.evaluate(() => {
			const s = document.querySelector('[data-testid="paper-header-surface"]');
			if (!s) return null;
			const r = s.getBoundingClientRect();
			const host = s.offsetParent?.getBoundingClientRect();
			return {
				bottomGap: host ? Math.round(host.bottom - r.bottom) : -999,
				styleBottom: s.style.bottom,
				styleTop: s.style.top,
			};
		});
	let corner = await readCorner();
	check(
		"corner: dock nửa-DƯỚI (bottom 40px, gap < 80)",
		!!corner && corner.styleBottom === "40px" && corner.bottomGap >= 0 && corner.bottomGap < 80,
		corner ? `bottomGap=${corner.bottomGap} styleBottom=${corner.styleBottom} styleTop=${corner.styleTop}` : "không có surface",
	);
	// Kéo đi rồi double-click ⇒ reset về đúng corner default. Gửi dblclick thẳng vào
	// surface (không qua mouse vì tâm surface nằm trên nút — click thật sẽ mở ticket).
	await holdDrag(page, page.locator('[data-testid="buy-btn"]').first(), 140, -160);
	await page.evaluate(() => {
		const s = document.querySelector('[data-testid="paper-header-surface"]');
		s?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
	});
	await page.waitForTimeout(400);
	corner = await readCorner();
	check(
		"dblclick reset về corner default",
		!!corner && corner.styleBottom === "40px" && corner.bottomGap >= 0 && corner.bottomGap < 80,
		corner ? `bottomGap=${corner.bottomGap} styleBottom=${corner.styleBottom}` : "không có surface",
	);

	// --- 8. One-click qua CONFIG persist (A4/E-01): seed 3 profile-key thật → reload → click
	// buy ĐẶT LỆNH, KHÔNG mở ticket. Đối chứng (không vacuous) là check 4 chạy trước đó với
	// config trống đã mở ticket. Key quyết định = GLOBAL_MARGIN (surface chấm chạy BTCUSDT;
	// enum có GLOBAL_MARGIN, KHÔNG có CRYPTO — MarketRules.ts:5), seed cả 3 cho chắc. ---
	await page.evaluate(() => {
		const seed = JSON.stringify({ oneClickTrading: true, effectiveFrom: 1 });
		for (const k of ["vnsc_paper_cfg_VN_SPOT", "vnsc_paper_cfg_VN_DERIVATIVES", "vnsc_paper_cfg_GLOBAL_MARGIN"]) {
			localStorage.setItem(k, seed);
		}
	});
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForTimeout(3500);
	const buy8 = page.locator('[data-testid="buy-btn"]').first();
	const buy8Enabled = await buy8.isEnabled();
	await buy8.click();
	await page.waitForTimeout(800);
	const overlay8 = await page.locator('[data-testid="order-ticket-overlay"]').count();
	check(
		"config one-click: click buy đặt lệnh, không mở ticket (đối chứng check 4)",
		buy8Enabled && overlay8 === 0,
		`enabled=${buy8Enabled} overlays=${overlay8}`,
	);
	await page.evaluate(() => {
		for (const k of ["vnsc_paper_cfg_VN_SPOT", "vnsc_paper_cfg_VN_DERIVATIVES", "vnsc_paper_cfg_GLOBAL_MARGIN"]) {
			localStorage.removeItem(k);
		}
	});

	// --- 9. Pos cũ y>0 vẫn top-anchor (backward compat — người dùng cũ không bị nhảy chỗ) ---
	await page.evaluate(() => localStorage.setItem("vnsc.paperHeader.pos", '{"x":-72,"y":96}'));
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForTimeout(3500);
	const compat = await readCorner();
	check(
		"pos cũ y=96 vẫn top-anchor",
		!!compat && compat.styleTop === "96px" && compat.styleBottom === "",
		compat ? `top=${compat.styleTop} bottom=${compat.styleBottom}` : "không có surface",
	);
	await page.evaluate(() => localStorage.removeItem("vnsc.paperHeader.pos"));

	check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
	console.log(`\nSUMMARY ${results.filter((r) => r.ok).length}/${results.length} passed`);
	await browser.close();
	process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => {
	console.error("probe failed:", e.message);
	process.exit(1);
});
