// Symbol-local drawing gate (Slice E1 — SY-06, Q2, spec §2.3).

import { describe, it, expect } from "vitest";
import {
	withDrawingSourceSymbol,
	shouldApplyRemoteDrawing,
	shouldNotifyDrawingConflict,
	drawingPointToSyncTimestamp,
	nextDrawingOpTimestamp,
	drawingPointToSyncFields,
	syncPointToDrawingPoint,
} from "../drawingSync";

describe("drawing symbol gate (E1)", () => {
	it("applies same-symbol ops", () => {
		expect(shouldApplyRemoteDrawing("VIC", "VIC")).toBe(true);
	});

	it("drops other-symbol ops", () => {
		expect(shouldApplyRemoteDrawing("VIC", "FPT")).toBe(false);
	});

	it("lets legacy ops without symbol pass through", () => {
		expect(shouldApplyRemoteDrawing(undefined, "FPT")).toBe(true);
		expect(shouldApplyRemoteDrawing(null, "FPT")).toBe(true);
		expect(shouldApplyRemoteDrawing("", "FPT")).toBe(true);
	});

	it("stamps the origin symbol on emit, keeps legacy ops untouched", () => {
		const op = { id: "op-1", drawingId: "d-1" };
		expect(withDrawingSourceSymbol(op, "VIC")).toEqual({ ...op, symbol: "VIC" });
		expect(withDrawingSourceSymbol(op, undefined)).toBe(op);
	});
});

describe("shouldNotifyDrawingConflict (E2)", () => {
	const info = (winner: unknown, symbol?: string | null) => ({
		drawingId: "d-1",
		winner,
		localOp: { symbol: "AAA" },
		remoteOp: symbol === undefined ? null : { symbol },
	});

	it("notifies on remote-win for the same symbol", () => {
		expect(shouldNotifyDrawingConflict(info("remote", "AAA"), "AAA", false)).toBe(true);
	});

	it("stays silent on other symbols", () => {
		expect(shouldNotifyDrawingConflict(info("remote", "AAA"), "BBB", true)).toBe(false);
	});

	it("stays silent when local won (nothing visibly changed)", () => {
		expect(shouldNotifyDrawingConflict(info("local", "AAA"), "AAA", true)).toBe(false);
	});

	it("legacy conflicts without symbol notify on the active chart only", () => {
		const legacy = { drawingId: "d-1", winner: "remote", localOp: null, remoteOp: null };
		expect(shouldNotifyDrawingConflict(legacy, "BBB", true)).toBe(true);
		expect(shouldNotifyDrawingConflict(legacy, "BBB", false)).toBe(false);
	});

	it("rejects garbage input", () => {
		expect(shouldNotifyDrawingConflict(null, "AAA", true)).toBe(false);
		expect(shouldNotifyDrawingConflict(undefined, "AAA", true)).toBe(false);
		expect(shouldNotifyDrawingConflict({ drawingId: "d", winner: "tie" } as any, "AAA", true)).toBe(false);
	});
});

describe("drawingPointToSyncTimestamp (P2/D-SYNC-23)", () => {
	const plotData = [{ date: new Date(1000) }, { date: new Date(2000) }];

	it("prefers timeMsHint anchors", () => {
		expect(drawingPointToSyncTimestamp({ timeMsHint: 1500, xIndexFloat: 0 }, plotData)).toBe(1500);
	});

	it("resolves xIndexFloat through plotData", () => {
		expect(drawingPointToSyncTimestamp({ xIndexFloat: 1.4 }, plotData)).toBe(2000);
	});

	it("returns deterministic 0 (never fake now) when unanchorable", () => {
		expect(drawingPointToSyncTimestamp({}, plotData)).toBe(0);
		expect(drawingPointToSyncTimestamp({ xIndexFloat: 99 }, plotData)).toBe(0);
		expect(drawingPointToSyncTimestamp({ timeMsHint: Number.NaN }, plotData)).toBe(0);
	});
});

describe("nextDrawingOpTimestamp (E2-fix HLC)", () => {
	it("passes wall-clock through when ahead", () => {
		expect(nextDrawingOpTimestamp(1000, 2000)).toBe(2000);
	});

	it("bumps past last timestamp within the same millisecond (strictly monotonic)", () => {
		expect(nextDrawingOpTimestamp(2000, 2000)).toBe(2001);
		expect(nextDrawingOpTimestamp(2000, 1999)).toBe(2001);
	});

	it("recovers from non-finite input without NaN poisoning", () => {
		expect(nextDrawingOpTimestamp(Number.NaN, 3000)).toBe(3000);
		expect(nextDrawingOpTimestamp(3000, Number.NaN)).toBe(3001);
	});

	it("keeps sequential same-writer versions comparable (no CRDT tie)", () => {
		// Simulates engine compareVersionVectors on {k:a} vs {k:b}.
		const cmp = (a: number, b: number) => (a > b ? 1 : a < b ? -1 : 0);
		let last = 0;
		const seq = [0, 1, 2].map(() => { last = nextDrawingOpTimestamp(last, last); return last; });
		expect(cmp(seq[1], seq[0])).toBe(1);
		expect(cmp(seq[2], seq[1])).toBe(1);
	});
});

describe("drawingPointToSyncFields (eraser/ABCD stretch fix)", () => {
	it("anchors bare {x, y} draft points via x fallback (no timestamp 0 for real points)", () => {
		const f = drawingPointToSyncFields({ x: 1_700_000_000_000, y: 50 });
		expect(f.timestamp).toBe(1_700_000_000_000);
		expect(f.price).toBe(50);
		expect(f.yPrice).toBe(50);
	});

	it("passes full anchors through, resolving index via plotData", () => {
		const plotData = [{ date: new Date(1000) }, { date: new Date(2000) }];
		const f = drawingPointToSyncFields({ x: 1500, y: 42, xIndexFloat: 1.4, yPrice: 42 }, plotData);
		expect(f.timestamp).toBe(2000);
		expect(f.price).toBe(42);
		expect(f.xIndexFloat).toBe(1.4);
	});

	it("keeps deterministic 0 for genuinely unanchorable points", () => {
		const f = drawingPointToSyncFields({ x: 5, y: 7 });
		expect(f.timestamp).toBe(0);
		expect(f.price).toBe(7);
	});
});

describe("syncPointToDrawingPoint (stretch guard)", () => {
	it("maps valid wire points identically to the legacy inline mapper", () => {
		expect(syncPointToDrawingPoint({ timestamp: 2000, price: 42, xIndexFloat: 1.5 })).toEqual({
			x: 2000, y: 42, timeMsHint: 2000, yPrice: 42, xIndexFloat: 1.5,
		});
	});

	it("keeps timestamp 0 absent instead of fabricating timeMsHint 0", () => {
		const m = syncPointToDrawingPoint({ timestamp: 0, price: 42 });
		expect(m.timeMsHint).toBeUndefined();
		expect(m.x).toBeUndefined();
		expect(m.y).toBe(42);
	});

	it("treats missing/non-finite timestamps as absent", () => {
		expect(syncPointToDrawingPoint({ price: 42 }).timeMsHint).toBeUndefined();
		expect(syncPointToDrawingPoint({ timestamp: Number.NaN, price: 42 }).x).toBeUndefined();
	});
});
