/**
 * ExchangeCalendar — minimal interface for session-based gap classification.
 *
 * Used by the history planner to distinguish "market closed" gaps (weekends,
 * outside session hours) from "not fetched" gaps that require a backfill request.
 *
 * Intentionally minimal: only public holidays are NOT modelled here (they change
 * annually and require a data-maintenance concern separate from core logic).
 */

export interface ExchangeCalendar {
	readonly calendarId: string;
	/**
	 * Returns true if ANY trading time exists inside [fromMs, toMs).
	 * A missing segment whose entire range returns false here should be
	 * reclassified as `market-closed` and NOT enqueued for backfill.
	 */
	hasAnyTradingTime(fromMs: number, toMs: number): boolean;
}

// ---------------------------------------------------------------------------
// VN Exchange Calendar (HOSE / HNX)
// ---------------------------------------------------------------------------
// Trading hours (UTC+7, ICT):
//   Morning continuous: 09:15 – 11:30
//   Afternoon continuous: 13:00 – 14:45
// Market is closed on weekends (Saturday = day 6, Sunday = day 0 in Date.getDay).
// Public holidays are NOT modelled (would require a maintained list).
// ---------------------------------------------------------------------------

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7

// Session windows in seconds-of-day (ICT)
const SESSION_WINDOWS: Array<[number, number]> = [
	[9 * 3600 + 15 * 60, 11 * 3600 + 30 * 60], // 09:15 – 11:30
	[13 * 3600, 14 * 3600 + 45 * 60],           // 13:00 – 14:45
];

/**
 * Returns seconds elapsed since midnight ICT for the given UTC epoch (ms).
 */
function secondsOfDayICT(epochMs: number): number {
	const ictMs = epochMs + ICT_OFFSET_MS;
	const midnightMs = Math.floor(ictMs / (24 * 3600 * 1000)) * (24 * 3600 * 1000);
	return Math.floor((ictMs - midnightMs) / 1000);
}

/**
 * Returns 0 (Sun) – 6 (Sat) in ICT timezone.
 */
function dayOfWeekICT(epochMs: number): number {
	return new Date(epochMs + ICT_OFFSET_MS).getUTCDay();
}

/**
 * Returns the UTC epoch (ms) for midnight ICT at the start of the ICT day
 * that contains `epochMs`.
 */
function midnightICT(epochMs: number): number {
	return Math.floor((epochMs + ICT_OFFSET_MS) / (24 * 3600 * 1000)) * (24 * 3600 * 1000) - ICT_OFFSET_MS;
}

function isTradingDayICT(epochMs: number): boolean {
	const dow = dayOfWeekICT(epochMs);
	return dow >= 1 && dow <= 5; // Mon–Fri
}

/**
 * Check if ANY part of [fromMs, toMs) overlaps with a trading session.
 * Iterates day-by-day to handle ranges spanning multiple days efficiently.
 */
function vnHasAnyTradingTime(fromMs: number, toMs: number): boolean {
	if (fromMs >= toMs) return false;

	const DAY_MS = 24 * 3600 * 1000;

	// Walk through each ICT calendar day that intersects [fromMs, toMs)
	let dayStart = midnightICT(fromMs);
	while (dayStart < toMs) {
		const dayEnd = dayStart + DAY_MS;

		if (isTradingDayICT(dayStart + ICT_OFFSET_MS)) {
			// Check each session window for this day
			for (const [sessionStartSec, sessionEndSec] of SESSION_WINDOWS) {
				const sessionFromMs = dayStart + sessionStartSec * 1000;
				const sessionToMs = dayStart + sessionEndSec * 1000;
				// Overlap: [fromMs, toMs) ∩ [sessionFromMs, sessionToMs)
				if (fromMs < sessionToMs && toMs > sessionFromMs) {
					return true;
				}
			}
		}

		dayStart = dayEnd;
	}

	return false;
}

/**
 * VN Exchange Calendar singleton for HOSE/HNX trading hours.
 */
export const vnExchangeCalendar: ExchangeCalendar = {
	calendarId: "vn-exchange-calendar",
	hasAnyTradingTime: vnHasAnyTradingTime,
};

// Additional helper for single-point trading time check (used in tests / UI)
export function isVNTradingTime(epochMs: number): boolean {
	if (!isTradingDayICT(epochMs)) return false;
	const sod = secondsOfDayICT(epochMs);
	return SESSION_WINDOWS.some(([start, end]) => sod >= start && sod < end);
}
