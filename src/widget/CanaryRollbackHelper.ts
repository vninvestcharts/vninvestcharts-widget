/**
 * Canary rollback safety validation and emergency response helpers.
 * Enables operators to safely revert canary levels with confidence via metrics.
 *
 * @example
 * const validation = validateRollbackSafety(beforeMetrics, afterMetrics);
 * if (!validation.safe) {
 *   // Log incident, alert operator
 *   console.warn("[Rollback UNSAFE]", validation.reason);
 * }
 */

export interface RollbackSnapshot {
  /** Canary level at snapshot time (10, 30, or 100) */
  level: 10 | 30 | 100;

  /** Number of visible bars at snapshot time */
  barCount: number;

  /** Feature flags state at snapshot time */
  workersActive: {
    externalBarsWorker: boolean;
    lodWorker: boolean;
  };

  /** Unix timestamp when snapshot was captured (ms) */
  timestamp: number;
}

export interface RollbackValidation {
  /** True if rollback appears safe, false otherwise */
  safe: boolean;

  /** Human-readable reason for safety assessment */
  reason: string;

  /** Absolute bar count difference (after - before) */
  barCountDifference: number;

  /** True if potential data loss detected (unexpected bar reduction) */
  potentialDataLoss: boolean;

  /** Suggested next action ("MONITOR" | "INVESTIGATE" | "DISABLE_WORKER") */
  suggestedAction: "MONITOR" | "INVESTIGATE" | "DISABLE_WORKER";
}

export interface RollbackEvent {
  /** Previous canary level before rollback */
  previousLevel: 10 | 30 | 100;

  /** New canary level after rollback */
  newLevel: 10 | 30 | 100;

  /** Metrics snapshot before rollback */
  beforeMetrics: RollbackSnapshot;

  /** Metrics snapshot after rollback */
  afterMetrics: RollbackSnapshot;

  /** Safety validation result */
  validation: RollbackValidation;

  /** Incident severity: CRITICAL (immediate danger), HIGH (degradation), INFO (normal) */
  severity: "CRITICAL" | "HIGH" | "INFO";

  /** Unix timestamp of rollback event (ms) */
  timestamp: number;
}

export interface EmergencyRollbackRecommendation {
  /** Recommended target canary level to revert to */
  targetLevel: 10 | 30 | 100;

  /** Incident severity classification */
  severity: "CRITICAL" | "HIGH";

  /** Recommended action for operator */
  recommendation: string;
}

/**
 * Validate that a rollback was safe and didn't lose data.
 * Compares bar counts and worker state before/after.
 *
 * @param before Metrics snapshot before rollback
 * @param after Metrics snapshot after rollback
 * @returns Validation result with safety assessment and suggested action
 *
 * @example
 * const validation = validateRollbackSafety(before, after);
 * if (!validation.safe) {
 *   logger.error("[Rollback UNSAFE]", validation.reason);
 *   // Consider disabling problematic worker
 * }
 */
export function validateRollbackSafety(
	before: RollbackSnapshot,
	after: RollbackSnapshot,
): RollbackValidation {
	const barCountDiff = after.barCount - before.barCount;

	// Detect potential data loss: rolling back to lower level should increase bar count
	// (e.g., 100% → 30% should show fewer bars, so after should have fewer than before)
	const isRollingBack = after.level < before.level;
	const hasUnexpectedBarLoss = isRollingBack && barCountDiff > 0;

	if (hasUnexpectedBarLoss) {
		return {
			safe: false,
			reason: `Unexpected bar loss during rollback: expected fewer bars at level ${after.level}% but got +${barCountDiff}`,
			barCountDifference: barCountDiff,
			potentialDataLoss: true,
			suggestedAction: "INVESTIGATE",
		};
	}

	// Check worker state consistency
	const workerStateChanged =
    before.workersActive.externalBarsWorker !==
      after.workersActive.externalBarsWorker ||
    before.workersActive.lodWorker !== after.workersActive.lodWorker;

	if (workerStateChanged) {
		return {
			safe: false,
			reason: `Worker state changed unexpectedly during rollback: before={${JSON.stringify(before.workersActive)}}, after={${JSON.stringify(after.workersActive)}}`,
			barCountDifference: barCountDiff,
			potentialDataLoss: false,
			suggestedAction: "DISABLE_WORKER",
		};
	}

	// All checks passed
	return {
		safe: true,
		reason: `Rollback ${before.level}% → ${after.level}% validated: bar count change=${barCountDiff}, workers consistent`,
		barCountDifference: barCountDiff,
		potentialDataLoss: false,
		suggestedAction: "MONITOR",
	};
}

/**
 * Generate emergency rollback recommendation based on current canary level.
 * Used when operator manually triggers rollback due to incident.
 *
 * @param currentLevel Current active canary level (10, 30, or 100)
 * @returns Recommendation with target level and severity
 *
 * @example
 * const rec = createEmergencyRollbackTrigger(100);
 * // For 100%: recommends immediate rollback to 30% (CRITICAL severity)
 * // For 30%: recommends wait-and-monitor (no automatic rollback)
 */
export function createEmergencyRollbackTrigger(
	currentLevel: 10 | 30 | 100,
): EmergencyRollbackRecommendation {
	switch (currentLevel) {
		case 100:
			return {
				targetLevel: 30,
				severity: "CRITICAL",
				recommendation:
          "IMMEDIATE: Roll back from 100% to 30%. Production impact likely. Execute now.",
			};

		case 30:
			return {
				targetLevel: 10,
				severity: "HIGH",
				recommendation:
          "URGENT: Roll back from 30% to 10%. Limited scope but escalating. Execute within 2 min.",
			};

		case 10:
			return {
				targetLevel: 10,
				severity: "HIGH",
				recommendation:
          "Alert: Already at 10% canary. If still degraded, disable problematic worker via backfillWorkerFlags.",
			};

		default:
			const _exhaustive: never = currentLevel;
			return _exhaustive;
	}
}

/**
 * Format rollback event for console logging or telemetry.
 * @param event Rollback event to format
 * @returns Human-readable string
 */
export function formatRollbackEvent(event: RollbackEvent): string {
	const status = event.validation.safe ? "SAFE" : "UNSAFE";
	const severity = event.severity;
	const barDiff = event.validation.barCountDifference;
	const barDiffStr = barDiff > 0 ? `+${barDiff}` : `${barDiff}`;

	return `[Canary Rollback] ${event.previousLevel}% → ${event.newLevel}% [${status}] [${severity}] bars:${barDiffStr} action:${event.validation.suggestedAction}`;
}
