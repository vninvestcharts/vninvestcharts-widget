import type { OrderbookSnapshot, SymbolInfo, Timeframe, Trade, Unsubscribe } from "../types/adapter";
import type { OHLCVBar } from "../types/ohlcv";
import { BaseAdapter, type RawOHLCVBar } from "./BaseAdapter";
import type { SourceSemanticsDescriptor } from "@vninvestcharts/engine-core";

function normalizeTrade(symbol: string, payload: unknown): Trade {
	const rawTrade = payload as Partial<Trade>;
	return {
		symbol,
		price: rawTrade.price ?? 0,
		size: rawTrade.size ?? 0,
		timestamp: rawTrade.timestamp instanceof Date ? rawTrade.timestamp : new Date(rawTrade.timestamp ?? Date.now()),
		side: rawTrade.side ?? "unknown",
	};
}

function normalizeOrderbook(payload: unknown): OrderbookSnapshot {
	const rawSnapshot = payload as Partial<OrderbookSnapshot>;
	return {
		bids: rawSnapshot.bids ?? [],
		asks: rawSnapshot.asks ?? [],
		timestamp: rawSnapshot.timestamp instanceof Date ? rawSnapshot.timestamp : new Date(rawSnapshot.timestamp ?? Date.now()),
	};
}

export class DjangoVnstockAdapter extends BaseAdapter {
	constructor(baseUrl = "", cacheTtlMs = 1_000) {
		super(baseUrl, cacheTtlMs);
	}

	getSourceSemantics(): SourceSemanticsDescriptor {
		return {
			sourceId: "django-vnstock",
			sourceContractVersion: "django-vnstock-bars-v1",
			instrumentClass: "equity",
			coverageMode: "exact-range",
			sessionModel: "exchange-calendar",
			timezone: "Asia/Ho_Chi_Minh",
			supportsExactRangeFetch: true,
			supportsBackwardAnchor: true,
			supportsForwardAnchor: false,
			supportsLiveBars: true,
			finalityMode: "historically-correctable",
			expectedGapReasons: ["not-fetched", "market-closed", "source-no-data", "rate-limited", "boundary-exhausted"],
		};
	}

	async fetchBarsInRange(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<readonly OHLCVBar[]> {
		const cacheKey = `bars:${symbol}:${timeframe}:${from.toISOString()}:${to.toISOString()}`;
		return this.memoize(cacheKey, async () => {
			const params = new URLSearchParams({
				tf: timeframe,
				from: from.toISOString(),
				to: to.toISOString(),
			});
			const rawBars = await this.requestJson<readonly RawOHLCVBar[]>(`/api/bars/${symbol}/?${params}`);
			return this.normalizeBars(rawBars);
		});
	}

	async fetchBarsBefore(symbol: string, timeframe: Timeframe, before: Date, limit = 300): Promise<readonly OHLCVBar[]> {
		const cacheKey = `more-bars:${symbol}:${timeframe}:${before.toISOString()}:${limit}`;
		return this.memoize(cacheKey, async () => {
			const params = new URLSearchParams({
				tf: timeframe,
				before: before.toISOString(),
				limit: String(limit),
			});
			const rawBars = await this.requestJson<readonly RawOHLCVBar[]>(`/api/bars/${symbol}/?${params}`);
			return this.normalizeBars(rawBars);
		});
	}

	subscribeToBar(symbol: string, timeframe: Timeframe, onBar: (bar: OHLCVBar) => void): Unsubscribe {
		const socket = new WebSocket(this.buildWebSocketUrl(`/ws/bars/${symbol}/${timeframe}/`));
		socket.onmessage = (event) => {
			try {
				const rawBar = JSON.parse(event.data as string) as RawOHLCVBar;
				onBar(this.normalizeBar(rawBar, rawBar.index ?? 0));
			} catch { /* ignore malformed message */ }
		};
		return () => socket.close();
	}

	subscribeToTrades(symbol: string, onTrade: (trade: Trade) => void): Unsubscribe {
		const socket = new WebSocket(this.buildWebSocketUrl(`/ws/trades/${symbol}/`));
		socket.onmessage = (event) => {
			try {
				onTrade(normalizeTrade(symbol, JSON.parse(event.data as string)));
			} catch { /* ignore malformed message */ }
		};
		return () => socket.close();
	}

	subscribeToOrderbook(symbol: string, onUpdate: (snapshot: OrderbookSnapshot) => void): Unsubscribe {
		const socket = new WebSocket(this.buildWebSocketUrl(`/ws/orderbook/${symbol}/`));
		socket.onmessage = (event) => {
			try {
				onUpdate(normalizeOrderbook(JSON.parse(event.data as string)));
			} catch { /* ignore malformed message */ }
		};
		return () => socket.close();
	}

	async searchSymbols(query: string): Promise<readonly SymbolInfo[]> {
		const params = new URLSearchParams({ q: query });
		return this.requestJson<readonly SymbolInfo[]>(`/api/symbols/search/?${params}`);
	}
}

export function createRestAdapter(baseUrl = "") {
	return new DjangoVnstockAdapter(baseUrl);
}