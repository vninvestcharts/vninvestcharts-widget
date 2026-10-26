import type { RawOHLCV } from "../lib/core/calculators/types";
import bitstampCsv from "./data/bitfinex_xbtusd_1m.csv";

const DEMO_WINDOW = 1000;
const BINANCE_MAX_LIMIT = 1000;

declare const VN_BINANCE_BASE: string | undefined;

/**
 * Demo fetch base — SAME ORIGIN FIRST.
 *
 * Hardcoded `https://api.binance.com` here meant the demo's bootstrap data bypassed
 * `/binance-proxy/`, exactly like `BinanceAdapter` did in production. Measured against
 * the deployed test env on 2026-10-13: the direct host answers HTTP 451 and the browser
 * gets a CORS rejection, while the repo's own `/binance-proxy/` returns 200.
 *
 * The proxy is served by the webpack dev server (`npm run watch`) AND by
 * `deploy/nginx-app.conf` in the deployed image, so one relative path covers both. The
 * absolute URL stays reachable as a fallback for anyone serving `build/` without that
 * nginx conf — `loadDemoBars` tries the proxy first and only then the direct host.
 */
const BINANCE_PROXY_BASE = "/binance-proxy/api/v3/klines";
const BINANCE_DIRECT_BASE = "https://api.binance.com/api/v3/klines";
/** Public data-only mirror; not geo-blocked. Verified HTTP 200 from the test env. */
const BINANCE_FALLBACK_BASE = "https://data-api.binance.vision/api/v3/klines";
const BINANCE_BASE =
	typeof VN_BINANCE_BASE === "string" && VN_BINANCE_BASE.length > 0
		? `${VN_BINANCE_BASE}/api/v3/klines`
		: BINANCE_PROXY_BASE;

/** Map demo timeframe labels → Binance interval strings */
export const BINANCE_INTERVAL_MAP: Record<string, string> = {
	"1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
	"1h": "1h", "4h": "4h", "1D": "1d", "1W": "1w",
};

function sortBars(data: readonly RawOHLCV[]) {
	const getMs = (d: Date | string | number): number => {
		if (d instanceof Date) return d.getTime();
		return new Date(d).getTime();
	};
	return data
		.slice()
		.sort((left, right) => getMs(left.date) - getMs(right.date));
}

function normalizeBars(data: readonly RawOHLCV[], limit = DEMO_WINDOW): RawOHLCV[] {
	const sorted = sortBars(data);
	return sorted.slice(-limit);
}

export function mergeBarsByDate(primary: readonly RawOHLCV[], secondary: readonly RawOHLCV[]): RawOHLCV[] {
	const merged = sortBars([...primary, ...secondary]);
	if (merged.length === 0) {
		return [];
	}

	const getMs = (d: Date | string | number): number => {
		if (d instanceof Date) return d.getTime();
		return new Date(d).getTime();
	};

	const deduped: RawOHLCV[] = [merged[0]];
	for (const bar of merged.slice(1)) {
		const lastBar = deduped[deduped.length - 1];
		if (getMs(lastBar.date) === getMs(bar.date)) {
			deduped[deduped.length - 1] = bar;
		} else {
			deduped.push(bar);
		}
	}

	return deduped;
}

function parseDateTime(value: string) {
	return new Date(value.replace(" ", "T"));
}

function parseCsvRow(row: string): RawOHLCV {
	const [date, open, high, low, close, volume] = row.split(",");

	return {
		date: parseDateTime(date),
		open: Number(open),
		high: Number(high),
		low: Number(low),
		close: Number(close),
		volume: Number(volume),
	};
}

export function getOfflineDemoBars(): RawOHLCV[] {
	return normalizeBars(bitstampCsv.trim().split(/\r?\n/).slice(1).map(parseCsvRow));
}

type BinanceKline = [number | string, string, string, string, string, string, ...unknown[]];

function formatBinanceKlineBars(json: BinanceKline[], limit = DEMO_WINDOW): RawOHLCV[] {
	return normalizeBars(json.map((d: any) => ({
		date: new Date(d[0]),
		open: parseFloat(d[1]),
		high: parseFloat(d[2]),
		low: parseFloat(d[3]),
		close: parseFloat(d[4]),
		volume: parseFloat(d[5]),
	})), limit);
}

export interface FetchLiveOptions {
	symbol?: string;
	interval?: string;
	limit?: number;
	startTime?: number | Date;
	endTime?: number | Date;
	signal?: AbortSignal;
}

function toTimeValue(value?: number | Date) {
	if (value === undefined) {
		return undefined;
	}
	return value instanceof Date ? value.valueOf() : value;
}

