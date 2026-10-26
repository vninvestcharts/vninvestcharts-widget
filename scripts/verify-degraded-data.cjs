#!/usr/bin/env node
/**
 * Plan §9.3 — degraded-data E2E: the data-unavailable banner, the unadjusted long-horizon
 * tag, and a zero volume that is LABELLED rather than fabricated.
 *
 * WHAT THIS SCRIPT REFUSES TO DO
 * It does not assert the plan's three outcomes are present. It grades the shipped product
 * and reports what it finds. Two of the three user-facing strings the plan expects do not
 * exist at runtime, and one of the two conditions that should trigger them is hardcoded on:
 *   - src/widget/VNInvestCharts.tsx:768  `adjClose: null, adjFactor: null` — unconditional,
 *     so EVERY bar in the product is unadjusted and the tag is always owed
 *   - src/widget/i18n/capability.messages.en.ts:115-117 and .vi.ts:111-113 define
 *     data.unadjusted.{title,body,tag}; the only other mentions are a key-existence test
 *     (src/widget/i18n/__tests__/capabilityMessages.test.ts:92-93). No component reads them.
 *   - data_unavailable resolves to UnavailableState (src/widget/components/CapabilityGate.tsx:101,133,168)
 *     but no code ever renders it and nothing ever sets a forcedReason, so the banner has no
 *     trigger and no surface.
 * The copy exists; the product does not use it. Reported, not fixed — scripts/ may not touch src/.
 *
 * THE TWO DEGRADED PATHS ARE GENUINE, NOT SIMULATED
 * 1. The standalone demo ships a first-class offline switch
 *      - src/demo/StandaloneEmbedDemo.tsx:205-212  checkbox -> setOfflineMode
 *      - :62  geoBinance.setForceOffline(offlineMode)
 *      - :52  the code comment claims the crypto fallback lands on an offline CSV
 *        "with a visible status". That claim is graded by DEG-05.
 * 2. The demo's crypto chart is fed by a real network adapter (src/lib/adapters binanceAdapter),
 *    so DEG-06 aborts every request with page.route and watches for a real failure response.
 *    A banner that never appears under a genuine total outage is a real finding, not an
 *    argument from the source tree.
 *
 * ON THE ZERO VOLUME, STATED PRECISELY
 * src/widget/data/DataEnvelope.ts coerces a missing volume to 0 ON PURPOSE, with the reason
 * in a comment, and keeps adjClose nullable rather than substituting a value. So the zero is
 * deliberate and is not fabricated data. The defect the plan is pointing at is the missing
 * LABEL: nothing in the product tells the user that a 0 means "no volume in the source"
 * rather than "volume was zero". DEG-04 grades the label and reports the raw reading next to
 * it so the distinction is visible in the output.
 *
 * Run:  npm run build:css && npm run watch
 *       node scripts/verify-degraded-data.cjs
 *       node scripts/verify-degraded-data.cjs --self-test   (negative cases only, no browser)
 */
"use strict";

const { chromium } = require("playwright");

const WATCH_URL = process.env.VN_WATCH_URL || "http://localhost:3000/?standalone=1";
/* Vietnamese, verbatim from src/widget/i18n/capability.messages.vi.ts */
const UNADJUSTED = { tag: "Chưa điều chỉnh", title: "Giá chưa được điều chỉnh" };
const DATA_UNAVAILABLE = ["Dữ liệu không khả dụng", "không khả dụng", "unavailable", "Unavailable"];

let passed = 0;
let failed = 0;
let gaps = 0;
const step = (name, ok, detail = "") => {
	ok ? passed++ : failed++;
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};
const gap = (name, reason) => {
	gaps++;
	console.log(`GAP  ${name} — ${reason}`);
};

