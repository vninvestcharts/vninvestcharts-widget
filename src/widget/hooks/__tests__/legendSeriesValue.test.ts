// UI-P3 unit lock: legend live-value resolution (pure, no DOM).
import { describe, expect, it } from "vitest";
import { buildLegendSeriesValue } from "../useWidgetOverlays";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";

function makeDatum(overrides: Record<string, unknown> = {}): EnrichedDatum {
	return {
		date: new Date("2026-09-01T00:00:00Z"),
		open: 100,
		high: 102,
		low: 99,
		close: 101,
		volume: 204222,
		...overrides,
	} as unknown as EnrichedDatum;
}

describe("buildLegendSeriesValue (UI-P3)", () => {
	it("V-02: formats volume full-precision with bullish color on up candles", () => {
		const val = buildLegendSeriesValue(makeDatum(), { type: "Volume", yAxis: "right" });
		expect(val?.text).toBe("204,222.00");
		expect(val?.color).toBe("var(--vnsc-up, #0ecb81)");
	});

	it("uses bearish color on down candles", () => {
		const val = buildLegendSeriesValue(makeDatum({ open: 102, close: 100 }), {
			type: "Volume",
			yAxis: "right",
		});
		expect(val?.color).toBe("var(--vnsc-down, #f23645)");
	});

	it("resolves indicator numbers (RSI) in international format", () => {
		const datum = makeDatum({ indicatorValues: { "RSI:period=14": 54.213 } });
		const val = buildLegendSeriesValue(datum, { type: "RSI", yAxis: "left", params: { period: 14 } });
		expect(val?.text).toBe("54.21");
		expect(val?.color).toBeUndefined();
	});

	it("returns undefined when the value is missing or non-finite", () => {
		expect(buildLegendSeriesValue(makeDatum(), { type: "RSI", yAxis: "left", params: { period: 14 } })).toBeUndefined();
		expect(buildLegendSeriesValue(makeDatum(), undefined)).toBeUndefined();
	});
});
