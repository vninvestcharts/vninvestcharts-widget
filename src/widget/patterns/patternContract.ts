/**
 * Public contract for auto chart-pattern detection (A10).
 *
 * Rule 15 (open core): this file lives in the public widget and **must not**
 * import `@vninvestcharts/engine-pro`. A Free consumer has to be able to
 * type-check and bundle the widget without the private package. The detector
 * itself is registered by `@vninvestcharts/widget-pro` through the adapter
 * below — the same shape as `src/lib/pinescript/adapter.ts`.
 *
 * The types are structural copies of engine-pro's. They are kept in lock-step
 * at compile time: `packages/vn-kline-widget-pro/src/patterns/register.ts`
 * assigns `detectChartPatterns` to `PatternDetectionAdapter.detect`, and
 * `tsconfig.pro-typecheck.json` makes `tsc` check that assignment. If the two
 * definitions drift, the assignment stops compiling.
 *
 * Register the adapter before the first render: the registry has no
 * subscription mechanism on purpose (same as pinescript). A host that imports
 * `@vninvestcharts/widget-pro` once at startup satisfies that.
 */

/** Minimal bar shape the detector needs. `EnrichedDatum` satisfies it. */
export interface PatternBar {
	readonly high: number;
	readonly low: number;
	readonly close: number;
}

export type PatternShapeId =
	| "headAndShoulders"
	| "inverseHeadAndShoulders"
	| "doubleTop"
	| "doubleBottom"
	| "triangle";

export type PatternDirection = "bearish" | "bullish";

export type PatternAnchorRole =
	| "leftShoulder"
	| "leftValley"
	| "head"
	| "rightValley"
	| "rightShoulder"
	| "necklineStart"
	| "necklineEnd"
	| "firstTop"
	| "trough"
	| "secondTop"
	| "upperA"
	| "upperB"
	| "lowerA"
	| "lowerB";

export interface PatternAnchor {
	readonly role: PatternAnchorRole;
	/** `high` or `low` — which side of the bar this anchor sits on. */
	readonly kind: "high" | "low";
	readonly barIndex: number;
	readonly price: number;
}

/** A gated, ready-to-draw pattern. */
export interface DetectedPattern {
	/** Stable, derived from shape + anchor indexes; a re-scan must reuse it. */
	readonly id: string;
	readonly shape: PatternShapeId;
	readonly direction: PatternDirection;
	readonly anchors: readonly PatternAnchor[];
	readonly barsInPattern: number;
	readonly rSquared: number;
	readonly fitSamples: number;
	readonly degenerateFit: boolean;
	readonly confidence: number;
	readonly confirmedAtIndex: number;
	readonly firstBarIndex: number;
	readonly lastBarIndex: number;
	/** Always `"confirmed"` — the detector waits for confirmation. */
	readonly status: "confirmed";
}

/**
 * The subset of engine-pro's `DetectPatternsOptions` the public scan policy
 * needs. Kept narrow on purpose: a wider public type would have to reproduce
 * every threshold field, and any mismatch would break the adapter assignment
 * (contravariance) instead of failing here.
 */
export interface PatternDetectOptions {
	/** Last observable bar index, inclusive. */
	readonly asOf?: number;
	/** Restrict to a subset of the adapter's `shapes`. */
	readonly shapes?: readonly PatternShapeId[];
	/** Canvas cap. */
	readonly maxPatterns?: number;
}

/**
 * Implemented by `@vninvestcharts/widget-pro`, which owns the private detector.
 *
 * `detect` is declared as a property, not a method: method shorthand is
 * bivariant under `strictFunctionTypes` and would hide a parameter mismatch
 * between this contract and engine-pro.
 */
export interface PatternDetectionAdapter {
	/** Shapes the private detector ships. The only source of that list. */
	readonly shapes: readonly PatternShapeId[];
	/** Plan §3.9.5 cap; the only source of that number. */
	readonly maxPerSeries: number;
	detect: (
		bars: readonly PatternBar[],
		options: PatternDetectOptions,
	) => readonly DetectedPattern[];
}

let current: PatternDetectionAdapter | null = null;

export function setPatternDetectionAdapter(adapter: PatternDetectionAdapter | null): void {
	current = adapter;
}

export function getPatternDetectionAdapter(): PatternDetectionAdapter | null {
	return current;
}

/** Explicit reset for tests; production hosts register once at startup. */
export function clearPatternDetectionAdapter(): void {
	current = null;
}
