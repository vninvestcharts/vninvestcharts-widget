/**
 * OB-M02 — DataSource abstraction layer
 * Provides a unified interface for loading bar data from different sources.
 */

import type { RawOHLCV } from "../../lib/core/calculators/types";
import { getOfflineDemoBars } from "../demoData";
import { VNInvestClient } from "../../widget/adapters/VNInvestClient";
import type { RawOHLCVBar } from "../vninvest/types";

export interface SymbolSearchResult {
	symbol: string;
	company_name?: string;
	exchange?: string;
}

export interface DataSource {
	loadBars(symbol: string, options?: { days?: number; timeframe?: string }): Promise<RawOHLCV[]>;
	getSymbols(): Promise<string[]>;
	searchSymbols(query: string): Promise<SymbolSearchResult[]>;
	getSymbolName(symbol: string): Promise<string>;
}

function vniBarToRawOHLCV(bar: RawOHLCVBar): RawOHLCV {
	return {
		date: bar.date,
		open: bar.open,
		high: bar.high,
		low: bar.low,
		close: bar.close,
		volume: bar.volume,
	};
}

/** Demo data source — uses bundled offline bars. */
export class DemoDataSource implements DataSource {
	async loadBars(_symbol: string, _options?: { days?: number; timeframe?: string }): Promise<RawOHLCV[]> {
		return getOfflineDemoBars();
	}

	async getSymbols(): Promise<string[]> {
		return ["BTCUSDT", "ETHUSDT"];
	}

	async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
		const all: SymbolSearchResult[] = [
			{ symbol: "BTCUSDT", company_name: "Bitcoin / USDT", exchange: "Binance" },
			{ symbol: "ETHUSDT", company_name: "Ethereum / USDT", exchange: "Binance" },
		];
		if (!query) return all;
		const q = query.toLowerCase();
		return all.filter((item) => item.symbol.toLowerCase().includes(q) || (item.company_name ?? "").toLowerCase().includes(q));
	}

	async getSymbolName(symbol: string): Promise<string> {
		return symbol;
	}
}

/** VNInvest data source — delegates to VNInvestClient. */
export class VNInvestDataSource implements DataSource {
	constructor(private readonly _client: VNInvestClient) {}

	async loadBars(symbol: string, options?: { days?: number; timeframe?: string }): Promise<RawOHLCV[]> {
		const bars = await this._client.getChart(symbol, options);return bars.map(vniBarToRawOHLCV);
	}

	async getSymbols(): Promise<string[]> {
		const stocks = await this._client.getStocks();
		return stocks.map((s) => s.symbol);
	}

	async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
		const stocks = await this._client.getStocks(query);
		return stocks.map((s) => ({
			symbol: s.symbol,
			company_name: s.company_name,
			exchange: s.exchange,
		}));
	}

	async getSymbolName(symbol: string): Promise<string> {
		const stocks = await this._client.getStocks(symbol);
		return stocks.find((s) => s.symbol === symbol)?.company_name ?? symbol;
	}
}

export type { DataSource as IDataSource };
