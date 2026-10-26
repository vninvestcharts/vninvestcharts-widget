import { BaseAdapter, RawOHLCVBar } from "./BaseAdapter";
import type { OHLCVBar } from "../types/ohlcv";
import type { OrderbookSnapshot, SymbolInfo, Timeframe, Trade, Unsubscribe } from "../types/adapter";

/**
 * RESTAdapter handles standard REST API request logic for OHLCV data.
 */
export class RESTAdapter extends BaseAdapter {
	private readonly headers: HeadersInit;

	constructor(baseUrl: string, authHeader = "", cacheTtlMs = 5000) {
		super(baseUrl, cacheTtlMs);
		this.headers = {
			"Content-Type": "application/json",
			...(authHeader ? { Authorization: authHeader } : {}),
		};
	}

	async fetchBarsInRange(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<readonly OHLCVBar[]> {
		const cacheKey = `range:${symbol}:${timeframe}:${from.getTime()}:${to.getTime()}`;
		return this.memoize(cacheKey, async () => {
			const path = `/api/klines?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&from=${from.toISOString()}&to=${to.toISOString()}`;
			const rawBars = await this.requestJson<RawOHLCVBar[]>(path, { headers: this.headers });
			return this.normalizeBars(rawBars);
		});
	}

	async fetchBarsBefore(symbol: string, timeframe: Timeframe, before: Date, limit = 100): Promise<readonly OHLCVBar[]> {
		const cacheKey = `before:${symbol}:${timeframe}:${before.getTime()}:${limit}`;
		return this.memoize(cacheKey, async () => {
			const path = `/api/klines?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&before=${before.toISOString()}&limit=${limit}`;
			const rawBars = await this.requestJson<RawOHLCVBar[]>(path, { headers: this.headers });
			return this.normalizeBars(rawBars);
		});
	}

	subscribeToBar(symbol: string, timeframe: Timeframe, onBar: (bar: OHLCVBar) => void): Unsubscribe {
		return () => {};
	}

	subscribeToTrades(symbol: string, onTrade: (trade: Trade) => void): Unsubscribe {
		return () => {};
	}

	subscribeToOrderbook(symbol: string, onUpdate: (snapshot: OrderbookSnapshot) => void): Unsubscribe {
		return () => {};
	}

	async searchSymbols(query: string): Promise<readonly SymbolInfo[]> {
		const path = `/api/symbols?q=${encodeURIComponent(query)}`;
		return this.requestJson<SymbolInfo[]>(path, { headers: this.headers });
	}
}
