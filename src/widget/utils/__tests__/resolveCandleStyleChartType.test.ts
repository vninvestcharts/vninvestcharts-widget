// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolveCandleStyleApplication, resolveCandleStyleChartType } from "../resolveCandleStyleChartType";

/**
 * Batch B / B3 — the symbol tab writes `symbol.candleStyle` into the settings
 * composite, but nothing in the runtime read it, so the "Display Style"
 * control was dead.
 *
 * The mapping target is the chart-type key of the chart-type picker
 * (`CHART_TYPE_MAP` in VNInvestCharts turns it into the engine series type).
 */
describe("resolveCandleStyleChartType (B3)", () => {
	it("maps every display style of the symbol tab", () => {
		expect(resolveCandleStyleChartType("candle")).toBe("candlestick");
		expect(resolveCandleStyleChartType("hollow")).toBe("hollow");
		expect(resolveCandleStyleChartType("bar")).toBe("ohlc");
		expect(resolveCandleStyleChartType("line")).toBe("line");
		expect(resolveCandleStyleChartType("area")).toBe("area");
	});

	it("maps the bar style to the ohlc chart type", () => {
		// The engine series "Bar" was removed from the picker: its name
		// collides with the `type.includes("bar")` heuristic of the engine
		// (ledger WA_BAR_RUNTIME_2026-10-03).
		expect(resolveCandleStyleChartType("bar")).not.toBe("bar");
		expect(resolveCandleStyleChartType("bar")).toBe("ohlc");
	});

	it("falls back to the candlestick chart type for an unknown style", () => {
		expect(resolveCandleStyleChartType("unknown" as never)).toBe("candlestick");
	});
});

describe("resolveCandleStyleApplication (B3)", () => {
	it("does not apply the style on the first run", () => {
		// The first run only records the current style: the chart type at that
		// moment belongs to the host or to the pane state, and applying it would
		// replace the series of the price pane (a Pine series would be lost).
		const decision = resolveCandleStyleApplication({ appliedStyle: undefined, style: "line" });
		expect(decision.apply).toBe(false);
		expect(decision.chartType).toBe("");
	});

	it("does not apply the same style twice", () => {
		const decision = resolveCandleStyleApplication({ appliedStyle: "line", style: "line" });
		expect(decision.apply).toBe(false);
	});

	it("applies the style as soon as it changes", () => {
		const decision = resolveCandleStyleApplication({ appliedStyle: "candle", style: "hollow" });
		expect(decision).toEqual({ apply: true, chartType: "hollow" });
	});

	it("applies every change, also after the first one", () => {
		const decision = resolveCandleStyleApplication({ appliedStyle: "candle", style: "area" });
		expect(decision).toEqual({ apply: true, chartType: "area" });
	});
});
