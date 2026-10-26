import { describe, expect, it } from "vitest";
import type { EnrichedDatum } from "../calculators/types";
import { buildIndicatorSeriesKey, resolveSeriesStructuredValue, resolveSeriesValue, resolveSeriesValueAccessors } from "../seriesValueResolver";
import type { SeriesConfig } from "../types/pane-descriptor";

function makeDatum(): EnrichedDatum {
	return {
		date: new Date("2024-01-01T00:00:00.000Z"),
		open: 100,
		high: 110,
		low: 90,
		close: 105,
		volume: 1_000,
		indicatorValues: {
			"EMA:period=21": 201,
			"EMA:period=34": 340,
			"EMA:period=50": 98,
			"EMA:period=20": 102,
			"MA:period=21": 151,
			"RSI:period=21": 61,
			"RSI:period=14": 57,
			"MACD:fast=8:slow=21:signal=5": { macd: 2.2, signal: 1.7, divergence: 0.5 },
			"MACD:fast=12:slow=26:signal=9": { macd: 1.1, signal: 0.8, divergence: 0.3 },
			"BollingerBand:period=10:stdDev=3": { top: 120, middle: 103, bottom: 86 },
			"BollingerBand:period=20:stdDev=2": { top: 112, middle: 104, bottom: 96 },
			"Whale:threshold=75000": { whaleBuyVol: 4, whaleSellVol: 9 },
			"Whale:threshold=50000": { whaleBuyVol: 12, whaleSellVol: 7 },
		},
	};
}

