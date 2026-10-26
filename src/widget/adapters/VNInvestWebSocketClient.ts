/**
 * WP-03: VNInvestWebSocketClient — moved from src/demo/dataSources/
 * WebSocket client for the VNInvest Realtime channel.
 */

import { resolveApiBase } from "./VNInvestClient";

export interface TickerUpdateEvent {
	event_type: "ticker_update";
	symbol: string;
	price: number;
	current_price: number;
	volume: number;
	vwap?: number;
	ts: string;
	last_date?: string;
	stale?: boolean;
	seq?: number;
	rsi_14?: number;
	ma20_dist_pct?: number;
	rvol?: number;
	// BE-02b: native backend tick keys (realtime_prefetch broadcast payload).
	// Optional so legacy flat gateways keep working.
	open_price?: number;
	high_price?: number;
	low_price?: number;
	prev_price?: number | null;
	change_value?: number | null;
	change_pct?: number | null;
}

/**
 * BE-02b: unwrap the backend WS envelope (WEBSOCKET_EVENT_CONTRACT.md §2).
 * Server sends `{contract_version, event_type, symbol, ts, seq, source, data:{...}}`;
 * consumers want the inner `data` with envelope `ts`/`seq`/`symbol` backfilled when missing.
 * Non-envelope payloads pass through untouched. Pure function — unit tested.
 */
export function unwrapWsEnvelope(parsed: Record<string, unknown>): Record<string, unknown> {
	const data = parsed["data"];
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		return parsed;
	}
	const body = { ...(data as Record<string, unknown>) };
	for (const key of ["event_type", "symbol", "ts", "seq"] as const) {
		if (body[key] === undefined && parsed[key] !== undefined) {
			body[key] = parsed[key];
		}
	}
	return body;
}

export interface WhaleAlertWSEvent {
	event_type: "whale_alert";
	symbol: string;
	side?: "buy" | "sell";
	value?: number;
	price?: number;
	ts?: string;
}

export type VNIWSEvent =
	| TickerUpdateEvent
	| WhaleAlertWSEvent
	| { event_type: string; [key: string]: unknown };

export class VNInvestWebSocketClient {
	private static readonly MAX_RECONNECT_ATTEMPTS = 5;
	private static readonly RECONNECT_DELAY_MS = 5000;
	private static readonly WS_PATH_CANDIDATES = ["/ws/realtime/", "/api/realtime/ws/"] as const;

	private ws: WebSocket | null = null;
	private readonly pat: string;
	private readonly apiBase: string;
	private selectedWsPath: string | null = null;
	private wsUnavailable = false;
	private wsProbePromise: Promise<string | null> | null = null;
	private readonly subscribedSymbols = new Set<string>();
	private onTickerUpdateCb: ((event: TickerUpdateEvent) => void) | null = null;
	private onWhaleAlertCb: ((event: WhaleAlertWSEvent) => void) | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectAttempts = 0;
	private _isConnected = false;
	private _destroyed = false;

	constructor(pat: string, apiBase = resolveApiBase()) {
		this.pat = pat;
		this.apiBase = apiBase;
	}

	get isConnected(): boolean {
		return this._isConnected;
	}

	get destroyed(): boolean {
		return this._destroyed;
	}

