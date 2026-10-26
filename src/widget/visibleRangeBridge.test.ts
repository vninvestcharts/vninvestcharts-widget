import { describe, expect, it } from "vitest";
import {
	normalizeEngineVisibleRange,
	normalizeForkVisibleRange,
	normalizeVisibleRangeForEngine,
	normalizeVisibleRangeFork,
	resolveForkVisibleRangeFromDateExtents,
} from "./visibleRangeBridge";

const data = [
	{ date: new Date("2026-01-01T00:00:00.000Z") },
	{ date: new Date("2026-01-02T00:00:00.000Z") },
	{ date: new Date("2026-01-03T00:00:00.000Z") },
	{ date: new Date("2026-01-04T00:00:00.000Z") },
];

describe("visibleRangeBridge", () => {
	it("normalizeVisibleRangeFork preserves fractional precision", () => {
		const range = normalizeVisibleRangeFork({ from: 50.3, to: 200.7 }, data.length);
		expect(range).toEqual({ from: 50.3, to: 200.7 });
	});

	it("normalizeVisibleRangeFork preserves integer range unchanged", () => {
		const range = normalizeVisibleRangeFork({ from: 50, to: 200 }, data.length);
		expect(range).toEqual({ from: 50, to: 200 });
	});

	it("normalizeVisibleRangeFork swaps reversed from/to", () => {
		const range = normalizeVisibleRangeFork({ from: 200.7, to: 50.3 }, data.length);
		expect(range).toEqual({ from: 50.3, to: 200.7 });
	});

	it("normalizeVisibleRangeFork clamps negative from to 0", () => {
		const range = normalizeVisibleRangeFork({ from: -5.5, to: 100.2 }, data.length);
		expect(range).toEqual({ from: 0, to: 100.2 });
	});

	it("normalizeVisibleRangeFork returns null for null input", () => {
		expect(normalizeVisibleRangeFork(null, data.length)).toBeNull();
	});

	it("normalizeVisibleRangeFork returns null for zero-span range", () => {
		expect(normalizeVisibleRangeFork({ from: 50, to: 50 }, data.length)).toBeNull();
	});
	it("normalizes engine visible range into an inclusive widget visible range", () => {
		const normalized = normalizeForkVisibleRange({ from: 1, to: 3 }, data);

		expect(normalized).toEqual({
			startIndex: 1,
			endIndex: 2,
			startDate: data[1].date,
			endDate: data[2].date,
			timeRange: { from: data[1].date.getTime(), to: data[2].date.getTime() },
			barCount: 2,
		});
	});

	it("extrapolates time for left overscroll while keeping indices clamped (Z3-07)", () => {
		const normalized = normalizeForkVisibleRange({ from: -2.4, to: 2.2 }, data);

		// rawStart = floor(-2.4) = -3 → 3 daily bars before data[0] (2026-01-01).
		expect(normalized).toEqual({
			startIndex: 0,
			endIndex: 2,
			startDate: new Date("2025-12-29T00:00:00.000Z"),
			endDate: data[2].date,
			timeRange: {
				from: new Date("2025-12-29T00:00:00.000Z").getTime(),
				to: data[2].date.getTime(),
			},
			barCount: 6,
		});
	});

	it("extrapolates time for right overscroll while keeping indices clamped (Z3-07)", () => {
		const normalized = normalizeForkVisibleRange({ from: 1.2, to: 5.6 }, data);

		// rawEnd = ceil(5.6) - 1 = 5 → 2 daily bars after data[3] (2026-01-04).
		expect(normalized).toEqual({
			startIndex: 1,
			endIndex: 3,
			startDate: data[1].date,
			endDate: new Date("2026-01-06T00:00:00.000Z"),
			timeRange: {
				from: data[1].date.getTime(),
				to: new Date("2026-01-06T00:00:00.000Z").getTime(),
			},
			barCount: 5,
		});
	});

	it("resolves date extents into an engine range with an exclusive upper bound", () => {
		const range = resolveForkVisibleRangeFromDateExtents([
			data[1].date,
			data[2].date,
		], data);

		expect(range).toEqual({ from: 1, to: 3 });
	});

	it("resolves reversed date extents using the nearest available bars", () => {
		const range = resolveForkVisibleRangeFromDateExtents([
			new Date("2026-01-03T12:00:00.000Z"),
			new Date("2025-12-31T12:00:00.000Z"),
		], data);

		expect(range).toEqual({ from: 0, to: 3 });
	});

	it("normalizes engine-visible input into an in-bounds exclusive range", () => {
		const range = normalizeEngineVisibleRange({ from: 3.7, to: -2.2 }, data.length);

		expect(range).toEqual({ from: 0, to: 4 });
	});

	it("normalizes inclusive widget visible ranges into exclusive engine ranges", () => {
		const range = normalizeVisibleRangeForEngine({
			startIndex: 1,
			endIndex: 2,
			startDate: data[1].date,
			endDate: data[2].date,
			timeRange: { from: data[1].date.getTime(), to: data[2].date.getTime() },
			barCount: 2,
		}, data.length);

		expect(range).toEqual({ from: 1, to: 3 });
	});
});