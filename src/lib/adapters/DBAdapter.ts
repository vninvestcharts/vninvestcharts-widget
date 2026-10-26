import { BaseAdapter } from "./BaseAdapter";
import type { OHLCVBar } from "../types/ohlcv";
import type { OrderbookSnapshot, SymbolInfo, Timeframe, Trade, Unsubscribe } from "../types/adapter";

/**
 * DBAdapter simulated database queries executor for stock data.
 */
export class DBAdapter extends BaseAdapter {
	private readonly queryExecutor: (sql: string, params: unknown[]) => Promise<unknown[]>;

	constructor(queryExecutor?: (sql: string, params: unknown[]) => Promise<unknown[]>, baseUrl = "") {
		super(baseUrl, 5000);
		this.queryExecutor =
			queryExecutor ||
			(async (sql: string, params: unknown[]) => {
				return [];
			});
	}

	async fetchBarsInRange(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<readonly OHLCVBar[]> {
		const sql = `
			SELECT date, open, high, low, close, volume 
			FROM ohlcv 
			WHERE symbol = ? AND timeframe = ? AND date >= ? AND date <= ?
			ORDER BY date ASC
		`;
		const params = [symbol, timeframe, from.toISOString(), to.toISOString()];
		const cacheKey = `db-range:${symbol}:${timeframe}:${from.getTime()}:${to.getTime()}`;

		return this.memoize(cacheKey, async () => {
			const rows = (await this.queryExecutor(sql, params)) as any[];
			return this.normalizeBars(
				rows.map((row) => ({
					date: new Date(row.date),
					open: Number(row.open),
					high: Number(row.high),
					low: Number(row.low),
					close: Number(row.close),
					volume: Number(row.volume),
				})),
			);
		});
	}

	async fetchBarsBefore(symbol: string, timeframe: Timeframe, before: Date, limit = 100): Promise<readonly OHLCVBar[]> {
		const sql = `
			SELECT date, open, high, low, close, volume 
			FROM ohlcv 
			WHERE symbol = ? AND timeframe = ? AND date < ?
			ORDER BY date DESC
			LIMIT ?
		`;
		const params = [symbol, timeframe, before.toISOString(), limit];
		const cacheKey = `db-before:${symbol}:${timeframe}:${before.getTime()}:${limit}`;

		return this.memoize(cacheKey, async () => {
			const rows = (await this.queryExecutor(sql, params)) as any[];
			const normalized = rows.reverse().map((row) => ({
				date: new Date(row.date),
				open: Number(row.open),
				high: Number(row.high),
				low: Number(row.low),
				close: Number(row.close),
				volume: Number(row.volume),
			}));
			return this.normalizeBars(normalized);
		});
	}

	subscribeToBar(symbol: string, timeframe: Timeframe, onBar: (bar: OHLCVBar) => void): Unsubscribe {
		return () => {};
	}

	subscribeToTrades(symbol: string, onTrade: (trade: Trade) => void): Unsubscribe {
		return () => {};
	}

	subscribeToOrderbook(symbol: string, onUpdate: (snapshot: OrderbookSnapshot) => void): Unsubscribe {
		return () => {};
	}

	async searchSymbols(query: string): Promise<readonly SymbolInfo[]> {
		const sql = "SELECT symbol, name, exchange FROM symbols WHERE symbol LIKE ? OR name LIKE ? LIMIT 10";
		const wildcard = `%${query}%`;
		const rows = (await this.queryExecutor(sql, [wildcard, wildcard])) as any[];
		return rows.map((row) => ({
			symbol: String(row.symbol),
			name: String(row.name),
			exchange: String(row.exchange || ""),
		}));
	}
}
