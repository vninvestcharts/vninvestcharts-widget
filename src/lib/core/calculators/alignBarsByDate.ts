import { getGlobalTimezone } from "../../utils/timezoneFormatter";

export interface AlignedBarData {
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

const DATE_FORMAT_CACHE = new Map<string, Intl.DateTimeFormat>();

function getDateFormat(timezone: string): Intl.DateTimeFormat {
	const key = `date-${timezone}`;
	if (!DATE_FORMAT_CACHE.has(key)) {
		DATE_FORMAT_CACHE.set(
			key,
			new Intl.DateTimeFormat("en-CA", {
				timeZone: timezone,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
			}),
		);
	}
	return DATE_FORMAT_CACHE.get(key)!;
}

export function formatDateInTimezone(date: Date, timezone: string): string {
	return getDateFormat(timezone).format(date);
}

export function estimateTimeframeMs(bars: readonly { date: Date }[]): number {
	if (bars.length < 2) return 0;
	const diffs: number[] = [];
	for (let i = 1; i < Math.min(bars.length, 50); i++) {
		diffs.push(bars[i].date.getTime() - bars[i - 1].date.getTime());
	}
	diffs.sort((a, b) => a - b);
	const median = diffs[Math.floor(diffs.length / 2)] ?? 0;
	return Math.max(median, 0);
}

export function isDailyOrLarger(ms: number): boolean {
	return ms >= 86_400_000;
}

/**
 * Align overlay bars to primary bars by date, timezone-aware.
 *
 * - Daily+: Match by date string (YYYY-MM-DD in configured timezone)
 * - Intraday: Match by nearest bar within timeframeMs tolerance (binary search)
 *
 * @param primaryBars - Primary symbol bars
 * @param overlayBars - Overlay symbol bars
 * @param timezone    - Timezone for date formatting (default: from global SSOT)
 * @returns Array of AlignedBarData | undefined (aligned to primary bar index)
 */
export function alignBarsByDate(
	primaryBars: readonly { date: Date; open: number; high: number; low: number; close: number; volume: number }[],
	overlayBars: readonly { date: Date; open: number; high: number; low: number; close: number; volume: number }[],
	timezone?: string,
): (AlignedBarData | undefined)[] {
	const tz = timezone ?? getGlobalTimezone();
	const tfMs = estimateTimeframeMs(primaryBars);

	if (overlayBars.length === 0) {
		return primaryBars.map(() => undefined);
	}

	if (isDailyOrLarger(tfMs)) {
		return alignByDateString(primaryBars, overlayBars, tz);
	}

	return alignByTimeRange(primaryBars, overlayBars, tfMs);
}

function alignByDateString(
	primaryBars: readonly { date: Date }[],
	overlayBars: readonly { date: Date; open: number; high: number; low: number; close: number; volume: number }[],
	timezone: string,
): (AlignedBarData | undefined)[] {
	const overlayByDate = new Map<string, AlignedBarData>();
	for (const bar of overlayBars) {
		const dateKey = formatDateInTimezone(bar.date, timezone);
		if (!overlayByDate.has(dateKey)) {
			overlayByDate.set(dateKey, {
				open: bar.open,
				high: bar.high,
				low: bar.low,
				close: bar.close,
				volume: bar.volume,
			});
		}
	}

	return primaryBars.map((bar) => {
		const dateKey = formatDateInTimezone(bar.date, timezone);
		return overlayByDate.get(dateKey);
	});
}

function alignByTimeRange(
	primaryBars: readonly { date: Date }[],
	overlayBars: readonly { date: Date; open: number; high: number; low: number; close: number; volume: number }[],
	tfMs: number,
): (AlignedBarData | undefined)[] {
	const toleranceMs = Math.max(tfMs * 0.5, 1000);

	return primaryBars.map((primaryBar) => {
		const primaryTime = primaryBar.date.getTime();
		const idx = binarySearchNearest(overlayBars, primaryTime);
		if (idx === -1) return undefined;

		const overlayBar = overlayBars[idx];
		const overlayTime = overlayBar.date.getTime();
		const diff = Math.abs(overlayTime - primaryTime);

		if (diff <= toleranceMs) {
			return {
				open: overlayBar.open,
				high: overlayBar.high,
				low: overlayBar.low,
				close: overlayBar.close,
				volume: overlayBar.volume,
			};
		}

		return undefined;
	});
}

function binarySearchNearest(
	bars: readonly { date: Date }[],
	targetMs: number,
): number {
	if (bars.length === 0) return -1;

	let left = 0;
	let right = bars.length - 1;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);
		const midTime = bars[mid].date.getTime();

		if (midTime === targetMs) return mid;
		if (midTime < targetMs) {
			left = mid + 1;
		} else {
			right = mid - 1;
		}
	}

	if (left >= bars.length) return bars.length - 1;
	if (right < 0) return 0;

	const leftDiff = Math.abs(bars[left].date.getTime() - targetMs);
	const rightDiff = Math.abs(bars[right].date.getTime() - targetMs);
	return leftDiff <= rightDiff ? left : right;
}
