import { describe, expect, it } from "vitest";
import { chartPointsToRawOHLCV } from "../adapters";
import type { NullableChartPoint } from "../types";

describe("chartPointsToRawOHLCV", () => {
	it("converts valid points correctly", () => {
		const points: NullableChartPoint[] = [
			{ date: "2026-05-08T00:00:00", open: 83500, high: 84200, low: 83100, close: 83800, volume: 1234567 },
		];
		const result = chartPointsToRawOHLCV(points);
		expect(result).toHaveLength(1);
		expect(result[0].close).toBe(83800);
		expect(result[0].volume).toBe(1234567);
		expect(result[0].date).toBeInstanceOf(Date);
		expect(result[0].date.getFullYear()).toBe(2026);
	});

	it("filters out points with null close", () => {
		const points: NullableChartPoint[] = [
			{ date: "2026-05-08T00:00:00", open: 100, high: 110, low: 90, close: null, volume: 1000 },
			{ date: "2026-05-09T00:00:00", open: 100, high: 110, low: 90, close: 105, volume: 2000 },
		];
		const result = chartPointsToRawOHLCV(points);
		expect(result).toHaveLength(1);
		expect(result[0].close).toBe(105);
	});

	it("filters out points with invalid date string", () => {
		const points: NullableChartPoint[] = [
			{ date: "invalid-date", open: 100, high: 110, low: 90, close: 105, volume: 1000 },
		];
		const result = chartPointsToRawOHLCV(points);
		expect(result).toHaveLength(0);
	});

	it("uses close as fallback for null open/high/low", () => {
		const points: NullableChartPoint[] = [
			{ date: "2026-05-08T00:00:00", open: null, high: null, low: null, close: 83800, volume: 500 },
		];
		const result = chartPointsToRawOHLCV(points);
		expect(result[0].open).toBe(83800);
		expect(result[0].high).toBe(83800);
		expect(result[0].low).toBe(83800);
	});

	it("uses 0 as fallback for null volume", () => {
		const points: NullableChartPoint[] = [
			{ date: "2026-05-08T00:00:00", open: 100, high: 110, low: 90, close: 105, volume: null },
		];
		const result = chartPointsToRawOHLCV(points);
		expect(result[0].volume).toBe(0);
	});

	it("returns empty array for empty input", () => {
		expect(chartPointsToRawOHLCV([])).toHaveLength(0);
	});
});
