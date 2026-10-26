/**
 * WP-04: VNInvestDataAdapter
 *
 * Implements `StockDataAdapter` interface, wrapping VNInvestClient (REST)
 * and VNInvestWebSocketClient (WebSocket) into a single cohesive adapter.
 *
 * This is the OPTIONAL subpath import — NOT bundled in core IIFE.
 * Usage:
 *   import { VNInvestDataAdapter } from '@vninvestcharts/widget/adapters';
 */

import type {
	StockDataAdapter,
	Unsubscribe,
	Timeframe,
	Trade,
	OrderbookSnapshot,
	SymbolInfo,
} from "../../lib/types/adapter";
import type { OHLCVBar } from "../../lib/types/ohlcv";
import type { CoverageFragment, SourceSemanticsDescriptor, FinalityMode } from "@vninvestcharts/engine-core";
import { VNInvestClient, type VNIBarsParams, type WidgetAuthHandler } from "./VNInvestClient";
import { VNInvestWebSocketClient, type TickerUpdateEvent } from "./VNInvestWebSocketClient";

/**
 * BE-01: Max bars per /bars/ request. Backend enforces `_OHLCV_BAR_LIMIT_MAX = 1000`
 * (HTTP 400 LIMIT_EXCEEDED above it) — verified live 2026-09-21. Larger ranges are
 * covered by the forward/backward paging loops, never by a bigger limit.
 */
const PAGE_LIMIT = 1000;

/** Configuration for VNInvestDataAdapter. */
export interface VNInvestDataAdapterConfig {
	/** Personal Access Token — never hardcoded, always passed by host app. */
	patToken: string;
	/** API base URL. Falls back to resolveApiBase() if not provided. */
	apiBase?: string;
}

/**
 * Full-featured data adapter for the VNInvest platform.
 *
 * Implements:
 *   - fetchBarsInRange / fetchBarsBefore (cursor-paged /bars/ endpoint)
 *   - subscribeToBar (WebSocket ticker_update)
 *   - searchSymbols (GET /stocks/)
 *
 * Not implemented (VNInvest does not provide these endpoints):
 *   - subscribeToTrades → returns no-op unsubscribe
 *   - subscribeToOrderbook → returns no-op unsubscribe
 */
export class VNInvestDataAdapter implements StockDataAdapter {
	readonly name = "vninvest";
	private client: VNInvestClient;
	private wsClient: VNInvestWebSocketClient | null = null;
	private readonly barSubscribers = new Map<string, Set<(bar: OHLCVBar) => void>>();
	private readonly snapshotIds = new Map<string, string>();
	private readonly lastBackfillCoverageMap = new Map<string, readonly CoverageFragment[]>();
	private readonly lastRangeCoverageMap = new Map<string, readonly CoverageFragment[]>();

	constructor(config: VNInvestDataAdapterConfig) {
		this.client = new VNInvestClient(config.patToken);
		if (config.apiBase) {
			this.client.setBase(config.apiBase);
		}
	}

	setAuthHandler(handler: WidgetAuthHandler): void {
		this.client.setAuthHandler(handler);
	}

	getSourceSemantics(): SourceSemanticsDescriptor {
		return {
			sourceId: this.name,
			sourceContractVersion: "vninvest-backfill-v1",
			instrumentClass: "equity",
			coverageMode: "exact-range",
			sessionModel: "exchange-calendar",
			timezone: "Asia/Ho_Chi_Minh",
			sessionCalendarId: "vn-exchange-calendar",
			supportsExactRangeFetch: true,
			supportsBackwardAnchor: true,
			supportsForwardAnchor: false,
			supportsLiveBars: true,
			maxBarsPerRequest: PAGE_LIMIT,
			finalityMode: "historically-correctable" as FinalityMode,
			correctionLookbackMs: 30 * 86_400_000,
			expectedGapReasons: ["not-fetched", "market-closed", "source-no-data", "rate-limited", "boundary-exhausted"],
		};
	}

	private coverageKey(symbol: string, timeframe: Timeframe, chartId?: string): string {
		const scope = chartId ?? "__global__";
		return `${scope}:${symbol.toUpperCase()}:${timeframe}`;
	}

	getLastBackfillCoverage(symbol?: string, timeframe?: Timeframe, chartId?: string): readonly CoverageFragment[] | null {
		if (!symbol || !timeframe) {
			return null;
		}
		const key = this.coverageKey(symbol, timeframe, chartId);
		return this.lastBackfillCoverageMap.get(key) ?? null;
	}

	getLastRangeCoverage(symbol?: string, timeframe?: Timeframe, chartId?: string): readonly CoverageFragment[] | null {
		if (!symbol || !timeframe) {
			return null;
		}
		const key = this.coverageKey(symbol, timeframe, chartId);
		return this.lastRangeCoverageMap.get(key) ?? null;
	}

	/** Expose the underlying REST client for advanced use cases. */
	get restClient(): VNInvestClient {
		return this.client;
	}

