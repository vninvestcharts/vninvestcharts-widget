/**
 * Canary bar filtering logic for progressive rollout.
 * Implements percentage-based visibility of most recent bars.
 */

import type { OHLCVBar } from "../lib/types/ohlcv";
import type { CanaryLevel } from "./CanaryRolloutConfig";

/**
 * Apply canary filter to visible bars.
 * When canaryLevel < 100, returns only the most recent N% of bars.
 * Maintains temporal order and data integrity.
 *
 * @param bars All visible bars from data source
 * @param canaryLevel Canary percentage (10, 30, or 100)
 * @returns Filtered bars (subset when canaryLevel < 100)
 *
 * @example
 * const allBars = [bar1, bar2, ..., bar1000];
 * const canary10 = applyCanaryFilter(allBars, 10);
 * // => last ~100 bars (10% of 1000)
 *
 * const canary100 = applyCanaryFilter(allBars, 100);
 * // => all bars unchanged
 */
export function applyCanaryFilter(
	bars: readonly OHLCVBar[],
	canaryLevel: CanaryLevel,
): readonly OHLCVBar[] {
	// No filter at 100% (full production)
	if (canaryLevel === 100) {
		return bars;
	}

	// Handle empty or invalid input
	if (!Array.isArray(bars) || bars.length === 0) {
		return bars;
	}

	// Calculate how many bars to keep from the end (most recent)
	const keepCount = Math.max(1, Math.ceil(bars.length * (canaryLevel / 100)));

	// Return the most recent N bars, preserving order
	return bars.slice(-keepCount);
}

/**
 * Calculate canary slice statistics (for debugging/logging).
 * @param totalBars Total bars available
 * @param canaryLevel Canary percentage
 * @returns Slice information
 */
export function getCanarySliceInfo(
	totalBars: number,
	canaryLevel: CanaryLevel,
): {
  keepCount: number;
  percentage: number;
  description: string;
} {
	if (canaryLevel === 100 || totalBars === 0) {
		return {
			keepCount: totalBars,
			percentage: 100,
			description: `All ${totalBars} bars (100%)`,
		};
	}

	const keepCount = Math.max(1, Math.ceil(totalBars * (canaryLevel / 100)));
	return {
		keepCount,
		percentage: canaryLevel,
		description: `${keepCount} of ${totalBars} bars (${canaryLevel}%)`,
	};
}
