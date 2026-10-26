export const WIDGET_TIMEZONES = [
	"Asia/Ho_Chi_Minh",
	"UTC",
	"America/New_York",
	"Europe/London",
	"Asia/Tokyo",
	"Asia/Singapore",
] as const;

export type WidgetTimezone = (typeof WIDGET_TIMEZONES)[number];

let globalTimezone: WidgetTimezone = "Asia/Ho_Chi_Minh";

// Memory-friendly Formatter Cache Map
const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function setGlobalTimezone(tz: WidgetTimezone): void {
	if (globalTimezone === tz) {
		return;
	}
	globalTimezone = tz;
	formatterCache.clear();
}

export function getGlobalTimezone(): WidgetTimezone {
	return globalTimezone;
}

export function getCachedFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const cacheKey = JSON.stringify({ locale, options });
	if (!formatterCache.has(cacheKey)) {
		formatterCache.set(cacheKey, new Intl.DateTimeFormat(locale, options));
	}
	return formatterCache.get(cacheKey)!;
}

/**
 * Định dạng mốc thời gian tuân thủ múi giờ SSOT toàn cục.
 * Hỗ trợ cache formatter để tối ưu hóa hiệu năng render 60 FPS.
 */
export function formatWithTimezone(
	date: Date | number,
	options: Intl.DateTimeFormatOptions = {}
): string {
	const d = typeof date === "number" ? new Date(date) : date;
	const tz = getGlobalTimezone();

	const extendedOptions: Intl.DateTimeFormatOptions = {
		...options,
		timeZone: tz,
		/* `hour12: false` does not pin the hour cycle - ECMA-402 lets it resolve to
		 * "h24", and ICU builds that choose h24 emit hour "24" for midnight. Callers
		 * here format chart ticks and tooltips, so that surfaced as a literal
		 * "24:00". h23 makes 00-23 explicit whenever an hour is requested.
		 * A 12-hour clock is the opposite case: h23 would fight `hour12: true`,
		 * so the cycle is left to the locale there. */
		...(options.hour !== undefined || options.hour12 !== undefined
			? options.hour12 === true
				? { hour12: true }
				: { hour12: false, hourCycle: "h23" }
			: {}),
	};


	try {
		const formatter = getCachedFormatter("vi-VN", extendedOptions);
		return formatter.format(d);
	} catch (e) {
		// Fallback an toàn: ép về UTC + en-US để tránh throw lặp lại.
		const fallbackOptions: Intl.DateTimeFormatOptions = {
			...extendedOptions,
			timeZone: "UTC"
		};
		const formatter = getCachedFormatter("en-US", fallbackOptions);
		return formatter.format(d);
	}
}

/**
 * Format timestamp according to user pattern (yyyy-mm-dd | dd/mm/yyyy | mm/dd/yyyy)
 * adhering strictly to the chart's global timezone.
 */
/**
 * Format a date using the display timezone.
 *
 * `hour12: false` is ambiguous in ECMA-402: it permits hourCycle "h24", and ICU
 * builds that choose h24 emit hour `"24"` for midnight rather than `"00"`. That
 * is what produced a literal `24:00` on an x-axis tick and a `24:00:00` tooltip on
 * the CI runner (Node 22 / older ICU) while the dev box (Node 24) showed `00:00`.
 * It is not a test-only problem — any consumer on that runtime sees it.
 *
 * Mapping 24 -> 00 keeps the value a wall-clock time without changing the
 * requested cycle.
 */
function normaliseHour24(value: string): string {
	return value === "24" ? "00" : value;
}

/**
 * Dựng chuỗi giờ theo chế độ 12h/24h.
 * 24h: `hh:mm` · 12h: `h:mm AM/PM` (chuẩn hoá 0h ⇒ 12, 12h ⇒ 12).
 * Dùng chung cho trục X (`formatTickDateWithTimezone`) và nhãn hover của crosshair
 * (`formatCustomDateWithTimezone`) ⇒ hai nơi **luôn** cùng định dạng.
 */
export function composeClockTime(hour: string, minute: string, dayPeriod: string, use12h: boolean): string {
	if (!use12h) return `${hour}:${minute}`;
	const h12 = String((Number(hour) % 12) === 0 ? 12 : Number(hour) % 12).padStart(2, "0");
	return `${h12}:${minute} ${dayPeriod}`.trim();
}