	buildWsUrl(path = "/ws/realtime/"): string {
		const wsBase = this.apiBase
			.replace(/^https:\/\//, "wss://")
			.replace(/^http:\/\//, "ws://")
			.replace(/\/$/, "");
		// NOTE: PAT in query param is logged by proxies/CDNs.
		// Future: exchange PAT for short-lived session token server-side.
		return `${wsBase}${path}?token=${encodeURIComponent(this.pat)}`;
	}

	private buildHttpProbeUrl(path: string): string {
		const httpBase = this.apiBase.replace(/\/$/, "");
		return `${httpBase}${path}`;
	}

	private async probeWsPath(path: string): Promise<boolean> {
		try {
			const response = await fetch(this.buildHttpProbeUrl(path), {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.pat}`,
				},
			});
			if (response.status === 404 || response.status === 502 || response.status === 503) {
				return false;
			}
			return true;
		} catch {
			return false;
		}
	}

	private async resolveWsPath(): Promise<string | null> {
		if (this.selectedWsPath) {
			return this.selectedWsPath;
		}

		try {
			const hostname = new URL(this.apiBase).hostname;
			if (hostname.endsWith(".test")) {
				this.selectedWsPath = VNInvestWebSocketClient.WS_PATH_CANDIDATES[0];
				return this.selectedWsPath;
			}
		} catch {
			// ignore
		}

		if (this.wsProbePromise) {
			return this.wsProbePromise;
		}

		this.wsProbePromise = (async () => {
			for (const candidate of VNInvestWebSocketClient.WS_PATH_CANDIDATES) {
				// BE-02a: /ws/realtime/ is the documented backend consumer (asgi.py) and
				// Channels WS routes never answer HTTP GET (live 404) — probing it over HTTP
				// can only produce false negatives, so connect directly. A failed handshake
				// surfaces via onclose/onerror and the normal reconnect budget below.
				// Other (legacy) candidates keep the HTTP probe.
				const available = candidate === "/ws/realtime/"
					? true
					: await this.probeWsPath(candidate);
				if (available) {
					this.selectedWsPath = candidate;
					return candidate;
				}
			}
			this.wsUnavailable = true;
			return null;
		})();

		const resolved = await this.wsProbePromise;
		this.wsProbePromise = null;
		return resolved;
	}

	connect(): void {
		if (this._destroyed || this.ws !== null || this.wsUnavailable) {
			return;
		}

		void this.openConnection();
	}

	private async openConnection(): Promise<void> {
		if (this._destroyed || this.ws !== null || this.wsUnavailable) {
			return;
		}

		const wsPath = await this.resolveWsPath();
		if (!wsPath || this._destroyed || this.wsUnavailable) {
			return;
		}

		const url = this.buildWsUrl(wsPath);

		try {
			this.ws = new WebSocket(url);
		} catch {
			this.scheduleReconnect();
			return;
		}

		this.ws.onopen = () => {
			this.reconnectAttempts = 0;
			this._isConnected = true;
			const symbols = Array.from(this.subscribedSymbols);
			if (symbols.length > 0) {
				this.sendJson({ action: "subscribe", symbols });
			}
		};

		this.ws.onmessage = (event: MessageEvent) => {
			this.handleRawMessage(event.data as string);
		};

		this.ws.onclose = (event: CloseEvent) => {
			this.ws = null;
			this._isConnected = false;
			if (event.code === 4401) {
				return;
			}
			this.scheduleReconnect();
		};

		this.ws.onerror = () => {
			// handled in onclose
		};
	}

	subscribe(symbols: string[]): void {
		const normalized = symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
		for (const sym of normalized) {
			this.subscribedSymbols.add(sym);
		}
		if (this._isConnected && normalized.length > 0) {
			this.sendJson({ action: "subscribe", symbols: normalized });
		}
	}

	unsubscribe(symbols: string[]): void {
		const normalized = symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
		for (const sym of normalized) {
			this.subscribedSymbols.delete(sym);
		}
		if (this._isConnected && normalized.length > 0) {
			this.sendJson({ action: "unsubscribe", symbols: normalized });
		}
	}

	setOnTickerUpdate(cb: ((event: TickerUpdateEvent) => void) | null): void {
		this.onTickerUpdateCb = cb;
	}

	setOnWhaleAlert(cb: ((event: WhaleAlertWSEvent) => void) | null): void {
		this.onWhaleAlertCb = cb;
	}

	destroy(): void {
		this._destroyed = true;
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws !== null) {
			this.ws.onclose = null;
			this.ws.onmessage = null;
			this.ws.onerror = null;
			this.ws.onopen = null;
			try {
				this.ws.close(1000, "destroy");
			} catch {
				// ignore
			}
			this.ws = null;
		}
		this._isConnected = false;
	}

	private handleRawMessage(data: string): void {
		let parsed: VNIWSEvent;
		try {
			parsed = JSON.parse(data) as VNIWSEvent;
		} catch {
			return;
		}
		// BE-02b: backend wraps events in the contract envelope
		// ({..., data:{...}} — WEBSOCKET_EVENT_CONTRACT.md §2). Unwrap so consumers
		// see tick/alert fields at top level; envelope ts/seq/symbol are backfilled.
		const body = unwrapWsEnvelope(parsed as unknown as Record<string, unknown>) as unknown as VNIWSEvent;
		if (body.event_type === "ticker_update") {
			this.onTickerUpdateCb?.(body as TickerUpdateEvent);
		} else if (body.event_type === "whale_alert") {
			this.onWhaleAlertCb?.(body as WhaleAlertWSEvent);
		}
	}

	private scheduleReconnect(): void {
		if (this._destroyed || this.wsUnavailable || this.reconnectAttempts >= VNInvestWebSocketClient.MAX_RECONNECT_ATTEMPTS) {
			return;
		}
		this.reconnectAttempts += 1;
		const delay = VNInvestWebSocketClient.RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			if (!this._destroyed) {
				this.connect();
			}
		}, delay);
	}

	private sendJson(msg: object): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}
}