	/**
	 * Fetch bars in a date range.
	 * Uses the cursor-paged /bars/ endpoint with backward pagination.
	 *
	 * 504-guard: a single wide intraday window (e.g. 90d of 1H) times the server
	 * out — each request is capped to MAX_INTRADAY_SPAN_MS and the existing
	 * hasMoreAfter/nextAfter loop walks the remainder. Daily+ ranges are unaffected.
	 */
	async fetchBarsInRange(
		symbol: string,
		timeframe: Timeframe,
		from: Date,
		to: Date,
		chartId?: string,
		signal?: AbortSignal,
	): Promise<readonly OHLCVBar[]> {
		// DATA-03: the coordinator owns an AbortController per in-flight key and
		// passes it in. Honour it so a caller-side cancel (unmount, symbol
		// switch) stops the pagination loop instead of running to completion.
		const throwIfAborted = () => {
			if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
		};
		throwIfAborted();
		const allBars: OHLCVBar[] = [];
		const chunkSpan = isIntradayTimeframe(timeframe) ? MAX_INTRADAY_SPAN_MS : Number.POSITIVE_INFINITY;

		// Initial fetch covering the range
		const initParams: VNIBarsParams = {
			type: "init",
			symbol,
			timeframe,
			from: from.valueOf(),
			to: Math.min(to.valueOf(), from.valueOf() + chunkSpan),
			limit: PAGE_LIMIT,
		};

		let page = await this.client.getBarsPage(initParams);
		const key = this.coverageKey(symbol, timeframe, chartId);
		if (page.snapshotId) {
			this.snapshotIds.set(key, page.snapshotId);
		}

		let bars = sortBarsByDate(pageToOHLCV(page.bars));
		allBars.push(...bars);

		// Continue fetching forward if there's more data after the current range
		while (page.hasMoreAfter && page.nextAfter !== null) {
			throwIfAborted();
			const forwardParams: VNIBarsParams = {
				type: "init",
				symbol,
				timeframe,
				from: page.nextAfter,
				to: Math.min(to.valueOf(), page.nextAfter + chunkSpan),
				limit: PAGE_LIMIT,
			};
			page = await this.client.getBarsPage(forwardParams);
			if (page.snapshotId) {
				this.snapshotIds.set(key, page.snapshotId);
			}
			bars = sortBarsByDate(pageToOHLCV(page.bars));
			if (bars.length === 0) break;
			allBars.push(...bars);
		}

		if (allBars.length === 0) {
			this.lastRangeCoverageMap.set(key, [
				{ fromTs: from.valueOf(), toTs: to.valueOf(), status: "unresolved", reason: "source-no-data" }
			]);
		} else {
			const oldestTs = allBars[0].date.getTime();
			const newestTs = allBars[allBars.length - 1].date.getTime();
			const covered: CoverageFragment = { fromTs: oldestTs, toTs: newestTs, status: "covered" };
			const fragments: CoverageFragment[] = [covered];
			if (!page.hasMoreBefore) {
				fragments.unshift({ fromTs: 0, toTs: oldestTs, status: "unresolved", reason: "boundary-exhausted" });
			}
			if (!page.hasMoreAfter) {
				fragments.push({ fromTs: newestTs, toTs: to.valueOf(), status: "unresolved", reason: "boundary-exhausted" });
			}
			this.lastRangeCoverageMap.set(key, fragments);
		}

		return allBars;
	}

	/**
	 * Fetch bars before a given anchor date (backward pagination).
	 */
	async fetchBarsBefore(
		symbol: string,
		timeframe: Timeframe,
		before: Date,
		limit = PAGE_LIMIT,
		chartId?: string,
	): Promise<readonly OHLCVBar[]> {
		const key = this.coverageKey(symbol, timeframe, chartId);
		const snapshotId = this.snapshotIds.get(key);

		const params: VNIBarsParams = {
			type: "backward",
			symbol,
			timeframe,
			before: before.valueOf(),
			limit,
			snapshotId,
		};

		const page = await this.client.getBarsPage(params);
		if (page.snapshotId) {
			this.snapshotIds.set(key, page.snapshotId);
		}

		const bars = sortBarsByDate(pageToOHLCV(page.bars));

		if (bars.length === 0) {
			this.lastBackfillCoverageMap.set(key, [
				{ fromTs: 0, toTs: before.valueOf(), status: "unresolved", reason: "boundary-exhausted" }
			]);
		} else {
			const oldestTs = bars[0].date.getTime();
			const newestTs = bars[bars.length - 1].date.getTime();
			const covered: CoverageFragment = { fromTs: oldestTs, toTs: newestTs, status: "covered" };
			if (!page.hasMoreBefore) {
				this.lastBackfillCoverageMap.set(key, [
					{ fromTs: 0, toTs: oldestTs, status: "unresolved", reason: "boundary-exhausted" },
					covered,
				]);
			} else {
				this.lastBackfillCoverageMap.set(key, [covered]);
			}
		}

		return bars;
	}

