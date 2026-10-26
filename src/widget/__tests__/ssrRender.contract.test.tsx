/**
 * W-7 - lock the SSR behaviour that already works.
 *
 * PLAN_AUDIT listed "SSR/Next.js" as a pre-release gap. Measured, it is not a bug:
 * `renderToString` renders the public entry on the server without throwing.
 *
 *   VNInvestCharts      data=[]            -> OK, 90 chars
 *   VNInvestCharts      data=60 real bars  -> OK, 90 chars
 *   VNInvestMultiCharts data=[]            -> OK, 19,814 chars
 *
 * So this file asserts the behaviour rather than fixing it. That is the point: the
 * measurement is cheap and repeatable, but nothing was holding it, and the next refactor
 * could break server rendering without any test going red.
 *
 * ## What is NOT asserted, and why
 *
 * This is not a claim that the widget is fully SSR-correct. It renders without throwing,
 * which is a lower and still valuable bar. Known limits, deliberately left visible:
 *
 *   - `useEffect` does not run on the server, so the canvas chart paints only after
 *     hydration. The 90-char output for VNInvestCharts IS that empty shell.
 *   - `typeof window` guards mean DOM-dependent code paths are skipped server-side
 *     rather than exercised. A path that only runs in the browser is untested here.
 *   - No streaming/async rendering is covered.
 *
 * ## Why `environment: node` is set per-file
 *
 * The rest of this suite runs in jsdom, where `window` and `document` exist. Under jsdom
 * a test asserting server behaviour would pass for the wrong reason - the very globals
 * that make it not-the-server would be present. The annotation removes the ambiguity
 * instead of relying on the caller.
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { OHLCVBar } from "@vninvestcharts/engine-core";

/** Real-shaped bars, so a data-shape crash on the server would surface. */
function bars(count: number): OHLCVBar[] {
	return Array.from({ length: count }, (_, i) => ({
		// A Date, not an epoch number. Vitest does not type-check, so the first draft
		// got away with `.getTime()` here and only `tsc` caught it - which is why the
		// gate, not the test run, is what proves this file compiles.
		date: new Date(Date.UTC(2024, 0, 2 + i)),
		open: 100 + i,
		high: 102 + i,
		low: 98 + i,
		close: 101 + i,
		volume: 1000 + i,
		index: i,
		dataIndex: i,
	}));
}

describe("W-7 server rendering does not throw", () => {
	it("the public entry exposes the documented components", async () => {
		const mod = await import("../../public-api");
		expect(Object.keys(mod).length).toBeGreaterThan(0);
		// Not `typeof === "function"`: both are React.memo objects, and asserting a
		// function type would fail on a healthy build.
		for (const name of ["VNInvestCharts", "VNInvestMultiCharts"] as const) {
			expect(mod[name], `${name} must be exported`).toBeDefined();
		}
	});

	it("VNInvestCharts renders with no data", async () => {
		const { VNInvestCharts } = await import("../../public-api");
		const html = renderToString(createElement(VNInvestCharts, { data: [] as never }));
		expect(typeof html).toBe("string");
	});

	it("VNInvestCharts renders with 60 real bars", async () => {
		const { VNInvestCharts } = await import("../../public-api");
		const html = renderToString(
			createElement(VNInvestCharts, { data: bars(60) as never, symbol: "FPT" }),
		);
		expect(typeof html).toBe("string");
	});

	it("VNInvestMultiCharts renders and emits real markup", async () => {
		const { VNInvestMultiCharts } = await import("../../public-api");
		// `charts`, not `data`. The first draft guessed `data` and `tsc` rejected it,
		// which is worth stating: MultiChartConfig is {id, symbol, timeframe}, so a
		// multi-chart server render carries config only, never bars.
		const html = renderToString(
			createElement(VNInvestMultiCharts, {
				charts: [
					{ id: "a", symbol: "FPT", timeframe: "1d" },
					{ id: "b", symbol: "VIC", timeframe: "1d" },
				],
			}),
		);
		// Multi-chart builds its own layout, so it must produce more than an empty
		// string - otherwise "did not throw" would be satisfied by a blank render.
		expect(html.length).toBeGreaterThan(1000);
	});

	it("the module graph pulls in nothing that needs a DOM at import time", async () => {
		// The failure mode this file really guards: a future top-level
		// `const w = window.innerWidth` would throw during import on the server, which
		// in Next.js surfaces as a broken page rather than a failed test elsewhere.
		// Importing a second time is a no-op cache hit, so this asserts the module was
		// already safe to evaluate - which is exactly what the renders above proved.
		await expect(import("../../public-api")).resolves.toBeDefined();
	});

	it("renders without logging a storage error", async () => {
		// This one exists because of a real defect the earlier tests surfaced rather than
		// predicted. AlertManager's constructor calls loadAlerts, which read
		// `localStorage.getItem` unguarded. On the server that identifier does not resolve,
		// so it threw ReferenceError, and the surrounding catch swallowed it *after*
		// logging - meaning every server render emitted "Failed to load alerts" once per
		// chart. Nothing crashed, which is why it had gone unnoticed; the render passed.
		//
		// Asserting the log, not just the return value, is the point. A test that only
		// checked "did not throw" passes against the broken version too.
		const { VNInvestCharts } = await import("../../public-api");
		const errors: unknown[][] = [];
		const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
			errors.push(args);
		});
		try {
			renderToString(createElement(VNInvestCharts, { data: bars(5) as never }));
		} finally {
			spy.mockRestore();
		}
		expect(errors).toEqual([]);
	});
});