/**
 * A10 — the scan policy, i.e. the plan's runtime constraints expressed as
 * one pure function the UI and the tests both go through.
 *
 * PLAN_FRONTEND_PROPLUS_TRACKA_2026-09-28 §3.9:
 *   §3.9.1 anti-look-ahead → `asOf` is the last **closed** bar.
 *   §3.9.3 off on mobile and at `free` → the caller passes `enabled`, which
 *          comes from the `auto_pattern` capability (already `DEVICE_HEAVY`
 *          and already `pro`-gated in `CapabilityResolver`).
 *   §3.9.4 never in the background while panning or zooming → `idle` must be
 *          true. A scan is a decision the user made, not a background job.
 *   §3.9.5 at most 12 patterns per series.
 *
 * Kept pure so every one of those is testable without a chart, and so the
 * rule "no scan during a gesture" cannot be satisfied in the UI and broken in
 * the engine.
 */

import {
	getPatternDetectionAdapter,
	type DetectedPattern,
	type PatternBar,
	type PatternDetectOptions,
	type PatternShapeId,
} from "./patternContract";

export interface ScanRequest {
	readonly bars: readonly PatternBar[];
	/** Capability gate result. `false` covers both `free` and narrow devices. */
	readonly enabled: boolean;
	/**
	 * `true` when the scan was triggered deliberately — the panel is open, or
	 * the host's idle callback fired. A pan or zoom in progress sets this
	 * `false` and the scan is skipped entirely.
	 */
	readonly idle: boolean;
	/**
	 * Shapes the user has selected. `undefined` means all shipped shapes;
	 * an **empty array means none**. Collapsing `[]` to "everything" would
	 * make "Clear all" followed by "Scan" quietly draw every pattern the user
	 * had just switched off.
	 */
	readonly shapes?: readonly PatternShapeId[];
	/**
	 * How many trailing bars are still forming. `1` on a live chart, `0` on
	 * a historical one. Those bars are excluded from the scan so a live bar
	 * can never confirm a pattern.
	 */
	readonly formingBars?: number;
	/** Plan §3.9.5. */
	readonly maxPatterns?: number;
	/** Extra detector options, for hosts that want to tune the noise floor. */
	readonly detector?: PatternDetectOptions;
}

export type ScanSkipReason = "disabled" | "busy" | "no-data" | "unavailable";

export interface ScanResult {
	readonly patterns: readonly DetectedPattern[];
	readonly skipped: ScanSkipReason | null;
}

/**
 * Run a scan, or explain why not.
 *
 * `skipped` is returned rather than an empty `patterns` array so a caller
 * can tell "scanned, found nothing" from "did not scan" — the difference
 * matters for the empty-state copy, and for the test that asserts the
 * gesture rule.
 */
export function runAutoPatternScan(request: ScanRequest): ScanResult {
	if (!request.enabled) {
		return { patterns: [], skipped: "disabled" };
	}
	if (!request.idle) {
		return { patterns: [], skipped: "busy" };
	}
	const forming = Math.max(0, request.formingBars ?? 0);
	const lastClosed = request.bars.length - 1 - forming;
	if (lastClosed < 1) {
		return { patterns: [], skipped: "no-data" };
	}
	if (request.shapes && request.shapes.length === 0) {
		return { patterns: [], skipped: null };
	}
	// Rule 15: without the private module there is no detector. Fail closed and
	// say so, rather than reporting "scanned, found nothing" (which would look
	// like a market with no patterns).
	const adapter = getPatternDetectionAdapter();
	if (!adapter) {
		return { patterns: [], skipped: "unavailable" };
	}

	const patterns = adapter.detect(request.bars, {
		...request.detector,
		asOf: lastClosed,
		shapes: request.shapes ?? adapter.shapes,
		maxPatterns: request.maxPatterns ?? adapter.maxPerSeries,
	});
	return { patterns, skipped: null };
}

/** Human-facing numbers for the picker; kept here so the panel stays dumb. */
export interface PatternSummary {
	readonly id: string;
	readonly shape: PatternShapeId;
	readonly direction: "bullish" | "bearish";
	/** 0..1, as reported by the detector. */
	readonly confidence: number;
	readonly rSquared: number;
	readonly barsInPattern: number;
	/**
	 * `true` when the gating R² had fewer than three samples and so carries
	 * no information. Surfaced rather than hidden: a "R² 1.00" badge on a
	 * two-point neckline is a claim the number cannot support.
	 */
	readonly degenerateFit: boolean;
}

export function summarizePatterns(patterns: readonly DetectedPattern[]): PatternSummary[] {
	return patterns.map((p) => ({
		id: p.id,
		shape: p.shape,
		direction: p.direction,
		confidence: p.confidence,
		rSquared: p.rSquared,
		barsInPattern: p.barsInPattern,
		degenerateFit: p.degenerateFit,
	}));
}
