import { BaseAdapter } from "./BaseAdapter";
import type { OHLCVBar } from "../types/ohlcv";
import type { OrderbookSnapshot, SymbolInfo, Timeframe, Trade, Unsubscribe } from "../types/adapter";

/**
 * WSAdapter manages a persistent WebSocket connection for real-time market data streaming
 * with automated exponential backoff reconnection.
 */
export class WSAdapter extends BaseAdapter {
	private ws: WebSocket | null = null;
	private isConnecting = false;
	private reconnectAttempts = 0;
	private readonly baseDelayMs = 1000;
	private readonly maxDelayMs = 30000;
	private readonly wsUrl: string;

	private readonly barSubscriptions = new Map<string, Set<(bar: OHLCVBar) => void>>();
	private readonly tradeSubscriptions = new Map<string, Set<(trade: Trade) => void>>();
	private readonly orderbookSubscriptions = new Map<string, Set<(snapshot: OrderbookSnapshot) => void>>();

	constructor(baseUrl: string, wsPath = "/ws", cacheTtlMs = 1000) {
		super(baseUrl, cacheTtlMs);
		this.wsUrl = this.buildWebSocketUrl(wsPath);
		this.connect();
	}

	private connect() {
		if (this.ws || this.isConnecting) return;

		this.isConnecting = true;
		try {
			this.ws = new WebSocket(this.wsUrl);

			this.ws.onopen = () => {
				this.isConnecting = false;
				this.reconnectAttempts = 0;
				this.resubscribeAll();
			};

			this.ws.onmessage = (event) => {
				this.handleMessage(event.data);
			};

			this.ws.onclose = () => {
				this.ws = null;
				this.isConnecting = false;
				this.scheduleReconnect();
			};

			this.ws.onerror = () => {
				if (this.ws) {
					this.ws.close();
				}
			};
		} catch (error) {
			this.isConnecting = false;
			this.scheduleReconnect();
		}
	}

	private scheduleReconnect() {
		const delay = Math.min(this.maxDelayMs, this.baseDelayMs * Math.pow(2, this.reconnectAttempts));
		this.reconnectAttempts++;
		setTimeout(() => {
			this.connect();
		}, delay);
	}

	private resubscribeAll() {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

		for (const [key, listeners] of this.barSubscriptions.entries()) {
			if (listeners.size > 0) {
				const [symbol, timeframe] = key.split(":");
				this.sendWsMessage({ action: "subscribe", type: "bar", symbol, timeframe });
			}
		}
		for (const [symbol, listeners] of this.tradeSubscriptions.entries()) {
			if (listeners.size > 0) {
				this.sendWsMessage({ action: "subscribe", type: "trades", symbol });
			}
		}
		for (const [symbol, listeners] of this.orderbookSubscriptions.entries()) {
			if (listeners.size > 0) {
				this.sendWsMessage({ action: "subscribe", type: "orderbook", symbol });
			}
		}
	}

	private sendWsMessage(msg: unknown) {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}

	private handleMessage(data: string) {
		try {
			const parsed = JSON.parse(data);
			if (parsed.type === "bar") {
				const bar: OHLCVBar = {
					...parsed.bar,
					date: new Date(parsed.bar.date),
				};
				const key = `${parsed.symbol}:${parsed.timeframe}`;
				this.barSubscriptions.get(key)?.forEach((cb) => cb(bar));
			} else if (parsed.type === "trade") {
				const trade: Trade = {
					...parsed.trade,
					timestamp: new Date(parsed.trade.timestamp),
				};
				this.tradeSubscriptions.get(parsed.symbol)?.forEach((cb) => cb(trade));
			} else if (parsed.type === "orderbook") {
				const snapshot: OrderbookSnapshot = {
					timestamp: new Date(parsed.timestamp),
					bids: parsed.bids,
					asks: parsed.asks,
				};
				this.orderbookSubscriptions.get(parsed.symbol)?.forEach((cb) => cb(snapshot));
			}
		} catch (e) {
			console.error("Failed to parse WebSocket message:", e);
		}
	}

	async fetchBarsInRange(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<readonly OHLCVBar[]> {
		const cacheKey = `range:${symbol}:${timeframe}:${from.getTime()}:${to.getTime()}`;
		return this.memoize(cacheKey, async () => {
			const path = `/api/klines?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&from=${from.toISOString()}&to=${to.toISOString()}`;
			const response = await fetch(this.buildUrl(path));
			const rawBars = await response.json();
			return this.normalizeBars(rawBars);
		});
	}

	async fetchBarsBefore(symbol: string, timeframe: Timeframe, before: Date, limit = 100): Promise<readonly OHLCVBar[]> {
		const cacheKey = `before:${symbol}:${timeframe}:${before.getTime()}:${limit}`;
		return this.memoize(cacheKey, async () => {
			const path = `/api/klines?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&before=${before.toISOString()}&limit=${limit}`;
			const response = await fetch(this.buildUrl(path));
			const rawBars = await response.json();
			return this.normalizeBars(rawBars);
		});
	}

	subscribeToBar(symbol: string, timeframe: Timeframe, onBar: (bar: OHLCVBar) => void): Unsubscribe {
		const key = `${symbol}:${timeframe}`;
		if (!this.barSubscriptions.has(key)) {
			this.barSubscriptions.set(key, new Set());
		}
		this.barSubscriptions.get(key)!.add(onBar);
		this.sendWsMessage({ action: "subscribe", type: "bar", symbol, timeframe });

		return () => {
			const listeners = this.barSubscriptions.get(key);
			if (listeners) {
				listeners.delete(onBar);
				if (listeners.size === 0) {
					this.sendWsMessage({ action: "unsubscribe", type: "bar", symbol, timeframe });
					this.barSubscriptions.delete(key);
				}
			}
		};
	}

	subscribeToTrades(symbol: string, onTrade: (trade: Trade) => void): Unsubscribe {
		if (!this.tradeSubscriptions.has(symbol)) {
			this.tradeSubscriptions.set(symbol, new Set());
		}
		this.tradeSubscriptions.get(symbol)!.add(onTrade);
		this.sendWsMessage({ action: "subscribe", type: "trades", symbol });

		return () => {
			const listeners = this.tradeSubscriptions.get(symbol);
			if (listeners) {
				listeners.delete(onTrade);
				if (listeners.size === 0) {
					this.sendWsMessage({ action: "unsubscribe", type: "trades", symbol });
					this.tradeSubscriptions.delete(symbol);
				}
			}
		};
	}

	subscribeToOrderbook(symbol: string, onUpdate: (snapshot: OrderbookSnapshot) => void): Unsubscribe {
		if (!this.orderbookSubscriptions.has(symbol)) {
			this.orderbookSubscriptions.set(symbol, new Set());
		}
		this.orderbookSubscriptions.get(symbol)!.add(onUpdate);
		this.sendWsMessage({ action: "subscribe", type: "orderbook", symbol });

		return () => {
			const listeners = this.orderbookSubscriptions.get(symbol);
			if (listeners) {
				listeners.delete(onUpdate);
				if (listeners.size === 0) {
					this.sendWsMessage({ action: "unsubscribe", type: "orderbook", symbol });
					this.orderbookSubscriptions.delete(symbol);
				}
			}
		};
	}

	async searchSymbols(query: string): Promise<readonly SymbolInfo[]> {
		const path = `/api/symbols?q=${encodeURIComponent(query)}`;
		const response = await fetch(this.buildUrl(path));
		return response.json();
	}
}
