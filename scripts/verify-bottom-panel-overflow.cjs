/**
 * Gate: bottom panel (paper trading) khong duoc tran xuong duoi footer.
 *
 * Regression user report 2026-09-30 (anh chup multicharts): noi dung panel bi footer "chen
 * lan" — chu "Chua co vi the mo" bi cat.
 *
 * Do lai thi do DUNG lai cach nhin: panel va footer **khong chong nhau** (overlap = 0px).
 * Panel co `height` co dinh + `maxHeight: 60dvh` va **khong co `overflow`** ⇒ noi dung
 * dai hon box bi TRAN xuong duoi, footer co z-index cao phu len ⇒ nguoi dung thay nhu
 * chong lan.⇒ sua dung cho: cho vung noi dung CUON (`overflow-y: auto`).
 *
 * Gate nay kiem HAI dieu:
 *   (1) empty-state cua panel nam trong box panel (khong tran ra duoi footer)
 *   (2) noi dung dai hon box thi CUON duoc va cuon toi duoc cuoi
 *
 * Usage: node scripts/verify-bottom-panel-overflow.cjs   (can dev server o :3000)
 */
const { chromium } = require("playwright");

// Verify the fix for the user's image 1: panel content must not spill under the footer,
// and anything longer must be reachable by scrolling.
const URL = process.env.URL || "http://localhost:3000/";

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1920, height: 940 } });
	await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
	await page.waitForTimeout(4500);
	const tab = page.locator("button", { hasText: "Giao dịch mô phỏng" }).last();
	if ((await tab.count()) > 0) { await tab.click().catch(() => {}); await page.waitForTimeout(1500); }

	const r = await page.evaluate(() => {
		const host = document.querySelector("[data-vnsc-bottom-panel]");
		const footer = document.querySelector("footer");
		if (!host) return { error: "no panel host" };
		const hb = host.getBoundingClientRect();
		const fb = footer ? footer.getBoundingClientRect() : null;
		// The scroll container we added
		const scroller = host.querySelector("div[style*='auto']") || host.children[1];
		// The empty-state text the user reported as cut off
		const empty = Array.from(host.querySelectorAll("*")).find((el) =>
			/Chưa có vị thế mở/.test(el.textContent || "") && el.children.length === 0,
		);
		const eb = empty ? empty.getBoundingClientRect() : null;
		return {
			panel: { y: Math.round(hb.y), bottom: Math.round(hb.bottom) },
			footerY: fb ? Math.round(fb.y) : null,
			emptyStateInsidePanel: eb ? eb.bottom <= hb.bottom + 1 : null,
			emptyStateBottom: eb ? Math.round(eb.bottom) : null,
			scrollerOverflowY: scroller ? getComputedStyle(scroller).overflowY : null,
			scrollable: scroller ? scroller.scrollHeight > scroller.clientHeight + 1 : null,
			scrollH: scroller ? scroller.scrollHeight : null,
			clientH: scroller ? scroller.clientHeight : null,
		};
	});
	console.log(JSON.stringify(r, null, 1));

	// If scrollable, prove the content is actually reachable by scrolling.
	if (r.scrollable) {
		await page.evaluate(() => {
			const host = document.querySelector("[data-vnsc-bottom-panel]");
			const sc = host.querySelector("div[style*='auto']");
			if (sc) sc.scrollTop = sc.scrollHeight;
		});
		await page.waitForTimeout(400);
		const after = await page.evaluate(() => {
			const host = document.querySelector("[data-vnsc-bottom-panel]");
			const sc = host.querySelector("div[style*='auto']");
			return sc ? { scrollTop: Math.round(sc.scrollTop), max: Math.round(sc.scrollHeight - sc.clientHeight) } : null;
		});
		console.log("[scroll reachable]", JSON.stringify(after), after && after.scrollTop > 0 ? "=> OK" : "=> FAIL");
	}
	await browser.close();
})().catch((e) => { console.error("probe failed:", e.message); process.exit(1); });