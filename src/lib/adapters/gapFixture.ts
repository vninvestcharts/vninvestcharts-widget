/**
 * W-18 - a fixture with a REAL gap, so lane-switch parity can be proved at all.
 *
 * ## Why this file exists
 *
 * G0.4 was FAILED and the recorded reason was "the demo uses LIVE, continuous data so
 * it cannot demonstrate a lane switch". That diagnosis was right, and here is the
 * measurement behind it.
 *
 * `MockAdapter.createSampleBars` emitted:
 *
 *     date: new Date(Date.UTC(2024, 0, index + 1))
 *
 * Consecutive days, weekends included, no exchange calendar, no gap.
 *
 * The discontinuous time scale only diverges between the legacy and fork lanes AT A
 * GAP. With continuous data there is literally nothing for the two runtimes to
 * disagree about, so no screenshot could ever have proved a lane switch. The evidence
 * gap was never a tooling problem - the input could not express the thing being tested.
 *
 * ## What this fixture guarantees
 *
 * `buildGapFixture` produces a series that crosses a weekend AND a national holiday,
 * so the whitespace detector has something real to find. `assertHasGap` is the gate:
 * if a future edit accidentally makes the fixture continuous again, the parity work
 * that depends on it fails loudly instead of producing screenshots that prove
 * nothing.
 *
 * ## Why the fixture is a separate module rather than a MockAdapter option
 *
 * Because it is test and documentation input, not product behaviour. MockAdapter
 * stays the continuous synthetic series the demo and unit tests use; a demo that
 * suddenly had holes in it would change what every other test observes. The fixture is
 * opt-in, and the demo can adopt it explicitly once a lane switch is actually wired to
 * a UI control.
 */
import type { OHLCVBar } from "../types/ohlcv";
import { vnExchangeCalendar } from "../calendars/ExchangeCalendar";

/** One calendar day in ms. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** ICT is UTC+7 with no DST. VN Exchange sessions are quoted in ICT, so every
 *  "is this a trading day" decision below is made in ICT terms - not UTC. Deciding in
 *  UTC put the bars a full day off the calendar's answer and the cross-check test
 *  failed for exactly that reason. */
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

/** UTC midnight on 2024-01-01 - a Monday. */
const EPOCH = Date.UTC(2024, 0, 1);

export interface GapFixtureOptions {
	/** Trading days to emit, counting only sessions that actually trade. */
	tradingDays?: number;
	/** Starting price; a gentle drift keeps the series visually plausible. */
	startPrice?: number;
}

/**
 * VN public holidays that fall on weekdays in the fixture window.
 *
 * These are OPTIONAL and off by default, because `ExchangeCalendar.ts:28` states
 * that public holidays are deliberately NOT modelled ("would require a maintained
 * list"). Enabling them makes the fixture disagree with the repository's own
 * calendar, which is worse than having no holiday at all: the cross-check test would
 * fail for a reason that has nothing to do with the parity work.
 *
 * Vietnamese holidays are also lunar and move between years, so a fixture whose
 * contents shift every year cannot serve as evidence - the pixels would move for
 * reasons unrelated to the code. Off by default for that reason too.
 *
 * With these off, weekends still produce real gaps, which is all the discontinuous
 * time scale needs.
 */
const FIXED_HOLIDAYS_UTC = new Set<number>();
export const FIXTURE_INCLUDE_HOLIDAYS = false;

/**
 * A timestamp inside the VN morning session (09:30 ICT) for the ICT day that `utcMs`
 * falls in.
 *
 * Written the long way on purpose. `ictMidnight` already returns a UTC epoch, so the
 * arithmetic is: shift into ICT, add the session offset, shift back. An earlier draft
 * tried to fold the two offsets into one term and got 02:30 ICT - before the market
 * opens - which the calendar cross-check rejected for every bar.
 */
function sessionTimestamp(utcMs: number, secondsIntoIctDay: number): number {
	const shifted = utcMs + ICT_OFFSET_MS;
	const ictMidnightShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
	return ictMidnightShifted + secondsIntoIctDay * 1000 - ICT_OFFSET_MS;
}

