/**
 * CE20: DataAdapter abstraction for demo data fetching.
 *
 * This is intentionally separate from `StockDataAdapter` (used by VNInvestCharts for
 * chart rendering). `DataAdapter` handles historical bar loading for the demo shell.
 */

import type {
	CoverageFragment,
	CoverageBulkSlotInfo,
	CoverageMode,
	SessionModel,
	FinalityMode,
	GapReason,
	SourceSemanticsDescriptor,
} from "@vninvestcharts/engine-core";

/** A single OHLCV bar with a Unix-ms timestamp. */
export interface KLineBar {
	timestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

/** Whether we are fetching the initial set, newer bars, or older bars. */
export type GetBarsType = "init" | "forward" | "backward";

export interface GetBarsParams {
	type: GetBarsType;
	symbol: string;
	interval: string;
	/**
	 * Anchor timestamp (ms).
	 * - "init"/"forward": unused (pass null)
	 * - "backward": fetch bars whose close time is strictly before this value
	 */
	timestamp: number | null;
	limit: number;
	signal?: AbortSignal;
}

export interface GetBarsResult {
	bars: KLineBar[];
	/** true when the source may have more bars further back */
	hasMore: boolean;
}

/**
 * Canonical fetch result that carries coverage fragments alongside bars.
 *
 * `coverage` describes exactly which time ranges were resolved by this fetch
 * call and why any sub-range remains unresolved. The consumer (planner, cache
 * writer) can use this to reclassify gaps from `not-fetched` to a concrete
 * `GapReason` without making a second API call.
 */
export interface CanonicalFetchResult extends GetBarsResult {
	/** One or more fragments describing the resolved and unresolved coverage. */
	readonly coverage: readonly CoverageFragment[];
}

export interface Level2Snapshot {
	symbol: string;
	timestamp: number;
	bids: [price: number, size: number][]; // sorted desc
	asks: [price: number, size: number][]; // sorted asc
}

export interface TickData {
	symbol: string;
	timestamp: number;
	price: number;
	size: number;
	side: "buy" | "sell"; // aggressor side
}

export interface DataAdapter {
	readonly name: string;
	getBars(params: GetBarsParams): Promise<GetBarsResult>;
	/**
	 * Optional exact-range helper for sources that can fetch directly by [from, to].
	 * The widget bridge prefers this over `getBars()` when present so it does not
	 * collapse range requests into a latest-page bootstrap.
	 */
	fetchBarsInRange?(symbol: string, timeframe: string, from: Date, to: Date, signal?: AbortSignal): Promise<readonly KLineBar[]>;
	/**
	 * Optional backward-anchor helper mirroring the widget contract directly.
	 */
	fetchBarsBefore?(symbol: string, timeframe: string, before: Date, limit?: number, signal?: AbortSignal): Promise<readonly KLineBar[]>;
	/**
	 * Optional canonical variant of getBars that also returns coverage fragments.
	 * Adapters that can accurately report what they fetched (and what they could
	 * not) should implement this method.  The demo bridge prefers this over
	 * getBars when present.
	 */
	getBarsCanonical?(params: GetBarsParams): Promise<CanonicalFetchResult>;
	getSourceSemantics?(): SourceSemanticsDescriptor;

	/** Subscribe to Level 2 order book updates */
	subscribeLevel2?(params: {
		symbol: string;
		depth: number; // number of levels
		callback: (snapshot: Level2Snapshot) => void;
	}): () => void;

  /** Subscribe to tick/print data */
  subscribeTicks?(params: {
    symbol: string;
    callback: (tick: TickData) => void;
  }): () => void;

  /**
   * Subscribe to live kline (candle) updates for the given symbol + interval.
   * Emits the current candle on every update (same `timestamp` while the candle
   * is open; a new `timestamp` when a new candle opens). Consumers dedupe by
   * timestamp so re-emits update the open candle in place.
   */
  subscribeKline?(params: {
    symbol: string;
    interval: string;
    callback: (bar: KLineBar & { isClosed?: boolean }) => void;
  }): () => void;

	/** Fetch historical Level 2 snapshots (if available) */
	fetchLevel2History?(params: {
		symbol: string;
		from: number;
		to: number;
		depth: number;
	}): Promise<Level2Snapshot[]>;

	/** Fetch historical tick data */
	fetchTickHistory?(params: {
		symbol: string;
		from: number;
		to: number;
	}): Promise<TickData[]>;

	/**
	 * Phase 4 — Optional bulk coverage endpoint for multi-chart prefetch.
	 *
	 * When implemented, the widget can issue 1 bulk request instead of N
	 * individual fetchBarsInRange calls during layout change.
	 *
	 * Returns coverage metadata per slotId, allowing the widget to:
	 * - Determine which ranges are already available
	 * - Only fetch missing gaps
	 * - Mount charts with coverage data for zero-wait render
	 */
	fetchCoverageBulk?(slots: Array<{
		slotId: string;
		symbol: string;
		timeframe: string;
	}>): Promise<Record<string, CoverageBulkSlotInfo>>;
}
