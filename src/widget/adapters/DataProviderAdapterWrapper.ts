import { type StockDataAdapter, type OHLCVBar, type SymbolInfo, type Trade, type OrderbookSnapshot } from "../../lib/types/adapter";
import { type IChartDataProvider } from "../types/dataProvider";
import { resolveTimeframeMs } from "../history/historyDataUtils";

export class DataProviderAdapterWrapper implements StockDataAdapter {
	public label = "data-provider-wrapper";

	constructor(private provider: IChartDataProvider) {}

	public getSourceSemantics?() {
		return {
			supportedTimeframes: ["1m", "5m", "15m", "1h", "4h", "1D", "1W", "1M"],
			supportsStreaming: true,
		} as any; // ARC-1-keep: legacy bridge
	}

	public async fetchBarsInRange(
		symbol: string,
		timeframe: string,
		from: Date,
		to: Date,
		_chartId?: string
	): Promise<readonly OHLCVBar[]> {
		const bars = await this.provider.fetchBars(symbol, timeframe, from.getTime(), to.getTime());
		return bars;
	}

	public async fetchBarsBefore(
		symbol: string,
		timeframe: string,
		before: Date,
		limit?: number,
		_chartId?: string
	): Promise<readonly OHLCVBar[]> {
		const tfMs = resolveTimeframeMs(timeframe);
		const count = limit ?? 1000;
		const fromTs = before.getTime() - count * tfMs;
		const bars = await this.provider.fetchBars(symbol, timeframe, fromTs, before.getTime());
		return bars;
	}

	public subscribeToBar(
		symbol: string,
		timeframe: string,
		onBar: (bar: OHLCVBar) => void
	): () => void {
		return this.provider.subscribeBars(symbol, timeframe, onBar);
	}

	public subscribeToTrades(_symbol: string, _onTrade: (trade: Trade) => void): () => void {
		return () => {};
	}

	public subscribeToOrderbook(_symbol: string, _onUpdate: (snapshot: OrderbookSnapshot) => void): () => void {
		return () => {};
	}

	public async searchSymbols(query: string): Promise<readonly SymbolInfo[]> {
		return this.provider.searchSymbols(query);
	}
}
