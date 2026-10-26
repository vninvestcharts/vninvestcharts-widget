import type { CanonicalFetchResult, DataAdapter, GetBarsParams, GetBarsResult, KLineBar, Level2Snapshot, TickData } from "./DataAdapter";
import type { CoverageFragment, SourceSemanticsDescriptor } from "@vninvestcharts/engine-core";
import { createAdapterLogger } from '../utils/logger';

const log = createAdapterLogger('binance');


declare const VN_BINANCE_BASE: string | undefined;

declare const VN_BINANCE_WS_BASE: string | undefined;

// In dev the webpack DefinePlugin injects VN_BINANCE_BASE = "/binance-proxy" so the
// browser never hits api.binance.com directly (avoids CORS / regional blocks).
// In production the value is "" and we fall back to the public Binance URL.
const _BINANCE_ORIGIN = typeof VN_BINANCE_BASE === "string" && VN_BINANCE_BASE.length > 0
	? VN_BINANCE_BASE
	: "https://api.binance.com";
const BINANCE_BASE = `${_BINANCE_ORIGIN}/api/v3/klines`;

// Public data-only mirror that is generally not geo-blocked (HTTP 451). Used as a
// fallback for REST klines when the primary origin/proxy is blocked by region.
const BINANCE_FALLBACK_KLINES = "https://data-api.binance.vision/api/v3/klines";

// Region-block status returned by Binance for legally restricted regions.
const HTTP_UNAVAILABLE_FOR_LEGAL_REASONS = 451;

/** Error carrying the upstream HTTP status so callers can handle geo-blocks (451) gracefully. */
export class BinanceHttpError extends Error {
	constructor(readonly status: number, message: string) {
		super(message);
		this.name = "BinanceHttpError";
	}
}

/** True when an error is a Binance regional block (HTTP 451). */
function isGeoBlocked(error: unknown): boolean {
	return error instanceof BinanceHttpError && error.status === HTTP_UNAVAILABLE_FOR_LEGAL_REASONS;
}

// Mirrors VN_BINANCE_BASE for the streaming WebSocket endpoint. In dev the
// webpack DefinePlugin injects VN_BINANCE_WS_BASE = "/binance-ws-proxy" so the
// browser never hits stream.binance.com directly (avoids regional blocks).
const _BINANCE_WS_ORIGIN = typeof VN_BINANCE_WS_BASE === "string" && VN_BINANCE_WS_BASE.length > 0
	? VN_BINANCE_WS_BASE
	: "wss://stream.binance.com:9443";
const BINANCE_WS_BASE = `${_BINANCE_WS_ORIGIN}/ws`;
const MAX_LIMIT = 1000;

/** Allowlist of valid Binance interval strings */
const BINANCE_INTERVALS = new Set([
	"1m", "3m", "5m", "15m", "30m",
	"1h", "2h", "4h", "6h", "8h", "12h",
	"1d", "3d", "1w", "1M",
]);

/** Map demo timeframe labels → Binance interval strings */
const INTERVAL_MAP: Record<string, string> = {
	"1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
	"1h": "1h", "4h": "4h", "1D": "1d", "1W": "1w",
};

/** OWASP: validate symbol against allowlist pattern before sending to API */
const SYMBOL_RE = /^[A-Z0-9]{2,20}$/;

function validateSymbol(symbol: string): string {
	const upper = symbol.toUpperCase();
	if (!SYMBOL_RE.test(upper)) {
		throw new Error(`Tên symbol không hợp lệ: "${symbol}"`);
	}
	return upper;
}

function resolveInterval(interval: string): string {
	const mapped = INTERVAL_MAP[interval] ?? interval;
	if (!BINANCE_INTERVALS.has(mapped)) {
		throw new Error(`Interval không hợp lệ: "${interval}"`);
	}
	return mapped;
}

type BinanceKline = [number | string, string, string, string, string, string, ...unknown[]];

function parseKlines(json: BinanceKline[]): KLineBar[] {
	return json.map((d) => ({
		timestamp: Number(d[0]),
		open: parseFloat(d[1] as string),
		high: parseFloat(d[2] as string),
		low: parseFloat(d[3] as string),
		close: parseFloat(d[4] as string),
		volume: parseFloat(d[5] as string),
	}));
}

