import { type Timeframe } from "../../lib/types/adapter";
import {
	getGlobalTimezone,
	getCachedFormatter,
	formatTickDateWithTimezone,
	formatWithTimezone,
} from "../../lib/utils/timezoneFormatter";
import { intradayAxisFormat } from "./widgetHelpers";

export interface RawForkTickItem {
	key: string;
	x: number;
	dataIndex: number;
	date: Date;
}

import { formatCustomDateWithTimezone } from "../../lib/utils/timezoneFormatter";

/**
 * Nhãn giờ của **crosshair hover** (UIUX-AB-06).
 *
 * Trước đây nhãn này dùng `dateFormat(...)` với `hour12` **hardcode 24h** ⇒ chọn 12h ở
 * `scales.timeFormat` thì trục X hiện "2:00 PM" còn nhãn hover vẫn "14:00" ⇒ lệch nhau.
 * Hàm này dùng **cùng** formatter với trục X (`formatCustomDateWithTimezone`) ⇒ hai nơi luôn khớp.
 */
export function resolveForkHoverLabel(
	date: Date,
	timeframe: string,
	pattern: "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy" = "yyyy-mm-dd",
	timeFormat: "24h" | "12h" = "24h",
): string {
	const daily = /[DWM]$/.test(timeframe);
	// Ngày (D/W/M) không có giờ ⇒ `includeTime = false`; intraday thì theo `timeFormat`.
	return formatCustomDateWithTimezone(date, pattern, !daily, daily ? "24h" : timeFormat);
}

export interface ForkXAxisTick {
	key: string;
	x: number;
	label: string;
}

export function parseTimeframeToMinutes(timeframe: string): number {
	if (!timeframe) return 1;
	const match = timeframe.match(/^(\d+)?([a-zA-Z]+)$/);
	if (!match) return 1;
	const num = match[1] ? Number(match[1]) : 1;
	const unit = match[2];
	const unitLower = unit.toLowerCase();
	switch (unitLower) {
		case "m":
			if (unit === "M") {
				return num * 43200;
			}
			return num;
		case "h":
			return num * 60;
		case "d":
			return num * 1440;
		case "w":
			return num * 10080;
		default:
			return 1;
	}
}

interface CalendarParts {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
}

function getCalendarParts(date: Date): CalendarParts {
	const tz = getGlobalTimezone();
	const options: Intl.DateTimeFormatOptions = {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: tz,
	};
	let formatter: Intl.DateTimeFormat;
	try {
		formatter = getCachedFormatter("en-US", options);
	} catch {
		formatter = getCachedFormatter("en-US", { ...options, timeZone: "UTC" });
	}
	const parts = formatter.formatToParts(date);
	let year = 0;
	let month = 0;
	let day = 0;
	let hour = 0;
	let minute = 0;
	for (let i = 0; i < parts.length; i++) {
		const p = parts[i];
		if (p.type === "year") year = Number(p.value);
		else if (p.type === "month") month = Number(p.value);
		else if (p.type === "day") day = Number(p.value);
		else if (p.type === "hour") hour = Number(p.value);
		else if (p.type === "minute") minute = Number(p.value);
	}
	return { year, month, day, hour, minute };
}

/**
 * Format sequence of X-axis ticks adaptively based on tick interval,
 * ensuring boundary transitions and zero identical adjacent labels.
 */