/** Map timeframe strings → millisecond intervals for gap detection. */
export const INTERVAL_MS_MAP: Record<string, number> = {
	"1m": 60_000, "3m": 3 * 60_000, "5m": 5 * 60_000,
	"15m": 15 * 60_000, "30m": 30 * 60_000,
	"1h": 3_600_000, "1H": 3_600_000,
	"2H": 2 * 3_600_000,
	"4h": 4 * 3_600_000, "4H": 4 * 3_600_000,
	"1D": 86_400_000, "1d": 86_400_000, "d": 86_400_000, "D": 86_400_000,
	"1W": 7 * 86_400_000, "1w": 7 * 86_400_000, "w": 7 * 86_400_000, "W": 7 * 86_400_000,
	"1M": 30 * 86_400_000, "M": 30 * 86_400_000,
	"1Y": 365 * 86_400_000, "Y": 365 * 86_400_000,
};

/**
 * Maximum allowed gap between backward-fetched bars and current bars,
 * in multiples of the interval. 48 × 1h = 2 days for crypto (24/7 market).
 */
const MAX_CONTIGUOUS_GAP_MULTIPLIER = 48;

/**
 * Detect whether merging `olderBars` into `currentBars` would create
 * an excessive time gap. Used to reject stale backward-fetched pages
 * that would cause visual artefacts (BB ballooning, chart discontinuity).
 */
export function isBackfillGapExcessive(
	olderBars: readonly RawOHLCV[],
	currentBars: readonly RawOHLCV[],
	timeframe: string,
	maxMultiplier: number = MAX_CONTIGUOUS_GAP_MULTIPLIER,
): boolean {
	if (olderBars.length === 0 || currentBars.length === 0) return false;

	const newestOlderTs = olderBars[olderBars.length - 1].date.valueOf();
	const oldestCurrentTs = currentBars[0].date.valueOf();
	const gapMs = oldestCurrentTs - newestOlderTs;

	if (gapMs <= 0) return false;

	const intervalMs = INTERVAL_MS_MAP[timeframe] ?? 3_600_000;
	return gapMs > intervalMs * maxMultiplier;
}

async function fetchBinanceKlinePage(options: FetchLiveOptions = {}): Promise<RawOHLCV[]> {
	const { symbol = "BTCUSDT", interval = "1h", limit = DEMO_WINDOW, startTime, endTime, signal } = options;
	const binanceInterval = BINANCE_INTERVAL_MAP[interval] ?? interval;
	const params = new URLSearchParams({
		symbol,
		interval: binanceInterval,
		limit: String(Math.max(1, Math.min(BINANCE_MAX_LIMIT, limit))),
	});
	const startTimeValue = toTimeValue(startTime);
	const endTimeValue = toTimeValue(endTime);
	if (startTimeValue !== undefined) {
		params.set("startTime", String(startTimeValue));
	}
	if (endTimeValue !== undefined) {
		params.set("endTime", String(endTimeValue));
	}
	// Proxy first, direct host only if the proxy itself is unavailable (someone serving
	// `build/` without the repo's nginx conf). A CORS rejection is an opaque TypeError,
	// so the catch has to cover a thrown fetch too, not just a non-OK response.
	const query = params.toString();
	let response: Response;
	try {
		response = await fetch(`${BINANCE_BASE}?${query}`, { signal });
	} catch (error) {
		if (BINANCE_BASE === BINANCE_DIRECT_BASE) throw error;
		response = await fetch(`${BINANCE_DIRECT_BASE}?${query}`, { signal });
	}

	if (!response.ok) {
		// 451 = geo-block on the direct host; the public mirror serves the same data.
		if (response.status === 451 && BINANCE_BASE !== BINANCE_FALLBACK_BASE) {
			const mirrored = await fetch(`${BINANCE_FALLBACK_BASE}?${query}`, { signal });
			if (mirrored.ok) {
				return formatBinanceKlineBars((await mirrored.json()) as BinanceKline[], limit);
			}
		}
		throw new Error(`Không tải được dữ liệu Binance: ${response.status}`);
	}

	const json = await response.json() as BinanceKline[];
	return formatBinanceKlineBars(json, limit);
}

export async function fetchHistoricalDemoBars(options: FetchLiveOptions & { pages?: number } = {}): Promise<RawOHLCV[]> {
	const { pages = 1, limit = BINANCE_MAX_LIMIT, endTime, ...rest } = options;
	let nextEndTime = toTimeValue(endTime);
	let bars: RawOHLCV[] = [];

	for (let page = 0; page < Math.max(1, pages); page += 1) {
		const pageBars = await fetchBinanceKlinePage({
			...rest,
			limit,
			endTime: nextEndTime,
		});

		if (pageBars.length === 0) {
			break;
		}

		bars = mergeBarsByDate(pageBars, bars);
		if (pageBars.length < limit) {
			break;
		}

		nextEndTime = pageBars[0].date.valueOf() - 1;
	}

	return bars;
}