type BinancePageRequest = {
	symbol: string;
	interval: string;
	limit: number;
	startTime?: number;
	endTime?: number;
	signal?: AbortSignal;
};

const BINANCE_TIMEOUT_MS = 8_000;

async function fetchBinancePage({
	symbol,
	interval,
	limit,
	startTime,
	endTime,
	signal,
}: BinancePageRequest): Promise<KLineBar[]> {
	const urlParams = new URLSearchParams({
		symbol,
		interval,
		limit: String(limit),
	});

	if (startTime !== undefined) {
		urlParams.set("startTime", String(startTime));
	}

	if (endTime !== undefined) {
		urlParams.set("endTime", String(endTime));
	}

	const query = urlParams.toString();

	const fetchFrom = async (base: string): Promise<KLineBar[]> => {
		const response = await fetch(`${base}?${query}`, { signal });
		if (!response.ok) {
			throw new BinanceHttpError(response.status, `Không tải được dữ liệu Binance: ${response.status}`);
		}
		const json = await response.json() as BinanceKline[];
		return parseKlines(json);
	};

	const fetchPromise = fetchFrom(BINANCE_BASE).catch((error) => {
		// On a regional block (451), retry once against the public data mirror,
		// unless the primary already IS the mirror.
		if (
			error instanceof BinanceHttpError &&
			error.status === HTTP_UNAVAILABLE_FOR_LEGAL_REASONS &&
			BINANCE_BASE !== BINANCE_FALLBACK_KLINES
		) {
			log.warn("Binance origin geo-blocked (451); retrying via data-api.binance.vision mirror");
			return fetchFrom(BINANCE_FALLBACK_KLINES);
		}
		throw error;
	});

	const timeoutPromise = new Promise<never>((_, reject) => {
		setTimeout(() => reject(new Error(`Binance API timeout after ${BINANCE_TIMEOUT_MS}ms`)), BINANCE_TIMEOUT_MS);
	});

	return Promise.race([fetchPromise, timeoutPromise]);
}

export class BinanceAdapter implements DataAdapter {
	readonly name = "binance";
	/**
	 * Latched when Binance answers HTTP 451 (regional block). Demo shells read this
	 * to serve offline data with a visible status instead of an empty chart.
	 * Cleared on the next successful fetch.
	 */
	private regionBlocked = false;

	/** True after an observed HTTP 451 until a fetch succeeds again. */
	isRegionBlocked(): boolean {
		return this.regionBlocked;
	}

	getSourceSemantics(): SourceSemanticsDescriptor {
		return {
			sourceId: this.name,
			sourceContractVersion: "binance-klines-v1",
			instrumentClass: "crypto",
			coverageMode: "exact-range",
			sessionModel: "continuous",
			timezone: "UTC",
			supportsExactRangeFetch: true,
			supportsBackwardAnchor: true,
			supportsForwardAnchor: false,
			supportsLiveBars: true,
			maxBarsPerRequest: MAX_LIMIT,
			finalityMode: "near-now-provisional",
			expectedGapReasons: ["not-fetched", "source-no-data", "rate-limited", "boundary-exhausted"],
		};
	}

	async getBars(params: GetBarsParams): Promise<GetBarsResult> {
		const { symbol, interval, timestamp, limit, signal } = params;
		const safeSymbol = validateSymbol(symbol);
		const safeInterval = resolveInterval(interval);
		const safeLimit = Math.max(1, Math.min(MAX_LIMIT, limit));
		try {
			const bars = await fetchBinancePage({
				symbol: safeSymbol,
				interval: safeInterval,
				limit: safeLimit,
				endTime: params.type === "backward" && timestamp !== null ? timestamp - 1 : undefined,
				signal,
			});
			this.regionBlocked = false;
			return { bars, hasMore: bars.length >= safeLimit };
		} catch (error) {
			if (isGeoBlocked(error)) {
				this.regionBlocked = true;
				log.error("Binance unavailable in this region (451); returning empty result");
				return { bars: [], hasMore: false };
			}
			throw error;
		}
	}