export function formatForkXAxisTicksSequence(
	ticks: readonly RawForkTickItem[],
	timeframe: Timeframe,
	pattern: "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy" = "yyyy-mm-dd",
	timeFormat: "24h" | "12h" = "24h",
): ForkXAxisTick[] {
	if (ticks.length === 0) return [];
	if (ticks.length === 1) {
		return [{
			key: ticks[0].key,
			x: ticks[0].x,
			label: formatForkXAxisLabel(ticks[0].date, timeframe, 1, pattern, timeFormat),
		}];
	}

	const firstTime = ticks[0].date.getTime();
	const lastTime = ticks[ticks.length - 1].date.getTime();
	const totalSpanMs = Math.abs(lastTime - firstTime);
	const avgStepMs = totalSpanMs / Math.max(1, ticks.length - 1);
	const avgStepMinutes = avgStepMs / (1000 * 60);
	const avgStepHours = avgStepMinutes / 60;
	const avgStepDays = avgStepHours / 24;

	type SequenceMode = "minute" | "hour" | "day" | "month" | "year";
	let baseMode: SequenceMode;
	if (avgStepMinutes < 60) {
		baseMode = "minute";
	} else if (avgStepHours < 24) {
		baseMode = "hour";
	} else if (avgStepDays < 30) {
		baseMode = "day";
	} else if (avgStepDays < 365) {
		baseMode = "month";
	} else {
		baseMode = "year";
	}

	const intermediate: {
		key: string;
		x: number;
		date: Date;
		label: string;
		modeUsed: "time" | "dayMonth" | "monthYear" | "year" | "dayMonthTime";
	}[] = [];

	let prevParts: CalendarParts | null = null;

	for (let i = 0; i < ticks.length; i++) {
		const tick = ticks[i];
		const currParts = getCalendarParts(tick.date);
		let label = "";
		let modeUsed: "time" | "dayMonth" | "monthYear" | "year" | "dayMonthTime" = "dayMonth";

		const isNewYear = prevParts !== null && currParts.year !== prevParts.year;
		const isNewMonth = prevParts !== null && currParts.month !== prevParts.month;
		const isNewDay = prevParts !== null && currParts.day !== prevParts.day;

		switch (baseMode) {
			case "minute":
			case "hour":
				if (isNewYear) {
					label = formatTickDateWithTimezone(tick.date, pattern, "dayMonth");
					modeUsed = "dayMonth";
				} else if (isNewDay) {
					label = formatTickDateWithTimezone(tick.date, pattern, "dayMonth");
					modeUsed = "dayMonth";
				} else {
					label = formatTickDateWithTimezone(tick.date, pattern, "time");
					modeUsed = "time";
				}
				break;

			case "day":
				if (isNewYear) {
					label = formatTickDateWithTimezone(tick.date, pattern, "year");
					modeUsed = "year";
				} else {
					label = formatTickDateWithTimezone(tick.date, pattern, "dayMonth");
					modeUsed = "dayMonth";
				}
				break;

			case "month":
				if (isNewYear) {
					label = formatTickDateWithTimezone(tick.date, pattern, "year");
					modeUsed = "year";
				} else {
					label = formatTickDateWithTimezone(tick.date, pattern, "monthYear");
					modeUsed = "monthYear";
				}
				break;

			case "year":
			default:
				label = formatTickDateWithTimezone(tick.date, pattern, "year");
				modeUsed = "year";
				break;
		}

		intermediate.push({
			key: tick.key,
			x: tick.x,
			date: tick.date,
			label,
			modeUsed,
		});

		prevParts = currParts;
	}

	// Escalation Guard (Deduplication - INV-01):
	// Ensure no two adjacent ticks display identical text
	for (let i = 1; i < intermediate.length; i++) {
		if (intermediate[i].label === intermediate[i - 1].label) {
			if (intermediate[i].modeUsed === "year") {
				intermediate[i].label = formatTickDateWithTimezone(intermediate[i].date, pattern, "monthYear");
				intermediate[i].modeUsed = "monthYear";
				if (i === 1) {
					intermediate[0].label = formatTickDateWithTimezone(intermediate[0].date, pattern, "monthYear");
					intermediate[0].modeUsed = "monthYear";
				}
			} else if (intermediate[i].modeUsed === "monthYear") {
				intermediate[i].label = formatTickDateWithTimezone(intermediate[i].date, pattern, "dayMonth");
				intermediate[i].modeUsed = "dayMonth";
				if (intermediate[i - 1].modeUsed === "monthYear" || intermediate[i].label === intermediate[i - 1].label) {
					intermediate[i - 1].label = formatTickDateWithTimezone(intermediate[i - 1].date, pattern, "dayMonth");
					intermediate[i - 1].modeUsed = "dayMonth";
				}
			} else if (intermediate[i].modeUsed === "dayMonth") {
				intermediate[i].label = formatTickDateWithTimezone(intermediate[i].date, pattern, "dayMonthTime");
				intermediate[i].modeUsed = "dayMonthTime";
				if (intermediate[i - 1].modeUsed === "dayMonth") {
					intermediate[i - 1].label = formatTickDateWithTimezone(intermediate[i - 1].date, pattern, "dayMonthTime");
					intermediate[i - 1].modeUsed = "dayMonthTime";
				}
			} else if (intermediate[i].modeUsed === "time") {
				intermediate[i].label = formatTickDateWithTimezone(intermediate[i].date, pattern, "dayMonthTime");
				intermediate[i].modeUsed = "dayMonthTime";
				intermediate[i - 1].label = formatTickDateWithTimezone(intermediate[i - 1].date, pattern, "dayMonthTime");
				intermediate[i - 1].modeUsed = "dayMonthTime";
			}
		}
	}

	return intermediate.map((item) => ({
		key: item.key,
		x: item.x,
		label: item.label,
	}));
}

