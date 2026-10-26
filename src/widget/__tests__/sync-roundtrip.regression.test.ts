// Sync round-trip regression lock: synced charts must converge, never ratchet.
// Root causes fixed: (1) inclusive→exclusive off-by-one on apply (+1 toIdx),
// (2) equality-only echo guard replaced by containment (isContainedEcho).
// Mirrors production: normalizeForkVisibleRange (emit) + resolveSyncIndexes
// (apply) + half-open engine ranges.

import { describe, expect, it } from "vitest";

import { normalizeForkVisibleRange } from "../visibleRangeBridge";
import { isContainedEcho, isEchoOfRange, resolveSyncIndexes } from "../utils/rangeSync";

const DAY = 86_400_000;
const T0 = Date.UTC(2024, 0, 1);

function makeData(n: number, t0 = T0) {
	return Array.from({ length: n }, (_, i) => ({ date: new Date(t0 + i * DAY) }));
}

// Mirror production: GridContainer outgoing (bar dates + relativePosition) +
// useChartImperativeHandle incoming (resolveSyncIndexes + half-open +1 apply).
function emitPayload(data: Array<{ date: Date }>, range: { from: number; to: number }) {
	const n = normalizeForkVisibleRange(range, data as any);
	if (!n) throw new Error("normalize null");
	const dataStartMs = data[0].date.getTime();
	const dataEndMs = data[data.length - 1].date.getTime();
	const dataSpanMs = dataEndMs - dataStartMs;
	const payload: any = { timeRange: { ...n.timeRange } };
	if (dataSpanMs > 0) {
		payload.relativePosition = {
			startRatio: Math.max(0, Math.min(1, (n.timeRange.from - dataStartMs) / dataSpanMs)),
			spanRatio: Math.min(1, Math.max(0, (n.timeRange.to - n.timeRange.from) / dataSpanMs)),
		};
	}
	return payload;
}

function applyPayload(data: Array<{ date: Date }>, payload: any): { from: number; to: number } | null {
	const datesMs = data.map((d) => d.date.getTime());
	const { fromIdx: rFrom, toIdx: rTo } = resolveSyncIndexes(datesMs, {
		fromTs: payload.timeRange.from,
		toTs: payload.timeRange.to,
		relativePosition: payload.relativePosition,
	});
	const fromIdx = rFrom < 0 ? 0 : rFrom;
	const toIdx = rTo < 0 ? data.length - 1 : rTo;
	if (fromIdx >= toIdx) return null;
	// Production applies half-open [fromIdx, toIdx + 1).
	return { from: fromIdx, to: toIdx + 1 };
}

describe("sync round-trip regression lock", () => {
	it("in-bounds zoom converges in ONE hop (echo engages, span kept)", () => {
		const data = makeData(6000);
		const rangeA = { from: 100.4, to: 200.7 };
		const payloadA = emitPayload(data, rangeA);
		const rangeB = applyPayload(data, payloadA);
		expect(rangeB).toEqual({ from: 100, to: 201 });
		const payloadB = emitPayload(data, rangeB!);
		// B renders bars 100..200 — identical dates → true echo, no re-broadcast.
		expect(isEchoOfRange(payloadB.timeRange, payloadA.timeRange)).toBe(true);
		expect(isContainedEcho(payloadB.timeRange, payloadA.timeRange)).toBe(true);
		const backA = applyPayload(data, payloadB);
		expect(backA).toEqual({ from: 100, to: 201 });
	});

	it("repeated cycles never ratchet (span stable, was -2 bars/cycle)", () => {
		const data = makeData(6000);
		let range = { from: 100.4, to: 200.7 };
		for (let cycle = 0; cycle < 10; cycle++) {
			const p = emitPayload(data, range);
			range = applyPayload(data, p)!;
		}
		expect(range.to - range.from).toBeCloseTo(101, 6);
	});

	it("overscroll peer echo is contained (source must not be snapped back)", () => {
		const data = makeData(6000);
	 const payloadA = emitPayload(data, { from: -20.5, to: 150.2 });
		const rangeB = applyPayload(data, payloadA);
		expect(rangeB).toEqual({ from: 0, to: 151 });
		const payloadB = emitPayload(data, rangeB!);
		// B clamps to loaded data: re-emit sits inside incoming → suppressed.
		expect(isContainedEcho(payloadB.timeRange, payloadA.timeRange)).toBe(true);
	});

	it("different calendars stay bounded (no runaway to min span)", () => {
		const dataA = makeData(6000, T0);
		const dataB = makeData(6000, T0 + 30 * DAY);
		let rangeA = { from: 100.4, to: 200.7 };
		let rangeB = { from: 100, to: 201 };
		for (let cycle = 0; cycle < 10; cycle++) {
			rangeB = applyPayload(dataB, emitPayload(dataA, rangeA)) ?? rangeB;
			rangeA = applyPayload(dataA, emitPayload(dataB, rangeB)) ?? rangeA;
		}
		expect(rangeA.to - rangeA.from).toBeGreaterThan(50);
		expect(rangeB.to - rangeB.from).toBeGreaterThan(50);
	});
});
