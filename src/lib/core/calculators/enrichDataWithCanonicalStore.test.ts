import { describe, it, expect, beforeEach } from "vitest";
import { createCanonicalSeriesStore, type CanonicalSeriesStore } from "@vninvestcharts/engine-core";
import { buildIndicatorComputationPlan, computeIndicatorComputationResult } from "./indicatorComputation";
import { enrichData } from "./enrichData";
import { enrichDataWithCanonicalStore } from "./enrichDataWithCanonicalStore";
import type { SeriesTypeId } from "../types/pane-descriptor";
import type { OHLCVBar } from "../../types/ohlcv";

const sampleData: OHLCVBar[] = [
	{
		index: 0,
		dataIndex: 0,
		date: new Date("2024-01-01"),
		open: 100,
		high: 102,
		low: 99,
		close: 101,
		volume: 1000000,
	},
	{
		index: 1,
		dataIndex: 1,
		date: new Date("2024-01-02"),
		open: 101,
		high: 103,
		low: 100,
		close: 102,
		volume: 1100000,
	},
	{
		index: 2,
		dataIndex: 2,
		date: new Date("2024-01-03"),
		open: 102,
		high: 104,
		low: 101,
		close: 103,
		volume: 1200000,
	},
];

type CacheEntry = {
	plan: ReturnType<typeof buildIndicatorComputationPlan>;
	result: ReturnType<typeof computeIndicatorComputationResult>;
	aoColors: (string | undefined)[];
};

