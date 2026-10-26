#!/usr/bin/env node
/**
 * verify-drawing-tier-gate - đo số drawing tool bị KHOÁ theo tier, trên trang thật.
 *
 * WHY: quyết định D2 (2026-10-22) hạ `smart_drawing_pro` về Community ⇒ 16 tool
 * TIER-16 (Gann Box, Schiff Pitchfork, XABCD, Cypher, 5 loại Elliott, Fib Arc/Circles/
 * SpeedResistance/Spiral) mở cho **mọi** tier. Đó là thay đổi **thấy được bằng mắt**
 * trên UI ⇒ cần **runtime proof** (bugfix workflow bước 6), không chỉ "test xanh".
 *
 * ⚠ ĐO ĐÚNG ĐỐI TƯỢNG — hai lần sai đã bị bắt, ghi lại để không sai lần ba:
 *  1. Đo nhầm 16 **nút nhóm** (chevron "▾", `title` = tên nhóm) thay vì 16 **tool**.
 *  2. Đo trên rail **desktop**: tool thật nằm trong `.vnsc-tools-group-container` và các
 *     nút nhóm nằm ngoài viewport (`Element is outside of the viewport`) ⇒ không mở được
 *     flyout ⇒ đo 0 tool ⇒ **UNDECIDABLE**, không phải "0 tool bị khoá".
 *
 * BỀ MẶT ĐÁNG TIN: **mobile flyout** (`src/widget/components/mobile/MobileToolbar.tsx:222`):
 *   `title={!available ? t("tool.premiumLocked") : undefined}`
 * ⇒ **nút CÓ thuộc tính `title` ⇔ tool đó bị khoá**; tool khả dụng thì KHÔNG có `title`.
 * Locale-independent (không cần biết chuỗi dịch), và một lần mở là thấy **toàn bộ**
 * danh sách tool vẽ (`DRAWING_TOOLS`) — không phải mở 14 flyout.
 *
 * Free tier: bản demo tự cài license Pro khi load (`src/demo/demoLicense.ts`), nên để
 * quan sát tier FREE ta đặt `localStorage.vnsc_demo_license_off = "1"`
 * (`DEMO_LICENSE_OPTOUT_KEY`) — đúng lever mà `demoLicense.ts` document.
 *
 * Usage:
 *   WATCH_URL=https://charts.edusuccess.vn/?standalone=1 \
 *   VNI_PROBE_FREE_TIER=1 node scripts/verify-drawing-tier-gate.cjs
 *
 * Env:
 *   WATCH_URL                  trang để đo (mặc định staging)
 *   VNI_PROBE_FREE_TIER=1      ép tier FREE (opt-out demo license)
 *   VNI_PROBE_EXPECT_LOCKED    số tool khoá mong đợi (mặc định 0 = sau D2)
 *   VNI_PROBE_OUT              ghi JSON báo cáo vào file này
 *
 * Exit: 0 = khớp kỳ vọng · 1 = không khớp (có bằng chứng) · 2 = không đo được.
 */
const fs = require("node:fs");
const { chromium } = require("playwright");

const WATCH_URL = process.env.WATCH_URL || "https://charts.edusuccess.vn/?standalone=1";
const FREE_TIER = process.env.VNI_PROBE_FREE_TIER === "1";
const EXPECT_LOCKED = Number(process.env.VNI_PROBE_EXPECT_LOCKED ?? 0);
const OUT_FILE = process.env.VNI_PROBE_OUT || "";

/**
 * Đọc các nút tool trong mobile flyout.
 * `locked` = có thuộc tính `title` (MobileToolbar.tsx:222 chỉ đặt title khi bị khoá).
 */
async function readMobileFlyoutTools(page) {
	return page.evaluate(() => {
		const panel = document.querySelector('[role="dialog"][aria-label]');
		if (!panel) return null;
		const out = [];
		for (const b of panel.querySelectorAll("button")) {
			const title = b.getAttribute("title");
			const text = (b.textContent || "").replace(/\s+/g, " ").trim();
			// Chỉ tính nút TOOL: nút công cụ có nhãn vẽ (không rỗng) hoặc có title.
			if (!title && !text) continue;
			out.push({ title: title ?? null, label: text, locked: title !== null });
		}
		return out;
	});
}

async function main() {
	const browser = await chromium.launch();
	// Viewport điện thoại: mobile flyout chỉ render ở chế độ mobile.
	const context = await browser.newContext({ viewport: { width: 390, height: 740 } });
	if (FREE_TIER) {
		// Chạy TRƯỚC mọi script trang ⇒ demo license không được cài ⇒ tier FREE.
		await context.addInitScript(() => {
			try {
				window.localStorage.setItem("vnsc_demo_license_off", "1");
			} catch {
				/* storage bị chặn ⇒ probe sẽ báo UNDECIDABLE */
			}
		});
	}
	const page = await context.newPage();
	const errors = [];
	page.on("pageerror", (e) => errors.push(String(e)));

	await page.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

	// Mở mobile flyout qua FAB.
	const fab = page.locator("button.vnsc-mobile-fab");
	await fab.waitFor({ state: "attached", timeout: 30000 });
	await fab.click({ force: true }).catch(() => {});
	await page.waitForTimeout(600);

	const tools = await readMobileFlyoutTools(page);
	await browser.close();

	if (!tools || tools.length === 0) {
		console.error("\nUNDECIDABLE: mobile flyout không mở được (hoặc không có nút) — không kết luận được");
		process.exit(2);
	}

	const locked = tools.filter((t) => t.locked);
	const report = {
		url: WATCH_URL,
		surface: "mobile-flyout",
		freeTier: FREE_TIER,
		expectLocked: EXPECT_LOCKED,
		buttonsSeen: tools.length,
		lockedCount: locked.length,
		lockedTools: locked.map((t) => t.title),
		pageErrors: errors.slice(0, 5),
	};

	console.log(`verify-drawing-tier-gate: ${WATCH_URL}`);
	console.log(`  surface: mobile flyout · tier: ${FREE_TIER ? "FREE (demo license opt-out)" : "as-is"}`);
	console.log(`  buttons seen: ${report.buttonsSeen}`);
	console.log(`  premium-locked (có thuộc tính title): ${report.lockedCount}`);
	for (const l of locked) console.log(`    - ${l.title}`);

	if (OUT_FILE) fs.writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");

	if (report.lockedCount !== EXPECT_LOCKED) {
		console.error(
			`\nFAIL: mong đợi ${EXPECT_LOCKED} tool bị khoá, đo được ${report.lockedCount}` +
				`${FREE_TIER ? " (free tier)" : ""}.`,
		);
		process.exit(1);
	}
	console.log(`\nPASS: ${report.lockedCount} tool bị khoá (mong đợi ${EXPECT_LOCKED}).`);
}

main().catch((err) => {
	console.error("verify-drawing-tier-gate: lỗi probe:", err && err.message ? err.message : err);
	process.exit(2);
});