export function formatCustomDateWithTimezone(
	date: Date | number,
	pattern: "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy" = "yyyy-mm-dd",
	includeTime = false,
	timeFormat: "24h" | "12h" = "24h",
): string {
	const d = typeof date === "number" ? new Date(date) : date;
	const tz = getGlobalTimezone();
	const use12h = includeTime && timeFormat === "12h";
	const options: Intl.DateTimeFormatOptions = {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		...(includeTime
			? use12h
				? { hour: "2-digit", minute: "2-digit", hour12: true }
				: { hour: "2-digit", minute: "2-digit", hour12: false, hourCycle: "h23" }
			: {}),
		timeZone: tz,
	};
	let formatter: Intl.DateTimeFormat;
	try {
		formatter = getCachedFormatter("en-US", options);
	} catch {
		formatter = getCachedFormatter("en-US", { ...options, timeZone: "UTC" });
	}

	const parts = formatter.formatToParts(d);
	let year = "";
	let month = "";
	let day = "";
	let hour = "";
	let minute = "";
	let dayPeriod = "";

	for (let i = 0; i < parts.length; i++) {
		const p = parts[i];
		if (p.type === "year") year = p.value;
		else if (p.type === "month") month = p.value;
		else if (p.type === "day") day = p.value;
		/* `hour12: false` does not reliably mean 00-23. With hourCycle "h24" some ICU
		 * builds emit hour "24" for midnight instead of "00", which surfaced as a
		 * "24:00" tick label on the CI runner and would do the same for any user on
		 * that runtime. Normalising here is what keeps the label a clock time. */
		else if (p.type === "hour") hour = normaliseHour24(p.value);
		else if (p.type === "minute") minute = p.value;
		else if (p.type === "dayPeriod") dayPeriod = p.value;
	}

	const timeSuffix = includeTime ? ` ${composeClockTime(hour, minute, dayPeriod, use12h)}` : "";
	if (pattern === "dd/mm/yyyy") {
		return `${day}/${month}/${year}${timeSuffix}`;
	}
	if (pattern === "mm/dd/yyyy") {
		return `${month}/${day}/${year}${timeSuffix}`;
	}
	return `${year}-${month}-${day}${timeSuffix}`;
}

/**
 * Format compact tick dates for X-axis ticks (e.g. DD/MM, MM/DD, MM/YYYY, DD/MM HH:mm).
 */
export function formatTickDateWithTimezone(
	date: Date | number,
	pattern: "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy" = "yyyy-mm-dd",
	mode: "dayMonth" | "monthYear" | "dayMonthTime" | "time" | "year" = "dayMonth",
	timeFormat: "24h" | "12h" = "24h",
): string {
	const d = typeof date === "number" ? new Date(date) : date;
	const tz = getGlobalTimezone();
	const includeTime = mode === "dayMonthTime" || mode === "time";
	const use12h = timeFormat === "12h";
	const options: Intl.DateTimeFormatOptions = {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		...(includeTime
			? use12h
				? { hour: "2-digit", minute: "2-digit", hour12: true }
				: { hour: "2-digit", minute: "2-digit", hour12: false, hourCycle: "h23" }
			: {}),
		timeZone: tz,
	};
	let formatter: Intl.DateTimeFormat;
	try {
		formatter = getCachedFormatter("en-US", options);
	} catch {
		formatter = getCachedFormatter("en-US", { ...options, timeZone: "UTC" });
	}

	const parts = formatter.formatToParts(d);
	let year = "";
	let month = "";
	let day = "";
	let hour = "";
	let minute = "";
	let dayPeriod = "";

	for (let i = 0; i < parts.length; i++) {
		const p = parts[i];
		if (p.type === "year") year = p.value;
		else if (p.type === "month") month = p.value;
		else if (p.type === "day") day = p.value;
		else if (p.type === "hour") hour = normaliseHour24(p.value);
		else if (p.type === "minute") minute = p.value;
		else if (p.type === "dayPeriod") dayPeriod = p.value;
	}

	// 12-hour clock: the formatter already returns the 12-hour value, so only
	// the "12" edge (midnight / noon) has to be normalised.
	const timeText = composeClockTime(hour, minute, dayPeriod, use12h);

	if (mode === "time") {
		return timeText;
	}
	if (mode === "year") {
		return `${year}`;
	}
	if (mode === "monthYear") {
		return `${month}/${year}`;
	}

	const timeSuffix = mode === "dayMonthTime" ? ` ${timeText}` : "";
	if (pattern === "mm/dd/yyyy") {
		return `${month}/${day}${timeSuffix}`;
	}
	return `${day}/${month}${timeSuffix}`;
}


