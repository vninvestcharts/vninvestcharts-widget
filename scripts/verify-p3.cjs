// S0/S5.5: P3 Drawing Rail E2E 12/12 (rewritten from spec — original local-only, C-04).
// Usage: WATCH_URL=http://localhost:3000/?standalone=1 node scripts/verify-p3.cjs
// Exit 0 = 12/12 PASS.
const { chromium } = require("playwright");
// `LICENSE_SLOT` used to be destructured here, but e2e-license.cjs only ever exported
// `STORAGE_KEY` — so the seeding below wrote to the literal key "undefined" and the
// claimed Pro entitlement was never actually seeded (harmless: this suite grades a
// tier-agnostic flow, 12/12 on staging without a licence). Alias it now so the seed
// does what the comment below says.
const { stagingLicense, mode: licenseMode, STORAGE_KEY: LICENSE_SLOT } = require("./e2e-license.cjs");

const WATCH_URL = process.env.WATCH_URL || "http://localhost:3000/?standalone=1";
const results = [];
const errors = [];

function step(name, ok, detail = "") {
	results.push({ name, ok });
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

/**
 * A step whose precondition failed is BLOCKED, not PASS.
 *
 * Without this the suite reports false confidence. P3-05 and P3-07 assert a
 * persisted drawing count of 0, which is trivially true when the draw in P3-04
 * never happened - so a completely broken drawing pipeline still scored
 * 9/12. A step that depends on earlier state must be able to say "blocked".
 */
function blocked(name, why) {
	results.push({ name, ok: false, blocked: true });
	console.log(`FAIL ${name} (BLOCKED: ${why})`);
}

function passed(name) {
	return results.some((r) => r.name === name && r.ok);
}

async function drawingCount(page) {
	return page.evaluate(() => {
		let total = 0;
		for (let i = 0; i < localStorage.length; i += 1) {
			const k = localStorage.key(i);
			if (!k || !k.startsWith("rsc-drawings-v1-") || k.endsWith("-all")) continue;
			try {
				const raw = JSON.parse(localStorage.getItem(k));
				if (Array.isArray(raw)) total += raw.length;
				else if (raw && Array.isArray(raw.drawings)) total += raw.drawings.length;
			} catch { /* ignore */ }
		}
		return total;
	});
}

// P3-07 flake fix: poll the persisted count instead of asserting once after
// a fixed sleep (redo→dispatch→storage occasionally exceeds 700ms on load).
async function waitForDrawingCount(page, expected, timeout = 5000) {
	try {
		await page.waitForFunction(
			(expectedCount) => {
				let total = 0;
				for (let i = 0; i < localStorage.length; i += 1) {
					const k = localStorage.key(i);
					if (!k || !k.startsWith("rsc-drawings-v1-") || k.endsWith("-all")) continue;
					try {
						const raw = JSON.parse(localStorage.getItem(k));
						if (Array.isArray(raw)) total += raw.length;
						else if (raw && Array.isArray(raw.drawings)) total += raw.drawings.length;
					} catch { /* ignore */ }
				}
				return total === expectedCount;
			},
			expected,
			{ timeout },
		);
		return true;
	} catch {
		return false;
	}
}

// P3-04 flake fix: drawing needs loaded data (scales/domains). Fresh runs
// sometimes reach the drag before the first fetch resolves → points invalid
// → silent drop. Poll for evidence that candles rendered instead of sleeping.
//
// The previous pattern was /O[\d,]+\.\d{2}\s+H[\d,]+\.\d{2}/, which requires
// "O<number> H<number>". The header actually renders "OHLC: 83,418.91 / ...",
// where the digits sit after the word "OHLC", so that pattern never matched and
// this function always timed out — the gate reported "no data" even on a chart
// that was fully loaded. Detection is now based on signals that are actually
// present, in order of directness.
//
// ⚠ SỬA 2026-10-10 (HAZARD 8 — proxy đo được, ý nghĩa hỏng).
// Nhánh bid/ask trước đây coi text KHÁC RỖNG là "đã có dữ liệu". Nhưng giá trị
// placeholder của UI là chuỗi "Chưa có giá" — CÓ ký tự, nên `(textContent||"").trim()`
// là truthy và hàm trả về `true` sau **24 ms**, lúc chart còn **0 nến**. Drag lúc đó
// không tạo được drawing ⇒ P3-04 đỏ ⇒ 4 bước sau BLOCKED. Đo được:
//   dataOK=true in 24ms | ohlc=false dec=false bid="Chưa có giá" candles=0 | drew=0
// Tức là chính "bằng chứng có dữ liệu" lại là thứ làm cổng đỏ. Sửa ở ĐIỂM LỆCH ĐẦU
// TIÊN: đòi bằng chứng dữ liệu THẬT (số nến > 0), không đòi con trỏ khác rỗng.
// SỬA 2026-10-10 (S5) — cổng không còn phụ thuộc chuỗi đã dịch.
//
// Bản cũ dò `document.body.innerText` theo literal "Số nến: <n>". Đó là giá trị của i18n key
// `a11y.chart.bars` — CHUỖI ĐÃ DỊCH (vi: "Số nến", en: "Bars").
//
// ⚠ ĐỪNG ĐỌC LẠI NHƯ "cổng này đang đỏ vì tiếng Việt". Đo lại: `?standalone=1` dẫn tới
// `StandaloneEmbedDemo.tsx:359-360`, nơi `locale` được ghim cứng "vi" và truyền tường minh
// vào `<VNInvestCharts locale="vi">`, nên `WidgetI18nContext` không bao giờ đọc
// `document.documentElement.lang`. Nghĩa là TRÊN SURFACE NÀY nhánh cũ luôn khớp. Lý do
// vẫn đúng để sửa là khác: một assertion mà kết quả phụ thuộc vào locale của máy chạy thì
// sẽ hỏng với consumer embed `locale="en"`, và "nó có thể hỏng" không phải bằng chứng.
// Cách sửa là theo BẤT BIẾN: `chart-a11y-summary` mang `data-bar-count` là số nguyên thuần
// (không dịch, không format, không thể là placeholder) — đúng ở mọi locale.
//
// LƯU Ý: lần trước có thử thêm `data-testid="candle-count"` và P3-04 đỏ 8/8 — vì KHÔNG có
// phần tử nào render testid đó. Bài học: thêm hook thì phải thêm vào chỗ thật sự render, và
// phải đọc lại danh sách testid thật (probe Playwright) trước khi tin hook tồn tại.
//
// PHẠM VI: `querySelector` lấy node ĐẦU TIÊN, khớp với `getByTestId("vninvest-charts").first()`
// mà bước drag dùng — nên trên surface nhiều chart cả hai cùng trỏ chart #1 và vẫn nhất quán.
// Cổng này được viết cho `?standalone=1` (một chart).
async function waitForChartData(page, timeout = 45000) {
	try {
		await page.waitForFunction(
			() => {
				// 1. data-bar-count — bằng chứng dữ liệu thật, không phụ thuộc locale.
				//    Không có nến thì không có miền tọa độ, mà drawing cần miền tọa độ.
				const summary = document.querySelector('[data-testid="chart-a11y-summary"]');
				const bars = summary && summary.getAttribute("data-bar-count");
				if (bars !== null && bars !== undefined && bars !== "") {
					const n = Number(bars);
					if (Number.isFinite(n) && n > 0) return true;
				}
				// 2. OHLC readout, tolerating the "OHLC: " label and any
				//    thousands separator.
				if (/O[A-Z]*:?\s*[\d.,]+\s*[/|]?\s*[\d.,]+/.test(document.body.innerText)) {
					if (/\d[\d.,]*\.\d{2}/.test(document.body.innerText)) return true;
				}
				// 3. Bid/ask — CHỈ khi giá trị là SỐ thật. Placeholder "Chưa có giá"
				//    bị loại ở đây; trước đây chỉ kiểm "không rỗng" nên placeholder
				//    lọt và làm cổng báo xanh sớm 20 giây.
				const bid = document.querySelector('[data-testid="bid-price"]');
				const ask = document.querySelector('[data-testid="ask-price"]');
				const num = (el) => {
					if (!el) return null;
					const raw = (el.textContent || "").trim().replace(/[,\s]/g, "");
					const v = Number(raw);
					return Number.isFinite(v) && v > 0 ? v : null;
				};
				if (num(bid) !== null && num(ask) !== null) return true;
				return false;
			},
			null,
			{ timeout },
		);
		return true;
	} catch {
		return false;
	}
}

async function stepsRailAndTools(page) {
	// 1. Rail attached + reveals on shell hover (auto-hide shell).
	const toolbar = page.getByTestId("drawing-toolbar");
	await toolbar.waitFor({ state: "attached", timeout: 30000 });
	await page.hover(".vnsc-drawing-toolbar-shell").catch(() => {});
	await toolbar.waitFor({ state: "visible", timeout: 10000 });
	step("P3-01 rail visible", await toolbar.isVisible());
	// 2. Tool buttons present (locale-agnostic: count rail buttons).
	const trendBtn = toolbar.locator(".vnsc-drawing-toolbar__btn--active");
	step("P3-02 tool buttons present", (await toolbar.locator(".vnsc-drawing-toolbar__btn").count()) > 5);
	// 3. Alt+T selects trendLine (active class) — locale-agnostic.
	await page.keyboard.press("Alt+t");
	await page.waitForTimeout(300);
	step("P3-03 Alt+T selects trendLine", (await trendBtn.count()) > 0);
	// 4. Draw one trendLine via mouse drag.
	// Data is a hard precondition: without candles there is no coordinate
	// domain, the drag resolves to invalid points and the tool drops the drawing
	// silently. Failing here loudly beats dragging on an empty chart.
	if (!(await waitForChartData(page))) {
		blocked("P3-04 draw trendLine", "chart has no candle data - cannot resolve drawing points");
		return { x1: 0, y1: 0, x2: 0, y2: 0, drew: false };
	}
	const box = await page.getByTestId("vninvest-charts").first().boundingBox();
	const x1 = box.x + box.width * 0.3;
	const y1 = box.y + box.height * 0.5;
	const x2 = box.x + box.width * 0.6;
	const y2 = box.y + box.height * 0.4;
	await page.mouse.move(x1, y1);
	await page.mouse.down();
	await page.mouse.move(x2, y2, { steps: 12 });
	await page.mouse.up();
	const drew = await waitForDrawingCount(page, 1);
	step("P3-04 draw trendLine", drew);
	// 5. Delete removes it.
	if (!drew) {
		blocked("P3-05 Delete removes", "P3-04 never produced a drawing");
		blocked("P3-06 Ctrl+Z restores", "P3-04 never produced a drawing");
		return { x1, y1, x2, y2, drew: false };
	}
	await page.mouse.click((x1 + x2) / 2, (y1 + y2) / 2);
	await page.waitForTimeout(300);
	// P3-05 flake diagnosis (2026-10-12). The click is supposed to SELECT the
	// line; the step then presses Delete and expects 0. Nothing between them
	// asserts the selection took, so a failure reports "5/12" and leaves the
	// reader guessing whether the click missed, the selection never rendered,
	// or Delete arrived before selection was live.
	//
	// This adds DIAGNOSTIC OUTPUT ONLY - pass/fail semantics are unchanged
	// (`step` still records the same boolean). It exists because the flake is
	// ~1-in-10 (measured: 18 PASS / 2 FAIL over 20 runs, 2026-10-12) and the
	// previous two sessions each burned a full investigation on a hypothesis
	// this probe could have refuted in one line.
	const diag = await page
		.evaluate(() => {
			let stored = 0;
			for (let i = 0; i < localStorage.length; i += 1) {
				const k = localStorage.key(i);
				if (!k || !k.startsWith("rsc-drawings-v1-") || k.endsWith("-all")) continue;
				try {
					const raw = JSON.parse(localStorage.getItem(k));
					const arr = Array.isArray(raw) ? raw : raw && raw.drawings;
					if (Array.isArray(arr)) stored += arr.length;
				} catch { /* ignore */ }
			}
			const active = document.querySelector(".vnsc-drawing-toolbar__btn--active");
			const selected = document.querySelectorAll(
				"[class*='selected'], .vnsc-drawing--selected, .vnsc-drawing__selected"
			).length;
			return { stored, tool: (active && (active.getAttribute("title") || active.textContent || "")) || "?", selected };
		})
		.catch(() => null);
	await page.keyboard.press("Delete");
	const removed = await waitForDrawingCount(page, 0);
	step(
		"P3-05 Delete removes",
		removed,
		removed
			? ""
			: `DIAG stored=${diag?.stored ?? "?"} activeTool="${diag?.tool ?? "?"}" selectedNodes=${diag?.selected ?? "?"}`
	);
	// 6. Ctrl+Z restores (undo chain, 1 press).
	await page.keyboard.press("Control+z");
	const undone = await waitForDrawingCount(page, 1);
	step("P3-06 Ctrl+Z restores", undone);
	return { x1, y1, x2, y2, drew: true, undone };
}

async function stepsFavRedoGuard(page) {
	const toolbar = page.getByTestId("drawing-toolbar");
	// 7. Ctrl+Y redoes (back to 0). Only meaningful if the undo in P3-06
	// actually restored something; otherwise the count is already 0 and the
	// assertion would pass without testing redo at all.
	if (!passed("P3-06 Ctrl+Z restores")) {
		blocked("P3-07 Ctrl+Y redoes", "P3-06 did not restore a drawing to redo from");
		blocked("P3-08 undo again restores", "P3-06 did not restore a drawing");
		return;
	}
	await page.keyboard.press("Control+y");
	const redone = await waitForDrawingCount(page, 0);
	step("P3-07 Ctrl+Y redoes", redone);
	// 8. Ctrl+Z again restores (redo stack cleared path).
	//
	// PHẢI có tiền đề: `waitForDrawingCount(page, 1)` trả true NGAY LẬP TỨC khi số nến
	// vốn đã là 1. Trước khi có guard này, P3-07 đỏ thì P3-08 vẫn xanh — cổng báo 11/12
	// trong khi thật ra có 2 bước hỏng, và người đọc tưởng chỉ hỏng một bước. Đo được:
	// sau khi P3-07 đỏ, count vẫn = 1 nên P3-08 "pass" rỗng (L-E01).
	if (!redone) {
		const why = "P3-07 did not redo, so there is nothing to undo back to";
		blocked("P3-08 undo again restores", why);
		// PHẢI ghi nốt 4 bước sau thay vì `return` im lặng. Bản đầu chỉ `return`, nên dòng
		// RESULT in ra `6/8` mà không có con số nào cho biết 4 bước kia CHƯA TỪNG CHẠY —
		// mất 4 assertion thật (fav-star, fav-bar, typing guard, zero page error) trong
		// im lặng. Đây là cùng lớp lỗi "false confidence" mà `blocked()` sinh ra để chống.
		blocked("P3-09 Alt+S toggles fav bar", why);
		blocked("P3-10 fav star persists", why);
		blocked("P3-11 typing guard", why);
		blocked("P3-12 zero page errors", why);
		return;
	}
	await page.keyboard.press("Control+z");
	step("P3-08 undo again restores", await waitForDrawingCount(page, 1));

	// 9. Fav star toggles favorite + persists (locale-agnostic).
	//
	// THỨ TỰ ĐỔI (S5, 2026-10-10): bước này chạy TRƯỚC P3-09, ngược với thứ tự đánh số.
	// Lý do: `FloatingFavoritesBar` return null khi `favoriteTools.length === 0`
	// (FloatingFavoritesBar.tsx:109), nên khi chưa có sao yêu thích nào thì Alt+S không
	// có gì để hiện — đo "Alt+S có bật thanh không" lúc đó là đo trên trạng thái mặc
	// định, tức pass rỗng. Đo sau khi đã có ít nhất một favorite thì mới là phép đo thật.
	// Số hiệu bước đi theo tên bước, không theo thứ tự thực thi.
	//
	// Stars live inside the group flyout: open groups until stars appear.
	await page.hover(".vnsc-drawing-toolbar-shell").catch(() => {});
	await page.waitForTimeout(300);
	const stars = toolbar.locator(".vnsc-tool-fav-star");
	const railBtns = toolbar.locator(":scope > .vnsc-drawing-toolbar__btn, :scope .vnsc-tools-group-container > .vnsc-drawing-toolbar__btn");
	const nBtns = await railBtns.count();
	for (let i = 0; i < nBtns && (await stars.count()) === 0; i += 1) {
		await railBtns.nth(i).click({ force: true }).catch(() => {});
		await page.waitForTimeout(250);
	}
	let favOk = false;
	let favDetail = `stars=${await stars.count()}`;
	if ((await stars.count()) > 0) {
		const before = await page.evaluate(() => localStorage.getItem("vnsc_favTools") || "");
		await stars.first().click({ force: true });
		await page.waitForTimeout(400);
		const after = await page.evaluate(() => localStorage.getItem("vnsc_favTools") || "");
		favOk = after !== "" && after !== before;
		favDetail = `before=${before} after=${after}`;
	}
	step("P3-10 fav star persists", favOk, favDetail);

	// 10. Alt+S toggles favorites bar.
	//
	// TRƯỚC ĐÂY: `step("P3-09 ...", true, "no crash")` — đối số là HẰNG SỐ, không có phép
	// so sánh nào, nên bước này không thể bao giờ đỏ. Đó là pass rỗng tệ hơn cái P3-08
	// vừa gỡ, và nó nằm ngay trong cùng file. Nay đo trạng thái thật của nút toggle.
	const favToggle = toolbar.locator('[data-testid="drawing-toolbar-favorites-toggle"]');
	const pressedBefore = (await favToggle.count()) > 0 ? await favToggle.first().getAttribute("aria-pressed") : null;
	if (pressedBefore === null) {
		blocked("P3-09 Alt+S toggles fav bar", "favorites toggle button is not rendered on this surface");
	} else {
		await page.keyboard.press("Alt+s");
		await page.waitForTimeout(400);
		const pressedAfter = await favToggle.first().getAttribute("aria-pressed");
		const barVisible = await toolbar.locator('[data-testid="floating-favorites-bar"]').count();
		step(
			"P3-09 Alt+S toggles fav bar",
			pressedAfter !== pressedBefore,
			`aria-pressed ${pressedBefore} -> ${pressedAfter} · bar nodes=${barVisible}`,
		);
	}

	// 11. Typing guard: typing in the symbol search must not switch the drawing
	//    tool, and Ctrl+Z there must undo the TEXT rather than the drawing.
	//
	//    Nhánh `else` cũ gán `guardOk = true` — tự thừa nhận là vacuous. Không có ô
	//    search thì KHÔNG có gì để bảo vệ, nên đó là "không đo được", không phải
	//    "đạt". Nay `blocked()` để nó không bao giờ làm xanh một thứ chưa từng được
	//    kiểm.
	//
	// BA LỖI ĐÃ ĐO, mỗi cái làm bước này hỏng theo cách khác nhau:
	//
	 //  a) SELECTOR PHỤ THUỘC LOCALE. Cũ là
	 //     `input[placeholder*="earch" i]` — chuỗi tiếng Anh. Surface này ghim
	 //     locale "vi" (`StandaloneEmbedDemo.tsx`), nên placeholder thật là
	 //     "Tìm mã chứng khoán..." và không chứa "earch". Đo bằng Playwright:
	 //     selector cũ khớp **0** node, `input[role="combobox"]` khớp **1**.
	 //     Đây đúng là lớp lỗi mà chính file này đã sửa cho P3-04 bằng
	 //     `data-bar-count` — một assertion mà kết quả phụ thuộc locale máy chạy
	 //     là một assertion có thể hỏng với consumer `locale="en"`.
	 //     Nay dùng `role="combobox"`, là thuộc tính semantics không dịch
	 //     (`VNSymbolSearch.tsx:375`).
	 //
	 //  b) ĐO TRÊN TRẠNG THÁI MẶC ĐỊNH. Ô search không tồn tại cho tới khi modal
	 //     mở; nó mở bằng **Ctrl+K**. Không bấm Ctrl+K thì bước này đo một cái
	 //     không có — L-E01 đúng nghĩa. Đã sửa ở điểm lệch đầu tiên: mở modal
	 //     bằng chính phím tắt người dùng thật, rồi mới đo.
	 //
	 //  c) ĐO PROXY. Bản cũ chỉ hỏi `inputValue().includes("l")` — tức "ô nhập
	 //     nhận được chữ". Điều đó KHÔNG nói được chuyện gì về guard: `l` là phím
	 //     tắt tool (`TOOL_SHORTCUT_KEYS.l === "trendLine"`), nên nếu guard hỏng,
	 //     gõ `l` sẽ vừa nhập chữ vừa đổi tool. Thứ người dùng quan tâm là
	 //     TOOL KHÔNG ĐỔI. Cũng vậy, Ctrl+Z trong ô search phải là undo của văn
	 //     bản, không phải của drawing.
	// ĐỌC ACTIVE TOOL — hai lỗi liên tiếp ở đây, cả hai đều làm assertion trung
	// tâm thành PASS RỖNG. Ghi lại vì bản sửa chỉ nhìn thấy lỗi thứ hai nếu đã
	// chạy mutation.
	//
	// LỖI 1 — đọc `textContent`. Element `--active` là nút group
	// (`DrawingToolbar.tsx:334`) và không có `aria-label`; `textContent` của nó là
	// literal `"▾"` (`:346`) — hằng số, đúng bằng mọi group. Sửa bằng `title`
	// (`:335`, i18n key riêng từng group: `tool.group.cursor` vs `tool.group.lines`).
	//
	// LỖI 2 — `querySelector` lấy node ĐẦU TIÊN, mà class `--active` dùng chung
	// cho CẢ nút ghim toolbar (`:225`, `data-testid="toolbar-dock-toggle"`) và
	// nút group, và nút ghim đứng TRƯỚC. Đo được: giá trị đọc về là
	// "Tháo ghim thanh công cụ" — tức nút ghim, không phải tool. Mutation gỡ
	// `isTypingTarget` khiến tool đổi thật, nhưng giá trị này không đổi ⇒
	// assertion vẫn xanh.
	//
	// Sửa ở điểm lệch đầu tiên: chỉ đọc nút TOOL. `vnsc-tool-btn--group` là class
	// riêng của nút group (`DrawingToolbar.tsx:334`), không dùng chung với nút ghim.
	// Và `testid="toolbar-dock-toggle"` là cách loại trừ tường minh — đo bằng
	// điều kiện, không phải bằng vị trí trong DOM (thứ tự render có thể đổi).
	const activeToolNow = async () =>
		page.evaluate(() => {
			const all = Array.from(document.querySelectorAll(".vnsc-drawing-toolbar__btn--active"));
			const el = all.find(
				(n) =>
					n.getAttribute("data-testid") !== "toolbar-dock-toggle" &&
					(n.classList.contains("vnsc-tool-btn--group") || n.closest(".vnsc-tools-group-container")),
			);
			if (!el) return null;
			// `title` trước, vì `textContent` của nút group là hằng "▾".
			return el.getAttribute("title") || el.getAttribute("aria-label") || el.className || null;
		});

	// Ctrl+K là phím tắt thật của sản phẩm (ShortcutManager.ts:128), không phải
	// thao tác dành riêng cho cổng.
	await page.keyboard.press("Control+k");
	await page.waitForTimeout(600);
	const search = page.locator('input[role="combobox"]').first();
	if ((await search.count()) === 0) {
		blocked(
			"P3-11 typing guard",
			"Ctrl+K did not open the symbol search (no input[role=combobox]) - nothing was guarded",
		);
	} else {
		// Tool trước khi gõ: nếu guard hỏng, `l` sẽ đổi nó sang trendLine.
		await page.keyboard.press("Escape");
		await page.waitForTimeout(300);
		const toolBefore = await activeToolNow();
		// Số drawing TRƯỚC khi gõ. Đây là mốc so sánh của cả hai phép đo phía
		// dưới; so `sau` với chính `sau` là pass rỗng (L-E01).
		const drawingsBefore = await drawingCount(page);
		await page.keyboard.press("Control+k");
		await page.waitForTimeout(600);
		await search.click();
		await page.keyboard.type("lhp", { delay: 60 });
		await page.waitForTimeout(400);
		const typed = ((await search.inputValue()) || "").toLowerCase();
		const toolAfterTyping = await activeToolNow();

		// Ctrl+Z trong ô search: phải là undo văn bản, không phải undo drawing.
		await page.keyboard.press("Control+z");
		await page.waitForTimeout(500);
		const afterTextUndo = ((await search.inputValue()) || "").toLowerCase();
		const drawingsAfterTextUndo = await drawingCount(page);

		// Cả ba là quan sát được từ phía người dùng, không phải proxy. Điểm mấu
		// chốt của `nativeUndoOk`: nếu drawing bị chart-undo mất đi, số sẽ nhỏ
		// hơn `drawingsBefore` — đó là kịch bản hỏng mà assertion này bắt.
		//
		// Hai guard chống PASS RỖNG (L-E01), cả hai đều là điều kiện FAIL:
		//   - `toolBefore !== null`: nếu `--active` không tồn tại (surface khác,
		//     Shadow DOM, toolbar không render) thì `null === null` là xanh rỗng.
		//   - `typed.length > 0`: nếu ô search không nhận được chữ thì phép so
		//     tool bên dưới không có nghĩa gì.
		const typingOk =
			toolBefore !== null &&
			typed.includes("l") &&
			toolAfterTyping === toolBefore;
		const nativeUndoOk =
			typed.length > 0 &&
			afterTextUndo.length < typed.length &&
			drawingsAfterTextUndo === drawingsBefore;
		step(
			"P3-11 typing guard",
			typingOk && nativeUndoOk,
			`typed="${typed}" tool ${JSON.stringify(toolBefore)}->${JSON.stringify(toolAfterTyping)} · textUndo "${typed}"->"${afterTextUndo}" drawings ${drawingsBefore}->${drawingsAfterTextUndo}`,
		);
		await page.keyboard.press("Escape");
		await page.waitForTimeout(300);
	}
	// 12. Zero page errors during the whole run.
	step("P3-12 zero page errors", errors.length === 0, `${errors.length} errors`);
}

/**
 * Refuse to grade code it is not pointed at.
 *
 * This script never started the server it was driving, so a stale process left
 * over from an earlier session could serve entirely different code and the
 * whole result would be meaningless. That is not hypothetical: a run was graded
 * 12/12 against a dev server that had been up since two days before the
 * migration under test. `VNSC_ALLOW_ANY_SERVER=1` is the explicit opt-out.
 */
async function assertServerIsOurs() {
	const target = new URL(WATCH_URL);
	// 2026-10-17 (matrix vòng 4): MỘT lần fetch đơn (timeout 5s) fail trong khi staging
	// rõ ràng đang sống — pine/demo-mode PASS vài giây sau đó, chạy lại đơn 12/12, cold
	// fetch đo được ~1.9s. Một blip mạng không được phép abort cả gate. 3 lần thử.
	const ATTEMPTS = 3;
	let fetchError = null;
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		const res = await fetch(target.origin, { signal: AbortSignal.timeout(8000) }).catch((e) => {
			fetchError = e;
			return null;
		});
		if (res && res.ok) return;
		fetchError = res ? new Error(`HTTP ${res.status}`) : fetchError;
		console.warn(`verify-p3: pre-flight ${attempt}/${ATTEMPTS} at ${target.origin} failed: ${fetchError?.name ?? ""} ${fetchError?.message ?? "no response"}`);
		if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 1000 * attempt));
	}
	console.error(
		`verify-p3: no server responding at ${target.origin} after ${ATTEMPTS} attempts ` +
			`(${fetchError?.message ?? "no response"}).\n` +
			"  For a dev server, start one first:  npm run watch\n" +
			"  This suite grades whatever is on the URL, so it refuses to run\n" +
			"  rather than report a result for code it did not build.",
	);
	process.exit(1);
}

