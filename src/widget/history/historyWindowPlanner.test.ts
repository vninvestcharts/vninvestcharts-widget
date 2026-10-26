/**
 * historyWindowPlanner.test.ts
 *
 * Unit tests for the resident 3x window planner.
 */
import { describe, it, expect } from "vitest";
import {
	computeResidentTarget,
	computeMissingSegments,
	computeTrimWindow,
	prioritizeMissingSegments,
	resolveResidentRetentionFactor,
	type VisibleWindow,
	type ResidentWindow,
} from "./historyWindowPlanner";
import { vnExchangeCalendar } from "../../lib/calendars";
import type { SourceSemanticsDescriptor } from "../../lib/adapters";

// Helpers
const win = (startMs: number, endMs: number): VisibleWindow => ({ startMs, endMs });
const res = (startMs: number, endMs: number): ResidentWindow => ({ startMs, endMs });

function makeSemantics(overrides: Partial<SourceSemanticsDescriptor>): SourceSemanticsDescriptor {
	return {
		sourceId: "retention-test",
		sourceContractVersion: "retention-v1",
		instrumentClass: "equity",
		coverageMode: "exact-range",
		sessionModel: "continuous",
		timezone: "UTC",
		supportsExactRangeFetch: true,
		supportsBackwardAnchor: false,
		supportsForwardAnchor: false,
		supportsLiveBars: false,
		finalityMode: "immutable",
		expectedGapReasons: ["not-fetched"],
		...overrides,
	};
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe("historyWindowPlanner — mandatory spec cases", () => {
	it("visible window is centered inside resident 3x target when data is sufficient", () => {
		// Visible: 10:00 → 11:00 (60 min span)
		const start = 10 * 60 * 60 * 1000;
		const end = 11 * 60 * 60 * 1000;
		const span = end - start; // 60 min

		const target = computeResidentTarget(win(start, end));

		expect(target.startMs).toBe(start - span); // 09:00
		expect(target.endMs).toBe(end + span);     // 12:00

		// Visible window midpoint should be centered in resident window
		const visMid = (start + end) / 2;
		const resMid = (target.startMs + target.endMs) / 2;
		expect(resMid).toBe(visMid);
	});

	it("when panning left, planner only requests the missing-left segment", () => {
		// Visible has panned left; loaded only covers the right portion
		const resident = res(1000, 7000);
		const loaded = res(3000, 7000); // missing left: 1000→3000

		const segments = computeMissingSegments(resident, loaded);

		expect(segments).toHaveLength(1);
		expect(segments[0].side).toBe("left");
		expect(segments[0].from).toBe(1000);
		expect(segments[0].to).toBe(3000);
	});

	it("after merging a new page, resident window is trimmed back to target rather than growing unbounded", () => {
		// computeTrimWindow should be narrower than or equal to a very large hypothetical loaded window
		const resident = res(1000, 7000);
		const trim = computeTrimWindow(resident);

		// Trim window should be wider than resident (hysteresis padding)
		expect(trim.startMs).toBeLessThan(resident.startMs);
		expect(trim.endMs).toBeGreaterThan(resident.endMs);

		// But it should not grow by more than 50% of the resident span on each side (default hysteresisRatio=0.5)
		const residentSpan = resident.endMs - resident.startMs; // 6000
		const maxPad = residentSpan * 0.5; // 3000
		expect(resident.startMs - trim.startMs).toBeLessThanOrEqual(maxPad);
		expect(trim.endMs - resident.endMs).toBeLessThanOrEqual(maxPad);
	});
});

describe("historyWindowPlanner — additional behavior", () => {
	it("resident target spans exactly 3x the visible width (1x left buffer + 1x visible + 1x right buffer)", () => {
		const start = 0;
		const end = 100;
		const target = computeResidentTarget(win(start, end));

		// Total resident span should be 3× visible span
		const residentSpan = target.endMs - target.startMs;
		const visibleSpan = end - start;
		expect(residentSpan).toBe(visibleSpan * 3);
	});

	it("minSpanMs floor prevents degenerate window when visible span is zero", () => {
		const point = 5000;
		const minSpanMs = 60_000;
		const target = computeResidentTarget(win(point, point), minSpanMs);

		expect(target.endMs - target.startMs).toBe(minSpanMs * 2);
	});

	it("no missing segments when loaded fully covers resident range", () => {
		const resident = res(1000, 5000);
		const loaded = res(500, 6000); // loaded is wider than resident

		const segments = computeMissingSegments(resident, loaded);
		expect(segments).toHaveLength(0);
	});

	it("no missing segments when loaded exactly matches resident range", () => {
		const resident = res(1000, 5000);
		const loaded = res(1000, 5000);

		const segments = computeMissingSegments(resident, loaded);
		expect(segments).toHaveLength(0);
	});

	it("when panning right, planner only requests the missing-right segment", () => {
		const resident = res(1000, 7000);
		const loaded = res(1000, 4000); // missing right: 4000→7000

		const segments = computeMissingSegments(resident, loaded);

		expect(segments).toHaveLength(1);
		expect(segments[0].side).toBe("right");
		expect(segments[0].from).toBe(4000);
		expect(segments[0].to).toBe(7000);
	});

	it("when no data loaded, returns a single full-range left segment", () => {
		const resident = res(1000, 7000);

		const segments = computeMissingSegments(resident, null);
		expect(segments).toHaveLength(1);
		expect(segments[0].side).toBe("left");
	});

	it("when loaded is narrower on both sides, returns both segments", () => {
		const resident = res(1000, 7000);
		const loaded = res(2000, 6000);

		const segments = computeMissingSegments(resident, loaded);
		expect(segments).toHaveLength(2);

		const left = segments.find((s) => s.side === "left");
		const right = segments.find((s) => s.side === "right");
		expect(left).toBeDefined();
		expect(right).toBeDefined();
		expect(left!.from).toBe(1000);
		expect(left!.to).toBe(2000);
		expect(right!.from).toBe(6000);
		expect(right!.to).toBe(7000);
	});

	it("finite-snapshot sources mark missing segments as boundary-exhausted", () => {
		const resident = res(1000, 7000);
		const loaded = res(3000, 7000);

		const segments = computeMissingSegments(resident, loaded, {
			sourceId: "local",
			sourceContractVersion: "local-archive-v1",
			instrumentClass: "custom",
			coverageMode: "finite-snapshot",
			sessionModel: "continuous",
			timezone: "UTC",
			supportsExactRangeFetch: false,
			supportsBackwardAnchor: true,
			supportsForwardAnchor: false,
			supportsLiveBars: false,
			finalityMode: "immutable",
			expectedGapReasons: ["boundary-exhausted"],
		});

		expect(segments).toHaveLength(1);
		expect(segments[0].reason).toBe("boundary-exhausted");
	});

	it("computeTrimWindow with hysteresisRatio=0 returns resident window unchanged", () => {
		const resident = res(1000, 5000);
		const trim = computeTrimWindow(resident, 0);
		expect(trim.startMs).toBe(resident.startMs);
		expect(trim.endMs).toBe(resident.endMs);
	});

	it("computeTrimWindow with hysteresisRatio=1 pads by one full resident span on each side", () => {
		const resident = res(1000, 3000); // span = 2000
		const trim = computeTrimWindow(resident, 1);
		expect(trim.startMs).toBe(1000 - 2000); // -1000
		expect(trim.endMs).toBe(3000 + 2000);   // 5000
	});

	it("computeResidentTarget handles negative startMs (unix timestamps before epoch) without panic", () => {
		const target = computeResidentTarget(win(-5000, 5000));
		expect(target.startMs).toBe(-5000 - 10000);
		expect(target.endMs).toBe(5000 + 10000);
	});

	it("adaptive retention factor applies 3.0x for <= 2k visible bars", () => {
		const target = computeResidentTarget(win(1000, 2000), 0, 1500);
		const span = target.endMs - target.startMs;
		expect(span).toBe(1000 * 3.0); // 3.0x visible span
	});

	it("adaptive retention factor applies 2.0x for 2k-10k visible bars", () => {
		const target = computeResidentTarget(win(1000, 2000), 0, 5000);
		const span = target.endMs - target.startMs;
		expect(span).toBe(1000 * 2.0); // 2.0x visible span
	});

	it("adaptive retention factor applies 1.4x for 10k-30k visible bars", () => {
		const target = computeResidentTarget(win(1000, 2000), 0, 15000);
		const span = target.endMs - target.startMs;
		expect(span).toBe(1000 * 1.4); // 1.4x visible span
	});

	it("adaptive retention factor applies 1.2x for > 30k visible bars", () => {
		const target = computeResidentTarget(win(1000, 2000), 0, 40000);
		const span = target.endMs - target.startMs;
		expect(span).toBe(1000 * 1.2); // 1.2x visible span
	});

	it("session-based exact-range sources retain slightly more than continuous sources at the same density", () => {
		const continuousFactor = resolveResidentRetentionFactor(5000, makeSemantics({
			coverageMode: "exact-range",
			sessionModel: "continuous",
		}));
		const sessionFactor = resolveResidentRetentionFactor(5000, makeSemantics({
			coverageMode: "exact-range",
			sessionModel: "exchange-calendar",
			sessionCalendarId: "vn-exchange-calendar",
			timezone: "Asia/Ho_Chi_Minh",
		}));

		expect(continuousFactor).toBe(2.0);
		expect(sessionFactor).toBe(2.15);
	});

	it("window-hint session-based sources trim more aggressively than exact-range sources", () => {
		const factor = resolveResidentRetentionFactor(5000, makeSemantics({
			coverageMode: "window-hint",
			sessionModel: "exchange-calendar",
			sessionCalendarId: "vn-exchange-calendar",
			timezone: "Asia/Ho_Chi_Minh",
		}));

		expect(factor).toBe(1.9);
	});

	it("finite-snapshot sources cap retention even when the density base would be 3.0x", () => {
		const factor = resolveResidentRetentionFactor(1500, makeSemantics({
			coverageMode: "finite-snapshot",
			supportsExactRangeFetch: false,
			supportsBackwardAnchor: true,
		}));

		expect(factor).toBe(1.5);
	});

	it("computeResidentTarget caps runtime retention override to the source-aware base factor", () => {
		const target = computeResidentTarget(
			win(1000, 2000),
			0,
			5000,
			makeSemantics({
				coverageMode: "window-hint",
				sessionModel: "exchange-calendar",
				sessionCalendarId: "vn-exchange-calendar",
				timezone: "Asia/Ho_Chi_Minh",
			}),
			3.0,
		);

		expect(target.endMs - target.startMs).toBe(1900);
	});

	it("computeResidentTarget honors a lower runtime override after backpressure reduces retention", () => {
		const target = computeResidentTarget(
			win(1000, 2000),
			0,
			5000,
			makeSemantics({
				coverageMode: "anchor-before",
				supportsExactRangeFetch: false,
				supportsBackwardAnchor: true,
			}),
			1.4,
		);

		expect(target.endMs - target.startMs).toBe(1400);
	});

	describe("source-class matrix coverage", () => {
		const resident = res(1000, 7000);
		const loadedMiddle = res(2000, 6000);
		const fetchableCases = [
			{
				label: "exact-range",
				semantics: makeSemantics({
					coverageMode: "exact-range",
					supportsExactRangeFetch: true,
					supportsBackwardAnchor: false,
					supportsForwardAnchor: false,
				}),
			},
			{
				label: "anchor-before",
				semantics: makeSemantics({
					coverageMode: "anchor-before",
					supportsExactRangeFetch: false,
					supportsBackwardAnchor: true,
					supportsForwardAnchor: false,
				}),
			},
			{
				label: "anchor-after",
				semantics: makeSemantics({
					coverageMode: "anchor-after",
					supportsExactRangeFetch: false,
					supportsBackwardAnchor: false,
					supportsForwardAnchor: true,
				}),
			},
			{
				label: "window-hint",
				semantics: makeSemantics({
					coverageMode: "window-hint",
					supportsExactRangeFetch: false,
					supportsBackwardAnchor: false,
					supportsForwardAnchor: false,
				}),
			},
		] as const;

		for (const testCase of fetchableCases) {
			it(`${testCase.label} keeps both-side middle gaps fetchable`, () => {
				const segments = computeMissingSegments(resident, loadedMiddle, testCase.semantics);

				expect(segments).toHaveLength(2);
				expect(segments.map((segment) => segment.reason)).toEqual(["not-fetched", "not-fetched"]);
			});
		}

		it("finite-snapshot marks both-side middle gaps as boundary-exhausted", () => {
			const segments = computeMissingSegments(resident, loadedMiddle, makeSemantics({
				coverageMode: "finite-snapshot",
				supportsExactRangeFetch: false,
				supportsBackwardAnchor: false,
				supportsForwardAnchor: false,
			}));

			expect(segments).toHaveLength(2);
			expect(segments.map((segment) => segment.reason)).toEqual(["boundary-exhausted", "boundary-exhausted"]);
		});

		it("exchange-calendar marks weekend-only gaps as market-closed in planner classification", () => {
			const saturdayIctStartMs = Date.UTC(2024, 10, 8, 17, 0, 0);
			const sundayIctStartMs = Date.UTC(2024, 10, 9, 17, 0, 0);
			const residentWeekend = res(saturdayIctStartMs, sundayIctStartMs);
			const loadedEndFriday = res(saturdayIctStartMs - DAY_MS, saturdayIctStartMs);
			const segments = computeMissingSegments(
				residentWeekend,
				loadedEndFriday,
				makeSemantics({
					coverageMode: "anchor-before",
					sessionModel: "exchange-calendar",
					sessionCalendarId: "vn-exchange-calendar",
					timezone: "Asia/Ho_Chi_Minh",
					supportsExactRangeFetch: false,
					supportsBackwardAnchor: true,
				}),
				vnExchangeCalendar,
			);

			expect(segments).toHaveLength(1);
			expect(segments[0].reason).toBe("market-closed");
		});

		it("anchor-before exchange-calendar retention clamps to the hard max at low density", () => {
			const factor = resolveResidentRetentionFactor(1500, makeSemantics({
				coverageMode: "anchor-before",
				sessionModel: "exchange-calendar",
				sessionCalendarId: "vn-exchange-calendar",
				timezone: "Asia/Ho_Chi_Minh",
				supportsExactRangeFetch: false,
				supportsBackwardAnchor: true,
			}));

			expect(factor).toBe(3.0);
		});

		it("window-hint retention clamps to the minimum floor at very high density", () => {
			const factor = resolveResidentRetentionFactor(50000, makeSemantics({
				coverageMode: "window-hint",
				supportsExactRangeFetch: false,
				supportsBackwardAnchor: false,
				supportsForwardAnchor: false,
			}));

			expect(factor).toBe(1.15);
		});

		it("anchor-after keeps the same retention bump as anchor-before at the same density", () => {
			const beforeFactor = resolveResidentRetentionFactor(5000, makeSemantics({
				coverageMode: "anchor-before",
				supportsExactRangeFetch: false,
				supportsBackwardAnchor: true,
				supportsForwardAnchor: false,
			}));
			const afterFactor = resolveResidentRetentionFactor(5000, makeSemantics({
				coverageMode: "anchor-after",
				supportsExactRangeFetch: false,
				supportsBackwardAnchor: false,
				supportsForwardAnchor: true,
			}));

			expect(beforeFactor).toBe(2.25);
			expect(afterFactor).toBe(beforeFactor);
		});

		it("computeResidentTarget uses the clamped minimum retention floor for high-density window-hint sources", () => {
			const target = computeResidentTarget(
				win(1000, 2000),
				0,
				50000,
				makeSemantics({
					coverageMode: "window-hint",
					supportsExactRangeFetch: false,
					supportsBackwardAnchor: false,
					supportsForwardAnchor: false,
				}),
			);

			expect(target.endMs - target.startMs).toBe(1150);
		});
	});

	describe("near-edge priority queue ordering", () => {
		it("prioritizes the left gap first when it is closer to the viewport than the right gap", () => {
			const priorityQueue = prioritizeMissingSegments([
				{ side: "left", from: 1000, to: 1800, reason: "not-fetched" },
				{ side: "right", from: 4200, to: 5000, reason: "not-fetched" },
			], win(2000, 4000));

			expect(priorityQueue.map((segment) => segment.side)).toEqual(["left", "right"]);
			expect(priorityQueue.map((segment) => segment.distance)).toEqual([200, 200]);
		});

		it("prioritizes the nearer right gap ahead of a farther left gap", () => {
			const priorityQueue = prioritizeMissingSegments([
				{ side: "left", from: 1000, to: 1400, reason: "not-fetched" },
				{ side: "right", from: 4050, to: 5000, reason: "not-fetched" },
			], win(2000, 4000));

			expect(priorityQueue.map((segment) => segment.side)).toEqual(["right", "left"]);
			expect(priorityQueue.map((segment) => segment.distance)).toEqual([50, 600]);
		});

		it("keeps ordering deterministic by preferring left when both gaps are equally close", () => {
			const priorityQueue = prioritizeMissingSegments([
				{ side: "right", from: 4200, to: 5000, reason: "not-fetched" },
				{ side: "left", from: 1000, to: 1800, reason: "not-fetched" },
			], win(2000, 4000));

			expect(priorityQueue.map((segment) => segment.side)).toEqual(["left", "right"]);
			expect(priorityQueue.map((segment) => segment.distance)).toEqual([200, 200]);
		});
	});
});

// ---------------------------------------------------------------------------
// BUG-2 regression: resident.endMs must extend beyond visible.endMs + padding
// to enable forward backfill detection up to current date.
// DO NOT clamp at liveEdgeMs — this was the root cause of missing candles.
// ---------------------------------------------------------------------------

describe("computeResidentTarget — endMs extends for forward backfill (BUG-2 fix)", () => {
	it("endMs extends beyond liveEdgeMs to enable forward backfill detection", () => {
		const DAY_MS = 24 * 60 * 60 * 1000;
		const liveEdge = new Date("2026-07-10").getTime();
		const visibleSpan = 30 * DAY_MS;

		// Visible window ends at liveEdge — endMs should extend beyond liveEdge
		// so computeMissingSegments detects the gap and triggers forward fetch.
		const target = computeResidentTarget(
			win(liveEdge - visibleSpan, liveEdge),
			visibleSpan,
			30,
			undefined,
			undefined,
			liveEdge,
		);

		// endMs = liveEdge + padding (NOT clamped at liveEdge)
		const paddingMs = Math.round(((3.0 - 1) / 2) * visibleSpan);
		expect(target.endMs).toBe(liveEdge + paddingMs);
		expect(target.endMs).toBeGreaterThan(liveEdge);
	});

	it("does not clamp when endMs is already below liveEdgeMs", () => {
		const liveEdge = 10_000;
		const target = computeResidentTarget(
			win(0, 100),
			100,
			10,
			undefined,
			undefined,
			liveEdge,
		);

		// endMs = 100 + span = 200, well below liveEdge 10_000
		expect(target.endMs).toBe(200);
	});

	it("without liveEdgeMs, endMs extends beyond any boundary (backward compatible)", () => {
		const target = computeResidentTarget(win(0, 1000), 1000);

		// endMs = 1000 + span = 2000
		expect(target.endMs).toBe(2000);
	});

	it("endMs extends beyond liveEdgeMs even when liveEdgeMs is between visible.endMs and raw endMs", () => {
		const visibleEnd = 5000;
		const liveEdge = 5500; // between visibleEnd (5000) and raw endMs (5000 + 5000 = 10000)
		const target = computeResidentTarget(
			win(0, visibleEnd),
			visibleEnd,
			50,
			undefined,
			undefined,
			liveEdge,
		);

		// endMs = visibleEnd + padding (NOT clamped at liveEdge)
		const paddingMs = Math.round(((3.0 - 1) / 2) * visibleEnd);
		expect(target.endMs).toBe(visibleEnd + paddingMs);
		expect(target.endMs).toBeGreaterThan(liveEdge);
	});
});
