import { type Timeframe } from "../../lib/types/adapter";

export const CHART_RANGES = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "All"] as const;

export type ChartRange = typeof CHART_RANGES[number];

export const DEFAULT_CHART_RANGE: ChartRange = "3M";

export const CHART_RANGE_LABEL_KEYS: Record<ChartRange, string> = {
	"1D": "library.range.1d",
	"5D": "library.range.5d",
	"1M": "library.range.1m",
	"3M": "library.range.3m",
	"6M": "library.range.6m",
	YTD: "library.range.ytd",
	"1Y": "library.range.1y",
	All: "library.range.all",
};

const FETCH_PREFETCH_MULTIPLIER: Record<ChartRange, number> = {
	"1D": 7,
	"5D": 6,
	"1M": 3,
	"3M": 2,
	"6M": 1.5,
	YTD: 1.25,
	"1Y": 1.1,
	All: 1,
};

type RangeDatum = { date: Date | number };

function normalizeDate(value: Date | number) {
	return value instanceof Date ? value : new Date(value);
}

function subtractDays(date: Date, days: number) {
	const next = new Date(date.getTime());
	next.setDate(next.getDate() - days);
	return next;
}

function subtractMonths(date: Date, months: number) {
	const next = new Date(date.getTime());
	const dayOfMonth = next.getDate();
	next.setDate(1);
	next.setMonth(next.getMonth() - months);
	const lastDayOfMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
	next.setDate(Math.min(dayOfMonth, lastDayOfMonth));
	return next;
}

function subtractYears(date: Date, years: number) {
	const next = new Date(date.getTime());
	next.setFullYear(next.getFullYear() - years);
	return next;
}

export function resolveChartRangeStart(endDate: Date, range: ChartRange) {
	switch (range) {
		case "1D":
			return subtractDays(endDate, 1);
		case "5D":
			return subtractDays(endDate, 5);
		case "1M":
			return subtractMonths(endDate, 1);
		case "3M":
			return subtractMonths(endDate, 3);
		case "6M":
			return subtractMonths(endDate, 6);
		case "YTD":
			return new Date(endDate.getFullYear(), 0, 1);
		case "1Y":
			return subtractYears(endDate, 1);
		case "All":
			return new Date(0);
		default:
			return endDate;
	}
}

export function resolveChartRangeFetchStart(endDate: Date, range: ChartRange) {
	if (range === "All") {
		return new Date(0);
	}

	const viewportStart = resolveChartRangeStart(endDate, range);
	const multiplier = FETCH_PREFETCH_MULTIPLIER[range] ?? 1;
	if (multiplier <= 1) {
		return viewportStart;
	}

	const viewportSpanMs = Math.max(1, endDate.valueOf() - viewportStart.valueOf());
	const fetchSpanMs = Math.ceil(viewportSpanMs * multiplier);
	return new Date(endDate.valueOf() - fetchSpanMs);
}

export function resolveChartRangeExtents(data: readonly RangeDatum[], range: ChartRange): [Date, Date] | null {
	if (data.length === 0) {
		return null;
	}

	if (data.length === 1) {
		const single = normalizeDate(data[0].date);
		return [single, single];
	}

	const first = normalizeDate(data[0].date);
	const last = normalizeDate(data[data.length - 1].date);

	if (range === "All") {
		return [first, last];
	}

	const rangeStart = resolveChartRangeStart(last, range);
	return [rangeStart.valueOf() < first.valueOf() ? first : rangeStart, last];
}

export function isChartRangeSatisfied(data: readonly RangeDatum[], range: ChartRange): boolean {
	if (data.length === 0 || range === "All") {
		return true;
	}

	const first = normalizeDate(data[0].date);
	const last = normalizeDate(data[data.length - 1].date);
	const targetStart = resolveChartRangeStart(last, range);
	return first.valueOf() <= targetStart.valueOf();
}
