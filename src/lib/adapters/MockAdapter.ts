import type { OrderbookSnapshot, StockDataAdapter, SymbolInfo, Timeframe, Trade, Unsubscribe } from "../types/adapter";
import type { OHLCVBar } from "../types/ohlcv";
import type { RawOHLCVBar } from "./BaseAdapter";

export interface MockAdapterOptions {
	symbols?: readonly SymbolInfo[];
	bars?: readonly OHLCVBar[];
	intervalMs?: number;
}

function createSampleBars(count: number): OHLCVBar[] {
	const bars: OHLCVBar[] = [];
	let close = 100;
	for (let index = 0; index < count; index += 1) {
		const drift = Math.sin(index / 6) * 1.4;
		const open = close;
		close = Number((close + drift).toFixed(2));
		const high = Math.max(open, close) + 1.5;
		const low = Math.min(open, close) - 1.5;
		bars.push({
			date: new Date(Date.UTC(2024, 0, index + 1)),
			open,
			high,
			low,
			close,
			volume: 1_000 + index * 25,
			index,
			dataIndex: index,
		});
	}
	return bars;
}

function cloneBar(bar: OHLCVBar, index: number): OHLCVBar {
	return {
		...bar,
		date: new Date(bar.date),
		index,
		dataIndex: index,
	};
}

export class MockAdapter implements StockDataAdapter {
	private readonly bars: OHLCVBar[];
	private readonly symbols: readonly SymbolInfo[];
	private readonly intervalMs: number;

	constructor(options: MockAdapterOptions = {}) {
		this.bars = [...(options.bars ?? createSampleBars(240))];
		this.symbols = options.symbols ?? [
			{ symbol: "VCB", name: "Vietcombank", exchange: "HOSE" },
			{ symbol: "FPT", name: "FPT Corporation", exchange: "HOSE" },
			{ symbol: "MBB", name: "Military Bank", exchange: "HOSE" },
		];
		this.intervalMs = options.intervalMs ?? 1_000;
	}

	async fetchBars(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<readonly OHLCVBar[]> {
		void symbol;
		void timeframe;
		return this.bars
			.filter((bar) => bar.date >= from && bar.date <= to)
			.map((bar, index) => cloneBar(bar, index));
	}

	async fetchMoreBars(symbol: string, timeframe: Timeframe, before: Date, limit = 300): Promise<readonly OHLCVBar[]> {
		void symbol;
		void timeframe;
		return this.bars
			.filter((bar) => bar.date < before)
			.slice(-limit)
			.map((bar, index) => cloneBar(bar, index));
	}

	async fetchBarsInRange(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<readonly OHLCVBar[]> {
		return this.fetchBars(symbol, timeframe, from, to);
	}

	async fetchBarsBefore(symbol: string, timeframe: Timeframe, before: Date, limit = 300): Promise<readonly OHLCVBar[]> {
		return this.fetchMoreBars(symbol, timeframe, before, limit);
	}

	subscribeToBar(symbol: string, timeframe: Timeframe, onBar: (bar: OHLCVBar) => void): Unsubscribe {
		void symbol;
		void timeframe;
		let cursor = 0;
		const emitNext = () => {
			if (this.bars.length === 0) {
				return;
			}
			const bar = cloneBar(this.bars[cursor % this.bars.length], cursor);
			onBar(bar);
			cursor += 1;
		};

		emitNext();
		const timerId = setInterval(emitNext, this.intervalMs);
		return () => clearInterval(timerId);
	}

	subscribeToTrades(symbol: string, onTrade: (trade: Trade) => void): Unsubscribe {
		if (this.bars.length === 0) {
			return () => undefined;
		}

		let tradeIndex = 0;
		const emitTrade = () => {
			const bar = this.bars[tradeIndex % this.bars.length];
			onTrade({
				symbol,
				price: bar.close,
				size: Math.max(1, Math.round(bar.volume / 100)),
				timestamp: new Date(bar.date),
				side: tradeIndex % 2 === 0 ? "buy" : "sell",
			});
			tradeIndex += 1;
		};

		emitTrade();
		const timerId = setInterval(emitTrade, this.intervalMs);
		return () => clearInterval(timerId);
	}

	subscribeToOrderbook(symbol: string, onUpdate: (snapshot: OrderbookSnapshot) => void): Unsubscribe {
		if (this.bars.length === 0) {
			return () => undefined;
		}

		let snapshotIndex = 0;
		const emitSnapshot = () => {
			const bar = this.bars[snapshotIndex % this.bars.length];
			onUpdate({
				timestamp: new Date(bar.date),
				bids: [
					{ price: bar.close - 0.5, size: 100 },
					{ price: bar.close - 1, size: 80 },
				],
				asks: [
					{ price: bar.close + 0.5, size: 95 },
					{ price: bar.close + 1, size: 75 },
				],
			});
			snapshotIndex += 1;
		};

		emitSnapshot();
		const timerId = setInterval(emitSnapshot, this.intervalMs);
		return () => clearInterval(timerId);
	}

	async searchSymbols(query: string): Promise<readonly SymbolInfo[]> {
		const normalizedQuery = query.trim().toUpperCase();
		if (!normalizedQuery) {
			return this.symbols;
		}

		return this.symbols.filter((symbol) => (
			symbol.symbol.includes(normalizedQuery)
				|| (symbol.name?.toUpperCase() ?? "").includes(normalizedQuery)
		));
	}
}

export function createMockBars(count = 240) {
	return createSampleBars(count);
}