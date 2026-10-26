import { describe, expect, it } from "vitest";
import { alignBarsByDate, estimateTimeframeMs, formatDateInTimezone } from "../alignBarsByDate";

function makeBar(date: Date, close = 100) {
	return { date, open: close, high: close + 1, low: close - 1, close, volume: 1000 };
}

describe("estimateTimeframeMs", () => {
	it("returns 0 for <2 bars", () => {
		expect(estimateTimeframeMs([makeBar(new Date("2024-01-01"))])).toBe(0);
		expect(estimateTimeframeMs([])).toBe(0);
	});

	it("estimates daily timeframe", () => {
		const bars = [
			makeBar(new Date("2024-01-01")),
			makeBar(new Date("2024-01-02")),
			makeBar(new Date("2024-01-03")),
		];
		expect(estimateTimeframeMs(bars)).toBe(86_400_000);
	});

	it("estimates hourly timeframe", () => {
		const bars = [
			makeBar(new Date("2024-01-01T00:00:00Z")),
			makeBar(new Date("2024-01-01T01:00:00Z")),
			makeBar(new Date("2024-01-01T02:00:00Z")),
		];
		expect(estimateTimeframeMs(bars)).toBe(3_600_000);
	});
});

describe("formatDateInTimezone", () => {
	it("formats date in UTC", () => {
		const date = new Date("2024-01-15T00:00:00Z");
		expect(formatDateInTimezone(date, "UTC")).toBe("2024-01-15");
	});

	it("formats date in Asia/Ho_Chi_Minh", () => {
		const date = new Date("2024-01-15T00:00:00Z");
		expect(formatDateInTimezone(date, "Asia/Ho_Chi_Minh")).toBe("2024-01-15");
	});
});

describe("alignBarsByDate", () => {
	it("returns all undefined for empty overlay", () => {
		const primary = [makeBar(new Date("2024-01-01")), makeBar(new Date("2024-01-02"))];
		const result = alignBarsByDate(primary, []);
		expect(result).toHaveLength(2);
		expect(result[0]).toBeUndefined();
		expect(result[1]).toBeUndefined();
	});

	it("aligns daily bars by date string", () => {
		const primary = [
			makeBar(new Date("2024-01-01"), 100),
			makeBar(new Date("2024-01-02"), 101),
			makeBar(new Date("2024-01-03"), 102),
		];
		const overlay = [
			makeBar(new Date("2024-01-01"), 200),
			makeBar(new Date("2024-01-02"), 202),
			makeBar(new Date("2024-01-04"), 204),
		];
		const result = alignBarsByDate(primary, overlay, "UTC");
		expect(result).toHaveLength(3);
		expect(result[0]?.close).toBe(200);
		expect(result[1]?.close).toBe(202);
		expect(result[2]).toBeUndefined();
	});

	it("aligns intraday bars by time range", () => {
		const primary = [
			makeBar(new Date("2024-01-01T00:00:00Z"), 100),
			makeBar(new Date("2024-01-01T01:00:00Z"), 101),
			makeBar(new Date("2024-01-01T02:00:00Z"), 102),
		];
		const overlay = [
			makeBar(new Date("2024-01-01T00:00:00Z"), 200),
			makeBar(new Date("2024-01-01T01:00:00Z"), 202),
			makeBar(new Date("2024-01-01T03:00:00Z"), 204),
		];
		const result = alignBarsByDate(primary, overlay, "UTC");
		expect(result).toHaveLength(3);
		expect(result[0]?.close).toBe(200);
		expect(result[1]?.close).toBe(202);
		expect(result[2]).toBeUndefined();
	});

	it("handles intraday with slight time offset", () => {
		const primary = [
			makeBar(new Date("2024-01-01T00:00:00Z"), 100),
			makeBar(new Date("2024-01-01T01:00:00Z"), 101),
		];
		const overlay = [
			makeBar(new Date("2024-01-01T00:00:05Z"), 200),
			makeBar(new Date("2024-01-01T01:00:03Z"), 202),
		];
		const result = alignBarsByDate(primary, overlay, "UTC");
		expect(result[0]?.close).toBe(200);
		expect(result[1]?.close).toBe(202);
	});
});
