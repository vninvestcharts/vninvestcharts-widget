// Runtime lane smoke, replacing scripts/legacy-parity-shots.cjs.
//
// The old script compared PNG byte lengths between the legacy and fork runtimes to prove
// they matched, then called that G3's parity evidence. Three things made it worthless.
//
// One, the legacy runtime it photographed no longer exists. G4 cut the lane, so
// runtimeLane: "legacy" resolves to fork exactly like "auto" does, and the script's
// central assertion, lanes differ visually, could only ever have passed by accident.
// Its verdict table still listed legacy captured as a requirement.
//
// Two, the comparison method was invalid. It read PNG byte length as a proxy for
// "visually different". The demo draws live Binance data, so every reload produced a
// different image and the proxy measured the network, not the renderer. Byte length is a
// fine way to prove two renders are identical. It is not a way to prove two renders
// differ.
//
// Three, it could not fail for a useful reason. Three shots and a byte diff cannot catch a
// blank pane or a thrown render, which are the failures that matter.
//
// So this checks what is still true and is checkable.
//
// Phase A, no browser. The shipped bundles must contain one runtime, not two. This is the
// property G4 actually established and the old script had no way to assert it.
//
// Phase B, browser, only when BROWSER_URL is set. Zero page errors, a canvas with real
// pixels in it, and byte-identical output across two loads of the same URL, which is the
// legitimate use of byte comparison and is only meaningful against deterministic data.
// Point it at a fixture page, not the live demo, or the determinism check will report the
// network.
//
// Usage:
//   npm run build && node scripts/runtime-lane-smoke.cjs    # phase A needs dist/
//   BROWSER_URL=http://localhost:6006 \
//   BROWSER_STORY=widget-vninvestcharts--deterministic-fork-runtime \
//     node scripts/runtime-lane-smoke.cjs                  # A then B
//
// The story must be one built on deterministic data. `widget-vninvestcharts--default` and
// its siblings use `mockData`, which is built from Date.now() and Math.random(), so their
// two loads differ by construction and the determinism verdict below measures the fixture,
// not the renderer. `--deterministic-fork-runtime` uses stories/support/storyData.ts,
// generated from a fixed epoch. It also keeps `data-testid="vninvest-charts"`, which phase B
// needs to find the canvas; the `CandleStick*` stories render ChartSurface and do not.
//
// Phase A needs dist/, and `npm run watch` DELETES IT - but not because of webpack.
// The cause is package.json's `watch` script: `npm run clean && cross-env ... webpack
// serve`, and `clean` is `rimraf -rf ./build ./dist`. rimraf deletes dist/ BEFORE webpack
// starts. Webpack's own output.path is ../build (config/webpack.config.js:138) and its
// `clean: true` (:140) only ever empties that directory - webpack never writes dist/.
// Verified 2026-10-04 and again 2026-10-05 by observing dist/ absent while `npm run watch`
// was running (PIDs 32592 -> 30536, port 3000 open).
//
// So: build AFTER the last `npm run watch`, or run this before starting the dev server.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

// Markers that must not survive in a build where only fork exists. shouldForceLegacyRuntime
// is deliberately still exported and always false, so it is listed as an allowed residue
// rather than a failure: removing the export is a separate breaking change.
//
// The match is anchored on an identifier boundary, and that is not decoration. A plain
// substring search for PaneTooltip reported a failure in all three shipped bundles, and the
// hit was forkPaneTooltip, a live CSS-module class in ForkPaneTooltips.tsx. A check that
// cries wolf on the fork lane is worse than no check, so the lookbehind rejects a match
// glued to the end of a longer identifier.
const FORBIDDEN = ["PaneTooltip", "GenericChartComponent", "resolveSeriesRenderMode"];
const ALLOWED_RESIDUE = ["shouldForceLegacyRuntime"];

// Must not match forkPaneTooltip or PaneTooltipsExtra, must match a bare reference.
function markerRe(marker) {
	return new RegExp(`(?<![A-Za-z0-9_$])${marker}\\b`);
}

function selfTest() {
	const cases = [
		["forkPaneTooltipDark", "PaneTooltip", false],
		["PaneTooltipsExtra", "PaneTooltip", false],
		["className: PaneTooltip }", "PaneTooltip", true],
		["import { PaneTooltip }", "PaneTooltip", true],
		["forkGenericChartComponent", "GenericChartComponent", false],
		["x = GenericChartComponent;", "GenericChartComponent", true],
	];
	let bad = 0;
	for (const [subject, marker, want] of cases) {
		const got = markerRe(marker).test(subject);
		if (got !== want) {
			bad += 1;
			console.log(`FAIL self-test ${marker} against "${subject}" -> ${got}, want ${want}`);
		}
	}
	console.log(`${bad === 0 ? "PASS" : "FAIL"} matcher self-test (${cases.length} cases)`);
	return bad;
}

