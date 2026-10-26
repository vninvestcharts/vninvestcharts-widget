// S0 reproduce + regression lock: 1 Delete => 1 undo entry (F-01 / P3-06b).
// Usage: WATCH_URL=http://localhost:3000/?standalone=1 node scripts/stability-undo.cjs
// Exit 0 = 5/5 PASS, 1 = FAIL. Before S1.1 fix: expected FAIL (undo no-op,
// 2 history entries). After fix: expected 5/5 PASS.
const { chromium } = require("playwright");

const WATCH_URL = process.env.WATCH_URL || "http://localhost:3000/?standalone=1";
const ITERATIONS = Number(process.env.ITER || 5);

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
			} catch { /* ignore corrupt */ }
		}
		return total;
	});
}

async function clearDrawingKeys(page) {
	await page.evaluate(() => {
		const doomed = [];
		for (let i = 0; i < localStorage.length; i += 1) {
			const k = localStorage.key(i);
			if (k && k.startsWith("rsc-drawings-v1-")) doomed.push(k);
		}
		doomed.forEach((k) => localStorage.removeItem(k));
	});
}

async function runIteration(page, n) {
	// Data-ready gate (2026-10-19): drag cần MIỀN TỌA ĐỘ — chart chưa có nến
	// (`data-bar-count` = 0) thì mouse down/move/up không tạo được drawing: đo
	// staging cùng build có `hit=CANVAS` nhưng draw=0 khi bars=0, và PASS 3/3 khi
	// chờ bars>0. verify-p3 đã có cổng này (waitForChartData); script này dùng
	// sleep cứng nên kẹt race khi bundle nặng thêm (S2 default-on rail).
	// KHÔNG đổi tiêu chí PASS (draw=1 → del=0 → undo=1), chỉ chờ app sẵn sàng.
	await page.waitForFunction(
		() => {
			const s = document.querySelector('[data-testid="chart-a11y-summary"]');
			const n = s ? Number(s.getAttribute("data-bar-count")) : 0;
			return Number.isFinite(n) && n > 0;
		},
		null,
		{ timeout: 45000 },
	);
	await page.waitForTimeout(500);
	const toolbar = page.getByTestId("drawing-toolbar");
	await toolbar.waitFor({ state: "attached", timeout: 30000 });
	// Rail auto-hides (toolbar.css shell :hover) — reveal before clicking.
	await page.hover(".vnsc-drawing-toolbar-shell").catch(() => {});
	await toolbar.waitFor({ state: "visible", timeout: 10000 });
	// Locale-agnostic tool select: Alt+T => trendLine (ALT_TOOL_SHORTCUTS).
	await page.keyboard.press("Alt+t");
	await page.waitForTimeout(300);
	const box = await page.getByTestId("vninvest-charts").first().boundingBox();
	if (!box) throw new Error("chart box not found");
	const x1 = box.x + box.width * 0.3;
	const y1 = box.y + box.height * 0.5;
	const x2 = box.x + box.width * 0.6;
	const y2 = box.y + box.height * 0.4;
	await page.mouse.move(x1, y1);
	await page.mouse.down();
	await page.mouse.move(x2, y2, { steps: 12 });
	await page.mouse.up();
	await page.waitForTimeout(900); // 300ms debounce persist + margin
	const drawn = await drawingCount(page);
	// Select the new drawing (click its midpoint), then Delete.
	await page.mouse.click((x1 + x2) / 2, (y1 + y2) / 2);
	await page.waitForTimeout(300);
	await page.keyboard.press("Delete");
	await page.waitForTimeout(700);
	const deleted = await drawingCount(page);
	await page.keyboard.press("Control+z");
	await page.waitForTimeout(700);
	const undone = await drawingCount(page);
	const pass = drawn === 1 && deleted === 0 && undone === 1;
	console.log(`ITER ${n}: draw=${drawn} del=${deleted} undo=${undone} ${pass ? "PASS" : "FAIL"}`);
	return pass;
}

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	page.on("pageerror", (e) => console.log(`PAGEERROR: ${e.message}`));
	try {
		await page.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
		await clearDrawingKeys(page);
		await page.reload({ waitUntil: "domcontentloaded" });
		let ok = 0;
		for (let n = 1; n <= ITERATIONS; n += 1) {
			try {
				if (await runIteration(page, n)) ok += 1;
			} catch (e) {
				console.log(`ITER ${n}: ERROR ${e.message}`);
			}
			await clearDrawingKeys(page);
			await page.reload({ waitUntil: "domcontentloaded" });
		}
		console.log(`RESULT: ${ok}/${ITERATIONS} ${ok === ITERATIONS ? "PASS" : "FAIL"}`);
		process.exitCode = ok === ITERATIONS ? 0 : 1;
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(`FATAL: ${e.message}`);
	process.exitCode = 1;
});
