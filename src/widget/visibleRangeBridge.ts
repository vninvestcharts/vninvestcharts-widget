import type { VisibleRange as EngineVisibleRange } from "@vninvestcharts/engine-core";
import type { VisibleRange } from "../lib/core";

export interface DateBackedDatum {
	date: Date;
}

export function clampIndex(index: number, length: number) {
	if (length <= 0) {
		return 0;
	}

	const lastIndex = length - 1;
	return Math.min(lastIndex, Math.max(0, Math.floor(index)));
}

export function clampToRange(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export function asTimeValue(value: Date | number): number {
	return value instanceof Date ? value.getTime() : value;
}

export function findNearestDateIndex(data: readonly DateBackedDatum[], targetTime: number): number {
	if (data.length === 0) {
		return 0;
	}

	let low = 0;
	let high = data.length - 1;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const midTime = data[mid].date.getTime();
		if (midTime === targetTime) {
			return mid;
		}

		if (midTime < targetTime) {
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	const right = Math.min(data.length - 1, Math.max(0, low));
	const left = Math.min(data.length - 1, Math.max(0, high));
	return Math.abs(data[left].date.getTime() - targetTime) <= Math.abs(data[right].date.getTime() - targetTime)
		? left
		: right;
}

export function normalizeForkVisibleRange(range: EngineVisibleRange, data: readonly DateBackedDatum[]): VisibleRange | null {
	if (data.length === 0) {
		return null;
	}

	const lo = Math.min(range.from, range.to);
	const hi = Math.max(range.from, range.to);
	const rawStartIndex = Math.floor(lo);
	const rawEndExclusive = Math.max(rawStartIndex + 1, Math.ceil(hi));
	const rawEndIndex = rawEndExclusive - 1;

	// Indices stay clamped so consumers can index data[] safely.
	const startIndex = clampIndex(rawStartIndex, data.length);
	const endIndex = clampIndex(rawEndIndex, data.length);
	const startBar = data[startIndex];
	const endBar = data[endIndex];
	if (!startBar?.date || !endBar?.date) {
		return null;
	}

	// Z3-07 (D-Z16): overscroll-aware dates. When the engine viewport extends
	// beyond loaded data (from < 0 from soft-boundary damp, or to > data.length
	// from right padding), clampIndex alone would pin timeRange to bar 0 / last
	// bar and desync multi-chart followers. Extrapolate with the dataset bar step
	// so timeRange carries the TRUE overscrolled extent (sync consumers read
	// timeRange/startDate/endDate; index consumers keep the clamped fields).
	const firstBar = data[0];
	const lastBar = data[data.length - 1];
	const firstMs = firstBar.date.getTime();
	const lastMs = lastBar.date.getTime();
	const stepMs = data.length > 1
		? Math.max(1, Math.round((lastMs - firstMs) / (data.length - 1)))
		: 3_600_000;
	const startDate = rawStartIndex < 0
		? new Date(firstMs + rawStartIndex * stepMs)
		: startBar.date;
	const endDate = rawEndIndex >= data.length
		? new Date(lastMs + (rawEndIndex - (data.length - 1)) * stepMs)
		: endBar.date;

	return {
		startIndex,
		endIndex,
		startDate,
		endDate,
		timeRange: {
			from: startDate.getTime(),
			to: endDate.getTime(),
		},
		barCount: rawEndExclusive - rawStartIndex,
	};
}

export function normalizeEngineVisibleRange(
	visibleRange: EngineVisibleRange | null,
	dataLength: number,
): EngineVisibleRange | null {
	if (!visibleRange || dataLength <= 0) {
		return null;
	}

	const from = clampIndex(Math.floor(Math.min(visibleRange.from, visibleRange.to)), dataLength);
	const to = clampToRange(
		Math.ceil(Math.max(visibleRange.from, visibleRange.to)),
		from + 1,
		dataLength,
	);

	return {
		from,
		to,
	};
}

/**
 * Fork runtime variant of normalizeEngineVisibleRange that preserves fractional
 * precision. Skips Math.floor/ Math.ceil to avoid coordinate mismatch between
 * the bridge projector (used for hit-testing) and the engine projector (used
 * for canvas rendering) after biased zoom operations.
 *
 * Only enforces:
 *  - from <= to (swapped if needed)
 *  - finite number checks
 *  - non-negative from (clamped to 0)
 *
 * Does NOT clamp to dataLength or round to integers — the fork engine maintains
 * its own valid range and may intentionally show empty space beyond data bounds.
 */
export function normalizeVisibleRangeFork(
	visibleRange: EngineVisibleRange | null,
	_dataLength: number,
): EngineVisibleRange | null {
	if (!visibleRange) {
		return null;
	}

	const from = Math.min(visibleRange.from, visibleRange.to);
	const to = Math.max(visibleRange.from, visibleRange.to);
	if (!Number.isFinite(from) || !Number.isFinite(to) || to - from <= 1e-10) {
		return null;
	}

	return { from: Math.max(0, from), to };
}

export function normalizeVisibleRangeForEngine(
	visibleRange: EngineVisibleRange | VisibleRange | null,
	dataLength: number,
): EngineVisibleRange | null {
	if (!visibleRange || dataLength <= 0) {
		return null;
	}

	if ("from" in visibleRange && "to" in visibleRange) {
		return normalizeEngineVisibleRange(visibleRange, dataLength);
	}

	const from = clampIndex(Math.floor(Math.min(visibleRange.startIndex, visibleRange.endIndex)), dataLength);
	const to = clampToRange(
		Math.ceil(Math.max(visibleRange.startIndex, visibleRange.endIndex)) + 1,
		from + 1,
		dataLength,
	);

	return { from, to };
}

export function resolveForkVisibleRangeFromDateExtents(
	extents: readonly [Date | number, Date | number],
	data: readonly DateBackedDatum[],
): EngineVisibleRange | null {
	if (data.length === 0) {
		return null;
	}

	const startTime = asTimeValue(extents[0]);
	const endTime = asTimeValue(extents[1]);
	const lowerTime = Math.min(startTime, endTime);
	const upperTime = Math.max(startTime, endTime);
	const startIndex = findNearestDateIndex(data, lowerTime);
	const endIndex = findNearestDateIndex(data, upperTime);
	const fromIndex = Math.min(startIndex, endIndex);
	const toIndex = Math.max(startIndex, endIndex);
	const toExclusive = clampToRange(toIndex + 1, fromIndex + 1, data.length);

	return {
		from: fromIndex,
		to: toExclusive,
	};
}