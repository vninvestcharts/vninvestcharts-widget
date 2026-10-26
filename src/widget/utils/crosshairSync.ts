/**
 * crosshairSync.ts — Shared helper for resolving crosshair position from timestamp.
 *
 * When two charts have different data (different symbol/timeframe/bar-count),
 * the source chart's xIndexFloat is NOT valid as a local index on the target chart.
 * This helper resolves the correct local index by binary-searching for the timestamp
 * in the target chart's plotData, then interpolating a fractional position within the bar.
 */

interface PlotDatum {
	date: Date;
}

/**
 * Estimate the target chart's bar duration (ms) as the MINIMUM gap between
 * consecutive bars over a bounded sample. The minimum is robust against
 * calendar gaps (an exchange-calendar series has mostly 1-day gaps but the odd
 * 3-day weekend gap — the minimum still recovers the true 1-day duration).
 */
function estimateBarDurationMs(plotData: readonly PlotDatum[]): number | null {
	if (plotData.length < 2) return null;
	const sampleCount = Math.min(plotData.length - 1, 200);
	let minGap = Infinity;
	for (let i = 1; i <= sampleCount; i++) {
		const gap = plotData[i].date.getTime() - plotData[i - 1].date.getTime();
		if (gap > 0 && gap < minGap) minGap = gap;
	}
	return Number.isFinite(minGap) ? minGap : null;
}

/**
 * Resolve a FRACTIONAL local x-index on the TARGET chart from a remote timestamp.
 *
 * The crosshair on the source chart sits at a concrete point in time T (the
 * mouse position on the source time axis, not necessarily a bar boundary). To
 * mirror it exactly, the target chart needs `index + fraction` where `index` is
 * the target bar covering T and `fraction ∈ [0,1)` is where inside that bar T
 * falls — this reproduces the precise pixel position of the cursor, not just the
 * bar's left edge.
 *
 * Two data sources may stamp the same logical bar at different clock offsets
 * (e.g. a VN-exchange chart stamps a 1D bar at 00:00 Asia/Ho_Chi_Minh = 17:00
 * UTC of the previous day, while a crypto chart stamps 00:00 UTC). We therefore
 * align T onto the target chart's OWN bar grid (phase = the target bars' offset
 * within a bar-duration) before computing the bucket + fraction. This keeps the
 * cursor position accurate while absorbing the timezone offset.
 *
 * Returns `null` when T falls in a real gap the target chart does not cover
 * (weekend/holiday for an exchange-calendar chart) so the caller hides the
 * crosshair; it reappears when T lands within a real target bar. A continuous
 * target (crypto) has a bar in every bucket, so it always resolves.
 *
 * @param plotData  - target chart's plotData array (sorted by date ascending)
 * @param timestamp - source chart's crosshair timestamp (ms since epoch)
 * @param sourceFraction - cursor's fractional position INSIDE the source bar
 *        (0 = bar start, ~0.5 = center), taken from the source `xIndexFloat`.
 *        This carries the true cursor position independent of any timezone
 *        offset between the two data sources. When omitted, the fraction is
 *        derived from where T sits inside the nearest target bar (less accurate
 *        across a tz offset, kept for callers that have no source index).
 * @returns fractional local x-index (index + fraction), or null if no target bar covers T
 */
export function resolveLocalXIndexFromTimestamp(
	plotData: readonly PlotDatum[],
	timestamp: number,
	sourceFraction?: number,
): number | null {
	if (plotData.length === 0) return null;

	const barDurationMs = estimateBarDurationMs(plotData);

	// Binary search: find the last bar whose date <= timestamp.
	let low = 0;
	let high = plotData.length - 1;
	let dataIndex = -1;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const midTime = plotData[mid].date.getTime();
		if (midTime <= timestamp) {
			dataIndex = mid;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	// Normalize the source-bar fraction to [0, 1) when provided.
	let frac = 0;
	if (sourceFraction != null && Number.isFinite(sourceFraction)) {
		frac = sourceFraction - Math.floor(sourceFraction);
	}

	// Single-bar series: no duration to interpolate → require near-exact.
	if (barDurationMs == null) {
		if (dataIndex < 0) {
			return timestamp === plotData[0].date.getTime() ? 0 : null;
		}
		return timestamp === plotData[dataIndex].date.getTime() ? dataIndex + frac : null;
	}

	// Choose the nearest bar to T (absorbs a whole-bar timezone offset), then
	// interpolate the cursor's fractional position INSIDE that bar.
	const candidates: number[] = [];
	if (dataIndex >= 0) candidates.push(dataIndex);
	if (dataIndex + 1 < plotData.length) candidates.push(dataIndex + 1);
	if (candidates.length === 0) return null;

	let bestIndex = candidates[0];
	let bestDelta = Math.abs(plotData[bestIndex].date.getTime() - timestamp);
	for (let i = 1; i < candidates.length; i++) {
		const delta = Math.abs(plotData[candidates[i]].date.getTime() - timestamp);
		if (delta < bestDelta) {
			bestDelta = delta;
			bestIndex = candidates[i];
		}
	}

	// Reject a real calendar gap: the nearest bar is more than half a duration
	// away → no bar covers T → hide crosshair.
	if (bestDelta > barDurationMs / 2) {
		return null;
	}

	// Cursor position = chosen target bar + the cursor's fraction inside the
	// SOURCE bar. Using the source fraction (not T's offset within the target
	// bar) makes the position exact and immune to any timezone offset between
	// the two data sources. Falls back to the target-bar-relative fraction when
	// no source fraction is available.
	if (sourceFraction != null && Number.isFinite(sourceFraction)) {
		return bestIndex + frac;
	}
	const signedFrac = (timestamp - plotData[bestIndex].date.getTime()) / barDurationMs;
	return bestIndex + signedFrac;
}

export interface CrosshairPriceRemote {
	price?: number | null;
	symbol?: string | null;
}

// Q4 price-local rule (spec §2.2, B4): the time axis syncs, the price axis is
// LOCAL. The remote absolute price is projected only when it belongs to the
// same symbol (and is finite); otherwise the target chart's own bar close at
// the synced timestamp is used. Returns null when neither is usable — the
// caller falls back to mid-pane (vertical-only crosshair).
export function resolveCrosshairPrice(
	remote: CrosshairPriceRemote,
	localSymbol: unknown,
	localClose: number | null,
): number | null {
	const remotePrice = remote?.price ?? null;
	const remoteSymbol = remote?.symbol ?? null;
	if (
		remotePrice != null && Number.isFinite(remotePrice) &&
		typeof remoteSymbol === "string" && remoteSymbol !== "" && remoteSymbol === localSymbol
	) {
		return remotePrice;
	}
	return typeof localClose === "number" && Number.isFinite(localClose) ? localClose : null;
}
