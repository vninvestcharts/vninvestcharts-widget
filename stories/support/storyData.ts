import { getIndicator } from "../../src/lib/indicators";
import type { OHLCVBar } from "../../src/lib/types/ohlcv";

export interface StoryDatum extends OHLCVBar {
	ema20?: number;
	ema50?: number;
	rsi?: number;
	macd?: {
		macd: number;
		signal: number;
		divergence: number;
	};
	bollingerBand?: {
		top: number;
		middle: number;
		bottom: number;
	};
	absoluteChange?: number;
}

const baseTime = Date.UTC(2024, 0, 2, 9, 0, 0);

function extractNumberArray(value: unknown) {
	const candidate: any = value;
	return Array.isArray(candidate) ? candidate : [];
}

function extractMacd(value: unknown) {
	const candidate: any = value;

	if (!candidate || typeof candidate !== "object") {
		return undefined;
	}

	if (!Array.isArray(candidate.macd) || !Array.isArray(candidate.signal) || !Array.isArray(candidate.histogram)) {
		return undefined;
	}

	return candidate;
}

function extractBollinger(value: unknown) {
	const candidate: any = value;

	if (!candidate || typeof candidate !== "object") {
		return undefined;
	}

	if (!Array.isArray(candidate.upper) || !Array.isArray(candidate.middle) || !Array.isArray(candidate.lower)) {
		return undefined;
	}

	return candidate;
}

function createSyntheticBar(index: number, previousClose: number): StoryDatum {
	const open = previousClose + Math.sin(index / 5) * 0.75;
	const swing = Math.sin(index / 6) * 2.4 + Math.cos(index / 17) * 1.2 + ((index % 9) - 4) * 0.08;
	const close = open + swing;
	const spread = 1.2 + Math.abs(Math.cos(index / 4)) * 0.9;

	return {
		date: new Date(baseTime + index * 60 * 60 * 1000),
		open,
		high: Math.max(open, close) + spread,
		low: Math.min(open, close) - spread,
		close,
		volume: Math.round(1_200_000 + Math.abs(Math.sin(index / 8)) * 650_000 + index * 8_500 + (index % 6) * 12_000),
		index,
		dataIndex: index,
	};
}

export function createStoryData(count = 240): StoryDatum[] {
	const bars: StoryDatum[] = [];
	let previousClose = 100;

	for (let index = 0; index < count; index += 1) {
		const bar = createSyntheticBar(index, previousClose);
		bars.push(bar);
		previousClose = bar.close;
	}

	const emaIndicator = getIndicator("EMA");
	const rsiIndicator = getIndicator("RSI");
	const macdIndicator = getIndicator("MACD");
	const bollingerIndicator = getIndicator("BOLLINGER");

	const ema20 = extractNumberArray(emaIndicator?.compute(bars, 20));
	const ema50 = extractNumberArray(emaIndicator?.compute(bars, 50));
	const rsi = extractNumberArray(rsiIndicator?.compute(bars, 14));
	const macd = extractMacd(macdIndicator?.compute(bars, 12, 26, 9));
	const bollingerBand = extractBollinger(bollingerIndicator?.compute(bars, 20, 2));

	return bars.map((bar, index) => ({
		...bar,
		absoluteChange: bar.close - bar.open,
		ema20: ema20[index],
		ema50: ema50[index],
		rsi: rsi[index],
		macd: macd
			? {
				macd: macd.macd[index],
				signal: macd.signal[index],
				divergence: macd.histogram[index],
			}
			: undefined,
		bollingerBand: bollingerBand
			? {
				top: bollingerBand.upper[index],
				middle: bollingerBand.middle[index],
				bottom: bollingerBand.lower[index],
			}
			: undefined,
	}));
}

export function buildDefaultExtents(data: StoryDatum[], visibleCount = 160): [Date, Date] {
	const endIndex = data.length - 1;
	const startIndex = Math.max(0, data.length - Math.min(visibleCount, data.length));
	return [data[startIndex].date, data[endIndex].date];
}