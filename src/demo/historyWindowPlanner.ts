/**
 * OB-M01 — historyWindowPlanner
 * Pure utility functions for computing what history windows need to be fetched.
 * No React dependency, no side effects.
 */

export interface TimeWindow {
	startMs: number;
	endMs: number;
}

export interface PlannerOptions {
	/** Multiplier for how far left of the viewport to prefetch. Default 2.0 */
	leftPrefetchRatio?: number;
	/** Multiplier for how far right of the viewport to prefetch. Default 0.5 */
	rightPrefetchRatio?: number;
}

export interface MissingSegments {
	leftMissing: boolean;
	rightMissing: boolean;
	leftTargetMs: number;
	rightTargetMs: number;
}

/**
 * Expand a viewport window by the given prefetch ratios to compute the ideal
 * target window that should be loaded.
 */
export function computeTargetWindow(
	viewport: TimeWindow,
	options?: PlannerOptions,
): TimeWindow {
	const leftRatio = options?.leftPrefetchRatio ?? 2.0;
	const rightRatio = options?.rightPrefetchRatio ?? 0.5;
	const span = viewport.endMs - viewport.startMs;

	return {
		startMs: viewport.startMs - span * leftRatio,
		endMs: viewport.endMs + span * rightRatio,
	};
}

/**
 * Compute the min/max window of the provided data array.
 * Returns null when data is empty.
 */
export function computeLoadedWindow(
	data: readonly { date: Date | number }[],
): TimeWindow | null {
	if (data.length === 0) {
		return null;
	}

	let minMs = Infinity;
	let maxMs = -Infinity;

	for (const item of data) {
		const ms =
			item.date instanceof Date
				? item.date.valueOf()
				: typeof item.date === "number"
					? item.date
					: 0;
		if (ms < minMs) minMs = ms;
		if (ms > maxMs) maxMs = ms;
	}

	return { startMs: minMs, endMs: maxMs };
}

/**
 * Compare target vs. loaded windows and identify which segments are missing.
 */
export function computeMissingSegments(
	target: TimeWindow,
	loaded: TimeWindow,
): MissingSegments {
	const leftMissing = loaded.startMs > target.startMs;
	const rightMissing = loaded.endMs < target.endMs;

	return {
		leftMissing,
		rightMissing,
		leftTargetMs: target.startMs,
		rightTargetMs: target.endMs,
	};
}

/**
 * Decide whether a new scheduler tick should enqueue a fetch job.
 * Returns true only when missing state transitions from absent/false → true
 * (avoids hammering the server when nothing has changed).
 */
export function shouldScheduleFetch(
	previous: MissingSegments | null,
	next: MissingSegments,
): boolean {
	if (!next.leftMissing && !next.rightMissing) {
		return false;
	}
	if (previous === null) {
		return true;
	}
	// Trigger if either side transitions false → true
	const leftTrigger = !previous.leftMissing && next.leftMissing;
	const rightTrigger = !previous.rightMissing && next.rightMissing;
	return leftTrigger || rightTrigger;
}
