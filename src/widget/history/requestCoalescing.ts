import type { MissingSegment } from "./historyWindowPlanner";

export interface InflightRange {
	side: MissingSegment["side"];
	from: number;
	to: number;
}

export function toInflightRequestKey(segment: MissingSegment): string {
	return `${segment.side}:${segment.from ?? 0}:${segment.to ?? 0}`;
}

export function parseInflightRequestKey(key: string): InflightRange | null {
	const [side, fromRaw, toRaw] = key.split(":");
	if ((side !== "left" && side !== "right") || fromRaw === undefined || toRaw === undefined) {
		return null;
	}

	const from = Number(fromRaw);
	const to = Number(toRaw);
	if (!Number.isFinite(from) || !Number.isFinite(to)) {
		return null;
	}

	return { side, from, to };
}

function normalizeSegmentRange(segment: MissingSegment): { from: number; to: number } | null {
	if (segment.from === undefined || segment.to === undefined) {
		return null;
	}
	return { from: segment.from, to: segment.to };
}

export function isSegmentCoalescedByInflight(
	segment: MissingSegment,
	inflightKeys: Iterable<string>,
): boolean {
	const segmentRange = normalizeSegmentRange(segment);
	if (!segmentRange) {
		return false;
	}

	for (const key of inflightKeys) {
		const inflight = parseInflightRequestKey(key);
		if (!inflight || inflight.side !== segment.side) {
			continue;
		}

		if (inflight.from <= segmentRange.from && inflight.to >= segmentRange.to) {
			return true;
		}
	}

	return false;
}

export function coalesceAndAdjustSegment(
	segment: MissingSegment,
	inflightKeys: Iterable<string>,
): MissingSegment | null {
	if (segment.from === undefined || segment.to === undefined) {
		return segment;
	}

	let adjustedFrom = segment.from;
	let adjustedTo = segment.to;

	for (const key of inflightKeys) {
		const inflight = parseInflightRequestKey(key);
		if (!inflight || inflight.side !== segment.side) {
			continue;
		}

		if (segment.side === "left") {
			// Inflight is fetching [inflight.from, inflight.to]
			// If it overlaps with our [adjustedFrom, adjustedTo] at the upper end:
			if (inflight.from < adjustedTo && inflight.to >= adjustedTo) {
				adjustedTo = Math.max(adjustedFrom, inflight.from);
			}
		} else {
			// Inflight is fetching [inflight.from, inflight.to]
			// If it overlaps with our [adjustedFrom, adjustedTo] at the lower end:
			if (inflight.to > adjustedFrom && inflight.from <= adjustedFrom) {
				adjustedFrom = Math.min(adjustedTo, inflight.to);
			}
		}
	}

	if (adjustedTo <= adjustedFrom) {
		return null; // Fully coalesced
	}

	return {
		...segment,
		from: adjustedFrom,
		to: adjustedTo,
	};
}

