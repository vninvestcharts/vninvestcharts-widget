// Timestamp-primary range resolution (Slice B1 — SY-02, spec §2.1).
// Same calendar dates must win over relativePosition ratio.

import { describe, it, expect } from 'vitest';
import { resolveSyncIndexes, resolveAnchorIndexes, isEchoOfRange, isContainedEcho } from '../rangeSync';

const DAY = 86_400_000;
const dates = (n: number, start = 0): number[] =>
	Array.from({ length: n }, (_, i) => start + i * DAY);

describe('resolveSyncIndexes (B1 timestamp-primary)', () => {
	it('SY-02 repro: different-length datasets resolve the SAME calendar dates', () => {
		// Chart A: 500 daily bars; chart B: 2000 daily bars, same symbol/epoch.
		const a = dates(500);
		const b = dates(2000);
		// Remote = A's last 100 bars + A's ratio (start 0.8, span 0.2).
		const remote = {
			fromTs: a[400],
			toTs: a[499],
			relativePosition: { startRatio: 0.8, spanRatio: 0.2 },
		};
		const res = resolveSyncIndexes(b, remote);
		// Ratio-primary (old bug) would land at ~1599..1998. Timestamp wins:
		expect(res.method).toBe('timestamp');
		expect(res.fromIdx).toBe(400);
		expect(res.toIdx).toBe(499);
	});

	it('maps timestamps inside local data even without any ratio', () => {
		const res = resolveSyncIndexes(dates(100), { fromTs: 10 * DAY, toTs: 19 * DAY });
		expect(res).toEqual({ fromIdx: 10, toIdx: 19, method: 'timestamp' });
	});

	it('falls back to ratio when the range is entirely right of local data', () => {
		const res = resolveSyncIndexes(dates(100), {
			fromTs: 1000 * DAY,
			toTs: 1100 * DAY,
			relativePosition: { startRatio: 0.5, spanRatio: 0.1 },
		});
		expect(res.method).toBe('ratio-fallback');
		// 0.5 * 99d ≈ idx 50, span 0.1 * 99d ≈ 10 bars.
		expect(res.fromIdx).toBeGreaterThanOrEqual(49);
		expect(res.fromIdx).toBeLessThanOrEqual(50);
		expect(res.toIdx).toBeGreaterThan(res.fromIdx);
	});

	it('returns raw misses (caller clamps) when no ratio is available', () => {
		const res = resolveSyncIndexes(dates(100), { fromTs: 1000 * DAY, toTs: 1100 * DAY });
		expect(res.method).toBe('timestamp');
		expect(res.fromIdx).toBe(-1);
		expect(res.toIdx).toBe(99);
	});

	it('signals no-data on empty input (caller takes the invalid path)', () => {
		expect(resolveSyncIndexes([], { fromTs: 0, toTs: 1 })).toEqual({
			fromIdx: 0,
			toIdx: -1,
			method: 'no-data',
		});
	});
});

describe('resolveAnchorIndexes - center span on timestamp (F1)', () => {
	const dates = (n: number) => Array.from({ length: n }, (_, i) => i * DAY);

	it('keeps span in the middle without clamping', () => {
		const res = resolveAnchorIndexes(dates(200), 100 * DAY, 40);
		expect(res).toEqual({ fromIdx: 80, toIdx: 120, clamped: false });
	});

	it('shifts (not shrinks) the span at the right edge', () => {
		// Anchor at bar 150, span 100 → centered [100, 200] overflows → [99, 199].
		const res = resolveAnchorIndexes(dates(200), 150 * DAY, 100);
		expect(res.toIdx - res.fromIdx).toBe(100);
		expect(res).toEqual({ fromIdx: 99, toIdx: 199, clamped: false });
	});

	it('clamps a future timestamp to the right edge', () => {
		const res = resolveAnchorIndexes(dates(200), 5000 * DAY, 40);
		expect(res).toEqual({ fromIdx: 159, toIdx: 199, clamped: true });
	});

	it('clamps a past timestamp to the left edge', () => {
		const res = resolveAnchorIndexes(dates(200), -5000 * DAY, 40);
		expect(res).toEqual({ fromIdx: 0, toIdx: 40, clamped: true });
	});

	it('signals no-data on empty input', () => {
		expect(resolveAnchorIndexes([], 0, 40)).toEqual({ fromIdx: 0, toIdx: -1, clamped: true });
	});
});

describe('isEchoOfRange - content-based echo suppression (P1-H)', () => {
	it('matches identical timestamps (true echo)', () => {
		expect(isEchoOfRange({ from: 1, to: 2 }, { from: 1, to: 2 })).toBe(true);
	});

	it('rejects different ranges (genuine intent)', () => {
		expect(isEchoOfRange({ from: 1, to: 3 }, { from: 1, to: 2 })).toBe(false);
		expect(isEchoOfRange({ from: 5, to: 6 }, { from: 1, to: 2 })).toBe(false);
	});

	it('fails open on missing data (legacy/index-only emits proceed)', () => {
		expect(isEchoOfRange(null, { from: 1, to: 2 })).toBe(false);
		expect(isEchoOfRange({ from: 1, to: 2 }, null)).toBe(false);
		expect(isEchoOfRange(undefined, undefined)).toBe(false);
	});
});

describe('isContainedEcho - parrot-back suppression (sync ratchet fix)', () => {
	it('suppresses exact echoes (equality subset)', () => {
		expect(isContainedEcho({ from: 1, to: 2 }, { from: 1, to: 2 })).toBe(true);
	});

	it('suppresses lossy re-emits inside the applied range (quantize/clamp)', () => {
		// Peer quantized [100,200] -> renders [100,199]: re-emit inside incoming.
		expect(isContainedEcho({ from: 100, to: 199 }, { from: 100, to: 200 })).toBe(true);
		// Overscroll clamped to loaded data.
		expect(isContainedEcho({ from: 0, to: 150 }, { from: -20, to: 150 })).toBe(true);
	});

	it('propagates genuine intent outside the applied range', () => {
		expect(isContainedEcho({ from: 90, to: 200 }, { from: 100, to: 200 })).toBe(false);
		expect(isContainedEcho({ from: 100, to: 210 }, { from: 100, to: 200 })).toBe(false);
		expect(isContainedEcho({ from: 500, to: 600 }, { from: 100, to: 200 })).toBe(false);
	});

	it('fails open on missing data', () => {
		expect(isContainedEcho(null, { from: 1, to: 2 })).toBe(false);
		expect(isContainedEcho({ from: 1, to: 2 }, null)).toBe(false);
		expect(isContainedEcho(undefined, undefined)).toBe(false);
	});
});