	/**
	 * Subscribe to real-time bar updates via WebSocket.
	 * Maps ticker_update events to OHLCVBar callbacks.
	 */
	subscribeToBar(
		symbol: string,
		timeframe: Timeframe,
		onBar: (bar: OHLCVBar) => void,
	): Unsubscribe {
		const key = `${symbol.toUpperCase()}:${timeframe}`;

		if (!this.wsClient) {
			this.wsClient = new VNInvestWebSocketClient(
				this.client.getPAT(),
				this.client.getBase(),
			);
			this.wsClient.setOnTickerUpdate(this.handleTickerUpdate.bind(this));
			this.wsClient.connect();
		}

		if (!this.barSubscribers.has(key)) {
			this.barSubscribers.set(key, new Set());
			this.wsClient.subscribe([symbol.toUpperCase()]);
		}

		this.barSubscribers.get(key)!.add(onBar);

		return () => {
			const subs = this.barSubscribers.get(key);
			if (subs) {
				subs.delete(onBar);
				if (subs.size === 0) {
					this.barSubscribers.delete(key);
					this.wsClient?.unsubscribe([symbol.toUpperCase()]);
				}
			}
		};
	}

	/** Not supported by VNInvest — returns no-op. */
	subscribeToTrades(_symbol: string, _onTrade: (trade: Trade) => void): Unsubscribe {
		return () => {};
	}

	/** Not supported by VNInvest — returns no-op. */
	subscribeToOrderbook(_symbol: string, _onUpdate: (snapshot: OrderbookSnapshot) => void): Unsubscribe {
		return () => {};
	}

	/** Search symbols via GET /stocks/ endpoint. */
	async searchSymbols(query: string): Promise<readonly SymbolInfo[]> {
		const items = await this.client.getStocks(query);
		return items.map((item) => ({
			symbol: item.symbol,
			name: item.company_name,
			exchange: item.exchange,
		}));
	}

	/** Clean up: destroy WebSocket connection. */
	destroy(): void {
		this.wsClient?.destroy();
		this.wsClient = null;
		this.barSubscribers.clear();
	}

	private handleTickerUpdate(event: TickerUpdateEvent): void {
		// Skip stale WS events — they indicate no recent trades and would inject
		// outdated data into the chart, causing the current candle to be wrong.
		if (event.stale) return;

		// BE-02b: backend tick fields use *_price key names (open_price/high_price/low_price,
		// unwrapped from the WS envelope by VNInvestWebSocketClient). Prefer them, fall back
		// to the legacy flat keys for forward-compat with older gateways.
		const price = Number.isFinite(event.price) ? event.price : event.current_price;
		const currentPrice = Number.isFinite(event.current_price) ? event.current_price : price;
		if (!Number.isFinite(currentPrice)) return;
		const high = Number.isFinite(event.high_price) ? event.high_price as number : currentPrice;
		const low = Number.isFinite(event.low_price) ? event.low_price as number : currentPrice;
		const open = Number.isFinite(event.open_price) ? event.open_price as number : price;

		const symbolUpper = event.symbol.toUpperCase();
		// seq is optional (envelope backfill may leave it absent) — index usage only.
		const seq = Number.isFinite(event.seq) ? event.seq as number : 0;
		// Backend may send volume: null when no trades yet — honest zero, not NaN.
		const volume = Number.isFinite(event.volume) ? event.volume : 0;
		for (const [key, subs] of this.barSubscribers.entries()) {
			if (key.startsWith(`${symbolUpper}:`)) {
				// Map ticker update to a minimal OHLCVBar
				const bar: OHLCVBar = {
					date: new Date(event.ts),
					open,
					high,
					low,
					close: currentPrice,
					volume,
					index: seq,
					dataIndex: seq,
				};

				for (const cb of subs) {
					cb(bar);
				}
			}
		}
	}
}

/**
 * 504-guard: sub-daily timeframes aggregate server-side over the requested window —
 * wide windows time out. Matched case-insensitively ("1H" and "1h" both occur);
 * "1M" lowercases to "1m" and is treated as intraday — harmless (chunking only
 * adds requests, never changes results).
 */
const INTRADAY_TIMEFRAMES = new Set(["1m", "5m", "15m", "1h", "2h", "4h"]);
const MAX_INTRADAY_SPAN_MS = 30 * 24 * 60 * 60 * 1000;

function isIntradayTimeframe(timeframe: Timeframe): boolean {
	return INTRADAY_TIMEFRAMES.has(String(timeframe).toLowerCase());
}

function pageToOHLCV(bars: Array<{ date: Date; open: number; high: number; low: number; close: number; volume: number }>): OHLCVBar[] {
	return bars.map((bar, index) => ({
		date: bar.date,
		open: bar.open,
		high: bar.high,
		low: bar.low,
		close: bar.close,
		volume: bar.volume,
		index,
		dataIndex: index,
	}));
}

function sortBarsByDate(bars: OHLCVBar[]): OHLCVBar[] {
	return bars.sort((a, b) => a.date.valueOf() - b.date.valueOf());
}