(async () => {
	if (process.env.VNSC_ALLOW_ANY_SERVER === "1") {
		console.warn("verify-p3: VNSC_ALLOW_ANY_SERVER=1 - not verifying which build is served");
	} else {
		await assertServerIsOurs();
	}
	const browser = await chromium.launch();
	const page = await browser.newPage();
	page.on("pageerror", (e) => errors.push(e.message));
	console.log(`ENTITLEMENT=${licenseMode()}`);
	// Seed the Pro entitlement BEFORE any document script runs, so the widget reads it at mount.
	// Without this the drawing rail is locked for a free-tier page and P3-04 can never produce a
	// drawing, which is what made this gate 4/13 on staging rather than a real product finding.
	// Set VNI_E2E_LICENSE to a licence signed by the production key and no dev hook is involved.
	const seededLicence = stagingLicense();
	if (seededLicence) {
		await page.addInitScript(
			([slot, lic]) => {
				try {
					localStorage.setItem(slot, lic);
				} catch {
					/* ignore */
				}
			},
			[LICENSE_SLOT, seededLicence],
		);
	}
	try {
		await page.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
		await page.evaluate(() => {
			const doomed = [];
			for (let i = 0; i < localStorage.length; i += 1) {
				const k = localStorage.key(i);
				if (k && (k.startsWith("rsc-drawings-v1-") || k === "vnsc_favTools")) doomed.push(k);
			}
			doomed.forEach((k) => localStorage.removeItem(k));
		});
		await page.reload({ waitUntil: "domcontentloaded" });
		await stepsRailAndTools(page);
		await stepsFavRedoGuard(page);
		const ok = results.filter((r) => r.ok).length;
		const wasBlocked = results.filter((r) => r.blocked).length;
		console.log(
			`RESULT: ${ok}/${results.length} ${ok === results.length ? "PASS" : "FAIL"}` +
				(wasBlocked ? ` (${wasBlocked} step(s) blocked by an unmet precondition)` : ""),
		);
		process.exitCode = ok === results.length ? 0 : 1;
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(`FATAL: ${e.message}`);
	process.exitCode = 1;
});
