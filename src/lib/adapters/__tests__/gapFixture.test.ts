import { describe, it, expect } from "vitest";
import {
	assertHasGap,
	buildGapFixture,
	distinctGaps,
	fixtureMatchesExchangeCalendar,
} from "../gapFixture";

/**
 * W-18 - the fixture has to be provably gap-bearing, or the lane-switch parity work
 * it exists to enable produces screenshots that prove nothing again.
 *
 * These are written as assertions about the FIXTURE, not about the discontinuous
 * scale: the scale's gap handling is what the parity round is for, and testing it
 * here would blur which failure belongs to whom.
 */
describe("W-18 gap fixture", () => {
	it("produces a series with more than one distinct interval", () => {
		const bars = buildGapFixture({ tradingDays: 20 });
		const gaps = distinctGaps(bars);

		// A continuous series has exactly one interval. That single value is the entire
		// reason G0.4 could not produce evidence.
		expect(gaps.length).toBeGreaterThan(1);
		expect(assertHasGap(bars).length).toBeGreaterThan(1);
	});

	it("emits exactly the requested number of TRADING days", () => {
		const bars = buildGapFixture({ tradingDays: 20 });
		expect(bars).toHaveLength(20);
		// Contiguous indices - the gap lives in the dates, never in the index space.
		expect(bars.map((b) => b.index)).toEqual([...Array(20).keys()]);
	});

	it("emits only trading days, and the skipped days are visible as gaps", () => {
		const bars = buildGapFixture({ tradingDays: 40 });
		// Bars sit at 09:30 ICT, which is 02:30 UTC the same day.
		const ictDays = bars.map((b) => new Date(b.date.getTime() + 7 * 3600 * 1000).getUTCDay());

		// No weekend bar is ever emitted - that is what "skips weekends" means for a
		// series of SESSIONS. An earlier version of this test asserted that Saturday and
		// Sunday appear among the bars, which is backwards: they are the gaps, not data.
		expect(ictDays.every((d) => d >= 1 && d <= 5)).toBe(true);

		// The weekends are nonetheless present in the series, as gaps wider than a day.
		const day = 24 * 60 * 60 * 1000;
		const intervals = bars
			.slice(1)
			.map((b, i) => b.date.getTime() - bars[i].date.getTime());
		expect(intervals.some((d) => d > day)).toBe(true);
		// 40 sessions from a Monday span ~8 weeks, so several weekends must appear.
		expect(intervals.filter((d) => d > day).length).toBeGreaterThanOrEqual(7);

		// And the repository's own calendar agrees on every emitted day.
		// ExchangeCalendar.ts:28 deliberately does not model public holidays, so the
		// fixture must not either - a disagreement would fail the cross-check for a
		// reason unrelated to parity.
		expect(fixtureMatchesExchangeCalendar(bars)).toBe(true);
	});

	it("agrees with the repository's own exchange calendar", () => {
		// Cross-check rather than a second copy of the rule: if ExchangeCalendar ever
		// disagrees, the fixture follows it and this test is what says so.
		const bars = buildGapFixture({ tradingDays: 30 });
		expect(fixtureMatchesExchangeCalendar(bars)).toBe(true);
	});

	it("has a strictly increasing, gap-bearing date sequence", () => {
		const bars = buildGapFixture({ tradingDays: 15 });
		for (let i = 1; i < bars.length; i += 1) {
			const delta = bars[i].date.getTime() - bars[i - 1].date.getTime();
			expect(delta).toBeGreaterThan(0);
			// At least one interval must exceed a single day.
			expect(delta).toBeGreaterThan(0);
		}
		const widest = Math.max(...bars.slice(1).map((b, i) => b.date.getTime() - bars[i].date.getTime()));
		const day = 24 * 60 * 60 * 1000;
		expect(widest).toBeGreaterThan(day);
	});

	it("assertHasGap REJECTS a continuous series", () => {
		// The negative case. Without it, assertHasGap would be an assertion that cannot
		// fail, which is the same defect as the vacuous self-tests fixed earlier today.
		const continuous = [1, 2, 3].map((index) => ({
			date: new Date(Date.UTC(2024, 0, index)),
			open: 100,
			high: 101,
			low: 99,
			close: 100,
			volume: 1,
			index,
			dataIndex: index,
		}));

		expect(() => assertHasGap(continuous)).toThrow(/CONTINUOUS/);
	});

	it("assertHasGap REJECTS a series too short to have a gap", () => {
		expect(() => assertHasGap([])).toThrow(/at least 2 bars/);
	});
});