/**
 * BU-01-06: Source-class golden tests.
 *
 * These tests verify the complete semantics pipeline for every source class:
 *   - exact-range
 *   - anchor-before / anchor-after
 *   - window-hint
 *   - session-based (exchange-calendar)
 *   - finite-snapshot
 *
 * For each class the test verifies:
 *   1. computeMissingSegments produces correct gap reasons
 *   2. The correct subset of segments is marked "not-fetched" (fetchable)
 *   3. filterBarsForFinalityMerge respects the declared finalityMode
 *   4. Calendar classification works end-to-end for session-based sources
 */

import { describe, expect, it } from "vitest";
import { computeMissingSegments } from "../historyWindowPlanner";
import { filterBarsForFinalityMerge, type FinalityMergeOptions } from "../historyDataUtils";
import { vnExchangeCalendar } from "../../../lib/calendars";
import type { SourceSemanticsDescriptor } from "../../../lib/adapters";
import type { OHLCVBar } from "../../../lib/types/ohlcv";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bar(dateMs: number, close = 100): OHLCVBar {
	return { date: new Date(dateMs), open: close, high: close, low: close, close, volume: 1, index: 0, dataIndex: 0 };
}

function makeSemantics(overrides: Partial<SourceSemanticsDescriptor>): SourceSemanticsDescriptor {
	return {
		sourceId: "golden-test",
		sourceContractVersion: "1.0",
		instrumentClass: "equity",
		coverageMode: "anchor-before",
		sessionModel: "continuous",
		timezone: "UTC",
		supportsExactRangeFetch: false,
		supportsBackwardAnchor: true,
		supportsForwardAnchor: false,
		supportsLiveBars: false,
		finalityMode: "immutable",
		expectedGapReasons: ["not-fetched", "boundary-exhausted"],
		...overrides,
	};
}

const D1 = 24 * 3_600_000; // 1 day in ms
const NOW = 1_700_000_000_000;

// Resident window: [NOW-10d, NOW]
const RESIDENT = { startMs: NOW - 10 * D1, endMs: NOW };
// Loaded window: [NOW-5d, NOW-2d] — gaps on both sides
const LOADED_MIDDLE = { startMs: NOW - 5 * D1, endMs: NOW - 2 * D1 };
// Loaded window that covers exactly
const LOADED_FULL = { startMs: NOW - 10 * D1, endMs: NOW };
// Loaded window covering right but not left
const LOADED_RIGHT_ONLY = { startMs: NOW - 3 * D1, endMs: NOW };
// Loaded window covering left but not right
const LOADED_LEFT_ONLY = { startMs: NOW - 10 * D1, endMs: NOW - 5 * D1 };

// ---------------------------------------------------------------------------
// 1. exact-range source class
// ---------------------------------------------------------------------------

describe("Golden: exact-range source class", () => {
	const semantics = makeSemantics({
		coverageMode: "exact-range",
		sessionModel: "continuous",
		supportsExactRangeFetch: true,
		finalityMode: "immutable",
	});

	it("produces 'not-fetched' left segment when loaded starts late", () => {
		const segments = computeMissingSegments(RESIDENT, LOADED_RIGHT_ONLY, semantics);
		expect(segments).toHaveLength(1);
		expect(segments[0].side).toBe("left");
		expect(segments[0].reason).toBe("not-fetched");
	});

	it("produces 'not-fetched' right segment when loaded ends early", () => {
		const segments = computeMissingSegments(RESIDENT, LOADED_LEFT_ONLY, semantics);
		expect(segments).toHaveLength(1);
		expect(segments[0].side).toBe("right");
		expect(segments[0].reason).toBe("not-fetched");
	});

	it("produces both segments when loaded covers middle only", () => {
		const segments = computeMissingSegments(RESIDENT, LOADED_MIDDLE, semantics);
		expect(segments).toHaveLength(2);
		expect(segments.every((s) => s.reason === "not-fetched")).toBe(true);
	});

	it("produces no segments when fully loaded", () => {
		const segments = computeMissingSegments(RESIDENT, LOADED_FULL, semantics);
		expect(segments).toHaveLength(0);
	});

	it("immutable finality: does not overwrite resident bars", () => {
		const opts: FinalityMergeOptions = { finalityMode: "immutable", nowMs: NOW };
		const resident = [bar(1000, 100), bar(2000, 100)];
		const incoming = [bar(1000, 999), bar(3000, 200)]; // 1000 exists, 3000 new
		const filtered = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(filtered.map((b) => b.date.getTime())).toEqual([3000]);
	});
});

// ---------------------------------------------------------------------------
// 2. anchor-before source class
// ---------------------------------------------------------------------------