describe("seriesValueResolver", () => {
	it("buildIndicatorSeriesKey encodes runtime params exactly", () => {
		expect(buildIndicatorSeriesKey({ type: "EMA", yAxis: "right", params: { period: 21 } })).toBe("EMA:period=21");
		expect(buildIndicatorSeriesKey({ type: "MACD", yAxis: "right", params: { fast: 8, slow: 21, signal: 5 } })).toBe("MACD:fast=8:slow=21:signal=5");
	});

	it("resolveSeriesValue reads exact canonical EMA key instead of threshold fallbacks", () => {
		const datum = makeDatum();
		const ema21: SeriesConfig = { type: "EMA", yAxis: "right", params: { period: 21 } };
		const ema34: SeriesConfig = { type: "EMA", yAxis: "right", params: { period: 34 } };
		const ema50: SeriesConfig = { type: "EMA", yAxis: "right", params: { period: 50 } };

		expect(resolveSeriesValue(datum, ema21)).toBe(201);
		expect(resolveSeriesValue(datum, ema34)).toBe(340);
		expect(resolveSeriesValue(datum, ema50)).toBe(98);
	});

	it("resolveSeriesValue for MA uses canonical indicatorValues instead of close fallback", () => {
		const datum = makeDatum();
		const ma21: SeriesConfig = { type: "MA", yAxis: "right", params: { period: 21 } };

		expect(resolveSeriesValue(datum, ma21)).toBe(151);
	});

	it("resolveSeriesValueAccessors shares the same canonical Bollinger object across yExtents", () => {
		const datum = makeDatum();
		const series: SeriesConfig = { type: "BollingerBand", yAxis: "right", params: { period: 10, stdDev: 3 } };
		const accessors = resolveSeriesValueAccessors(series);

		expect(accessors).toHaveLength(3);
		expect(accessors[0]?.(datum)).toBe(120);
		expect(accessors[1]?.(datum)).toBe(103);
		expect(accessors[2]?.(datum)).toBe(86);
	});

	it("resolveSeriesStructuredValue returns the exact MACD tuple for the configured params", () => {
		const datum = makeDatum();
		const series: SeriesConfig = { type: "MACD", yAxis: "right", params: { fast: 8, slow: 21, signal: 5 } };
		const value = resolveSeriesStructuredValue(datum, series);

		expect(value).toEqual({ macd: 2.2, signal: 1.7, divergence: 0.5 });
	});

	it("resolveSeriesValue returns undefined when key is missing in indicatorValues", () => {
		const datum = makeDatum();
		const missingEma: SeriesConfig = { type: "EMA", yAxis: "right", params: { period: 99 } };
		expect(resolveSeriesValue(datum, missingEma)).toBeUndefined();
	});

	it("resolveSeriesStructuredValue returns undefined when complex key is missing in indicatorValues", () => {
		const datum = makeDatum();
		const missingBb: SeriesConfig = { type: "BollingerBand", yAxis: "right", params: { period: 99, stdDev: 2 } };
		const missingMacd: SeriesConfig = { type: "MACD", yAxis: "right", params: { fast: 99, slow: 100, signal: 9 } };

		expect(resolveSeriesStructuredValue(datum, missingBb)).toBeUndefined();
		expect(resolveSeriesStructuredValue(datum, missingMacd)).toBeUndefined();
	});

	// H0.11 — two misses, not one:
	//   1. buildIndicatorBaseKey had no ChaikinOscillator case, so it returned
	//      undefined and buildIndicatorComputationPlan dropped the config
	//      (`if (key)`), i.e. the indicator was NEVER computed.
	//   2. resolveSeriesValue had no case either, so the drawn line was
	//      `default: return datum.close` wearing a "Chaikin Oscillator" label.
	describe("ChaikinOscillator (H0.11)", () => {
		const series: SeriesConfig = { type: "ChaikinOscillator", yAxis: "right", params: { fast: 3, slow: 10 } };

		it("buildIndicatorSeriesKey encodes fast/slow so the computation plan keeps the config", () => {
			expect(buildIndicatorSeriesKey(series)).toBe("ChaikinOscillator:fast=3:slow=10");
			expect(buildIndicatorSeriesKey({ type: "ChaikinOscillator", yAxis: "right" })).toBe("ChaikinOscillator:fast=3:slow=10");
		});

		it("resolveSeriesValue reads the oscillator value, not the close price", () => {
			const datum: EnrichedDatum = {
				...makeDatum(),
				indicatorValues: { "ChaikinOscillator:fast=3:slow=10": 0.42 },
			};

			expect(resolveSeriesValue(datum, series)).toBe(0.42);
			expect(resolveSeriesValue(datum, series)).not.toBe(datum.close);
		});

		it("resolveSeriesValue returns undefined (draws nothing) when the value is missing, instead of close", () => {
			const datum = makeDatum();
			expect(resolveSeriesValue(datum, series)).toBeUndefined();
		});
	});

	// H0.11 (found by the coverage guard): HTFOverlay's registry tooltip reads
	// `d.htf?.close`, but resolveSeriesValue had no case, so the generic
	// accessor path returned the CURRENT-timeframe close instead.
	it("resolveSeriesValue for HTFOverlay reads the higher-timeframe close, not the chart close", () => {
		const datum: EnrichedDatum = {
			...makeDatum(),
			htf: { open: 90, high: 95, low: 85, close: 92, periodStart: 1_704_067_200_000, isClosed: false },
		};
		const series: SeriesConfig = { type: "HTFOverlay", yAxis: "right" };

		expect(resolveSeriesValue(datum, series)).toBe(92);
		expect(resolveSeriesValue(datum, series)).not.toBe(datum.close);
	});

	describe("overlay symbol resolution", () => {
		it("resolveSeriesValue reads symbolData.close when overlaySymbolId set and normalizeToBaseline is default (false)", () => {
			const datum: EnrichedDatum = {
				...makeDatum(),
				normalizedPrices: { VIC: 5.23, FPT: -2.1 },
				symbolData: { VIC: { open: 50, high: 55, low: 48, close: 52, volume: 5000 } },
			};
			const series: SeriesConfig = { type: "Line", yAxis: "right", overlaySymbolId: "VIC" };
			expect(resolveSeriesValue(datum, series)).toBe(52);
		});

		it("resolveSeriesValue reads symbolData.close when normalizeToBaseline is false", () => {
			const datum: EnrichedDatum = {
				...makeDatum(),
				normalizedPrices: { VIC: 5.23 },
				symbolData: { VIC: { open: 50, high: 55, low: 48, close: 52, volume: 5000 } },
			};
			const series: SeriesConfig = { type: "Line", yAxis: "right", overlaySymbolId: "VIC", normalizeToBaseline: false };
			expect(resolveSeriesValue(datum, series)).toBe(52);
		});

		it("resolveSeriesValue falls through to normal path when overlaySymbolId is not set", () => {
			const datum = makeDatum();
			const series: SeriesConfig = { type: "Line", yAxis: "right" };
			expect(resolveSeriesValue(datum, series)).toBe(datum.close);
		});

		it("resolveSeriesValue falls through to normal path when overlaySymbolId has no data in datum", () => {
			const datum = makeDatum();
			const series: SeriesConfig = { type: "Line", yAxis: "right", overlaySymbolId: "MISSING" };
			expect(resolveSeriesValue(datum, series)).toBe(datum.close);
		});

		it("resolveSeriesValueAccessors returns overlay low/high when overlaySymbolId is set", () => {
			const datum: EnrichedDatum = {
				...makeDatum(),
				symbolData: { VIC: { open: 50, high: 55, low: 48, close: 52, volume: 5000 } },
			};
			const series: SeriesConfig = { type: "Candlestick", yAxis: "right", overlaySymbolId: "VIC" };
			const accessors = resolveSeriesValueAccessors(series);
			expect(accessors).toHaveLength(2);
			expect(accessors[0]?.(datum)).toBe(48);
			expect(accessors[1]?.(datum)).toBe(55);
		});

		it("resolveSeriesValueAccessors for non-OHLC type delegates to resolveSeriesValue and respects normalizeToBaseline false", () => {
			const datum: EnrichedDatum = {
				...makeDatum(),
				normalizedPrices: { VIC: 5.23 },
				symbolData: { VIC: { open: 50, high: 55, low: 48, close: 52, volume: 5000 } },
			};
			const series: SeriesConfig = { type: "Line", yAxis: "right", overlaySymbolId: "VIC", normalizeToBaseline: false };
			const accessors = resolveSeriesValueAccessors(series);
			expect(accessors[0]?.(datum)).toBe(52);
		});
	});
});