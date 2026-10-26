/**
 * BU-01-05: Finality + correction policy tests.
 *
 * Validates FinalityMergeOptions semantics for:
 *  - filterBarsForFinalityMerge (pre-filter before chunkStore)
 *  - mergeBarsByDateWithFinality  (bar-level merge)
 *  - mergeBarPagesByDateWithFinality (page-level merge)
 */

import { describe, expect, it } from "vitest";
import {
	filterBarsForFinalityMerge,
	mergeBarsByDateWithFinality,
	mergeBarPagesByDateWithFinality,
	type FinalityMergeOptions,
} from "../historyDataUtils";
import type { OHLCVBar } from "../../../lib/types/ohlcv";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bar(dateMs: number, close = 100): OHLCVBar {
	return { date: new Date(dateMs), open: close, high: close, low: close, close, volume: 1, index: 0, dataIndex: 0 };
}

const NOW = 1_700_000_000_000; // fixed epoch for deterministic tests
const ONE_HOUR = 3_600_000;

// ---------------------------------------------------------------------------
// filterBarsForFinalityMerge
// ---------------------------------------------------------------------------

describe("filterBarsForFinalityMerge — immutable", () => {
	const opts: FinalityMergeOptions = { finalityMode: "immutable", nowMs: NOW };

	it("keeps bars whose timestamps are NOT in residentBars (new data)", () => {
		const resident = [bar(1000), bar(2000)];
		const incoming = [bar(3000), bar(4000)];
		const result = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(result.map((b) => b.date.getTime())).toEqual([3000, 4000]);
	});

	it("drops bars whose timestamps already exist in residentBars", () => {
		const resident = [bar(1000), bar(2000)];
		const incoming = [bar(1000, 999), bar(2000, 999)]; // same ts, different close
		const result = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(result).toHaveLength(0);
	});

	it("mixed: keeps new, drops existing", () => {
		const resident = [bar(1000), bar(2000)];
		const incoming = [bar(1000, 99), bar(3000)]; // 1000 exists, 3000 new
		const result = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(result.map((b) => b.date.getTime())).toEqual([3000]);
	});

	it("keeps a non-overlapping page without scanning resident timestamps", () => {
		const resident = [bar(10_000), bar(20_000), bar(30_000)];
		const incoming = [bar(1_000), bar(2_000), bar(3_000)];
		const result = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(result).toBe(incoming);
	});
});

describe("filterBarsForFinalityMerge — near-now-provisional", () => {
	const provisionalWindowMs = ONE_HOUR; // bars within 1h of now are provisional

	it("allows overwriting bar inside the provisional window", () => {
		const recentTs = NOW - 100; // well within 1h
		const opts: FinalityMergeOptions = { finalityMode: "near-now-provisional", nowMs: NOW, provisionalWindowMs };
		const resident = [bar(recentTs, 100)];
		const incoming = [bar(recentTs, 200)];
		const result = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(result).toHaveLength(1);
		expect(result[0].close).toBe(200);
	});

	it("drops bar outside the provisional window (older)", () => {
		const oldTs = NOW - ONE_HOUR - 1; // just outside window
		const opts: FinalityMergeOptions = { finalityMode: "near-now-provisional", nowMs: NOW, provisionalWindowMs };
		const resident = [bar(oldTs, 100)];
		const incoming = [bar(oldTs, 200)];
		const result = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(result).toHaveLength(0);
	});

	it("new timestamp always allowed regardless of window", () => {
		const opts: FinalityMergeOptions = { finalityMode: "near-now-provisional", nowMs: NOW, provisionalWindowMs };
		const resident = [bar(1000)];
		const incoming = [bar(999_000_000_000)]; // very old but new ts
		const result = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(result).toHaveLength(1);
	});
});

