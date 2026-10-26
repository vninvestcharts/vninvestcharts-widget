import type { OrderbookSnapshot, StockDataAdapter, SymbolInfo, Timeframe, Trade, Unsubscribe } from "../types/adapter";
import type { OHLCVBar } from "../types/ohlcv";
import { getCacheTTL } from "../cache/cacheDebug";

export type RawOHLCVBar = Omit<OHLCVBar, "date" | "index" | "dataIndex"> & {
	date: string | number | Date;
	index?: number;
	dataIndex?: number;
};

interface CacheEntry<T> {
	expiresAt: number;
	value: Promise<T>;
}

export abstract class BaseAdapter implements StockDataAdapter {
	private readonly requestCache = new Map<string, CacheEntry<unknown>>();

	protected constructor(protected readonly baseUrl = "", protected readonly cacheTtlMs = 1_000) {}

	protected buildUrl(path: string) {
		const fallbackOrigin = typeof globalThis.location !== "undefined" ? globalThis.location.origin : "http://localhost";
		return new URL(path, this.baseUrl || fallbackOrigin).toString();
	}

	protected buildWebSocketUrl(path: string) {
		const url = new URL(path, this.baseUrl || (typeof globalThis.location !== "undefined" ? globalThis.location.origin : "http://localhost"));
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		return url.toString();
	}

	protected async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
		const response = await fetch(this.buildUrl(path), init);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		return response.json() as Promise<T>;
	}

	protected memoize<T>(cacheKey: string, loader: () => Promise<T>) {
		const cached = this.requestCache.get(cacheKey) as CacheEntry<T> | undefined;
		const now = Date.now();
		const ttl = getCacheTTL(this.cacheTtlMs);
		if (cached && cached.expiresAt > now) {
			return cached.value;
		}

		const value = loader().catch((error: unknown) => {
			this.requestCache.delete(cacheKey);
			throw error;
		});

		this.requestCache.set(cacheKey, {
			expiresAt: now + ttl,
			value: value as Promise<unknown>,
		});
		return value;
	}

	protected normalizeBar(rawBar: RawOHLCVBar, fallbackIndex: number): OHLCVBar {
		const rawDate = rawBar.date;
		return {
			...rawBar,
			date: rawDate instanceof Date ? rawDate : new Date(rawDate),
			index: rawBar.index ?? fallbackIndex,
			dataIndex: rawBar.dataIndex ?? fallbackIndex,
		};
	}

	protected normalizeBars(rawBars: readonly RawOHLCVBar[]) {
		return rawBars.map((rawBar, index) => this.normalizeBar(rawBar, index));
	}

	abstract fetchBarsInRange(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<readonly OHLCVBar[]>;
	abstract fetchBarsBefore(symbol: string, timeframe: Timeframe, before: Date, limit?: number): Promise<readonly OHLCVBar[]>;
	abstract subscribeToBar(symbol: string, timeframe: Timeframe, onBar: (bar: OHLCVBar) => void): Unsubscribe;
	abstract subscribeToTrades(symbol: string, onTrade: (trade: Trade) => void): Unsubscribe;
	abstract subscribeToOrderbook(symbol: string, onUpdate: (snapshot: OrderbookSnapshot) => void): Unsubscribe;
	abstract searchSymbols(query: string): Promise<readonly SymbolInfo[]>;
}