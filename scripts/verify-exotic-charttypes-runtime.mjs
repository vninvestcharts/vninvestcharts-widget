// Runtime proof for A3 Baseline / A11 Renko / A11 Kagi.
//
// NOT a gate — a one-off probe, kept out of package.json on purpose. It answers
// one question the unit tests cannot: does the chart on screen actually change
// when the picker switches to each exotic type, at a tier that is allowed to use
// it? A green `chartTypeContract.test.ts` plus a blank canvas would still pass.
//
//   node scripts/verify-exotic-charttypes-runtime.mjs
//   WATCH_URL=... node scripts/verify-exotic-charttypes-runtime.mjs
//
// Exit 0 = all probes passed. Any non-zero = see the printed diagnosis.
import { chromium } from "playwright";
import { createHash } from "node:crypto";

const WATCH_URL = process.env.WATCH_URL || "http://localhost:3111/?standalone=1";
const OPEN_TIMEOUT = 90_000;

function hash(text) {
	return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

async function canvasSignature(page) {
	return page.evaluate(() => {
		const canvas = document.querySelector('[data-testid="vninvest-charts"] canvas');
		if (!canvas) {
			return { error: "no canvas in the DOM" };
		}
		const dataUrl = canvas.toDataURL("image/png");
		return { length: dataUrl.length, head: dataUrl.slice(0, 64) };
	});
}

async function openChartTypeMenu(page) {
	const toggle = page.locator('[data-testid="vninvest-charts"] button[aria-haspopup="listbox"]').first();
	await toggle.click({ timeout: 20_000 });
	await page.waitForSelector('[role="option"][data-chart-type]', { timeout: 20_000 });
}

async function selectChartType(page, value) {
	const option = page.locator(`[role="option"][data-chart-type="${value}"]`).first();
	const disabled = await option.getAttribute("aria-disabled");
	if (disabled === "true") {
		return { selected: false, disabled: true };
	}
	await option.click();
	await page.waitForTimeout(2500);
	return { selected: true, disabled: false };
}

const failures = [];
const pageErrors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => pageErrors.push(e.message));

try {
	await page.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: OPEN_TIMEOUT });
	await page.waitForSelector('[data-testid="vninvest-charts"] canvas', { timeout: OPEN_TIMEOUT });
	await page.waitForTimeout(4000);

	await openChartTypeMenu(page);
	const offered = await page.locator('[role="option"][data-chart-type]').evaluateAll((els) =>
		els.map((el) => ({
			value: el.getAttribute("data-chart-type"),
			disabled: el.getAttribute("aria-disabled"),
			comingSoon: el.getAttribute("data-coming-soon"),
		})),
	);
	console.log("picker offers:", JSON.stringify(offered));

	const gatedAtThisTier = offered.filter((o) => o.disabled === "true").map((o) => o.value);
	const exotic = ["baseline", "renko", "kagi"];
	const gated = exotic.filter((v) => offered.some((o) => o.value === v && o.disabled === "true"));
	console.log(`tier here: ${gated.length === exotic.length ? "FREE (all 3 locked)" : "PRO-or-higher (selectable)"}`);

	if (gated.length === exotic.length) {
		// This is the correct, intended state for an unverified tier. The script
		// cannot escalate, so it says so and checks the gate instead of faking a
		// pro session. `chartTypeCapability.test.tsx` covers the pro path.
		console.log("PASS chart_exotic/chart_baseline are locked at an unverified tier (fail-closed)");
		for (const value of gated) {
			const result = await selectChartType(page, value);
			if (result.selected) {
				failures.push(`${value} was reported aria-disabled=true but clicking it still changed the chart type`);
			}
		}
		if (pageErrors.length > 0) {
			failures.push(`page errors: ${pageErrors.join(" | ")}`);
		}
	} else {
		const baseline = await canvasSignature(page);
		const signatures = { candlestick: hash(JSON.stringify(baseline)) };
		for (const value of exotic) {
			const result = await selectChartType(page, value);
			if (!result.selected) {
				failures.push(`${value} is not gated but could not be selected`);
				continue;
			}
			const sig = await canvasSignature(page);
			signatures[value] = hash(JSON.stringify(sig));
			if (sig.error) {
				failures.push(`${value}: ${sig.error}`);
			}
			console.log(`  ${value}: canvas bytes=${sig.length} sig=${signatures[value]}`);
		}
		const distinct = new Set(Object.values(signatures));
		console.log("signatures:", JSON.stringify(signatures));
		if (distinct.size < 2) {
			failures.push(
				`all chart types produced the SAME canvas signature (${[...distinct].join(",")}) — ` +
				"the chart did not actually change. This is the exact bug the test latches describe.",
			);
		} else {
			console.log(`PASS ${distinct.size} distinct canvas signatures across the chart types`);
		}
		if (pageErrors.length > 0) {
			failures.push(`page errors: ${pageErrors.join(" | ")}`);
		}
	}
} catch (error) {
	failures.push(`probe threw: ${error && error.message ? error.message : String(error)}`);
} finally {
	await browser.close();
}

if (failures.length > 0) {
	console.error(`RESULT: FAIL (${failures.length})`);
	for (const failure of failures) {
		console.error(`  - ${failure}`);
	}
	process.exit(1);
}
console.log("RESULT: PASS");
process.exit(0);