describe("Golden: anchor-before source class", () => {
	const semantics = makeSemantics({
		coverageMode: "anchor-before",
		sessionModel: "continuous",
		supportsBackwardAnchor: true,
		finalityMode: "immutable",
	});

	it("left gap is not-fetched when loaded starts after resident", () => {
		const segments = computeMissingSegments(RESIDENT, LOADED_RIGHT_ONLY, semantics);
		const leftSeg = segments.find((s) => s.side === "left");
		expect(leftSeg?.reason).toBe("not-fetched");
	});

	it("no segments when loaded covers full resident", () => {
		expect(computeMissingSegments(RESIDENT, LOADED_FULL, semantics)).toHaveLength(0);
	});

	it("null loaded returns single left-segment for full resident", () => {
		const segments = computeMissingSegments(RESIDENT, null, semantics);
		expect(segments).toHaveLength(1);
		expect(segments[0].side).toBe("left");
		expect(segments[0].reason).toBe("not-fetched");
	});
});

// ---------------------------------------------------------------------------
// 3. anchor-after source class
// ---------------------------------------------------------------------------

describe("Golden: anchor-after source class", () => {
	const semantics = makeSemantics({
		coverageMode: "anchor-after",
		sessionModel: "continuous",
		supportsForwardAnchor: true,
		finalityMode: "near-now-provisional",
	});

	it("right gap is not-fetched when loaded ends before resident", () => {
		const segments = computeMissingSegments(RESIDENT, LOADED_LEFT_ONLY, semantics);
		const rightSeg = segments.find((s) => s.side === "right");
		expect(rightSeg?.reason).toBe("not-fetched");
	});

	it("near-now-provisional: allows overwriting recent bar", () => {
		const recentTs = NOW - 1000;
		const opts: FinalityMergeOptions = {
			finalityMode: "near-now-provisional",
			nowMs: NOW,
			provisionalWindowMs: 3_600_000, // 1h
		};
		const resident = [bar(recentTs, 100)];
		const incoming = [bar(recentTs, 200)];
		const filtered = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].close).toBe(200);
	});

	it("near-now-provisional: keeps old bar outside provisional window", () => {
		const oldTs = NOW - 2 * D1;
		const opts: FinalityMergeOptions = {
			finalityMode: "near-now-provisional",
			nowMs: NOW,
			provisionalWindowMs: 3_600_000,
		};
		const resident = [bar(oldTs, 100)];
		const incoming = [bar(oldTs, 200)];
		const filtered = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(filtered).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 4. window-hint source class
// ---------------------------------------------------------------------------

describe("Golden: window-hint source class", () => {
	const semantics = makeSemantics({
		coverageMode: "window-hint",
		sessionModel: "continuous",
		supportsExactRangeFetch: false,
		finalityMode: "historically-correctable",
		correctionLookbackMs: 7 * D1,
	});

	it("both sides return not-fetched when loaded covers middle", () => {
		const segments = computeMissingSegments(RESIDENT, LOADED_MIDDLE, semantics);
		expect(segments).toHaveLength(2);
		expect(segments.every((s) => s.reason === "not-fetched")).toBe(true);
	});

	it("historically-correctable: corrects bar within lookback", () => {
		const ts = NOW - 2 * D1; // 2 days ago — inside 7-day window
		const opts: FinalityMergeOptions = {
			finalityMode: "historically-correctable",
			nowMs: NOW,
			correctionLookbackMs: 7 * D1,
		};
		const resident = [bar(ts, 100)];
		const incoming = [bar(ts, 999)];
		const filtered = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].close).toBe(999);
	});

	it("historically-correctable: does NOT correct bar older than lookback", () => {
		const ts = NOW - 10 * D1; // 10 days ago — outside 7-day window
		const opts: FinalityMergeOptions = {
			finalityMode: "historically-correctable",
			nowMs: NOW,
			correctionLookbackMs: 7 * D1,
		};
		const resident = [bar(ts, 100)];
		const incoming = [bar(ts, 999)];
		const filtered = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(filtered).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 5. session-based (exchange-calendar) source class
// ---------------------------------------------------------------------------

describe("Golden: session-based / exchange-calendar source class", () => {
	// VN exchange: Mon-Fri 09:15-11:30 / 13:00-14:45 ICT (UTC+7)
	const semantics = makeSemantics({
		coverageMode: "anchor-before",
		sessionModel: "exchange-calendar",
		sessionCalendarId: "vn-exchange-calendar",
		timezone: "Asia/Ho_Chi_Minh",
		finalityMode: "immutable",
	});

	// Saturday midnight ICT = Friday 17:00 UTC
	// Sunday midnight ICT is Saturday 17:00 UTC
	// A gap spanning Saturday-Sunday only → market-closed
	// UTC+7: Saturday 2024-11-09 00:00 ICT = 2024-11-08 17:00 UTC
	const SAT_ICT_MS = Date.UTC(2024, 10, 8, 17, 0, 0); // Sat 00:00 ICT
	const SUN_ICT_MS = Date.UTC(2024, 10, 9, 17, 0, 0); // Sun 00:00 ICT
	const MON_TRADING_ICT_MS = Date.UTC(2024, 10, 11, 2, 15, 0); // Mon Nov 11 09:15 ICT (2024-11-10 is Sunday)

	it("gap that spans weekend only is classified as market-closed", () => {
		const residentSpanningWeekend = { startMs: SAT_ICT_MS, endMs: SUN_ICT_MS };
		const loadedEndFriday = { startMs: SAT_ICT_MS - D1, endMs: SAT_ICT_MS };
		const segments = computeMissingSegments(residentSpanningWeekend, loadedEndFriday, semantics, vnExchangeCalendar);
		expect(segments).toHaveLength(1);
		expect(segments[0].reason).toBe("market-closed");
	});

	it("gap that includes Monday trading time is classified as not-fetched", () => {
		const residentSpanning = { startMs: SAT_ICT_MS, endMs: MON_TRADING_ICT_MS + D1 };
		const loadedEndFriday = { startMs: SAT_ICT_MS - D1, endMs: SAT_ICT_MS };
		const segments = computeMissingSegments(residentSpanning, loadedEndFriday, semantics, vnExchangeCalendar);
		expect(segments).toHaveLength(1);
		expect(segments[0].reason).toBe("not-fetched");
	});

	it("continuous source ignores calendar (always not-fetched)", () => {
		const continuousSemantics = makeSemantics({
			sessionModel: "continuous",
		});
		const residentSpanningWeekend = { startMs: SAT_ICT_MS, endMs: SUN_ICT_MS };
		const loadedEndFriday = { startMs: SAT_ICT_MS - D1, endMs: SAT_ICT_MS };
		const segments = computeMissingSegments(residentSpanningWeekend, loadedEndFriday, continuousSemantics, vnExchangeCalendar);
		// Calendar provided but sessionModel is continuous → reason = not-fetched
		expect(segments[0].reason).toBe("not-fetched");
	});

	it("fetchable segments exclude market-closed gaps", () => {
		const residentSpanningWeekend = { startMs: SAT_ICT_MS, endMs: SUN_ICT_MS };
		const loadedEndFriday = { startMs: SAT_ICT_MS - D1, endMs: SAT_ICT_MS };
		const all = computeMissingSegments(residentSpanningWeekend, loadedEndFriday, semantics, vnExchangeCalendar);
		const fetchable = all.filter((s) => s.reason === "not-fetched");
		expect(fetchable).toHaveLength(0); // weekend gap is not fetchable
	});
});

// ---------------------------------------------------------------------------
// 6. finite-snapshot source class
// ---------------------------------------------------------------------------

describe("Golden: finite-snapshot source class", () => {
	const semantics = makeSemantics({
		coverageMode: "finite-snapshot",
		sessionModel: "continuous",
		supportsBackwardAnchor: false,
		supportsForwardAnchor: false,
		finalityMode: "immutable",
	});

	it("all gaps are classified as boundary-exhausted for finite-snapshot", () => {
		const segments = computeMissingSegments(RESIDENT, LOADED_MIDDLE, semantics);
		expect(segments).toHaveLength(2);
		expect(segments.every((s) => s.reason === "boundary-exhausted")).toBe(true);
	});

	it("no fetchable segments for finite-snapshot (all boundary-exhausted)", () => {
		const segments = computeMissingSegments(RESIDENT, LOADED_MIDDLE, semantics);
		const fetchable = segments.filter((s) => s.reason === "not-fetched");
		expect(fetchable).toHaveLength(0);
	});

	it("null loaded still returns boundary-exhausted (no data source to expand)", () => {
		const segments = computeMissingSegments(RESIDENT, null, semantics);
		expect(segments).toHaveLength(1);
		expect(segments[0].reason).toBe("boundary-exhausted");
	});

	it("immutable finality: new timestamps accepted, existing rejected", () => {
		const opts: FinalityMergeOptions = { finalityMode: "immutable", nowMs: NOW };
		const resident = [bar(1000), bar(2000)];
		const incoming = [bar(1000, 99), bar(2000, 99), bar(3000)]; // first two rejected
		const filtered = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(filtered.map((b) => b.date.getTime())).toEqual([3000]);
	});
});

// ---------------------------------------------------------------------------
// Cross-class invariants
// ---------------------------------------------------------------------------

describe("Cross-class invariant: fetchable = reason 'not-fetched' only", () => {
	it("only not-fetched segments should be scheduled for fetch", () => {
		const allReasons = ["not-fetched", "boundary-exhausted", "market-closed", "source-no-data"];
		const fetchable = allReasons.filter((r) => r === "not-fetched");
		expect(fetchable).toEqual(["not-fetched"]);
	});

	it("computeMissingSegments without semantics defaults to not-fetched", () => {
		const segments = computeMissingSegments(RESIDENT, LOADED_MIDDLE);
		expect(segments.every((s) => s.reason === "not-fetched")).toBe(true);
	});

	it("computeMissingSegments with no-calendar semantics (exchange-calendar but no calendar instance) treats as not-fetched", () => {
		const semantics = makeSemantics({ sessionModel: "exchange-calendar" });
		// No calendar passed → classifyGapReason falls through to 'not-fetched'
		const segments = computeMissingSegments(RESIDENT, LOADED_MIDDLE, semantics, undefined);
		expect(segments.every((s) => s.reason === "not-fetched")).toBe(true);
	});
});
