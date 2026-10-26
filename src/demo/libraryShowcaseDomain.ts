import { format } from "d3-format";
import { timeFormat } from "d3-time-format";

import { TIMEFRAME_MAP } from "../widget/adapters/VNInvestClient";
import type { KLineBar } from "../lib/adapters";
import type { RawOHLCV } from "../lib/core/calculators/types";
import type { SeriesTypeId } from "../public-api";

export const VNI_SYMBOL_STORAGE_KEY = "vnsc_vni_symbol";
export const VNI_TIMEFRAME_STORAGE_KEY = "vnsc_vni_timeframe";

const DAY_MS = 86_400_000;

export function readStoredString(key: string, fallback: string): string {
	if (typeof localStorage === "undefined") {
		return fallback;
	}
	try {
		return localStorage.getItem(key) ?? fallback;
	} catch {
		return fallback;
	}
}

export function writeStoredValue(key: string, value: string) {
	if (typeof localStorage === "undefined") {
		return;
	}
	try {
		localStorage.setItem(key, value);
	} catch {
		// ignore storage errors
	}
}

export function resolveTimeframeMs(timeframe: string): number {
	switch (timeframe) {
		case "1m": return 60_000;
		case "5m": return 5 * 60_000;
		case "15m": return 15 * 60_000;
		case "1H":
		case "1h": return 60 * 60_000;
		case "2H": return 2 * 60 * 60_000;
		case "4H":
		case "4h": return 4 * 60 * 60_000;
		case "D":
		case "1D":
		case "1d": return DAY_MS;
		case "W":
		case "1W":
		case "1w": return 7 * DAY_MS;
		case "M": return 30 * DAY_MS;
		case "Y": return 365 * DAY_MS;
		default: return DAY_MS;
	}
}

export function normalizeVNITimeframe(value: string): string {
	return TIMEFRAME_MAP[value] ?? value;
}

export const priceFormat = format(".2f");
export const volumeFormat = format(".3s");
export const dateFormat = timeFormat("%d/%m/%Y %H:%M");

export function klineBarToRawOHLCV(bar: KLineBar): RawOHLCV {
	return { date: new Date(bar.timestamp), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
}

export const BINANCE_TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "4h"] as const;
export const VNI_TIMEFRAMES = ["1m", "5m", "15m", "1H", "2H", "4H", "D", "W"] as const;
export type Timeframe = typeof BINANCE_TIMEFRAMES[number] | typeof VNI_TIMEFRAMES[number];

export const CHART_TYPES = ["candlestick", "hollow", "ohlc", "heikinashi", "line", "area"] as const;
export type ChartTypeId = typeof CHART_TYPES[number];
export const CANDLE_TYPE_STORAGE_KEY = "vnsc_candleType";

export const CHART_TYPE_TO_SERIES: Record<ChartTypeId, SeriesTypeId> = {
	candlestick: "Candlestick",
	hollow: "HollowCandle",
	ohlc: "OHLC",
	heikinashi: "HeikinAshi",
	line: "Line",
	area: "Area",
};

export const MAIN_PRICE_SERIES_TYPES: SeriesTypeId[] = ["Candlestick", "HollowCandle", "OHLC", "HeikinAshi", "Line", "Area"];

export function loadChartType(): ChartTypeId {
	if (typeof localStorage === "undefined") {
		return "candlestick";
	}

	try {
		const saved = localStorage.getItem(CANDLE_TYPE_STORAGE_KEY);
		if (saved && CHART_TYPES.includes(saved as ChartTypeId)) {
			return saved as ChartTypeId;
		}
	} catch {
		// ignore storage errors
	}

	return "candlestick";
}
