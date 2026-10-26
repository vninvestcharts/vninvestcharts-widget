import type { FinalityMode } from "../../lib/adapters";
import type { Timeframe } from "../../lib/types/adapter";
import type { OHLCVBar } from "../../lib/types/ohlcv";

/**
 * Options controlling how new bars override existing bars during merge.
 *
 * - `immutable`:              Never overwrite an existing bar (append-only for new timestamps).
 * - `near-now-provisional`:   Bars within `provisionalWindowMs` of `nowMs` may be overwritten;
 *                             older bars are treated as immutable.
 * - `historically-correctable`: Bars within `correctionLookbackMs` of `nowMs` may be overwritten;
 *                             bars older than the lookback are treated as immutable.
 *
 * When `finalityMode` is omitted the legacy behaviour (always overwrite) is preserved.
 */
export interface FinalityMergeOptions {
	readonly finalityMode: FinalityMode;
	/** Wall-clock "now" in epoch milliseconds. Defaults to Date.now() when omitted. */
	readonly nowMs?: number;
	/**
	 * Window (ms) around `nowMs` inside which `near-now-provisional` bars may be
	 * overwritten. Defaults to one timeframe bar width (caller should pass
	 * `resolveTimeframeMs(timeframe)` or similar).
	 */
	readonly provisionalWindowMs?: number;
	/**
	 * Lookback (ms) from `nowMs` inside which `historically-correctable` bars may be
	 * overwritten. Maps directly to `SourceSemanticsDescriptor.correctionLookbackMs`.
	 * When 0 or undefined, correction mode behaves like immutable for historical bars.
	 */
	readonly correctionLookbackMs?: number;
}

/**
 * Return true when `barMs` is within the mutable window defined by `opts`.
 */
function isMutableBar(barMs: number, opts: FinalityMergeOptions): boolean {
	const nowMs = opts.nowMs ?? Date.now();
	switch (opts.finalityMode) {
		case "immutable":
			return false;
		case "near-now-provisional": {
			const windowMs = opts.provisionalWindowMs ?? 0;
			return barMs >= nowMs - windowMs;
		}
		case "historically-correctable": {
			const lookbackMs = opts.correctionLookbackMs ?? 0;
			if (lookbackMs <= 0) return false;
			return barMs >= nowMs - lookbackMs;
		}
	}
}
export interface HistoryWindow {
	startMs: number;
	endMs: number;
}

export function resolveFetchWindow(timeframe: Timeframe): { from: Date; to: Date } {
	const to = new Date();
	const oneDay = 24 * 60 * 60 * 1000;
	const lookbackDays = (() => {
		switch (timeframe) {
			case "1m":
			case "3m":
			case "5m":
				return 7;
			case "15m":
			case "30m":
				return 14;
			case "1h":
				return 30;
			case "4h":
				return 90;
			case "1d":
			case "1D":
				return 365;
			default:
				return 30;
		}
	})();
	return { from: new Date(to.getTime() - lookbackDays * oneDay), to };
}

/**
 * Screen-first window for Phase 1 initial fetch.
 * Returns a window clipped to `screenBars` latest bars, but never
 * exceeding the full `resolveFetchWindow`. This keeps the blocking
 * initial load proportional to screen density per timeframe.
 */
export function resolveInitialFetchWindow(timeframe: Timeframe): { from: Date; to: Date } {
	const full = resolveFetchWindow(timeframe);
	const screenBars = (() => {
		switch (timeframe) {
			case "1d": return 500;
			case "4h":
			case "2h": return 2000;
			case "1h":
			case "30m":
			case "15m": return 5000;
			default: return 5000;
		}
	})();
	const minimalFrom = new Date(full.to.getTime() - resolveTimeframeMs(timeframe) * screenBars);
	return {
		from: minimalFrom.getTime() < full.from.getTime() ? full.from : minimalFrom,
		to: full.to,
	};
}

