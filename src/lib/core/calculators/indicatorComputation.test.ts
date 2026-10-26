import { describe, it, expect } from "vitest";
import { resolveCalculationOrder, computeIndicatorComputationResult, buildIndicatorComputationPlan } from "./indicatorComputation";
import type { SeriesConfig, SeriesTypeId } from "../types/pane-descriptor";
import type { RawOHLCV } from "./types";

describe("indicatorComputation - Indicators on Indicators", () => {
	it("should resolve calculation order topologically", () => {
		const s1: SeriesConfig = { id: "rsi-1", type: "RSI", yAxis: "right", params: { period: 14 } };
		const s2: SeriesConfig = { id: "ema-1", type: "EMA", yAxis: "right", params: { period: 20 }, sourceType: "indicator", sourceId: "rsi-1", sourceKey: "line" };
		const s3: SeriesConfig = { id: "sma-1", type: "MA", yAxis: "right", params: { period: 50 } };

		// Put s2 first in input list, it should be sorted to be after s1
		const sorted = resolveCalculationOrder([s2, s1, s3]);

		const s1Idx = sorted.findIndex(s => s.id === "rsi-1");
		const s2Idx = sorted.findIndex(s => s.id === "ema-1");

		expect(s1Idx).toBeLessThan(s2Idx);
	});

	it("should calculate child indicators (EMA of RSI)", () => {
		const raw: RawOHLCV[] = Array.from({ length: 40 }, (_, i) => ({
			date: new Date(2024, 0, i + 1),
			open: 100 + i,
			high: 102 + i,
			low: 99 + i,
			close: 101 + i,
			volume: 1000,
		}));

		const rsiSeries: SeriesConfig = {
			id: "rsi-1",
			type: "RSI",
			yAxis: "right",
			params: { period: 14 }
		};

		const emaOfRsi: SeriesConfig = {
			id: "ema-of-rsi",
			type: "EMA",
			yAxis: "right",
			params: { period: 5 },
			sourceType: "indicator",
			sourceId: "rsi-1",
			sourceKey: "line"
		};

		const plan = buildIndicatorComputationPlan([rsiSeries, emaOfRsi], 1000000);
		const result = computeIndicatorComputationResult(raw, plan);

		expect(result.valuesByKey.has("RSI:period=14")).toBe(true);
		expect(result.valuesByKey.has("EMA:period=5:sourceType=indicator:sourceId=rsi-1:sourceKey=line")).toBe(true);

		const rsiVals = result.valuesByKey.get("RSI:period=14")!;
		const emaVals = result.valuesByKey.get("EMA:period=5:sourceType=indicator:sourceId=rsi-1:sourceKey=line")!;

		// The first few items of EMA of RSI should be undefined due to warmup
		expect(emaVals[0]).toBeUndefined();
		// Later values should be calculated
		const validEmaIdx = emaVals.findIndex(v => typeof v === "number" && !isNaN(v));
		expect(validEmaIdx).toBeGreaterThan(0);
	});
});
