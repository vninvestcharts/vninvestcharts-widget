/**
 * INT-1: DataSource abstraction layer
 * Cho phép demo chuyển đổi giữa Binance Demo và VNInvest data source.
 */

export type DataSourceId = "demo" | "vninvest";

export interface RawOHLCVBar {
	date: Date;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface SymbolResult {
	symbol: string;
	company_name: string;
	exchange: string;
}

export interface DataSource {
	readonly id: DataSourceId;
	/** i18n key cho label hiển thị trong UI */
	readonly labelKey: string;
	getOHLCV(symbol: string, days: number, timeframe: string): Promise<RawOHLCVBar[]>;
	searchSymbols(query: string): Promise<SymbolResult[]>;
}
