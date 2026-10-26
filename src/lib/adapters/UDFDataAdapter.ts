import type {
	StockDataAdapter,
	Unsubscribe,
	Timeframe,
	Trade,
	OrderbookSnapshot,
	SymbolInfo,
} from "../types/adapter";
import type { OHLCVBar } from "../types/ohlcv";
import type { SourceSemanticsDescriptor } from "@vninvestcharts/engine-core";

export interface UDFDataAdapterConfig {
	baseUrl: string;
	wsUrl?: string;
	pollIntervalMs?: number;
}

interface UDFHistoryResponse {
	s: "ok" | "no_data" | "error";
	t?: number[];
	o?: number[];
	h?: number[];
	l?: number[];
	c?: number[];
	v?: number[];
	errmsg?: string;
}

interface UDFSymbolSearchItem {
	symbol: string;
	full_name?: string;
	description?: string;
	exchange?: string;
	type?: string;
}

export class UDFDataAdapter implements StockDataAdapter {
	private readonly baseUrl: string;
	private readonly wsUrl: string | null;
	private readonly pollIntervalMs: number;

	private ws: WebSocket | null = null;
	private wsConnecting = false;
	private readonly activeSubscriptions = new Map<
		string,
		{
			symbol: string;
			timeframe: string;
			onBar: (bar: OHLCVBar) => void;
			pollTimer?: any;
			lastBarTime?: number;
		}
	>();

	constructor(config: UDFDataAdapterConfig) {
		this.baseUrl = config.baseUrl.replace(/\/+$/, "");
		this.pollIntervalMs = config.pollIntervalMs ?? 5000;

		if (config.wsUrl) {
			this.wsUrl = config.wsUrl;
		} else {
			// Infer WebSocket URL from baseUrl
			try {
				const url = new URL(this.baseUrl);
				url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
				this.wsUrl = `${url.toString()}/ws`;
			} catch {
				this.wsUrl = null;
			}
		}
	}

	getSourceSemantics(): SourceSemanticsDescriptor {
		return {
			sourceId: "udf-http-feed",
			sourceContractVersion: "udf-v1",
			instrumentClass: "equity",
			coverageMode: "exact-range",
			sessionModel: "continuous",
			timezone: "UTC",
			supportsExactRangeFetch: true,
			supportsBackwardAnchor: true,
			supportsForwardAnchor: false,
			supportsLiveBars: true,
			maxBarsPerRequest: 1000,
			finalityMode: "near-now-provisional",
			expectedGapReasons: ["not-fetched", "source-no-data", "rate-limited", "boundary-exhausted"],
		};
	}

	private mapTimeframe(timeframe: string): string {
		// Map standard timeframes to TV/UDF resolution strings
		// e.g. "1D" -> "D", "1W" -> "W"
		if (timeframe === "1D") return "D";
		if (timeframe === "1W") return "W";
		if (timeframe === "1M") return "M";
		return timeframe;
	}

	private parseHistory(data: UDFHistoryResponse): OHLCVBar[] {
		if (data.s !== "ok" || !data.t || !data.o || !data.h || !data.l || !data.c) {
			return [];
		}

		const bars: OHLCVBar[] = [];
		const len = data.t.length;
		for (let i = 0; i < len; i++) {
			bars.push({
				date: new Date(data.t[i] * 1000),
				open: data.o[i],
				high: data.h[i],
				low: data.l[i],
				close: data.c[i],
				volume: data.v ? data.v[i] : 0,
				index: i,
				dataIndex: i,
			});
		}
		return bars;
	}

