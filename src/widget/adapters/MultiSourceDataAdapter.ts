import type { StockDataAdapter, OHLCVBar, Timeframe, Trade, OrderbookSnapshot, SymbolInfo, Unsubscribe } from "../../lib/types/adapter";
import type { CoverageFragment, SourceSemanticsDescriptor } from "@vninvestcharts/engine-core";

export interface SourceRoute {
	pattern: RegExp;
	adapter: StockDataAdapter;
}

export interface MultiSourceDataAdapterConfig {
	routes: SourceRoute[];
	defaultAdapter: StockDataAdapter;
}

function matchAdapter(symbol: string, config: MultiSourceDataAdapterConfig): StockDataAdapter {
	const route = config.routes.find(r => r.pattern.test(symbol));
	return route?.adapter ?? config.defaultAdapter;
}

export class MultiSourceDataAdapter implements StockDataAdapter {
	private readonly _cache: Map<string, StockDataAdapter>;

	constructor(private readonly config: MultiSourceDataAdapterConfig) {
		this._cache = new Map();
	}

	private _resolve(symbol: string): StockDataAdapter {
		const cached = this._cache.get(symbol);
		if (cached) {
			return cached;
		}
		const adapter = matchAdapter(symbol, this.config);
		this._cache.set(symbol, adapter);
		return adapter;
	}

	async fetchBarsInRange(symbol: string, timeframe: Timeframe, from: Date, to: Date, chartId?: string): Promise<readonly OHLCVBar[]> {
		return this._resolve(symbol).fetchBarsInRange(symbol, timeframe, from, to, chartId);
	}

	async fetchBarsBefore(symbol: string, timeframe: Timeframe, before: Date, limit?: number, chartId?: string): Promise<readonly OHLCVBar[]> {
		return this._resolve(symbol).fetchBarsBefore(symbol, timeframe, before, limit, chartId);
	}

	subscribeToBar(symbol: string, timeframe: Timeframe, onBar: (bar: OHLCVBar) => void): Unsubscribe {
		return this._resolve(symbol).subscribeToBar(symbol, timeframe, onBar);
	}

	subscribeToTrades(symbol: string, onTrade: (trade: Trade) => void): Unsubscribe {
		return this._resolve(symbol).subscribeToTrades(symbol, onTrade);
	}

	subscribeToOrderbook(symbol: string, onUpdate: (snapshot: OrderbookSnapshot) => void): Unsubscribe {
		return this._resolve(symbol).subscribeToOrderbook(symbol, onUpdate);
	}

	async searchSymbols(query: string): Promise<readonly SymbolInfo[]> {
		const adapters = [
			...this.config.routes.map(r => r.adapter),
			this.config.defaultAdapter,
		];
		const results = await Promise.all(
			adapters.map(a => a.searchSymbols(query))
		);
		const flat = results.flat();
		const seen = new Set<string>();
		return flat.filter(s => {
			if (seen.has(s.symbol)) return false;
			seen.add(s.symbol);
			return true;
		});
	}

	getLastBackfillCoverage?(symbol?: string, timeframe?: Timeframe, chartId?: string): readonly CoverageFragment[] | null {
		if (!symbol) return null;
		return this._resolve(symbol).getLastBackfillCoverage?.(symbol, timeframe, chartId) ?? null;
	}

	getLastRangeCoverage?(symbol?: string, timeframe?: Timeframe, chartId?: string): readonly CoverageFragment[] | null {
		if (!symbol) return null;
		return this._resolve(symbol).getLastRangeCoverage?.(symbol, timeframe, chartId) ?? null;
	}
}
