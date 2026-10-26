import type { DataAdapter, KLineBar, GapReason, SourceSemanticsDescriptor } from "../../lib/adapters";
import type { StockDataAdapter, Timeframe, Unsubscribe, Trade, OrderbookSnapshot, SymbolInfo } from "../../lib/types/adapter";
import type { OHLCVBar } from "../../lib/types/ohlcv";

const BINANCE_INTERVAL_MAP: Record<string, string> = {
	"1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
	"1h": "1h", "4h": "4h", "1D": "1d", "1W": "1w",
};

function normalizeTimeframe(tf: string): string {
	return BINANCE_INTERVAL_MAP[tf] ?? tf;
}

export class BinanceStockDataAdapter implements StockDataAdapter {
	constructor(private readonly adapter: DataAdapter) {}

	async fetchBarsInRange(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<readonly OHLCVBar[]> {
		const safeTf = normalizeTimeframe(timeframe);
		const safeTo = new Date(Math.min(to.getTime(), Date.now()));
		const bars = await this.adapter.fetchBarsInRange!(symbol, safeTf, from, safeTo);
		return bars.map((b, i) => ({
			date: new Date(b.timestamp), open: b.open, high: b.high,
			low: b.low, close: b.close, volume: b.volume,
			index: i, dataIndex: i,
		}));
	}

	async fetchBarsBefore(symbol: string, timeframe: Timeframe, before: Date, limit?: number): Promise<readonly OHLCVBar[]> {
		const safeTf = normalizeTimeframe(timeframe);
		const safeBefore = new Date(Math.min(before.getTime(), Date.now()));
		const bars = await this.adapter.fetchBarsBefore!(symbol, safeTf, safeBefore, limit);
		return bars.map((b, i) => ({
			date: new Date(b.timestamp), open: b.open, high: b.high,
			low: b.low, close: b.close, volume: b.volume,
			index: i, dataIndex: i,
		}));
	}

	subscribeToBar(symbol: string, timeframe: Timeframe, onBar: (bar: OHLCVBar) => void): Unsubscribe {
		const safeTf = normalizeTimeframe(timeframe);
		const unsub = this.adapter.subscribeKline?.({
			symbol,
			interval: safeTf,
			callback: (bar) => {
				onBar({
					date: new Date(bar.timestamp),
					open: bar.open,
					high: bar.high,
					low: bar.low,
					close: bar.close,
					volume: bar.volume,
					index: 0,
					dataIndex: 0,
				});
			},
		});
		return unsub ?? (() => {});
	}

	subscribeToTrades(): Unsubscribe {
		return () => {};
	}

	subscribeToOrderbook(): Unsubscribe {
		return () => {};
	}

	async searchSymbols(): Promise<readonly SymbolInfo[]> {
		return [];
	}

	getSourceSemantics(): SourceSemanticsDescriptor {
		return {
			sourceId: "binance",
			sourceContractVersion: "binance-klines-v1",
			instrumentClass: "crypto",
			coverageMode: "exact-range",
			sessionModel: "continuous",
			timezone: "UTC",
			supportsExactRangeFetch: true,
			supportsBackwardAnchor: true,
			supportsForwardAnchor: false,
			supportsLiveBars: true,
			maxBarsPerRequest: 1000,
			finalityMode: "near-now-provisional",
			expectedGapReasons: [
				"not-fetched",
				"source-no-data",
				"rate-limited",
				"boundary-exhausted",
			] as readonly GapReason[],
		};
	}
}