	async fetchBarsInRange(
		symbol: string,
		timeframe: Timeframe,
		from: Date,
		to: Date,
	): Promise<readonly OHLCVBar[]> {
		const resolution = this.mapTimeframe(timeframe);
		const fromSec = Math.floor(from.getTime() / 1000);
		const toSec = Math.floor(to.getTime() / 1000);

		const url = `${this.baseUrl}/history?symbol=${encodeURIComponent(
			symbol,
		)}&resolution=${encodeURIComponent(resolution)}&from=${fromSec}&to=${toSec}`;

		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`UDF history request failed with status: ${response.status}`);
		}

		const data = (await response.json()) as UDFHistoryResponse;
		return this.parseHistory(data);
	}

	async fetchBarsBefore(
		symbol: string,
		timeframe: Timeframe,
		before: Date,
		limit = 1000,
	): Promise<readonly OHLCVBar[]> {
		const resolution = this.mapTimeframe(timeframe);
		const beforeSec = Math.floor(before.getTime() / 1000);

		const url = `${this.baseUrl}/history?symbol=${encodeURIComponent(
			symbol,
		)}&resolution=${encodeURIComponent(resolution)}&to=${beforeSec}&countback=${limit}`;

		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`UDF backward history request failed: ${response.status}`);
		}

		const data = (await response.json()) as UDFHistoryResponse;
		return this.parseHistory(data);
	}

	subscribeToBar(
		symbol: string,
		timeframe: Timeframe,
		onBar: (bar: OHLCVBar) => void,
	): Unsubscribe {
		const key = `${symbol}:${timeframe}`;
		const subscription = { symbol, timeframe, onBar };
		this.activeSubscriptions.set(key, subscription);

		this.connectWebSocket();

		// Start fallback HTTP polling in case WebSocket doesn't connect/work
		this.startHttpPolling(key);

		return () => {
			const sub = this.activeSubscriptions.get(key);
			if (sub) {
				if (sub.pollTimer) {
					clearTimeout(sub.pollTimer);
				}
				this.activeSubscriptions.delete(key);
				this.sendWsMessage({ action: "unsubscribe", symbol, timeframe });
			}
		};
	}

	private startHttpPolling(key: string) {
		const sub = this.activeSubscriptions.get(key);
		if (!sub) return;

		sub.pollTimer = setTimeout(async () => {
			try {
				// Only query if websocket is not open
				if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
					const now = new Date();
					const from = sub.lastBarTime
						? new Date(sub.lastBarTime + 1000)
						: new Date(now.getTime() - 24 * 60 * 60 * 1000); // last 24h

					const bars = await this.fetchBarsInRange(sub.symbol, sub.timeframe, from, now);
					if (bars.length > 0) {
						sub.lastBarTime = bars[bars.length - 1].date.getTime();
						for (const bar of bars) {
							sub.onBar(bar);
						}
					}
				}
			} catch (err) {
				console.warn(`UDF polling failed for key ${key}:`, err);
			} finally {
				// Queue next poll
				this.startHttpPolling(key);
			}
		}, this.pollIntervalMs);
	}

	private connectWebSocket() {
		if (this.ws || this.wsConnecting || !this.wsUrl) {
			return;
		}

		this.wsConnecting = true;
		try {
			const socket = new WebSocket(this.wsUrl);
			this.ws = socket;

			socket.onopen = () => {
				this.wsConnecting = false;
				// Resubscribe all active subscriptions
				for (const [key, sub] of this.activeSubscriptions.entries()) {
					this.sendWsMessage({
						action: "subscribe",
						symbol: sub.symbol,
						timeframe: sub.timeframe,
					});
				}
			};

			socket.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					// Expect real-time update format: { symbol, timeframe, bar: { t, o, h, l, c, v } }
					if (data && data.symbol && data.timeframe && data.bar) {
						const key = `${data.symbol}:${data.timeframe}`;
						const sub = this.activeSubscriptions.get(key);
						if (sub) {
							const bar: OHLCVBar = {
								date: new Date(data.bar.t * 1000),
								open: data.bar.o,
								high: data.bar.h,
								low: data.bar.l,
								close: data.bar.c,
								volume: data.bar.v ?? 0,
								index: 0,
								dataIndex: 0,
							};
							sub.lastBarTime = bar.date.getTime();
							sub.onBar(bar);
						}
					}
				} catch (err) {
					console.warn("UDF WebSocket message parsing error:", err);
				}
			};

			socket.onclose = () => {
				this.ws = null;
				this.wsConnecting = false;
				// Try reconnecting after a delay
				setTimeout(() => this.connectWebSocket(), 10000);
			};

			socket.onerror = () => {
				socket.close();
			};
		} catch (err) {
			console.error("UDF WebSocket connection attempt failed:", err);
			this.wsConnecting = false;
		}
	}

	private sendWsMessage(msg: any) {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			try {
				this.ws.send(JSON.stringify(msg));
			} catch (err) {
				console.warn("Failed to send UDF WebSocket message:", err);
			}
		}
	}

	subscribeToTrades(_symbol: string, _onTrade: (trade: Trade) => void): Unsubscribe {
		return () => {};
	}

	subscribeToOrderbook(
		_symbol: string,
		_onUpdate: (snapshot: OrderbookSnapshot) => void,
	): Unsubscribe {
		return () => {};
	}

	async searchSymbols(query: string): Promise<readonly SymbolInfo[]> {
		// TV UDF standard search endpoint is /search?query=...
		// Fallback to /symbols?symbol=... if needed
		try {
			const searchUrl = `${this.baseUrl}/search?query=${encodeURIComponent(query)}`;
			const response = await fetch(searchUrl);
			if (response.ok) {
				const data = (await response.json()) as UDFSymbolSearchItem[];
				if (Array.isArray(data)) {
					return data.map((item) => ({
						symbol: item.symbol,
						name: item.description || item.full_name || item.symbol,
						exchange: item.exchange,
					}));
				}
			}
		} catch (err) {
			console.warn("UDF /search request failed, attempting fallback to /symbols:", err);
		}

		// Fallback symbols request
		try {
			const symbolsUrl = `${this.baseUrl}/symbols?symbol=${encodeURIComponent(query)}`;
			const response = await fetch(symbolsUrl);
			if (response.ok) {
				const item = (await response.json()) as UDFSymbolSearchItem;
				if (item && item.symbol) {
					return [
						{
							symbol: item.symbol,
							name: item.description || item.full_name || item.symbol,
							exchange: item.exchange,
						},
					];
				}
			}
		} catch (err) {
			console.error("UDF fallback symbols request failed:", err);
		}

		return [];
	}
}
