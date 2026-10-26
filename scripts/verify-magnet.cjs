// E2E regression: Shift+M magnet cycle in MULTICHART + ESC mid-draft cancel.
// - Multichart: shell useDrawingToolShortcuts must route Shift+M to the ACTIVE
//   chart handle cycleMagnet, and the shell knob must NOT lag by one stage
//   (rAF read-back fix).
// - ESC: switching drawing tool abandons a mid-draft so the next click cannot
//   complete a ghost drawing (stale "drawing" state).
// Run: npm run verify:magnet   (requires `npm run watch` on :3000)
const { chromium } = require("playwright");

const MAGNET_TESTID = "magnet-toggle";

async function titleOf(page) {
	const el = await page.getByTestId(MAGNET_TESTID).first().elementHandle();
	return (await el.getAttribute("title")) || "";
}

async function verifyMultichartMagnetCycle(page) {
	await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 90000 });
	await page.waitForTimeout(6000);
	await page.getByTestId(MAGNET_TESTID).first().waitFor({ state: "attached", timeout: 30000 });
	const seen = [];
	for (let i = 0; i < 4; i += 1) {
		seen.push(await titleOf(page));
		await page.keyboard.press("Shift+M");
		await page.waitForTimeout(1200);
	}
	seen.push(await titleOf(page));
	const distinct = new Set(seen).size;
	console.log("multichart magnet titles:", JSON.stringify(seen), "| distinct:", distinct);
	if (distinct < 3 || seen[0] === seen[1]) {
		console.log("MULTICHART SHIFT+M FAIL (no/lagged cycle)");
		return false;
	}
	console.log("MULTICHART SHIFT+M OK (full cycle on active chart)");
	return true;
}

async function countDrawings(page) {
	return page.evaluate(() => {
		let total = 0;
		for (let i = 0; i < localStorage.length; i += 1) {
			const k = localStorage.key(i);
			if (!k || !k.startsWith("rsc-drawings-v1-") || k.endsWith("-all")) continue;
			try {
				const raw = JSON.parse(localStorage.getItem(k));
				if (Array.isArray(raw)) total += raw.length;
				else if (raw && Array.isArray(raw.drawings)) total += raw.drawings.length;
			} catch {}
		}
		return total;
	});
}

async function verifyEscCancelGhost(page) {
	await page.goto("http://localhost:3000/?standalone=1", { waitUntil: "domcontentloaded", timeout: 90000 });
	await page.getByTestId("drawing-toolbar").waitFor({ state: "attached", timeout: 30000 });
	await page.waitForTimeout(3000);
	await page.evaluate(() => {
		for (let i = 0; i < localStorage.length; i += 1) {
			const k = localStorage.key(i);
			if (k && k.startsWith("rsc-drawings-v1-")) localStorage.removeItem(k);
		}
	});
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForTimeout(3000);
	const box = await page.getByTestId("vninvest-charts").first().boundingBox();
	await page.keyboard.press("Alt+t");
	await page.waitForTimeout(300);
	await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
	await page.waitForTimeout(400);
	await page.keyboard.press("Escape");
	await page.waitForTimeout(400);
	await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4);
	await page.waitForTimeout(900);
	const n = await countDrawings(page);
	console.log("drawings after Escape-mid-draft + click:", n);
	if (n !== 0) {
		console.log("ESC-CANCEL FAIL (ghost drawing completed)");
		return false;
	}
	console.log("ESC-CANCEL OK (no ghost)");
	return true;
}

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	page.on("pageerror", (e) => console.log("PAGEERROR: " + e.message));
	let ok = true;
	ok = (await verifyMultichartMagnetCycle(page)) && ok;
	await page.evaluate(() => localStorage.clear()).catch(() => {});
	page.on("pageerror", () => {});
	ok = (await verifyEscCancelGhost(page)) && ok;
	await browser.close();
	console.log(ok ? "VERIFY:MAGNET 2/2 PASS" : "VERIFY:MAGNET FAILED (see above)");
	process.exit(ok ? 0 : 1);
})();