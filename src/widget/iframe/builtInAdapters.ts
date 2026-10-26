/**
 * WP-11: Built-in Adapter Classes for Iframe Mode
 *
 * These adapter classes can be instantiated from JSON-serializable config
 * and are used in the iframe-hosted widget where custom callbacks
 * cannot be passed via postMessage.
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
import { VNInvestClient, type VNIBarsParams, type WidgetAuthHandler } from "../adapters/VNInvestClient";
import { VNInvestWebSocketClient, type TickerUpdateEvent } from "../adapters/VNInvestWebSocketClient";

const PAGE_LIMIT = 1000;

/**
 * Base class for built-in adapters
 */
export abstract class BuiltInAdapter implements StockDataAdapter {
	abstract readonly name: string;
	abstract readonly type: string;

	abstract fetchBarsInRange(
		symbol: string,
		timeframe: Timeframe,
		from: Date,
		to: Date
	): Promise<readonly OHLCVBar[]>;

	abstract fetchBarsBefore(
		symbol: string,
		timeframe: Timeframe,
		before: Date,
		limit?: number
	): Promise<readonly OHLCVBar[]>;

	abstract subscribeToBar(
		symbol: string,
		timeframe: Timeframe,
		onBar: (bar: OHLCVBar) => void
	): Unsubscribe;

	subscribeToTrades(_symbol: string, _onTrade: (trade: Trade) => void): Unsubscribe {
		return () => {};
	}

	subscribeToOrderbook(_symbol: string, _onUpdate: (snapshot: OrderbookSnapshot) => void): Unsubscribe {
		return () => {};
	}

	abstract searchSymbols(query: string): Promise<readonly SymbolInfo[]>;

	abstract destroy(): void;

	getSourceSemantics(): SourceSemanticsDescriptor {
		return {
			sourceId: this.name,
			sourceContractVersion: "built-in-v1",
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

	getLastBackfillCoverage(): readonly CoverageFragment[] | null {
		return null;
	}

	getLastRangeCoverage(): readonly CoverageFragment[] | null {
		return null;
	}
}

/**
 * VNInvest Built-in Adapter
 */
export class VNInvestBuiltInAdapter extends BuiltInAdapter {
	readonly name = "vninvest";
	readonly type = "vninvest";

	private client: VNInvestClient;
	private wsClient: VNInvestWebSocketClient | null = null;
	private readonly barSubscribers = new Map<string, Set<(bar: OHLCVBar) => void>>();
	private readonly snapshotIds = new Map<string, string>();
	private readonly lastBackfillCoverageMap = new Map<string, readonly CoverageFragment[]>();
	private readonly lastRangeCoverageMap = new Map<string, readonly CoverageFragment[]>();

	constructor(config: { patToken: string; apiBase?: string }) {
		super();
		this.client = new VNInvestClient(config.patToken);
		if (config.apiBase) {
			this.client.setBase(config.apiBase);
		}
	}

	setAuthHandler(handler: WidgetAuthHandler): void {
		this.client.setAuthHandler(handler);
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

	async fetchBarsInRange(
		symbol: string,
		timeframe: Timeframe,
		from: Date,
		to: Date,
		chartId?: string
	): Promise<readonly OHLCVBar[]> {
		const allBars: OHLCVBar[] = [];

		const initParams: VNIBarsParams = {
			type: "init",
			symbol,
			timeframe,
			from: from.valueOf(),
			to: to.valueOf(),
			limit: PAGE_LIMIT,
		};

		const page = await this.client.getBarsPage(initParams);
		const key = this.coverageKey(symbol, timeframe, chartId);
		if (page.snapshotId) {
			this.snapshotIds.set(key, page.snapshotId);
		}

		const bars = sortBarsByDate(pageToOHLCV(page.bars));
		allBars.push(...bars);

		if (bars.length === 0) {
			this.lastRangeCoverageMap.set(key, [
				{ fromTs: from.valueOf(), toTs: to.valueOf(), status: "unresolved", reason: "source-no-data" }
			]);
		} else {
			const oldestTs = bars[0].date.getTime();
			const newestTs = bars[bars.length - 1].date.getTime();
			const covered: CoverageFragment = { fromTs: oldestTs, toTs: newestTs, status: "covered" };
			if (!page.hasMoreBefore) {
				this.lastRangeCoverageMap.set(key, [
					{ fromTs: 0, toTs: oldestTs, status: "unresolved", reason: "boundary-exhausted" },
					covered,
				]);
			} else {
				this.lastRangeCoverageMap.set(key, [covered]);
			}
		}

		return allBars;
	}

	async fetchBarsBefore(
		symbol: string,
		timeframe: Timeframe,
		before: Date,
		limit = PAGE_LIMIT,
		chartId?: string
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

	subscribeToBar(
		symbol: string,
		timeframe: Timeframe,
		onBar: (bar: OHLCVBar) => void
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

	async searchSymbols(query: string): Promise<readonly SymbolInfo[]> {
		const items = await this.client.getStocks(query);
		return items.map((item) => ({
			symbol: item.symbol,
			name: item.company_name,
			exchange: item.exchange,
		}));
	}

	destroy(): void {
		this.wsClient?.destroy();
		this.wsClient = null;
		this.barSubscribers.clear();
	}

	private handleTickerUpdate(event: TickerUpdateEvent): void {
		if (event.stale) return;
		// BE-02b mirror: prefer native *_price keys (see VNInvestDataAdapter).
		const price = Number.isFinite(event.price) ? event.price : event.current_price;
		const currentPrice = Number.isFinite(event.current_price) ? event.current_price : price;
		if (!Number.isFinite(currentPrice)) return;
		const seq = Number.isFinite(event.seq) ? event.seq as number : 0;
		const volume = Number.isFinite(event.volume) ? event.volume : 0;
		const symbolUpper = event.symbol.toUpperCase();
		for (const [key, subs] of this.barSubscribers.entries()) {
			if (key.startsWith(`${symbolUpper}:`)) {
				const bar: OHLCVBar = {
					date: new Date(event.ts),
					open: Number.isFinite(event.open_price) ? event.open_price as number : price,
					high: Number.isFinite(event.high_price) ? event.high_price as number : currentPrice,
					low: Number.isFinite(event.low_price) ? event.low_price as number : currentPrice,
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
 * Factory function to create built-in adapter from config
 */
export function createBuiltInAdapter(config: {
	type: string;
	options?: Record<string, string | number | boolean | null>;
	token?: string;
}): BuiltInAdapter | null {
	switch (config.type) {
		case "vninvest":
			return new VNInvestBuiltInAdapter({
				patToken: config.token || "",
				apiBase: config.options?.apiBase as string | undefined,
			});
		// Add other adapter types here as needed
		case "tvfeed":
		case "yahoo":
		case "binance":
		case "coinbase":
		case "twelvedata":
		case "alphavantage":
		case "finnhub":
		case "polygon":
			// These would be implemented similarly
			console.warn(`Built-in adapter '${config.type}' not yet implemented`);
			return null;
		default:
			console.warn(`Unknown built-in adapter type: ${config.type}`);
			return null;
	}
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