/** A zero volume must be explained, never presented as a real observation. */
function zeroIsLabelled(reading, body) {
	if (reading === null) return false; // no volume pane at all: nothing is being claimed
	if (reading !== 0) return true; // a real non-zero volume needs no disclaimer
	return /khả dụng|unavailable|không có dữ liệu|no data/i.test(body);
}
/** The unadjusted tag is owed whenever adjusted prices are absent. */
const tagOwed = (adjCloseIsNull) => adjCloseIsNull;
function tagShown(body) {
	return body.includes(UNADJUSTED.tag) || body.includes(UNADJUSTED.title);
}
/** The banner must survive being asked for on a page that is genuinely broken. */
function bannerShown(body) {
	return DATA_UNAVAILABLE.some((needle) => body.includes(needle));
}
/** A degraded source must still paint: a canvas exists and a quote is on screen. */
const chartAlive = (c) => c.canvas > 0 && c.quote !== null;
/** Liveness of a page. `quote` is the raw OHLC match, kept out of the predicate on purpose. */
async function observe(p) {
	return {
		canvas: await p.locator("canvas").count(),
		quote: (await p.locator("body").innerText()).match(/\d[\d.,]*\s*\(\s*[+-]?\d/),
	};
}

const fail = (m) => {
	console.error(`FAIL selftest: ${m}`);
	process.exit(1);
};
const mustBe = (cond, m) => {
	if (!cond) fail(m);
};

// ---------------------------------------------------------------- self-test
if (process.argv.includes("--self-test")) {
	// The unadjusted tag is owed unconditionally: VNInvestCharts.tsx:768 always nulls adjClose.
	mustBe(tagOwed(true), "rejected the always-owed unadjusted tag");
	mustBe(!tagShown("giá đóng 266.20"), "accepted a page with no unadjusted tag");
	mustBe(!tagShown(""), "accepted an empty body as tagged");
	mustBe(tagShown(`... ${UNADJUSTED.tag} ...`), "rejected a page that does carry the tag");
	mustBe(!zeroIsLabelled(null, ""), "accepted a missing volume pane as labelled");
	mustBe(!zeroIsLabelled(0, "Vol 0"), "accepted an unlabelled zero volume");
	mustBe(zeroIsLabelled(0, "Vol 0 — dữ liệu không khả dụng"), "rejected a labelled zero volume");
	mustBe(zeroIsLabelled(521.13, ""), "rejected a real non-zero volume as needing a label");
	mustBe(!bannerShown("giá đóng 266.20"), "accepted a healthy page as showing the outage banner");
	mustBe(bannerShown("Dữ liệu không khả dụng"), "rejected a page that does show the banner");
	mustBe(chartAlive({ canvas: 1, quote: "266.20" }), "rejected a chart that still paints");
	mustBe(!chartAlive({ canvas: 0, quote: "266.20" }), "accepted a chart with no canvas");
	mustBe(!chartAlive({ canvas: 1, quote: null }), "accepted a canvas with no quote on screen");
	console.log("RESULT: 12/12 PASS");
	process.exit(0);
}

// ---------------------------------------------------------------- browser run
(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	const errors = [];
	page.on("pageerror", (e) => errors.push(String(e).split("\n")[0].slice(0, 160)));
	page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
	await page.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
	await page.waitForSelector('[data-testid="vninvest-charts"]', { timeout: 60000 });
	await page.waitForTimeout(4000);

	const body = () => page.locator("body").innerText();
	/** The volume legend, or null when no volume pane is on screen. */
	const volumeReading = async () => {
		const m = (await body()).match(/Vol[\s:]*([\d.,]+)/i);
		return m ? Number(m[1].replace(/,/g, "")) : null;
	};

	step("DEG-00 widget mounted", true);
	const live = await observe(page);
	step("DEG-01 the live source paints candles", chartAlive(live),
		`canvas=${live.canvas} quote=${live.quote ? live.quote[0].trim() : "none"} ` +
		"[the demo's crypto adapter is a real network source]");

	// -- unadjusted tag, on the default horizon and on the longest one
	const shortBody = await body();
	step("DEG-02 the unadjusted tag is shown", tagOwed(true) && tagShown(shortBody),
		`adjClose is hardcoded null [VNInvestCharts.tsx:768], tag "${UNADJUSTED.tag}" absent — ` +
		"data.unadjusted.* has no runtime consumer");

	const longest = page.locator('[data-testid="timeframe-footer"] button[data-range]').last();
	if ((await longest.count()) > 0) {
		await longest.click({ timeout: 10000 });
		await page.waitForTimeout(3000);
		const range = await longest.getAttribute("data-range");
		const longBody = await body();
		step("DEG-03 a long horizon is tagged unadjusted", tagShown(longBody),
			`range=${range}, tag absent — deep unadjusted history is silently presented as adjusted`);
	} else {
		step("DEG-03 a long horizon is tagged unadjusted", false, "no range chip in the footer to switch");
	}

	// -- the zero volume, read not assumed
	const vol = await volumeReading();
	if (vol === null || vol !== 0) {
		// A pass here would be vacuous: nothing was actually zero, so nothing was labelled.
		gap("a zero volume is labelled, not presented as real",
			`no zero volume occurred on this surface (reading=${vol === null ? "no volume pane" : vol}), ` +
			"so the condition was never exercised at runtime; the labelling predicate is covered " +
			"by --self-test only, and DataEnvelope.ts coerces a missing volume to 0 deliberately");
	} else {
		step("DEG-04 a zero volume is labelled, not presented as real", zeroIsLabelled(vol, await body()),
			"volume reading=0, unlabelled");
	}

	// -- the first-class offline switch the demo ships
	const offline = page.locator('label:has-text("Offline CSV") input[type="checkbox"]');
	if ((await offline.count()) === 0) {
		step("DEG-05 the offline CSV fallback shows a visible status", false, "the demo's offline switch is not in the DOM");
	} else {
		await offline.first().check({ timeout: 10000 });
		await page.waitForTimeout(5000);
		// The switch's own label reads "Offline CSV (dữ liệu demo)", so matching the word
		// "offline" would grade the toggle as the status it is supposed to report. Strip the
		// label out of the text before looking for a status, or the check is vacuous.
		const stripped = (await body()).replace(/Offline CSV[^\n]*/gi, "");
		const offVol = await volumeReading();
		step("DEG-05 the offline CSV fallback shows a visible status", /Đã tải\s*:|Loaded\s*:/i.test(stripped),
			`StandaloneEmbedDemo.tsx:52 promises a visible status; found=${/Đã tải\s*:|Loaded\s*:/i.test(stripped)} ` +
			`volume reading=${offVol === null ? "none" : offVol}`);
		step("DEG-06 the offline fallback still paints", chartAlive(await observe(page)),
			"canvas + quote must both be present after switching to the offline CSV");
	}

	// -- a genuine total outage of the DATA path, not of the page. Only xhr/fetch is cut:
	//    aborting scripts too means the app never boots, which would prove nothing about
	//    whether the product surfaces a banner.
	const dead = await browser.newPage();
	const deadErrors = [];
	dead.on("pageerror", (e) => deadErrors.push(String(e).split("\n")[0].slice(0, 120)));
	const aborted = [];
	await dead.route("**", (route) => {
		const type = route.request().resourceType();
		if (type !== "xhr" && type !== "fetch") return route.continue();
		aborted.push(new URL(route.request().url()).host);
		return route.abort("failed");
	});
	await dead.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
	await dead.waitForSelector('[data-testid="vninvest-charts"]', { timeout: 60000 });
	await dead.waitForTimeout(10000);
	const deadBody = await dead.locator("body").innerText();
	const hosts = [...new Set(aborted)];
	step("DEG-07 the data path is cut off", aborted.length > 0,
		`${aborted.length} xhr/fetch request(s) aborted to ${hosts.join(", ") || "nothing"}`);
	step("DEG-08 an unreachable data source shows the data-unavailable banner",
		bannerShown(deadBody),
		`banner absent with ${aborted.length} data request(s) refused; data_unavailable resolves to ` +
		"UnavailableState (CapabilityGate.tsx:133,168) which nothing renders and for which " +
		"nothing ever sets a forcedReason");
	step("DEG-09 the outage page raises no uncaught error", deadErrors.length === 0,
		`${deadErrors.length}: ${deadErrors[0] || ""}`);
	await dead.close();

	gap("data.unadjusted.{title,body,tag} and data.dividendsMissing",
		"the Vietnamese and English strings ship, but the only non-test reference is the " +
		"key-existence test at i18n/__tests__/capabilityMessages.test.ts:92-93");
	gap("long-horizon dividend adjustment",
		"adjClose/adjFactor are null at VNInvestCharts.tsx:768, so adjusted-return maths over " +
		"a long horizon cannot be correct, and nothing on screen discloses it");
	gap("pro-tier degraded surface",
		"no harness can reach pro (see verify-capability-gate.cjs header), so the paid variant " +
		"of the banner is unverified");

	step("DEG-10 zero page errors on the live surface", errors.length === 0, `${errors.length} errors: ${errors[0] || ""}`);
	await browser.close();
	console.log(`RESULT: ${passed}/${passed + failed} ${failed ? "FAIL" : "PASS"} | ${gaps} recorded gap(s)`);
	process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
	console.error(`HARNESS ERROR: ${e && e.stack ? e.stack.split("\n")[0] : e}`);
	process.exit(1);
});
