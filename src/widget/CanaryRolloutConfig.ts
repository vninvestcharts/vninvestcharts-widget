/**
 * Canary rollout configuration and resolver for progressive feature rollout.
 * Supports props and URL parameters with prop precedence.
 *
 * @example
 * // Via props
 * <VNInvestCharts {...props} canaryLevel={10} />
 *
 * // Via URL params
 * // ?canaryLevel=10 or ?canaryLevel=30 or ?canaryLevel=100
 */

export type CanaryLevel = 10 | 30 | 100;

export interface CanaryRolloutConfig {
  /**
   * Canary level percentage: 10%, 30%, or 100% (full).
   * Determines what percentage of visible bars to display during rollout.
   * @default 100 (no canary, full rollout)
   */
  canaryLevel?: CanaryLevel;
}

export interface CanaryMetrics {
  /** Total visible bars in dataset */
  visibleBarsTotal: number;

  /** Visible bars after canary filter applied */
  visibleBarsAfterFilter: number;

  /** Canary percentage active (10, 30, or 100) */
  canaryPercentage: CanaryLevel;

  /** Feature flags status */
  workersActive: {
    externalBarsWorker: boolean;
    lodWorker: boolean;
  };

  /** Frame time p95 (ms), undefined if not measured */
  p95FrameTimeMs?: number;

  /** Request count since canary level change */
  requestCount?: number;

  /** Timestamp when canary level was applied (ms since epoch) */
  timestamp: number;
}

export interface CanaryGateDecision {
  /** Previous canary level */
  previousLevel: CanaryLevel;

  /** Current canary level */
  currentLevel: CanaryLevel;

  /** Metrics at the time of decision */
  metrics: CanaryMetrics;

  /** Recommendation: "GO" to proceed to next level, "NO-GO" to hold or rollback */
  recommendation: "GO" | "NO-GO";

  /** Human-readable reason for recommendation */
  reason: string;

  /** Timestamp when decision was made (ms since epoch) */
  timestamp: number;
}

export const DEFAULT_CANARY_LEVEL: CanaryLevel = 100;

const VALID_CANARY_LEVELS = new Set<CanaryLevel>([10, 30, 100]);

/**
 * Parse and validate canary level from value.
 * @param value Candidate value (number, string, or null)
 * @returns Valid CanaryLevel or DEFAULT_CANARY_LEVEL if invalid
 */
export function parseCanaryLevel(value: unknown): CanaryLevel {
	if (typeof value === "number") {
		if (VALID_CANARY_LEVELS.has(value as CanaryLevel)) {
			return value as CanaryLevel;
		}
	}

	if (typeof value === "string") {
		const parsed = parseInt(value, 10);
		if (!Number.isNaN(parsed) && VALID_CANARY_LEVELS.has(parsed as CanaryLevel)) {
			return parsed as CanaryLevel;
		}
	}

	return DEFAULT_CANARY_LEVEL;
}

/**
 * Resolve canary level from props and URL search parameters.
 * Props override URL params (props take precedence).
 *
 * @param props Canary config from component props
 * @param searchParams URL search parameters (e.g., from useLocation().search)
 * @returns Resolved canary level
 *
 * @example
 * // Props only
 * resolveCanaryLevel({ canaryLevel: 30 }) // => 30
 *
 * // URL params only
 * resolveCanaryLevel(undefined, new URLSearchParams("canaryLevel=10")) // => 10
 *
 * // Props override URL (props win)
 * resolveCanaryLevel(
 *   { canaryLevel: 30 },
 *   new URLSearchParams("canaryLevel=10")
 * ) // => 30
 */
export function resolveCanaryLevel(
	props?: CanaryRolloutConfig,
	searchParams?: URLSearchParams,
): CanaryLevel {
	let level: CanaryLevel = DEFAULT_CANARY_LEVEL;

	// Apply URL params first
	if (searchParams) {
		const urlLevel = searchParams.get("canaryLevel");
		level = parseCanaryLevel(urlLevel);
	}

	// Props override URL params
	if (props?.canaryLevel !== undefined) {
		level = parseCanaryLevel(props.canaryLevel);
	}

	return level;
}

/**
 * Create a decision recommendation based on canary metrics.
 * Currently: simple heuristic (NO-GO if p95 > 50ms, otherwise GO).
 * In production, this would integrate with real SLO/alerting.
 *
 * @param metrics Current canary metrics
 * @returns GO or NO-GO recommendation with reason
 */
export function makeCanaryGateRecommendation(metrics: CanaryMetrics): {
  recommendation: "GO" | "NO-GO";
  reason: string;
} {
	const thresholds = {
		p95FrameTimeMs: 50, // Go/no-go gate at p95 frame time
		maxBarsExpected: 4000, // Worker should handle up to 4K bars
	};

	// Check frame time
	if (
		metrics.p95FrameTimeMs !== undefined &&
    metrics.p95FrameTimeMs > thresholds.p95FrameTimeMs
	) {
		return {
			recommendation: "NO-GO",
			reason: `Frame time p95=${metrics.p95FrameTimeMs}ms exceeds threshold ${thresholds.p95FrameTimeMs}ms`,
		};
	}

	// Check if workers are active and needed
	if (metrics.canaryPercentage >= 30 && !metrics.workersActive.lodWorker) {
		return {
			recommendation: "NO-GO",
			reason: "LOD worker disabled but canary level >= 30% (risk of dropped bars)",
		};
	}

	return {
		recommendation: "GO",
		reason: "Metrics within acceptable range",
	};
}

/**
 * Format canary metrics for console logging or telemetry.
 * @param metrics Metrics to format
 * @returns Human-readable string
 */
export function formatCanaryMetrics(metrics: CanaryMetrics): string {
	const {
		visibleBarsTotal,
		visibleBarsAfterFilter,
		canaryPercentage,
		workersActive,
		p95FrameTimeMs,
		requestCount,
	} = metrics;

	const parts = [
		`Canary ${canaryPercentage}%`,
		`[${visibleBarsAfterFilter}/${visibleBarsTotal} bars]`,
		`workers={externalBars:${workersActive.externalBarsWorker},lod:${workersActive.lodWorker}}`,
	];

	if (p95FrameTimeMs !== undefined) {
		parts.push(`p95=${p95FrameTimeMs.toFixed(1)}ms`);
	}

	if (requestCount !== undefined) {
		parts.push(`requests=${requestCount}`);
	}

	return parts.join(" ");
}
