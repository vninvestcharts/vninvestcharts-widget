// Task 00: MarketDataPort — cổng cấp giá duy nhất cho paper trading.
// Live lấy giá từ last-close / callback `setEnrichedData`; Replay nhận bar feed
// từ `BarReplayController`. 0% logic UI — chỉ sản xuất MarketQuote + pub/sub.
import type { ReplayOHLCBar } from "../replay/replayTradingTypes";

export interface MarketQuote {
	symbol: string;
	lastPrice: number;
	bidPrice: number;
	askPrice: number;
	spread: number;
	spreadBps: number;
	/** Luôn true với nguồn OHLC (không có sổ lệnh tick L1 thật). */
	isSyntheticSpread: boolean;
	timestamp: number;
}

export interface SyntheticSpreadConfig {
	/** Spread mặc định theo bps của last khi không có tick provider. Default 10. */
	spreadBps?: number;
	/** Nếu có: spread = đúng 1 tick, bid/ask làm tròn theo tick. */
	tickSizeProvider?: (symbol: string, price: number) => number;
}

export type QuoteCallback = (quote: MarketQuote) => void;

export interface IMarketDataPort {
	getLatestQuote(symbol: string): MarketQuote | undefined;
	feedBar(symbol: string, bar: ReplayOHLCBar): void;
	subscribeQuote(symbol: string, callback: QuoteCallback): () => void;
}

// TVP-B3 fix: synthetic spread mặc định 2bps (10bps trên giá lớn trông như bug,
// ví dụ 77k spread trên BTC). Có tick provider thì luôn dùng spread = 1 tick.
const DEFAULT_SPREAD_BPS = 2;

function toTimestamp(date: Date | number): number {
	return date instanceof Date ? date.getTime() : date;
}

function roundToTick(value: number, tick: number): number {
	if (!Number.isFinite(tick) || tick <= 0) return value;
	return Math.round(value / tick) * tick;
}

/**
 * Tính synthetic quote từ last price. Quy tắc xác định (deterministic):
 * - last không hợp lệ (<= 0 / NaN): spread = 0, bid = ask = last.
 * - có tickSizeProvider: spread = đúng 1 tick, bid/ask làm tròn theo tick.
 * - ngược lại: spread = last * spreadBps / 10000, bid/ask giữ nguyên.
 */
export function computeSyntheticQuote(
	symbol: string,
	lastPrice: number,
	timestamp: number,
	config: SyntheticSpreadConfig = {},
): MarketQuote {
	const bps = config.spreadBps ?? DEFAULT_SPREAD_BPS;
	if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
		return {
			symbol,
			lastPrice,
			bidPrice: lastPrice,
			askPrice: lastPrice,
			spread: 0,
			spreadBps: 0,
			isSyntheticSpread: true,
			timestamp,
		};
	}
	const tick = config.tickSizeProvider?.(symbol, lastPrice);
	const spread = tick != null && tick > 0 ? tick : (lastPrice * bps) / 10000;
	const half = spread / 2;
	const bid = tick != null && tick > 0 ? roundToTick(lastPrice - half, tick) : lastPrice - half;
	const ask = tick != null && tick > 0 ? roundToTick(lastPrice + half, tick) : lastPrice + half;
	return {
		symbol,
		lastPrice,
		bidPrice: bid,
		askPrice: ask,
		spread,
		spreadBps: (spread / lastPrice) * 10000,
		isSyntheticSpread: true,
		timestamp,
	};
}

export class MarketDataPort implements IMarketDataPort {
	private readonly config: SyntheticSpreadConfig;
	private readonly latest = new Map<string, MarketQuote>();
	private readonly subscribers = new Map<string, Set<QuoteCallback>>();

	constructor(config: SyntheticSpreadConfig = {}) {
		this.config = config;
	}

	getLatestQuote(symbol: string): MarketQuote | undefined {
		return this.latest.get(symbol);
	}

	feedBar(symbol: string, bar: ReplayOHLCBar): void {
		const quote = computeSyntheticQuote(symbol, bar.close, toTimestamp(bar.date), this.config);
		this.latest.set(symbol, quote);
		this.subscribers.get(symbol)?.forEach((cb) => cb(quote));
	}

	subscribeQuote(symbol: string, callback: QuoteCallback): () => void {
		let set = this.subscribers.get(symbol);
		if (!set) {
			set = new Set();
			this.subscribers.set(symbol, set);
		}
		set.add(callback);
		return () => {
			set?.delete(callback);
		};
	}
}

export function createMarketDataPort(config: SyntheticSpreadConfig = {}): IMarketDataPort {
	return new MarketDataPort(config);
}