export function resolveTimeframeMs(timeframe: Timeframe): number {
	const result = (() => {
		switch (timeframe) {
			case "1m":
				return 60_000;
			case "3m":
				return 3 * 60_000;
			case "5m":
				return 5 * 60_000;
			case "15m":
				return 15 * 60_000;
			case "30m":
				return 30 * 60_000;
			case "1h":
				return 60 * 60_000;
			case "2h":
				return 2 * 60 * 60_000;
			case "4h":
				return 4 * 60 * 60_000;
			case "1d":
			case "1D":
				return 24 * 60 * 60_000;
			case "1w":
			case "1W":
				return 7 * 24 * 60 * 60_000;
			case "1M":
				return 30 * 24 * 60 * 60_000;
			default:
				return 24 * 60 * 60_000;
		}
	})();
	return result;
}

export function computeLoadedHistoryWindow(bars: readonly OHLCVBar[]): HistoryWindow | null {
	if (bars.length === 0) {
		return null;
	}

	return {
		startMs: bars[0].date.getTime(),
		endMs: bars[bars.length - 1].date.getTime(),
	};
}

export function resolveRetentionWindow(visibleDomain: readonly [Date, Date], timeframe: Timeframe): HistoryWindow {
	const visibleStartMs = visibleDomain[0].getTime();
	const visibleEndMs = visibleDomain[1].getTime();
	const spanMs = Math.max(resolveTimeframeMs(timeframe), visibleEndMs - visibleStartMs);

	return {
		startMs: visibleStartMs - spanMs,
		endMs: visibleEndMs + spanMs,
	};
}

export function trimBarsToRetentionWindow(
	bars: readonly OHLCVBar[],
	visibleDomain: readonly [Date, Date] | null,
	timeframe: Timeframe,
): readonly OHLCVBar[] {
	if (!visibleDomain || bars.length === 0) {
		return bars;
	}

	const retentionWindow = resolveRetentionWindow(visibleDomain, timeframe);
	const trimmedBars = bars.filter((bar) => {
		const timestamp = bar.date.getTime();
		return timestamp >= retentionWindow.startMs && timestamp <= retentionWindow.endMs;
	});

	if (trimmedBars.length === 0 || trimmedBars.length === bars.length) {
		return bars;
	}

	return trimmedBars;
}

export function mergeBarPagesByDate(previousBars: readonly OHLCVBar[], nextBars: readonly OHLCVBar[]): readonly OHLCVBar[] {
	return nextBars.reduce((mergedBars, nextBar) => mergeBarsByDate(mergedBars, nextBar), previousBars);
}

export function mergeBarsByDate(previousBars: readonly OHLCVBar[], nextBar: OHLCVBar): readonly OHLCVBar[] {
	if (previousBars.length === 0) {
		return [nextBar];
	}
	const lastBar = previousBars[previousBars.length - 1];
	if (lastBar.date.getTime() === nextBar.date.getTime()) {
		return [...previousBars.slice(0, -1), nextBar];
	}
	if (lastBar.date.getTime() < nextBar.date.getTime()) {
		return [...previousBars, nextBar];
	}
	const existingIndex = previousBars.findIndex((bar) => bar.date.getTime() === nextBar.date.getTime());
	if (existingIndex >= 0) {
		return previousBars.map((bar, index) => (index === existingIndex ? nextBar : bar));
	}
	return [...previousBars, nextBar].sort((left, right) => left.date.getTime() - right.date.getTime());
}

/**
 * Finality-aware variant of `mergeBarPagesByDate`.
 *
 * When `opts` is provided each incoming bar is only allowed to overwrite an
 * existing bar when `isMutableBar` returns true for that bar's timestamp.
 * Bars with new timestamps are always inserted regardless of finality.
 */
export function mergeBarPagesByDateWithFinality(
	previousBars: readonly OHLCVBar[],
	nextBars: readonly OHLCVBar[],
	opts: FinalityMergeOptions,
): readonly OHLCVBar[] {
	return nextBars.reduce((mergedBars, nextBar) => mergeBarsByDateWithFinality(mergedBars, nextBar, opts), previousBars);
}

