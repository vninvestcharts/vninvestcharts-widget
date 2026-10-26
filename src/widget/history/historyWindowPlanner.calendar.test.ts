/**
 * Tests for VN Exchange Calendar and planner market-closed gap classification.
 *
 * BU-01-04 acceptance criteria:
 * - VN calendar correctly identifies trading / non-trading times
 * - computeMissingSegments tags gaps as `market-closed` when calendar confirms no trading
 * - computeMissingSegments keeps gaps as `not-fetched` when trading time overlaps
 */

import { describe, expect, it } from "vitest";
import { isVNTradingTime, vnExchangeCalendar } from "../../lib/calendars/ExchangeCalendar";
import { getCalendar } from "../../lib/calendars/calendarRegistry";
import { computeMissingSegments } from "./historyWindowPlanner";
import type { SourceSemanticsDescriptor } from "../../lib/adapters";

// ---------------------------------------------------------------------------
// VN Exchange Calendar — isVNTradingTime
// ---------------------------------------------------------------------------

// ICT = UTC+7.  We use exact UTC timestamps to avoid local TZ confusion.
// 2024-01-15 is a Monday.
// UTC 02:15 = ICT 09:15 → start of morning session
// UTC 04:30 = ICT 11:30 → end of morning session
// UTC 06:00 = ICT 13:00 → start of afternoon session
// UTC 07:45 = ICT 14:45 → end of afternoon session

const MON_JAN15_UTC_MS = Date.UTC(2024, 0, 15); // 2024-01-15T00:00:00Z

function utcMs(isoString: string): number {
	return new Date(isoString).getTime();
}

