// verify-uiux-multi-cells.cjs — probe audit giao diện multicharts (UIUX_MULTI_CELL_HEADER).
//
// MỤC TIÊU (2 phần, fail-closed):
//   1. Mỗi ô multi KHÔNG được có dải header thừa `[data-testid="cell-status-line"]` (đã bỏ vì
//      TRÙNG với dòng status line trong pane) — và vẫn PHẢI có dòng status line trong pane
//      `[data-rsc-chart-status-line]` (invariant dương: "vắng mặt" không được tính là pass).
//   2. 3 cờ `statusLine` (showTicker / showOHLC / showBarChange) phải QUAN SÁT ĐƯỢC trong multi:
//      đặt `showOHLC=false` cho từng ô ⇒ nhóm O/H/L-C phải BIẾN MẤT (Vol giữ lại); nếu còn ⇒ FAIL.
//
// CƠ CHẾ TOGGLE (PA-2): ô multi có `chartId` ⇒ `shouldAcceptSettingsEvent` BỎ QUA event global
// (`storageKeys.ts:106-114`) ⇒ probe ghi composite **theo từng chartId** vào localStorage rồi
// reload (settings hydrate lúc mount) — không dựa vào event toàn cục.
//
// Usage: WATCH_URL=https://charts.edusuccess.vn/ node scripts/verify-uiux-multi-cells.cjs
// Exit: 0 = tất cả assert PASS · 1 = FAIL (kèm lý do) · 2 = probe không chạy được (mạng/UI).
"use strict";
const { chromium } = require("playwright");

const WATCH_URL = process.env.WATCH_URL || "https://charts.edusuccess.vn/";
const OUT_FILE = process.env.UIUX_MULTI_OUT || "";

