import { describe, it, expect } from "vitest";
import { alignMTFData, resolveTimeframeMs } from "../MTFWrapper";
import type { OHLCVBar } from "../../../types/ohlcv";

describe("MTFWrapper - alignMTFData", () => {
	it("should parse timeframe sizes correctly", () => {
		expect(resolveTimeframeMs("1m")).toBe(60 * 1000);
		expect(resolveTimeframeMs("15m")).toBe(15 * 60 * 1000);
		expect(resolveTimeframeMs("1h")).toBe(60 * 60 * 1000);
		expect(resolveTimeframeMs("1d")).toBe(24 * 60 * 60 * 1000);
		expect(resolveTimeframeMs("1w")).toBe(7 * 24 * 60 * 60 * 1000);
	});

	it("should align hourly base bars to daily target values without look-ahead bias", () => {
		const targetBars: OHLCVBar[] = [
			{ index: 0, dataIndex: 0, date: new Date("2024-01-01T00:00:00Z"), open: 10, high: 10, low: 10, close: 100, volume: 10 },
			{ index: 1, dataIndex: 1, date: new Date("2024-01-02T00:00:00Z"), open: 10, high: 10, low: 10, close: 200, volume: 10 },
		];
		const targetValues = [100, 200];

		const baseBars: OHLCVBar[] = [
			{ index: 0, dataIndex: 0, date: new Date("2024-01-01T09:00:00Z"), open: 10, high: 10, low: 10, close: 10, volume: 10 },
			{ index: 1, dataIndex: 1, date: new Date("2024-01-01T15:00:00Z"), open: 10, high: 10, low: 10, close: 10, volume: 10 },
			{ index: 2, dataIndex: 2, date: new Date("2024-01-02T09:00:00Z"), open: 10, high: 10, low: 10, close: 10, volume: 10 },
			{ index: 3, dataIndex: 3, date: new Date("2024-01-02T15:00:00Z"), open: 10, high: 10, low: 10, close: 10, volume: 10 },
			{ index: 4, dataIndex: 4, date: new Date("2024-01-03T09:00:00Z"), open: 10, high: 10, low: 10, close: 10, volume: 10 },
		];

		const aligned = alignMTFData(baseBars, targetBars, targetValues, "1d");

		expect(aligned[0]).toBeUndefined(); // 2024-01-01T09:00:00Z
		expect(aligned[1]).toBeUndefined(); // 2024-01-01T15:00:00Z
		expect(aligned[2]).toBe(100); // 2024-01-02T09:00:00Z
		expect(aligned[3]).toBe(100); // 2024-01-02T15:00:00Z
		expect(aligned[4]).toBe(200); // 2024-01-03T09:00:00Z
	});
});