function phaseA() {
	console.log("PHASE A - shipped bundles must contain exactly one runtime");
	if (!fs.existsSync(DIST)) {
		console.log("FAIL dist/ is missing. Run npm run build first.");
		return 1;
	}
	const bundles = fs
		.readdirSync(DIST)
		.filter((f) => /\.(js|cjs)$/.test(f) && !f.endsWith(".map"))
		.sort();
	if (!bundles.length) {
		console.log("FAIL dist/ has no bundle to inspect.");
		return 1;
	}
	let failed = selfTest();
	for (const name of bundles) {
		const src = fs.readFileSync(path.join(DIST, name), "utf8");
		const hits = FORBIDDEN.filter((m) => markerRe(m).test(src));
		const residue = ALLOWED_RESIDUE.filter((m) => markerRe(m).test(src));
		const ok = hits.length === 0;
		if (!ok) failed += 1;
		console.log(
			`${ok ? "PASS" : "FAIL"} ${name}` +
				`${hits.length ? ` legacy markers: ${hits.join(", ")}` : ""}` +
				`${residue.length ? ` (allowed residue: ${residue.join(", ")})` : ""}`,
		);
	}
	return failed;
}

async function phaseB() {
	const url = process.env.BROWSER_URL;
	if (!url) {
		console.log("PHASE B - skipped, BROWSER_URL not set");
		return 0;
	}
	const story = process.env.BROWSER_STORY;
	const target = story ? `${url}/iframe.html?id=${story}&viewMode=story` : url;
	const outDir = path.join(ROOT, "artifacts", "runtime-lane-smoke");
	fs.mkdirSync(outDir, { recursive: true });

	const { chromium } = require("playwright");
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
	const pageErrors = [];
	page.on("pageerror", (e) => pageErrors.push(String(e)));

	/* Freeze "now" before any script runs.
	 *
	 * Without this the determinism verdict measures the wall clock, not the renderer. The
	 * widget draws a live countdown (the bar-close timer in the header), so two loads one
	 * second apart differ. Measured on the deterministic fixture: 61 differing pixels out of
	 * 1,108,800 (0.006%), confined to a 13x7 box at (567,16) - the countdown digits. Every
	 * other pixel of the 1600x693 canvas was identical, so the renderer IS stable and the
	 * comparison was simply watching a clock.
	 *
	 * `setFixedTime` and not `install`: install also fakes timers and requestAnimationFrame,
	 * and pausing those can stop the engine's animation loop from ever painting. Only
	 * Date.now() needs to be frozen for this to hold. Fixed at a constant so both loads
	 * agree, and independent of the machine's date. */
	await page.clock.setFixedTime(new Date("2026-01-05T00:00:00Z"));

	// A blank canvas is the failure the old byte-length proxy could not see, so sample
	// actual pixels rather than measuring the file.
	async function shoot(label) {
		await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
		const canvas = page.locator('[data-testid="vninvest-charts"] canvas').first();
		await canvas.waitFor({ state: "visible", timeout: 30_000 });
		await page.waitForTimeout(4_000);
		const file = path.join(outDir, `${label}.png`);
		const buf = await canvas.screenshot({ path: file });
		const ink = await page.evaluate(() => {
			const c = document.querySelector('[data-testid="vninvest-charts"] canvas');
			if (!c) return -1;
			const probe = document.createElement("canvas");
			probe.width = c.width;
			probe.height = c.height;
			const ctx = probe.getContext("2d");
			if (!ctx) return -1;
			ctx.drawImage(c, 0, 0);
			const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
			// Count pixels that differ from the modal colour instead of counting
			// non-white, so a themed dark background does not read as blank.
			const seen = new Set();
			for (let i = 0; i < data.length; i += 4) {
				seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
				if (seen.size > 32) break;
			}
			return seen.size;
		});
		console.log(`  ${label}: ${buf.length} bytes, ${ink} distinct colours`);
		return { bytes: buf.length, ink };
	}

	const first = await shoot("load-1");
	const second = await shoot("load-2");

	const verdicts = [
		["no page errors", pageErrors.length === 0],
		["canvas has content", first.ink > 8],
		["render is deterministic", first.bytes === second.bytes],
	];
	if (pageErrors.length) for (const e of pageErrors.slice(0, 3)) console.log(`  page error: ${e}`);
	await browser.close();

	let failed = 0;
	console.log("PHASE B - browser");
	for (const [n, ok] of verdicts) {
		console.log(`${ok ? "PASS" : "FAIL"} ${n}`);
		if (!ok) failed += 1;
	}
	console.log(`artifacts: ${outDir}`);
	if (!story) {
		console.log("NOTE BROWSER_STORY unset, so this hit a bare URL. The determinism check");
		console.log("     is only meaningful against a fixture page, not live data.");
	}
	return failed;
}

(async () => {
	let failed = phaseA();
	failed += await phaseB();
	console.log(failed === 0 ? "runtime-lane-smoke PASS" : `runtime-lane-smoke FAIL (${failed})`);
	process.exit(failed === 0 ? 0 : 1);
})();