// Timestamp-primary range resolver for cross-chart visible-range sync.
// TV Date Range semantics (spec §2.1, Slice B1): absolute timestamps are the
// PRIMARY mapping; relativePosition ratio is ONLY a fallback when timestamps
// fall completely outside local data. Pure function — unit-tested.

export interface RelativePositionInput {
  startRatio: number; // 0-1: where the visible range starts in source data
  spanRatio: number; // 0-1: what fraction of source data is visible
}

export interface SyncRangeInput {
  fromTs: number; // Unix ms, inclusive lower bound
  toTs: number; // Unix ms, inclusive upper bound
  relativePosition?: RelativePositionInput | null;
}

export type SyncResolveMethod = 'timestamp' | 'ratio-fallback' | 'no-data';

export interface SyncRangeResolution {
  fromIdx: number; // -1 = no local bar found on that side (caller clamps)
  toIdx: number;
  method: SyncResolveMethod;
}

export function resolveSyncIndexes(datesMs: number[], input: SyncRangeInput): SyncRangeResolution {
	const { fromTs, toTs, relativePosition } = input;
	if (datesMs.length === 0) {
		return { fromIdx: 0, toIdx: -1, method: 'no-data' };
	}

	// PRIMARY: absolute timestamp mapping (same calendar dates on every chart).
	let fromIdx = datesMs.findIndex((t) => t >= fromTs);
	let toIdx = -1;
	for (let i = datesMs.length - 1; i >= 0; i--) {
		if (datesMs[i] <= toTs) {
			toIdx = i;
			break;
		}
	}

	// FALLBACK: timestamps miss local data on either side (range entirely in the
	// past beyond backfill, or scrolled into empty future space). Approximate
	// with the source ratio instead of clamping to a misleading edge.
	if ((fromIdx < 0 || toIdx < 0) && relativePosition && datesMs.length > 1) {
		const dataStartMs = datesMs[0];
		const dataEndMs = datesMs[datesMs.length - 1];
		const dataSpanMs = dataEndMs - dataStartMs;
		const visibleStartMs = dataStartMs + relativePosition.startRatio * dataSpanMs;
		const visibleEndMs = visibleStartMs + relativePosition.spanRatio * dataSpanMs;
		fromIdx = datesMs.findIndex((t) => t >= visibleStartMs);
		toIdx = -1;
		for (let i = datesMs.length - 1; i >= 0; i--) {
			if (datesMs[i] <= visibleEndMs) {
				toIdx = i;
				break;
			}
		}
		return { fromIdx, toIdx, method: 'ratio-fallback' };
	}

	return { fromIdx, toIdx, method: 'timestamp' };
}

export interface TimeRangeMs {
  from: number;
  to: number;
}

// Echo suppression (P1-H): a re-emit is a TRUE echo only when it carries the
// same timestamps as the just-applied remote range. Anything else is genuine
// intent and must propagate immediately (the old 200ms blanket window ate
// rapid genuine pans). Missing data fails OPEN (legacy/index-only emits
// proceed; the engine A3 meta-guard remains the backstop).
export function isEchoOfRange(
	incoming: TimeRangeMs | null | undefined,
	applied: TimeRangeMs | null | undefined,
): boolean {
	if (!incoming || !applied) return false;
	return incoming.from === applied.from && incoming.to === applied.to;
}

// Contained-echo suppression (sync ratchet fix): a re-emit is a parrot-back
// — not new intent — when its timeRange sits entirely INSIDE the timestamps
// just applied from remote. Exact equality is too strict: the timestamp→index
// mapping quantizes (ceil from / floor to) and overscroll clamps to loaded
// data, so a lossy re-emit never equals the incoming and the old equality
// guard failed open — every sync hop shrank the span (~2 bars/round-trip)
// until charts ratcheted to max zoom-in and zoom-out was eaten alive.
// Containment covers equality as a subset. Missing data still fails OPEN
// (propagate), same contract as isEchoOfRange. Callers must only invoke this
// for the one-shot post-remote emit (hadPendingRemote / isRemote guard);
// continuous local gestures bypass suppression and always propagate.
export function isContainedEcho(
	own: TimeRangeMs | null | undefined,
	applied: TimeRangeMs | null | undefined,
): boolean {
	if (!own || !applied) return false;
	return own.from >= applied.from && own.to <= applied.to;
}

export interface AnchorResolution {
  fromIdx: number;
  toIdx: number;
  /** True when the timestamp fell outside local data and got clamped. */
  clamped: boolean;
}

// Time-anchor apply (F1, spec §2.4): center the CURRENT span (bar count) on
// the timestamp — zoom is preserved. Out-of-range timestamps clamp to the
// nearest edge (no backfill chase in F1 scope).
export function resolveAnchorIndexes(datesMs: number[], timestamp: number, spanBars: number): AnchorResolution {
	if (datesMs.length === 0 || spanBars < 1) {
		return { fromIdx: 0, toIdx: -1, clamped: true };
	}
	const span = Math.min(spanBars, datesMs.length - 1);
	if (timestamp < datesMs[0]) {
		return { fromIdx: 0, toIdx: span, clamped: true };
	}
	if (timestamp > datesMs[datesMs.length - 1]) {
		return { fromIdx: datesMs.length - 1 - span, toIdx: datesMs.length - 1, clamped: true };
	}
	let center = datesMs.findIndex((t) => t >= timestamp);
	if (center > 0 && datesMs[center] > timestamp) {
		const prev = center - 1;
		if (timestamp - datesMs[prev] <= datesMs[center] - timestamp) center = prev;
	}
	let fromIdx = center - Math.floor(span / 2);
	let toIdx = fromIdx + span;
	if (fromIdx < 0) {
		toIdx -= fromIdx;
		fromIdx = 0;
	}
	if (toIdx > datesMs.length - 1) {
		fromIdx -= toIdx - (datesMs.length - 1);
		toIdx = datesMs.length - 1;
	}
	// Reachable only via the early returns above when the timestamp is outside
	// local data; the shifts above always land in-bounds (span <= length - 1).
	return { fromIdx, toIdx, clamped: false };
}