describe("isVNTradingTime", () => {
	it("returns true during morning session (09:15–11:30 ICT on a weekday)", () => {
		// 2024-01-15 09:15 ICT = 2024-01-15 02:15 UTC
		expect(isVNTradingTime(utcMs("2024-01-15T02:15:00Z"))).toBe(true);
		// 2024-01-15 10:00 ICT = 2024-01-15 03:00 UTC
		expect(isVNTradingTime(utcMs("2024-01-15T03:00:00Z"))).toBe(true);
	});

	it("returns false at exact 11:30 ICT (session end)", () => {
		// 11:30 ICT = 04:30 UTC — end is exclusive
		expect(isVNTradingTime(utcMs("2024-01-15T04:30:00Z"))).toBe(false);
	});

	it("returns false during lunch break (11:30–13:00 ICT)", () => {
		// 12:00 ICT = 05:00 UTC
		expect(isVNTradingTime(utcMs("2024-01-15T05:00:00Z"))).toBe(false);
	});

	it("returns true during afternoon session (13:00–14:45 ICT on a weekday)", () => {
		// 13:30 ICT = 06:30 UTC
		expect(isVNTradingTime(utcMs("2024-01-15T06:30:00Z"))).toBe(true);
	});

	it("returns false at 14:45 ICT (session end exclusive)", () => {
		// 14:45 ICT = 07:45 UTC
		expect(isVNTradingTime(utcMs("2024-01-15T07:45:00Z"))).toBe(false);
	});

	it("returns false on Saturday", () => {
		// 2024-01-20 is a Saturday
		expect(isVNTradingTime(utcMs("2024-01-20T03:00:00Z"))).toBe(false);
	});

	it("returns false on Sunday", () => {
		// 2024-01-21 is a Sunday
		expect(isVNTradingTime(utcMs("2024-01-21T03:00:00Z"))).toBe(false);
	});

	it("returns false before market opens (08:00 ICT)", () => {
		// 08:00 ICT = 01:00 UTC
		expect(isVNTradingTime(utcMs("2024-01-15T01:00:00Z"))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// vnExchangeCalendar.hasAnyTradingTime
// ---------------------------------------------------------------------------

describe("vnExchangeCalendar.hasAnyTradingTime", () => {
	it("returns true for a range fully within a trading session", () => {
		// 09:30–10:30 ICT on Mon = 02:30–03:30 UTC
		const from = utcMs("2024-01-15T02:30:00Z");
		const to = utcMs("2024-01-15T03:30:00Z");
		expect(vnExchangeCalendar.hasAnyTradingTime(from, to)).toBe(true);
	});

	it("returns false for a range entirely over weekend", () => {
		// Saturday + Sunday ICT
		const from = utcMs("2024-01-20T00:00:00Z");
		const to = utcMs("2024-01-21T23:59:00Z");
		expect(vnExchangeCalendar.hasAnyTradingTime(from, to)).toBe(false);
	});

	it("returns false for a range entirely in lunch break on a weekday", () => {
		// 11:30–13:00 ICT = 04:30–06:00 UTC on Mon
		const from = utcMs("2024-01-15T04:30:00Z");
		const to = utcMs("2024-01-15T06:00:00Z");
		expect(vnExchangeCalendar.hasAnyTradingTime(from, to)).toBe(false);
	});

	it("returns true for a range spanning lunch break (partially overlaps trading)", () => {
		// 11:00–13:30 ICT = 04:00–06:30 UTC — overlaps morning end and afternoon start
		const from = utcMs("2024-01-15T04:00:00Z");
		const to = utcMs("2024-01-15T06:30:00Z");
		expect(vnExchangeCalendar.hasAnyTradingTime(from, to)).toBe(true);
	});

	it("returns true for a multi-day range containing a trading day", () => {
		// Fri evening to Tue morning — contains Mon/Tue trading sessions
		const from = utcMs("2024-01-19T15:00:00Z"); // Fri ICT 22:00
		const to = utcMs("2024-01-22T05:00:00Z");   // Mon ICT 12:00
		expect(vnExchangeCalendar.hasAnyTradingTime(from, to)).toBe(true);
	});

	it("returns false when from >= to", () => {
		const ts = utcMs("2024-01-15T03:00:00Z");
		expect(vnExchangeCalendar.hasAnyTradingTime(ts, ts)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Calendar registry
// ---------------------------------------------------------------------------

describe("getCalendar", () => {
	it("returns vnExchangeCalendar for 'vn-exchange-calendar'", () => {
		const cal = getCalendar("vn-exchange-calendar");
		expect(cal).not.toBeNull();
		expect(cal?.calendarId).toBe("vn-exchange-calendar");
	});

	it("returns null for unknown id", () => {
		expect(getCalendar("unknown-exchange")).toBeNull();
	});

	it("returns null for undefined", () => {
		expect(getCalendar(undefined)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// computeMissingSegments with exchange-calendar semantics
// ---------------------------------------------------------------------------

const VN_EXCHANGE_SEMANTICS: SourceSemanticsDescriptor = {
	sourceId: "vnstocks",
	sourceContractVersion: "vnstocks-window-v1",
	instrumentClass: "equity",
	coverageMode: "window-hint",
	sessionModel: "exchange-calendar",
	timezone: "Asia/Ho_Chi_Minh",
	sessionCalendarId: "vn-exchange-calendar",
	supportsExactRangeFetch: false,
	supportsBackwardAnchor: true,
	supportsForwardAnchor: false,
	supportsLiveBars: true,
	finalityMode: "historically-correctable",
	expectedGapReasons: ["not-fetched", "market-closed", "source-no-data", "rate-limited", "boundary-exhausted"],
};

const CRYPTO_SEMANTICS: SourceSemanticsDescriptor = {
	sourceId: "binance",
	sourceContractVersion: "binance-klines-v1",
	instrumentClass: "crypto",
	coverageMode: "exact-range",
	sessionModel: "continuous",
	timezone: "UTC",
	supportsExactRangeFetch: true,
	supportsBackwardAnchor: true,
	supportsForwardAnchor: false,
	supportsLiveBars: true,
	finalityMode: "near-now-provisional",
	expectedGapReasons: ["not-fetched", "source-no-data", "rate-limited", "boundary-exhausted"],
};

describe("computeMissingSegments with exchange-calendar", () => {
	it("tags a weekend gap as market-closed for exchange-calendar source", () => {
		// Gap covers Saturday–Sunday only: 2024-01-20 00:00 – 2024-01-21 23:59 UTC
		const resident = { startMs: utcMs("2024-01-20T00:00:00Z"), endMs: utcMs("2024-01-22T00:00:00Z") };
		const loaded = { startMs: utcMs("2024-01-21T23:59:00Z"), endMs: utcMs("2024-01-22T00:00:00Z") };

		const segments = computeMissingSegments(resident, loaded, VN_EXCHANGE_SEMANTICS, vnExchangeCalendar);

		expect(segments).toHaveLength(1);
		expect(segments[0].reason).toBe("market-closed");
	});

	it("keeps not-fetched for a gap that overlaps trading hours", () => {
		// Gap covers Monday morning trading hours
		const resident = { startMs: utcMs("2024-01-15T00:00:00Z"), endMs: utcMs("2024-01-15T10:00:00Z") };
		const loaded = { startMs: utcMs("2024-01-15T05:00:00Z"), endMs: utcMs("2024-01-15T10:00:00Z") };
		// Left gap: 00:00–05:00 UTC = 07:00–12:00 ICT → includes 09:15–11:30 trading

		const segments = computeMissingSegments(resident, loaded, VN_EXCHANGE_SEMANTICS, vnExchangeCalendar);

		expect(segments).toHaveLength(1);
		expect(segments[0].reason).toBe("not-fetched");
	});

	it("continuous source always returns not-fetched regardless of calendar", () => {
		// Same weekend range but for a continuous (crypto) source
		const resident = { startMs: utcMs("2024-01-20T00:00:00Z"), endMs: utcMs("2024-01-22T00:00:00Z") };
		const loaded = { startMs: utcMs("2024-01-21T23:59:00Z"), endMs: utcMs("2024-01-22T00:00:00Z") };

		const segments = computeMissingSegments(resident, loaded, CRYPTO_SEMANTICS, vnExchangeCalendar);

		expect(segments).toHaveLength(1);
		expect(segments[0].reason).toBe("not-fetched");
	});

	it("exchange-calendar without calendar param falls back to not-fetched", () => {
		// No calendar provided → cannot classify → not-fetched
		const resident = { startMs: utcMs("2024-01-20T00:00:00Z"), endMs: utcMs("2024-01-22T00:00:00Z") };
		const loaded = { startMs: utcMs("2024-01-21T23:59:00Z"), endMs: utcMs("2024-01-22T00:00:00Z") };

		const segments = computeMissingSegments(resident, loaded, VN_EXCHANGE_SEMANTICS, undefined);

		expect(segments).toHaveLength(1);
		expect(segments[0].reason).toBe("not-fetched");
	});
});
