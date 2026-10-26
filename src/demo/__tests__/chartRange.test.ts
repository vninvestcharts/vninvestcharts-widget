import { describe, expect, it } from "vitest";
import { DEFAULT_CHART_RANGE, isChartRangeSatisfied, resolveChartRangeExtents, resolveChartRangeFetchStart } from "../chartRange";

function buildBars(startDate: Date, count: number) {
	return Array.from({ length: count }, (_, index) => ({
		date: new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index, 12, 0, 0),
	}));
}

describe("resolveChartRangeExtents", () => {
	it("asserts DEFAULT_CHART_RANGE is 3M", () => {
		expect(DEFAULT_CHART_RANGE).toBe("3M");
	});

	it("uses the recent five-day window when specified", () => {
		const data = buildBars(new Date(2026, 4, 1), 10);
		const [start, end] = resolveChartRangeExtents(data, "5D")!;

		expect(start.getFullYear()).toBe(2026);
		expect(start.getMonth()).toBe(4);
		expect(start.getDate()).toBe(5);
		expect(end.getFullYear()).toBe(2026);
		expect(end.getMonth()).toBe(4);
		expect(end.getDate()).toBe(10);
	});

	it("clamps the YTD range to the first available bar", () => {
		const data = buildBars(new Date(2025, 10, 20), 20);
		const [start, end] = resolveChartRangeExtents(data, "YTD")!;

		expect(start.getFullYear()).toBe(2025);
		expect(start.getMonth()).toBe(10);
		expect(start.getDate()).toBe(20);
		expect(end.getFullYear()).toBe(2025);
		expect(end.getMonth()).toBe(11);
		expect(end.getDate()).toBe(9);
	});

	it("returns the full dataset for All", () => {
		const data = buildBars(new Date(2026, 0, 1), 3);
		const [start, end] = resolveChartRangeExtents(data, "All")!;

		expect(start.getDate()).toBe(1);
		expect(end.getDate()).toBe(3);
	});
});

describe("resolveChartRangeFetchStart", () => {
	it("prefetches a wider window for 5D to keep room for pan/zoom", () => {
		const end = new Date(2026, 4, 10, 0, 0, 0);
		const fetchStart = resolveChartRangeFetchStart(end, "5D");

		expect(fetchStart.getFullYear()).toBe(2026);
		expect(fetchStart.getMonth()).toBe(3);
		expect(fetchStart.getDate()).toBe(10);
	});

	it("keeps All range unbounded", () => {
		const end = new Date(2026, 4, 10, 0, 0, 0);
		const fetchStart = resolveChartRangeFetchStart(end, "All");

		expect(fetchStart.valueOf()).toBe(0);
	});
});

describe("isChartRangeSatisfied", () => {
	it("keeps 5D pinned until enough older bars have arrived", () => {
		const insufficientData = buildBars(new Date(2026, 4, 6), 5);
		const satisfiedData = buildBars(new Date(2026, 4, 5), 6);

		expect(isChartRangeSatisfied(insufficientData, "5D")).toBe(false);
		expect(isChartRangeSatisfied(satisfiedData, "5D")).toBe(true);
	});
});