const results = [];
let undecidable = false;
function step(name, ok, detail = "") {
	results.push({ name, ok });
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

/** Đọc trạng thái DOM của các ô multi. */
async function readCells(page) {
	return await page.evaluate(() => {
		const cells = Array.from(document.querySelectorAll('[data-testid="vninvest-charts"]'));
		return cells.map((cell) => {
			const host = cell.closest("[data-chart-id]") || cell;
			const chartId = host.getAttribute("data-chart-id");
			const ohlc = cell.querySelector('[data-testid="status-ohlc-values"]');
			const ohlcText = ohlc ? (ohlc.textContent || "").replace(/\s+/g, " ").trim() : null;
			// Hàng toolbar THẬT của ô multi = `PricePaneHeader` (symbol + O/H/L/C + % + Vol + ⚙).
			const toolbar = cell.querySelector('[data-testid="price-pane-header"]');
			const toolbarText = toolbar ? (toolbar.textContent || "").replace(/\s+/g, " ").trim() : null;
			return {
				chartId,
				stripCount: cell.querySelectorAll('[data-testid="cell-status-line"]').length,
				paneStatusLines: cell.querySelectorAll('[data-testid="price-pane-header"]').length,
				hasOhlcValues: !!ohlc,
				ohlcText,
				toolbarText,
				// Nhãn OHLC trong `PricePaneHeader`: dense = "O:83,153.78", compact = "O83,153.78".
				// Yêu cầu chữ số ngay sau "O" (mã như SOLUSDT không khớp vì sau "O" là "L").
				hasOpen: toolbarText ? /O[:]?\d/.test(toolbarText) : false,
				hasVol: toolbarText ? /Vol[:]?\d/.test(toolbarText) : false,
			};
		});
	});
}

async function gotoWithRetry(page, url, attempts = 3) {
	let last = null;
	for (let i = 0; i < attempts; i++) {
		try {
			await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
			return;
		} catch (e) {
			last = e;
			await page.waitForTimeout(2000 * (i + 1));
		}
	}
	throw last;
}

async function main() {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	const pageErrors = [];
	page.on("pageerror", (e) => pageErrors.push(String((e && e.message) || e)));

	try {
		await gotoWithRetry(page, WATCH_URL);
		await page.waitForTimeout(10000);

		const before = await readCells(page);
		if (before.length === 0) {
			console.log("FAIL không tìm thấy ô multi nào (probe không chạy được)");
			return 2;
		}

		// (1) không còn dải header thừa + vẫn có dòng status trong pane
		const withStrip = before.filter((c) => c.stripCount > 0);
		step("0 dải [cell-status-line] trong các ô multi", withStrip.length === 0, `còn ${withStrip.length} ô`);
		const withPaneLine = before.filter((c) => c.paneStatusLines > 0);
		step("mỗi ô có dòng status line trong pane", withPaneLine.length === before.length, `${withPaneLine.length}/${before.length} ô`);

		// (2) toggle showOHLC theo từng chartId (composite scoped) + reload
		//     LƯU Ý: hiện tại 3 cờ `statusLine` **chưa** quan sát được ở multi (ô multi hiện hàng
		//     toolbar `PricePaneHeader`, không phải `ChartStatusLine`) ⇒ phần này đo **INFO** (ghi
		//     trạng thái) chứ KHÔNG assert ⇒ không được báo FAIL giả. Xem plan §2.2 (follow-up W3).
		const saved = await page.evaluate(() => {
			const out = {};
			for (let i = 0; i < localStorage.length; i += 1) {
				const k = localStorage.key(i);
				// Cả khoá prefixed (adapter) lẫn khoá thô — app đọc prefixed TRƯỚC.
				if (k && (k.startsWith("vnsc_chart_settings_v1") || k.startsWith("vninvestcharts:vnsc_chart_settings_v1"))) {
					out[k] = localStorage.getItem(k);
				}
			}
			return out;
		});
		const applied = await page.evaluate(() => {
			const cells = Array.from(document.querySelectorAll('[data-testid="vninvest-charts"]'));
			const keys = [];
			for (const cell of cells) {
				const host = cell.closest("[data-chart-id]") || cell;
				const chartId = host.getAttribute("data-chart-id");
				if (!chartId) continue;
				// PA-3: app đọc khoá PREFIXED trước (`StorageAdapter.ts:11` prefix `vninvestcharts:`)
				// ⇒ phải ghi CẢ HAI khoá, và dùng đúng tên field `showOhlc` (PA-2).
				for (const key of [`vnsc_chart_settings_v1_${chartId}`, `vninvestcharts:vnsc_chart_settings_v1_${chartId}`]) {
					let state = {};
					try {
						state = JSON.parse(localStorage.getItem(key) || "{}");
					} catch {
						state = {};
					}
					state.statusLine = { ...(state.statusLine || {}), showOhlc: false };
					localStorage.setItem(key, JSON.stringify(state));
					keys.push(key);
				}
			}
			return keys;
		});
		console.log(`INFO  đã ghi composite showOhlc=false cho ${applied.length} khoá (${applied.length / 2} ô)`);

		// Precondition (PA-5): đọc lại theo thứ tự adapter-first ⇒ xác nhận app SẼ thấy giá trị mới.
		const precondition = await page.evaluate(() => {
			const cells = Array.from(document.querySelectorAll('[data-testid="vninvest-charts"]'));
			let ok = 0;
			for (const cell of cells) {
				const host = cell.closest("[data-chart-id]") || cell;
				const chartId = host.getAttribute("data-chart-id");
				if (!chartId) continue;
				const prefixed = localStorage.getItem(`vninvestcharts:vnsc_chart_settings_v1_${chartId}`);
				const raw = prefixed ?? localStorage.getItem(`vnsc_chart_settings_v1_${chartId}`);
				if (!raw) continue;
				try {
					const parsed = JSON.parse(raw);
					const sl = parsed.statusLine || {};
					if ((sl.showOhlc ?? sl.showOHLC) === false) ok += 1;
				} catch {
					/* ignore */
				}
			}
			return ok;
		});

		await gotoWithRetry(page, WATCH_URL);
		await page.waitForTimeout(10000);
		const after = await readCells(page);
		const stillOpen = after.filter((c) => c.hasOpen);
		const stillVol = after.filter((c) => c.hasVol);
		const openBefore = before.filter((c) => c.hasOpen).length;

		if (precondition === 0) {
			// PA-5: không xác nhận được composite mà app đọc ⇒ KHÔNG assert (tránh FAIL giả).
			step("precondition: composite showOhlc=false mà app đọc được", false, "không đọc được ⇒ UNDECIDABLE (exit 2)");
			undecidable = true;
		} else if (openBefore === 0) {
			step("precondition: ô có hiện O/H/L/C trước khi toggle", false, "0 ô ⇒ không quan sát được (exit 2)");
		} else {
			step("precondition: composite showOhlc=false mà app đọc được", true, `${precondition} ô`);
			step("showOhlc=false ⇒ toolbar ô ẨN O/H/L/C", stillOpen.length === 0, `còn ${stillOpen.length}/${after.length} ô`);
			step("showOHLC=false ⇒ Vol VẪN còn (chỉ OHLC bị ẩn)", stillVol.length === after.length, `${stillVol.length}/${after.length} ô`);
		}

		// (3) khôi phục composite ⇒ trạng thái về như cũ (round-trip) — CHỈ khoá vừa ghi (PA-4)
		const restore = await page.evaluate(
			({ savedMap, writtenKeys }) => {
				let restoredCount = 0;
				let removedCount = 0;
				for (const key of writtenKeys) {
					const prev = Object.prototype.hasOwnProperty.call(savedMap, key) ? savedMap[key] : null;
					if (prev === null) {
						localStorage.removeItem(key);
						removedCount += 1;
					} else {
						localStorage.setItem(key, prev);
						restoredCount += 1;
					}
				}
				return { restored: restoredCount, removed: removedCount };
			},
			{ savedMap: saved, writtenKeys: applied },
		);
		console.log(`INFO  khôi phục: ${restore.restored} khoá trở lại giá trị cũ · ${restore.removed} khoá mới bị xoá`);
		await gotoWithRetry(page, WATCH_URL);
		await page.waitForTimeout(10000);
		const restored = await readCells(page);
		const backOpen = restored.filter((c) => c.hasOpen);
		step("khôi phục ⇒ O/H/L-C quay lại", backOpen.length === restored.length && restored.length > 0, `${backOpen.length}/${restored.length} ô`);

		if (pageErrors.length) {
			console.log(`\npage errors (${pageErrors.length}): ${pageErrors.slice(0, 3).join(" | ")}`);
		}
	} catch (e) {
		console.log(`FAIL probe lỗi: ${(e && e.message) || e}`);
		return 2;
	} finally {
		await browser.close();
	}

	const failed = results.filter((r) => !r.ok).length;
	const md = [
		"| assert | kết quả |",
		"|---|---|",
		...results.map((r) => `| ${r.name} | **${r.ok ? "PASS" : "FAIL"}** |`),
		"",
		`Tổng: ${results.length} assert · PASS ${results.length - failed} · FAIL ${failed}`,
	].join("\n");
	console.log("\n" + md);
	if (OUT_FILE) require("node:fs").writeFileSync(OUT_FILE, md + "\n", "utf8");
	if (undecidable) return 2;
	return failed === 0 ? 0 : 1;
}

main()
	.then((code) => process.exit(code))
	.catch((e) => {
		console.error("verify-uiux-multi-cells: lỗi không kỳ vọng:", e);
		process.exit(2);
	});
