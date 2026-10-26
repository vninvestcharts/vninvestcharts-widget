// Dev runtime sweep: loads demo surfaces, captures console errors + page errors.
// Usage: node scripts/sweep-dev-runtime.cjs [url1,url2,...]
const { chromium } = require("@playwright/test");

const TARGETS = (process.argv[2] || process.env.SWEEP_URLS || "http://127.0.0.1:3000").split(",");

(async () => {
	const browser = await chromium.launch();
	const out = [];
	for (const url of TARGETS) {
		const page = await browser.newPage();
		const errors = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text().slice(0, 300));
		});
		page.on("pageerror", (err) => errors.push("PAGEERROR: " + String((err && err.message) || err).slice(0, 300)));
		try {
			await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
			await page.waitForTimeout(5000);
		} catch (e) {
			errors.push("NAVFAIL: " + String(e).split("\n")[0]);
		}
		out.push({ url, errors });
		await page.close();
	}
	await browser.close();
	let total = 0;
	for (const r of out) {
		console.log(`### ${r.url} — ${r.errors.length} errors`);
		r.errors.slice(0, 20).forEach((e) => console.log("  - " + e));
		total += r.errors.length;
	}
	console.log(`SWEEP_TOTAL_ERRORS=${total}`);
	process.exit(0);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
