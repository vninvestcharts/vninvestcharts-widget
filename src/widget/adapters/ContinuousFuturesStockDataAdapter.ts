import type { StockDataAdapter, Timeframe, Unsubscribe, Trade, OrderbookSnapshot, SymbolInfo } from "../../lib/types/adapter";
import type { OHLCVBar } from "../../lib/types/ohlcv";
import type { CoverageFragment, SourceSemanticsDescriptor } from "@vninvestcharts/engine-core";
import { ContinuousContractAdapter } from "../../lib/adapters/ContinuousContractAdapter";
import { DEFAULT_VN_FUTURES_ROLL_CONFIG } from "../../lib/adapters/ContinuousContractTypes";

export class ContinuousFuturesStockDataAdapter implements StockDataAdapter {
	private continuousAdapter: ContinuousContractAdapter;
	private baseAdapter: StockDataAdapter;
	private symbol: string;

	constructor(symbol: string, baseAdapter: StockDataAdapter) {
		this.baseAdapter = baseAdapter;
		this.symbol = symbol;
		const config = DEFAULT_VN_FUTURES_ROLL_CONFIG[symbol] || DEFAULT_VN_FUTURES_ROLL_CONFIG["VN30F1M"];

		this.continuousAdapter = new ContinuousContractAdapter(
			config.rootSymbol,
			config,
			async (sym, tf, from, to) => {
				const bars = await this.baseAdapter.fetchBarsInRange(sym, tf, from, to);
				return bars.map(b => ({
					timestamp: b.date.getTime(),
					open: b.open,
					high: b.high,
					low: b.low,
					close: b.close,
					volume: b.volume
				}));
			}
		);
	}

	async fetchBarsInRange(symbol: string, timeframe: Timeframe, from: Date, to: Date, chartId?: string): Promise<readonly OHLCVBar[]> {
		if (symbol === this.symbol) {
			const rootSymbol = this.continuousAdapter.getConfig().rootSymbol;
			const bars = await this.continuousAdapter.fetchBarsInRange?.(rootSymbol, timeframe, from, to);
			return (bars || []).map((b, index) => ({
				date: new Date(b.timestamp),
				open: b.open,
				high: b.high,
				low: b.low,
				close: b.close,
				volume: b.volume,
				index,
				dataIndex: index
			}));
		}
		return this.baseAdapter.fetchBarsInRange(symbol, timeframe, from, to, chartId);
	}

	async fetchBarsBefore(symbol: string, timeframe: Timeframe, before: Date, limit?: number, chartId?: string): Promise<readonly OHLCVBar[]> {
		if (symbol === this.symbol) {
			const rootSymbol = this.continuousAdapter.getConfig().rootSymbol;
			const bars = await this.continuousAdapter.fetchBarsBefore?.(rootSymbol, timeframe, before, limit);
			return (bars || []).map((b, index) => ({
				date: new Date(b.timestamp),
				open: b.open,
				high: b.high,
				low: b.low,
				close: b.close,
				volume: b.volume,
				index,
				dataIndex: index
			}));
		}
		return this.baseAdapter.fetchBarsBefore(symbol, timeframe, before, limit, chartId);
	}

	subscribeToBar(symbol: string, timeframe: Timeframe, onBar: (bar: OHLCVBar) => void): Unsubscribe {
		if (symbol === this.symbol) {
			let unsubscribed = false;
			let innerUnsubscribe: Unsubscribe | null = null;

			this.continuousAdapter.getMetadata().then(metadata => {
				if (unsubscribed) return;
				const activeContract = metadata.activeContract || symbol;
				innerUnsubscribe = this.baseAdapter.subscribeToBar(activeContract, timeframe, onBar);
			}).catch(err => {
				console.warn("Failed to resolve active contract for continuous subscription:", err);
			});

			return () => {
				unsubscribed = true;
				if (innerUnsubscribe) innerUnsubscribe();
			};
		}
		return this.baseAdapter.subscribeToBar(symbol, timeframe, onBar);
	}

	subscribeToTrades(symbol: string, onTrade: (trade: Trade) => void): Unsubscribe {
		return this.baseAdapter.subscribeToTrades(symbol, onTrade);
	}

	subscribeToOrderbook(symbol: string, onUpdate: (snapshot: OrderbookSnapshot) => void): Unsubscribe {
		return this.baseAdapter.subscribeToOrderbook(symbol, onUpdate);
	}

	async searchSymbols(query: string): Promise<readonly SymbolInfo[]> {
		return this.baseAdapter.searchSymbols(query);
	}

	getSourceSemantics(): SourceSemanticsDescriptor {
		return this.continuousAdapter.getSourceSemantics();
	}

	getLastBackfillCoverage?(symbol?: string, timeframe?: Timeframe, chartId?: string): readonly CoverageFragment[] | null {
		return this.baseAdapter.getLastBackfillCoverage?.(symbol, timeframe, chartId) ?? null;
	}

	getLastRangeCoverage?(symbol?: string, timeframe?: Timeframe, chartId?: string): readonly CoverageFragment[] | null {
		return this.baseAdapter.getLastRangeCoverage?.(symbol, timeframe, chartId) ?? null;
	}
}