	async fetchBarsInRange(symbol: string, timeframe: string, from: Date, to: Date, signal?: AbortSignal): Promise<readonly KLineBar[]> {
		const safeSymbol = validateSymbol(symbol);
		const safeInterval = resolveInterval(timeframe);
		const startTime = from.getTime();
		const endTime = to.getTime();

		if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
			return [];
		}

		const collectedBars = new Map<number, KLineBar>();
		let nextStartTime = startTime;

		while (nextStartTime <= endTime) {
			let pageBars: readonly KLineBar[];
			try {
				pageBars = await fetchBinancePage({
					symbol: safeSymbol,
					interval: safeInterval,
					limit: MAX_LIMIT,
					startTime: nextStartTime,
					endTime,
					signal,
				});
			} catch (error) {
				if (isGeoBlocked(error)) {
					this.regionBlocked = true;
					log.error("Binance unavailable in this region (451); returning collected bars so far");
					break;
				}
				throw error;
			}
			this.regionBlocked = false;

			if (pageBars.length === 0) {
				break;
			}

			for (const bar of pageBars) {
				if (bar.timestamp < startTime || bar.timestamp > endTime) {
					continue;
				}
				collectedBars.set(bar.timestamp, bar);
			}

			const lastBarTimestamp = pageBars[pageBars.length - 1]?.timestamp;
			if (lastBarTimestamp === undefined || pageBars.length < MAX_LIMIT || lastBarTimestamp >= endTime) {
				break;
			}

			if (lastBarTimestamp < nextStartTime) {
				break;
			}

			nextStartTime = lastBarTimestamp + 1;
		}