/**
 * Finality-aware variant of `mergeBarsByDate`.
 *
 * Rules:
 *  - New timestamp → always insert.
 *  - Existing timestamp + mutable → overwrite (same as legacy behaviour).
 *  - Existing timestamp + immutable → keep existing bar, discard incoming.
 */
/**
 * Filter `incomingBars` so that bars whose timestamps already exist in
 * `residentBars` are kept only when they fall within the mutable window.
 *
 * Use this BEFORE passing bars to `HistoryChunkStore.prepend / append` when
 * you want finality-aware merge without changing the chunkStore internals.
 *
 * Bars with entirely new timestamps pass through unconditionally.
 */
export function filterBarsForFinalityMerge(
	incomingBars: readonly OHLCVBar[],
	residentBars: readonly OHLCVBar[],
	opts: FinalityMergeOptions,
): readonly OHLCVBar[] {
	if (incomingBars.length === 0 || residentBars.length === 0) {
		return incomingBars;
	}

	let incomingStartMs = incomingBars[0].date.getTime();
	let incomingEndMs = incomingStartMs;
	for (const bar of incomingBars) {
		const barMs = bar.date.getTime();
		if (barMs < incomingStartMs) {
			incomingStartMs = barMs;
		}
		if (barMs > incomingEndMs) {
			incomingEndMs = barMs;
		}
	}

	const residentStartMs = residentBars[0].date.getTime();
	const residentEndMs = residentBars[residentBars.length - 1].date.getTime();
	if (incomingEndMs < residentStartMs || incomingStartMs > residentEndMs) {
		return incomingBars;
	}

	if (opts.finalityMode === "historically-correctable" || opts.finalityMode === "near-now-provisional") {
		const nowMs = opts.nowMs ?? Date.now();
		let cutoffMs: number;
		if (opts.finalityMode === "near-now-provisional") {
			const windowMs = opts.provisionalWindowMs ?? 0;
			cutoffMs = nowMs - windowMs;
		} else {
			const lookbackMs = opts.correctionLookbackMs ?? 0;
			cutoffMs = lookbackMs > 0 ? nowMs - lookbackMs : Infinity;
		}
		const residentTs = new Set(residentBars.map((b) => b.date.getTime()));
		return incomingBars.filter((bar) => {
			const barMs = bar.date.getTime();
			if (!residentTs.has(barMs)) return true;
			return barMs >= cutoffMs;
		});
	}
	if (opts.finalityMode === "immutable") {
		const residentTs = new Set(residentBars.map((b) => b.date.getTime()));
		return incomingBars.filter((bar) => !residentTs.has(bar.date.getTime()));
	}
	return incomingBars;
}

export function mergeBarsByDateWithFinality(
	previousBars: readonly OHLCVBar[],
	nextBar: OHLCVBar,
	opts: FinalityMergeOptions,
): readonly OHLCVBar[] {
	if (previousBars.length === 0) {
		return [nextBar];
	}
	const barMs = nextBar.date.getTime();
	const lastBar = previousBars[previousBars.length - 1];
	if (lastBar.date.getTime() === barMs) {
		// Tail overwrite: only allowed when bar is mutable.
		if (!isMutableBar(barMs, opts)) {
			return previousBars; // keep existing
		}
		return [...previousBars.slice(0, -1), nextBar];
	}
	if (lastBar.date.getTime() < barMs) {
		return [...previousBars, nextBar];
	}
	const existingIndex = previousBars.findIndex((bar) => bar.date.getTime() === barMs);
	if (existingIndex >= 0) {
		if (!isMutableBar(barMs, opts)) {
			return previousBars; // keep existing
		}
		return previousBars.map((bar, index) => (index === existingIndex ? nextBar : bar));
	}
	return [...previousBars, nextBar].sort((left, right) => left.date.getTime() - right.date.getTime());
}