/**
 * Format single X-axis label (for tooltips and backward compatibility)
 */
export function formatForkXAxisLabel(
	date: Date,
	timeframe: Timeframe,
	visibleBarCount: number,
	pattern: "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy" = "yyyy-mm-dd",
	timeFormat: "24h" | "12h" = "24h",
): string {
	const minutesPerBar = parseTimeframeToMinutes(timeframe);
	const totalMinutes = visibleBarCount * minutesPerBar;

	const isDailyOrAbove = /^[DWM]$/i.test(timeframe) || timeframe === "1D" || timeframe === "1W" || timeframe === "1M";

	if (isDailyOrAbove) {
		if (visibleBarCount > 250) {
			return formatTickDateWithTimezone(date, pattern, "monthYear");
		}
		return formatTickDateWithTimezone(date, pattern, "dayMonth");
	}

	// Intraday timeframes (1m .. 4h):
	// Short range (total span <= 3 days = 4320 minutes):
	if (totalMinutes <= 4320) {
		return visibleBarCount <= 48
			? formatTickDateWithTimezone(date, pattern, "time", timeFormat)
			: formatTickDateWithTimezone(date, pattern, "dayMonthTime", timeFormat);
	}

	// Wide range intraday (> 3 days, e.g. 100-500 bars of 1h):
	// Shows dayMonth (e.g. 25/05), NEVER monthYear (which causes 09/2026 duplicates)
	return formatTickDateWithTimezone(date, pattern, "dayMonth");
}

/**
 * TradingView-style tick label with day-change awareness (follow-up V-01).
 * Intraday: the first tick of a day shows the date, following ticks the SAME
 * day show time only ("14:00") — adjacent duplicates like "16/09 16/09"
 * become "16/09 14:00 18:00 17/09". Daily+ frames keep the base label.
 * Returns the label plus the day key the caller threads to the next tick.
 */
export function resolveForkTickLabel(
	date: Date,
	timeframe: Timeframe,
	visibleBarCount: number,
	pattern: "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy" = "yyyy-mm-dd",
	prevDayKey: string | null = null,
	timeFormat: "24h" | "12h" = "24h",
): { label: string; dayKey: string } {
	const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
	const isIntraday = !/[DWM]$/.test(timeframe);
	let label = formatForkXAxisLabel(date, timeframe, visibleBarCount, pattern, timeFormat);
	if (isIntraday && prevDayKey !== null && prevDayKey === dayKey) {
		label = intradayAxisFormat(date, timeFormat);
	}
	return { label, dayKey };
}