		return [...collectedBars.values()].sort((left, right) => left.timestamp - right.timestamp);
	}

	async fetchBarsBefore(symbol: string, timeframe: string, before: Date, limit = MAX_LIMIT, signal?: AbortSignal): Promise<readonly KLineBar[]> {
		const result = await this.getBars({
			type: "backward",
			symbol,
			interval: timeframe,
			timestamp: before.getTime(),
			limit,
			signal,
		});

		return result.bars;
	}

	getBarsCanonical(params: GetBarsParams): Promise<CanonicalFetchResult> {
		return this.getBars(params).then((result) => {
			const coverage = buildBinanceCoverage(result, params);
			return { ...result, coverage };
		});
	}

	subscribeLevel2(params: {
		symbol: string;
		depth: number;
		callback: (snapshot: Level2Snapshot) => void;
	}): () => void {
		const wsSymbol = params.symbol.toLowerCase();
		const depth = params.depth;
		const url = `${BINANCE_WS_BASE}/${wsSymbol}@depth${depth}@100ms`;
		const socket = new WebSocket(url);

		socket.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				const snapshot: Level2Snapshot = {
					symbol: params.symbol,
					timestamp: data.E ?? Date.now(),
					bids: (data.bids || []).map((b: [string, string]) => [parseFloat(b[0]), parseFloat(b[1])]),
					asks: (data.asks || []).map((a: [string, string]) => [parseFloat(a[0]), parseFloat(a[1])]),
				};
				params.callback(snapshot);
			} catch (e) {
				log.error('Binance Level2 message error:', e);
			}
		};

		socket.onerror = (err) => {
			log.error('Binance Level2 WS error:', err);
		};

		return () => {
			if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
				socket.close();
			}
		};
	}

	subscribeTicks(params: {
		symbol: string;
		callback: (tick: TickData) => void;
	}): () => void {
		const wsSymbol = params.symbol.toLowerCase();
		const url = `${BINANCE_WS_BASE}/${wsSymbol}@trade`;
		const socket = new WebSocket(url);

		socket.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				const tick: TickData = {
					symbol: params.symbol,
					timestamp: data.T,
					price: parseFloat(data.p),
					size: parseFloat(data.q),
					side: data.m ? "sell" : "buy",
				};
				params.callback(tick);
			} catch (e) {
				log.error('Binance Trade message error:', e);
			}
		};

		socket.onerror = (err) => {
			log.error('Binance Ticks WS error:', err);
		};

		return () => {
			if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
				socket.close();
			}
		};
	}

	subscribeKline(params: {
		symbol: string;
		interval: string;
		callback: (bar: KLineBar & { isClosed?: boolean }) => void;
	}): () => void {
		const wsSymbol = params.symbol.toLowerCase();
		const wsInterval = resolveInterval(params.interval);
		const url = `${BINANCE_WS_BASE}/${wsSymbol}@kline_${wsInterval}`;
		const socket = new WebSocket(url);

		socket.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				const k = data.k;
				if (!k) return;
				const bar: KLineBar & { isClosed?: boolean } = {
					timestamp: Number(k.t),
					open: parseFloat(k.o),
					high: parseFloat(k.h),
					low: parseFloat(k.l),
					close: parseFloat(k.c),
					volume: parseFloat(k.v),
					isClosed: k.x === true,
				};
				params.callback(bar);
			} catch (e) {
				log.error("Binance kline message error:", e);
			}
		};

		socket.onerror = (err) => {
			log.error("Binance kline WS error:", err);
		};

		return () => {
			if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
				socket.close();
			}
		};
	}

	async fetchLevel2History(params: {
		symbol: string;
		from: number;
		to: number;
		depth: number;
	}): Promise<Level2Snapshot[]> {
		const safeSymbol = validateSymbol(params.symbol);
		const urlParams = new URLSearchParams({
			symbol: safeSymbol,
			limit: String(params.depth),
		});

		const response = await fetch(`${_BINANCE_ORIGIN}/api/v3/depth?${urlParams.toString()}`);
		if (!response.ok) {
			throw new Error(`Failed to fetch Binance depth snapshot: ${response.status}`);
		}

		const json = await response.json() as { lastUpdateId: number; bids: [string, string][]; asks: [string, string][] };
		const snapshot: Level2Snapshot = {
			symbol: params.symbol,
			timestamp: Date.now(),
			bids: (json.bids || []).map((b) => [parseFloat(b[0]), parseFloat(b[1])]),
			asks: (json.asks || []).map((a) => [parseFloat(a[0]), parseFloat(a[1])]),
		};

		return [snapshot];
	}

	async fetchTickHistory(params: {
		symbol: string;
		from: number;
		to: number;
	}): Promise<TickData[]> {
		const safeSymbol = validateSymbol(params.symbol);
		const urlParams = new URLSearchParams({
			symbol: safeSymbol,
			startTime: String(params.from),
			endTime: String(params.to),
			limit: "1000",
		});

		const response = await fetch(`${_BINANCE_ORIGIN}/api/v3/aggTrades?${urlParams.toString()}`);
		if (!response.ok) {
			throw new Error(`Failed to fetch Binance tick history: ${response.status}`);
		}

		const json = await response.json() as Array<{ T: number; p: string; q: string; m: boolean }>;
		return json.map((item) => ({
			symbol: params.symbol,
			timestamp: item.T,
			price: parseFloat(item.p),
			size: parseFloat(item.q),
			side: item.m ? "sell" : "buy",
		}));
	}
}

/**
 * Builds coverage fragments for a Binance exact-range fetch.
 *
 * Binance is a continuous 24/7 market so any gap is either:
 * - Covered (bars returned)
 * - boundary-exhausted (no older data exists)
 */
function buildBinanceCoverage(
	result: GetBarsResult,
	params: GetBarsParams,
): readonly CoverageFragment[] {
	const { bars, hasMore } = result;

	if (bars.length === 0) {
		if (params.type === "backward" && params.timestamp !== null) {
			// Source returned nothing before the anchor — boundary exhausted
			return [{ fromTs: 0, toTs: params.timestamp, status: "unresolved", reason: "boundary-exhausted" }];
		}
		// Init / no anchor → no data at all
		return [{ fromTs: 0, toTs: Date.now(), status: "unresolved", reason: "source-no-data" }];
	}

	const oldestTs = bars[0].timestamp;
	const newestTs = bars[bars.length - 1].timestamp;
	const covered: CoverageFragment = { fromTs: oldestTs, toTs: newestTs, status: "covered" };

	if (!hasMore) {
		// No more data before oldest bar → boundary reached
		return [
			{ fromTs: 0, toTs: oldestTs, status: "unresolved", reason: "boundary-exhausted" },
			covered,
		];
	}

	return [covered];
}

export const binanceAdapter = new BinanceAdapter();