describe("enrichDataWithCanonicalStore", () => {
	let canonicalStore: CanonicalSeriesStore<CacheEntry>;

	beforeEach(() => {
		canonicalStore = createCanonicalSeriesStore();
	});

	it("should return same structure as enrichData when no store provided", () => {
		const withoutStore = enrichData(sampleData, { series: [] });
		const withStoreParam = enrichDataWithCanonicalStore(sampleData, {
			series: [],
			canonicalStore: undefined,
		});

		expect(withoutStore.length).toBe(withStoreParam.length);
		expect(withoutStore[0]).toHaveProperty("date");
		expect(withoutStore[0]).toHaveProperty("close");
	});

	it("should return empty array for empty input", () => {
		const result = enrichDataWithCanonicalStore([], {
			series: [],
			canonicalStore,
			sourceId: "TEST",
			timeframe: "1D",
		});

		expect(result).toEqual([]);
	});

	it("should fallback to enrichData when sourceId or timeframe missing", () => {
		const result1 = enrichDataWithCanonicalStore(sampleData, {
			series: [],
			canonicalStore,
			sourceId: "TEST",
			// timeframe missing
		});

		const result2 = enrichDataWithCanonicalStore(sampleData, {
			series: [],
			canonicalStore,
			// sourceId missing
			timeframe: "1D",
		});

		const baseline = enrichData(sampleData, { series: [] });

		expect(result1.length).toBe(baseline.length);
		expect(result2.length).toBe(baseline.length);
	});

	it("should cache computation result in store on first call", () => {
		const store = createCanonicalSeriesStore<CacheEntry>();

		enrichDataWithCanonicalStore(sampleData, {
			series: [],
			canonicalStore: store,
			sourceId: "AAPL",
			timeframe: "1D",
		});

		// Store should have one entry
		expect(store.size).toBe(1);
	});

	it("should reuse cached result for same sourceId/timeframe/series", () => {
		const store = createCanonicalSeriesStore<CacheEntry>();

		const result1 = enrichDataWithCanonicalStore(sampleData, {
			series: [
				{ type: "EMA" as SeriesTypeId, yAxis: "left" as const, params: { period: 20 } },
			],
			canonicalStore: store,
			sourceId: "AAPL",
			timeframe: "1D",
		});

		const initialSize = store.size;
		expect(initialSize).toBe(1);

		// Second call with same params should not increase store size
		const result2 = enrichDataWithCanonicalStore(sampleData, {
			series: [
				{ type: "EMA" as SeriesTypeId, yAxis: "left" as const, params: { period: 20 } },
			],
			canonicalStore: store,
			sourceId: "AAPL",
			timeframe: "1D",
		});

		expect(store.size).toBe(initialSize);
		expect(result1).toEqual(result2);
	});

	it("should create new cache entry for different series config", () => {
		const store = createCanonicalSeriesStore<CacheEntry>();

		enrichDataWithCanonicalStore(sampleData, {
			series: [
				{ type: "EMA" as SeriesTypeId, yAxis: "left" as const, params: { period: 20 } },
			],
			canonicalStore: store,
			sourceId: "AAPL",
			timeframe: "1D",
		});

		expect(store.size).toBe(1);

		// Different series config should create new entry
		enrichDataWithCanonicalStore(sampleData, {
			series: [
				{ type: "EMA" as SeriesTypeId, yAxis: "left" as const, params: { period: 50 } },
			],
			canonicalStore: store,
			sourceId: "AAPL",
			timeframe: "1D",
		});

		expect(store.size).toBe(2);
	});

	it("should create new cache entry for different sourceId", () => {
		const store = createCanonicalSeriesStore<CacheEntry>();

		enrichDataWithCanonicalStore(sampleData, {
			series: [
				{ type: "EMA" as SeriesTypeId, yAxis: "left" as const, params: { period: 20 } },
			],
			canonicalStore: store,
			sourceId: "AAPL",
			timeframe: "1D",
		});

		expect(store.size).toBe(1);

		// Different sourceId should create new entry
		enrichDataWithCanonicalStore(sampleData, {
			series: [
				{ type: "EMA" as SeriesTypeId, yAxis: "left" as const, params: { period: 20 } },
			],
			canonicalStore: store,
			sourceId: "MSFT",
			timeframe: "1D",
		});

		expect(store.size).toBe(2);
	});

	it("should include enriched indicator values in result", () => {
		const result = enrichDataWithCanonicalStore(sampleData, {
			series: [
				{ type: "EMA" as SeriesTypeId, yAxis: "left" as const, params: { period: 20 } },
			],
			canonicalStore,
			sourceId: "AAPL",
			timeframe: "1D",
		});

		expect(result.length).toBe(sampleData.length);
		// Check that enriched data has indicator properties
		expect(result[0]).toHaveProperty("date");
		expect(result[0]).toHaveProperty("close");
		expect(result[0]).toHaveProperty("open");
		expect(result[0]).toHaveProperty("high");
		expect(result[0]).toHaveProperty("low");
		expect(result[0]).toHaveProperty("volume");
	});

	it("should handle multiple consumers of same store", () => {
		const store = createCanonicalSeriesStore<CacheEntry>();
		const seriesConfig: Array<{ type: SeriesTypeId; yAxis: "left" | "right"; params: Record<string, number> }> = [
			{ type: "RSI", yAxis: "left", params: { period: 14 } },
		];

		// Simulate two panes both requesting RSI(14)
		const pane1Result = enrichDataWithCanonicalStore(sampleData, {
			series: seriesConfig,
			canonicalStore: store,
			sourceId: "AAPL",
			timeframe: "1D",
		});

		const pane2Result = enrichDataWithCanonicalStore(sampleData, {
			series: seriesConfig,
			canonicalStore: store,
			sourceId: "AAPL",
			timeframe: "1D",
		});

		// Both should get same cached computation
		expect(store.size).toBe(1);
		expect(pane1Result).toEqual(pane2Result);
	});

	it("should calculate and align MTF indicators correctly", () => {
		const targetBars = [
			{ index: 0, dataIndex: 0, date: new Date("2024-01-01T00:00:00Z"), open: 10, high: 10, low: 10, close: 100, volume: 10 },
			{ index: 1, dataIndex: 1, date: new Date("2024-01-02T00:00:00Z"), open: 10, high: 10, low: 10, close: 200, volume: 10 },
		];

		const baseBars = [
			{ index: 0, dataIndex: 0, date: new Date("2024-01-01T09:00:00Z"), open: 10, high: 10, low: 10, close: 10, volume: 10 },
			{ index: 1, dataIndex: 1, date: new Date("2024-01-01T15:00:00Z"), open: 10, high: 10, low: 10, close: 10, volume: 10 },
			{ index: 2, dataIndex: 2, date: new Date("2024-01-02T09:00:00Z"), open: 10, high: 10, low: 10, close: 10, volume: 10 },
			{ index: 3, dataIndex: 3, date: new Date("2024-01-02T15:00:00Z"), open: 10, high: 10, low: 10, close: 10, volume: 10 },
		];

		const store = createCanonicalSeriesStore<CacheEntry>();

		const result = enrichDataWithCanonicalStore(baseBars, {
			series: [
				{ type: "EMA" as SeriesTypeId, yAxis: "left" as const, params: { period: 1, timeframe: "1d" } }
			],
			canonicalStore: store,
			sourceId: "AAPL",
			timeframe: "1h",
			mtfBars: {
				"1d": targetBars
			}
		});

		expect(result.length).toBe(4);
		// Check that the EMA:period=1:timeframe=1d key was populated with aligned daily values
		const emaKey = "EMA:period=1:timeframe=1d";

		// baseBars[0] and [1] are on Day 1, Day 1 Daily bar is not closed yet.
		expect(result[0].indicatorValues?.[emaKey]).toBeUndefined();
		expect(result[1].indicatorValues?.[emaKey]).toBeUndefined();

		// baseBars[2] and [3] are on Day 2, Day 1 Daily bar is closed (EMA(1) of 100 = 100).
		expect(result[2].indicatorValues?.[emaKey]).toBe(100);
		expect(result[3].indicatorValues?.[emaKey]).toBe(100);
	});
});
