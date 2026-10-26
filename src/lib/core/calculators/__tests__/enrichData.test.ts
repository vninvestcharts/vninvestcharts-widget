import { describe, expect, it } from "vitest";
import { calcCVDApprox } from "../calcCVDApprox";
import { enrichData } from "../enrichData";
import { mockOHLCV300 } from "../fixtures/mockData";
import { resolveSeriesStructuredValue, resolveSeriesValue } from "../../seriesValueResolver";
import type { RawOHLCV } from "../types";

describe("enrichData", () => {
	it("returns same number of items", () => {
		const enriched = enrichData(mockOHLCV300);
		expect(enriched).toHaveLength(mockOHLCV300.length);
	});

	it("ema20 is undefined for the first 19 bars", () => {
		const enriched = enrichData(mockOHLCV300);
		const ema20Config = { type: "EMA" as const, yAxis: "right" as const, params: { period: 20 } };
		for (let index = 0; index < 19; index += 1) {
			expect(resolveSeriesValue(enriched[index]!, ema20Config)).toBeUndefined();
		}
		expect(resolveSeriesValue(enriched[19]!, ema20Config)).toBeDefined();
	});

	it("cvdApprox is cumulative and matches running delta sum", () => {
		const enriched = enrichData(mockOHLCV300);
		const cvdApproxConfig = { type: "CVDApprox" as const, yAxis: "right" as const };
		let cumulative = 0;
		mockOHLCV300.forEach((bar, index) => {
			const range = bar.high - bar.low;
			const buyVol = range > 0 ? bar.volume * ((bar.close - bar.low) / range) : bar.volume / 2;
			const sellVol = bar.volume - buyVol;
			const delta = buyVol - sellVol;
			cumulative += delta;

			const enrichedBar = enriched[index]!;
			const val = resolveSeriesValue(enrichedBar, cvdApproxConfig);
			if (val !== undefined) {
				expect(Math.abs(val - cumulative)).toBeLessThan(0.01);
			}
		});
	});

	it("bullPower equals high - ema13 when ema13 is available", () => {
		const enriched = enrichData(mockOHLCV300);
		const ema13Config = { type: "EMA" as const, yAxis: "right" as const, params: { period: 13 } };
		const strengthConfig = { type: "StrengthElder" as const, yAxis: "right" as const };
		for (let index = 12; index < 30; index += 1) {
			const bar = enriched[index]!;
			const ema13 = resolveSeriesValue(bar, ema13Config);
			const strength = resolveSeriesStructuredValue(bar, strengthConfig) as { bullPower: number; bearPower: number } | undefined;
			if (ema13 !== undefined && strength !== undefined) {
				expect(strength.bullPower).toBeCloseTo(bar.high - ema13, 6);
				expect(strength.bearPower).toBeCloseTo(bar.low - ema13, 6);
			}
		}
	});

	it("whale buy/sell volumes are never negative", () => {
		const series = [{ type: "Whale" as const, yAxis: "right" as const, params: { threshold: 50_000 } }];
		const enriched = enrichData(mockOHLCV300, { series });
		enriched.forEach((bar) => {
			const whale = resolveSeriesStructuredValue(bar, series[0]) as { whaleBuyVol?: number; whaleSellVol?: number } | undefined;
			if (whale) {
				if (whale.whaleBuyVol !== undefined) {
					expect(whale.whaleBuyVol).toBeGreaterThanOrEqual(0);
				}
				if (whale.whaleSellVol !== undefined) {
					expect(whale.whaleSellVol).toBeGreaterThanOrEqual(0);
				}
			}
		});
	});

	it("handles doji edge case with High === Low", () => {
		const singleBar: RawOHLCV[] = [{
			date: new Date(),
			open: 100,
			high: 100,
			low: 100,
			close: 100,
			volume: 1_000,
		}];
		const result = calcCVDApprox(singleBar);
		expect(result[0]?.cvdDelta).toBeCloseTo(0, 6);
		expect(result[0]?.cvdApprox).toBeCloseTo(0, 6);
	});

	it("performance: 1000 bars under 50ms", () => {
		const bigData = Array.from({ length: 1000 }, (_, index): RawOHLCV => ({
			date: new Date(Date.UTC(2024, 0, index + 1)),
			open: 100,
			high: 105,
			low: 98,
			close: 103,
			volume: 10_000,
		}));
		// Best of N after a warmup, not a single cold call. The old version timed one
		// cold run against a 50ms budget, so it failed roughly one run in four under the
		// full suite, where the machine is shared across parallel workers, and passed
		// every time when run alone. That is a measurement of the scheduler, not of
		// enrichData. Noise can only add time, so the minimum is the robust estimator,
		// and it still fails loudly if enrichData regresses into something superlinear.
		enrichData(bigData);
		const samples: number[] = [];
		for (let i = 0; i < 7; i += 1) {
			const startedAt = performance.now();
			enrichData(bigData);
			samples.push(performance.now() - startedAt);
		}
		const best = Math.min(...samples);
		console.log(
			`[enrichData perf] best=${best.toFixed(2)}ms median=${[...samples].sort((a, b) => a - b)[3].toFixed(2)}ms worst=${Math.max(...samples).toFixed(2)}ms`,
		);
		expect(best).toBeLessThan(50);
	});

	it("materializes canonical indicator values for requested runtime params", () => {
		const series = [
			{ type: "EMA", yAxis: "right", params: { period: 21 } },
			{ type: "RSI", yAxis: "left", params: { period: 21 } },
			{ type: "BollingerBand", yAxis: "right", params: { period: 10, stdDev: 3 } },
			{ type: "MACD", yAxis: "right", params: { fast: 8, slow: 21, signal: 5 } },
			{ type: "Whale", yAxis: "right", params: { threshold: 75_000 } },
		] as const;
		const enriched = enrichData(mockOHLCV300, { series });
		const bar = enriched[80];

		expect(resolveSeriesValue(bar!, series[0])).toBeTypeOf("number");
		expect(resolveSeriesValue(bar!, series[1])).toBeTypeOf("number");
		expect(resolveSeriesStructuredValue(bar!, series[2])).toEqual(
			expect.objectContaining({ top: expect.any(Number), middle: expect.any(Number), bottom: expect.any(Number) }),
		);
		expect(resolveSeriesStructuredValue(bar!, series[3])).toEqual(
			expect.objectContaining({ macd: expect.any(Number), signal: expect.any(Number), divergence: expect.any(Number) }),
		);
		expect(bar?.indicatorValues?.["EMA:period=21"]).toBeDefined();
		expect(bar?.indicatorValues?.["RSI:period=21"]).toBeDefined();
	});

	it("materializes the default canonical demo indicator keys", () => {
		const enriched = enrichData(mockOHLCV300);
		const bar = enriched[80];

		expect(bar?.indicatorValues?.["EMA:period=20"]).toBeDefined();
		expect(bar?.indicatorValues?.["EMA:period=50"]).toBeDefined();
		expect(bar?.indicatorValues?.["RSI:period=14"]).toBeDefined();
		expect(bar?.indicatorValues?.["MACD:fast=12:slow=26:signal=9"]).toBeDefined();
		expect(bar?.indicatorValues?.["BollingerBand:period=20:stdDev=2"]).toBeDefined();
	});

	it("KF10-T03-01: materializes both EMA:period=13 and EMA:period=20 when both series are requested", () => {
		const series = [
			{ type: "EMA", yAxis: "right", params: { period: 13 } },
			{ type: "EMA", yAxis: "right", params: { period: 20 } },
		] as const;
		const enriched = enrichData(mockOHLCV300, { series });
		const bar = enriched[80];

		expect(bar?.indicatorValues?.["EMA:period=13"]).toBeDefined();
		expect(bar?.indicatorValues?.["EMA:period=20"]).toBeDefined();
	});

	it("KF10-T03-02: EMA period-specific values remain independent", () => {
		const ema13Only = enrichData(mockOHLCV300, {
			series: [{ type: "EMA", yAxis: "right", params: { period: 13 } }],
		});
		const ema20Only = enrichData(mockOHLCV300, {
			series: [{ type: "EMA", yAxis: "right", params: { period: 20 } }],
		});

		const bar13 = ema13Only[80];
		const bar20 = ema20Only[80];

		expect(bar13?.indicatorValues?.["EMA:period=13"]).toBeDefined();
		expect(bar13?.indicatorValues?.["EMA:period=20"]).toBeDefined();
		expect(bar20?.indicatorValues?.["EMA:period=20"]).toBeDefined();
		expect(bar20?.indicatorValues?.["EMA:period=13"]).toBeDefined();

		// Default EMA periods are always computed, but period-specific values must stay distinct.
		expect(bar13?.indicatorValues?.["EMA:period=13"]).not.toBe(bar13?.indicatorValues?.["EMA:period=20"]);
		expect(bar20?.indicatorValues?.["EMA:period=13"]).not.toBe(bar20?.indicatorValues?.["EMA:period=20"]);
	});
});