describe("filterBarsForFinalityMerge — historically-correctable", () => {
	const correctionLookbackMs = 7 * 24 * ONE_HOUR; // 7 days

	it("allows overwriting bar within correction lookback", () => {
		const ts = NOW - 2 * 24 * ONE_HOUR; // 2 days ago — inside 7-day window
		const opts: FinalityMergeOptions = { finalityMode: "historically-correctable", nowMs: NOW, correctionLookbackMs };
		const resident = [bar(ts, 100)];
		const incoming = [bar(ts, 200)];
		const result = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(result).toHaveLength(1);
		expect(result[0].close).toBe(200);
	});

	it("drops bar outside correction lookback", () => {
		const ts = NOW - 10 * 24 * ONE_HOUR; // 10 days ago — outside 7-day window
		const opts: FinalityMergeOptions = { finalityMode: "historically-correctable", nowMs: NOW, correctionLookbackMs };
		const resident = [bar(ts, 100)];
		const incoming = [bar(ts, 200)];
		const result = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(result).toHaveLength(0);
	});

	it("zero correctionLookbackMs = nothing mutable (treat like immutable)", () => {
		const ts = NOW - 1000;
		const opts: FinalityMergeOptions = { finalityMode: "historically-correctable", nowMs: NOW, correctionLookbackMs: 0 };
		const resident = [bar(ts, 100)];
		const incoming = [bar(ts, 200)];
		const result = filterBarsForFinalityMerge(incoming, resident, opts);
		expect(result).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// mergeBarsByDateWithFinality
// ---------------------------------------------------------------------------

describe("mergeBarsByDateWithFinality — immutable tail overwrite", () => {
	const opts: FinalityMergeOptions = { finalityMode: "immutable", nowMs: NOW };

	it("does NOT overwrite existing tail bar when immutable", () => {
		const existing = [bar(1000, 100)];
		const result = mergeBarsByDateWithFinality(existing, bar(1000, 200), opts);
		expect(result).toHaveLength(1);
		expect(result[0].close).toBe(100); // kept original
	});

	it("DOES append new bar with different timestamp", () => {
		const existing = [bar(1000)];
		const result = mergeBarsByDateWithFinality(existing, bar(2000), opts);
		expect(result).toHaveLength(2);
		expect(result[1].date.getTime()).toBe(2000);
	});
});

describe("mergeBarsByDateWithFinality — near-now-provisional tail overwrite", () => {
	const opts: FinalityMergeOptions = {
		finalityMode: "near-now-provisional",
		nowMs: NOW,
		provisionalWindowMs: ONE_HOUR,
	};

	it("overwrites tail bar when within provisional window", () => {
		const ts = NOW - 100;
		const existing = [bar(ts, 100)];
		const result = mergeBarsByDateWithFinality(existing, bar(ts, 200), opts);
		expect(result[0].close).toBe(200);
	});

	it("does NOT overwrite tail bar outside provisional window", () => {
		const ts = NOW - ONE_HOUR - 1;
		const existing = [bar(ts, 100)];
		const result = mergeBarsByDateWithFinality(existing, bar(ts, 200), opts);
		expect(result[0].close).toBe(100);
	});
});

describe("mergeBarsByDateWithFinality — historically-correctable mid-array", () => {
	const opts: FinalityMergeOptions = {
		finalityMode: "historically-correctable",
		nowMs: NOW,
		correctionLookbackMs: 7 * 24 * ONE_HOUR,
	};

	it("corrects bar inside lookback window (mid-array)", () => {
		const ts = NOW - 2 * 24 * ONE_HOUR;
		const existing = [bar(ts - 1000), bar(ts, 100), bar(ts + 1000)];
		const result = mergeBarsByDateWithFinality(existing, bar(ts, 999), opts);
		const updated = result.find((b) => b.date.getTime() === ts);
		expect(updated?.close).toBe(999);
	});

	it("does NOT correct bar outside lookback window", () => {
		const ts = NOW - 10 * 24 * ONE_HOUR;
		const existing = [bar(ts - 1000), bar(ts, 100), bar(ts + 1000)];
		const result = mergeBarsByDateWithFinality(existing, bar(ts, 999), opts);
		const kept = result.find((b) => b.date.getTime() === ts);
		expect(kept?.close).toBe(100);
	});
});

// ---------------------------------------------------------------------------
// mergeBarPagesByDateWithFinality
// ---------------------------------------------------------------------------

describe("mergeBarPagesByDateWithFinality", () => {
	it("applies finality to all bars in a page", () => {
		const opts: FinalityMergeOptions = { finalityMode: "immutable", nowMs: NOW };
		const existing = [bar(1000, 100), bar(2000, 200)];
		const incoming = [bar(1000, 999), bar(2000, 999), bar(3000, 300)];
		const result = mergeBarPagesByDateWithFinality(existing, incoming, opts);
		expect(result.find((b) => b.date.getTime() === 1000)?.close).toBe(100); // immutable, kept
		expect(result.find((b) => b.date.getTime() === 2000)?.close).toBe(200); // immutable, kept
		expect(result.find((b) => b.date.getTime() === 3000)?.close).toBe(300); // new, appended
		expect(result).toHaveLength(3);
	});

	it("correctable page corrects within lookback only", () => {
		const correctionLookbackMs = 3 * 24 * ONE_HOUR;
		const opts: FinalityMergeOptions = { finalityMode: "historically-correctable", nowMs: NOW, correctionLookbackMs };
		const recentTs = NOW - ONE_HOUR;
		const oldTs = NOW - 5 * 24 * ONE_HOUR;
		const existing = [bar(oldTs, 100), bar(recentTs, 100)];
		const incoming = [bar(oldTs, 999), bar(recentTs, 999)];
		const result = mergeBarPagesByDateWithFinality(existing, incoming, opts);
		expect(result.find((b) => b.date.getTime() === oldTs)?.close).toBe(100); // outside lookback
		expect(result.find((b) => b.date.getTime() === recentTs)?.close).toBe(999); // corrected
	});
});