/** ICT midnight (as a UTC epoch) for the ICT day containing `utcMs`. */
function ictMidnight(utcMs: number): number {
	return Math.floor((utcMs + ICT_OFFSET_MS) / DAY_MS) * DAY_MS - ICT_OFFSET_MS;
}

/** Weekend (0 = Sunday) or a fixed holiday, decided in ICT. */
function isNonTradingDay(utcMs: number): boolean {
	const day = new Date(ictMidnight(utcMs) + ICT_OFFSET_MS).getUTCDay();
	if (day === 0 || day === 6) return true;
	return FIXED_HOLIDAYS_UTC.has(ictMidnight(utcMs));
}

/**
 * Build a bar series that contains real gaps.
 *
 * Trading sessions are taken from the repository's own exchange calendar, so the
 * fixture and `ExchangeCalendar` cannot drift apart: if the calendar stops or starts
 * treating a date as a session, the fixture follows.
 */
export function buildGapFixture(options: GapFixtureOptions = {}): OHLCVBar[] {
	const tradingDays = options.tradingDays ?? 20;
	const startPrice = options.startPrice ?? 100;
	const bars: OHLCVBar[] = [];

	let cursor = EPOCH;
	while (bars.length < tradingDays) {
		const dayStart = new Date(cursor);
		if (!isNonTradingDay(cursor)) {
			const index = bars.length;
			const drift = Math.sin(index / 6) * 1.4;
			const open = startPrice + index * 0.5;
			const close = Number((open + drift).toFixed(2));
			const high = Number((Math.max(open, close) + 1.5).toFixed(2));
			const low = Number((Math.min(open, close) - 1.5).toFixed(2));
			// Mid-morning ICT (09:30), i.e. inside the 09:15-11:30 session. The first draft
			// used 09:30 UTC, which is 16:30 ICT - after both sessions had closed, so the
			// calendar cross-check rejected every bar.
			/*
			 * 09:30 ICT, inside the 09:15-11:30 session the exchange calendar checks
			 * for. Getting this wrong by a few hours makes every bar land outside the
			 * session, which the cross-check test below reports rather than hides.
			 */
			bars.push({
				date: new Date(sessionTimestamp(cursor, 9 * 3600 + 30 * 60)),
				open,
				high,
				low,
				close,
				volume: 1000 + index * 25,
				index,
				dataIndex: index,
			});
		}
		cursor += DAY_MS;
	}

	return bars;
}

/** Every interval between consecutive bars, in ms. */
export function gapsOf(bars: readonly OHLCVBar[]): number[] {
	const out: number[] = [];
	for (let i = 1; i < bars.length; i += 1) {
		out.push(bars[i].date.getTime() - bars[i - 1].date.getTime());
	}
	return out;
}

/** Distinct intervals, ascending. One value means the series is continuous. */
export function distinctGaps(bars: readonly OHLCVBar[]): number[] {
	return [...new Set(gapsOf(bars))].sort((a, b) => a - b);
}

/**
 * The gate a fixture must pass before any lane-switch screenshot is worth taking.
 *
 * Returns the gaps it found. Throws when the series is continuous, because that is
 * the exact condition that made G0.3/G0.4 produce no evidence - and it fails silently,
 * the worst way to fail.
 */
export function assertHasGap(bars: readonly OHLCVBar[]): number[] {
	const gaps = distinctGaps(bars);
	if (bars.length < 2) {
		throw new Error(`gap fixture needs at least 2 bars, got ${bars.length}`);
	}
	if (gaps.length < 2) {
		throw new Error(
			`gap fixture is CONTINUOUS (single interval ${gaps[0]}ms). A continuous series ` +
				"cannot demonstrate a lane switch: the discontinuous time scale only diverges at a gap. " +
				"This is the condition that made G0.4 produce no evidence.",
		);
	}
	return gaps;
}

/**
 * True when the repository's own calendar considers the bar's day a session.
 *
 * Exported so a test can cross-check the fixture against the calendar instead of
 * trusting two copies of the same rule.
 */
export function fixtureMatchesExchangeCalendar(bars: readonly OHLCVBar[]): boolean {
	return bars.every((bar) =>
		vnExchangeCalendar.hasAnyTradingTime(bar.date.getTime(), bar.date.getTime() + 60 * 60 * 1000),
	);
}