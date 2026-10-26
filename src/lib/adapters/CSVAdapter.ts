import { BaseAdapter, RawOHLCVBar } from "./BaseAdapter";
import type { OHLCVBar } from "../types/ohlcv";
import type { OrderbookSnapshot, SymbolInfo, Timeframe, Trade, Unsubscribe } from "../types/adapter";

/**
 * CSVAdapter loads and parses offline/local CSV data.
 */
export class CSVAdapter extends BaseAdapter {
	private parsedBars: OHLCVBar[] = [];

	constructor(csvContent: string, baseUrl = "") {
		super(baseUrl, 60000);
		this.parseCSV(csvContent);
	}

	private parseCSV(csvContent: string) {
		const lines = csvContent.split(/\r?\n/);
		if (lines.length === 0) return;

		const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
		const dateIdx = headers.indexOf("date");
		const openIdx = headers.indexOf("open");
		const highIdx = headers.indexOf("high");
		const lowIdx = headers.indexOf("low");
		const closeIdx = headers.indexOf("close");
		const volumeIdx = headers.indexOf("volume");

		if (dateIdx === -1 || closeIdx === -1) {
			throw new Error("CSV must contain at least 'date' and 'close' columns");
		}

		const rawBars: RawOHLCVBar[] = [];
		for (let i = 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) continue;
			const cols = line.split(",").map((c) => c.trim());
			if (cols.length < headers.length) continue;

			const dateVal = cols[dateIdx];
			const openVal = openIdx !== -1 ? parseFloat(cols[openIdx]) : 0;
			const highVal = highIdx !== -1 ? parseFloat(cols[highIdx]) : 0;
			const lowVal = lowIdx !== -1 ? parseFloat(cols[lowIdx]) : 0;
			const closeVal = parseFloat(cols[closeIdx]);
			const volumeVal = volumeIdx !== -1 ? parseFloat(cols[volumeIdx]) : 0;

			rawBars.push({
				date: new Date(dateVal),
				open: isNaN(openVal) ? closeVal : openVal,
				high: isNaN(highVal) ? closeVal : highVal,
				low: isNaN(lowVal) ? closeVal : lowVal,
				close: isNaN(closeVal) ? 0 : closeVal,
				volume: isNaN(volumeVal) ? 0 : volumeVal,
			});
		}

		this.parsedBars = this.normalizeBars(rawBars);
	}

	async fetchBarsInRange(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<readonly OHLCVBar[]> {
		const fromTime = from.getTime();
		const toTime = to.getTime();
		return this.parsedBars.filter((bar) => {
			const t = bar.date.getTime();
			return t >= fromTime && t <= toTime;
		});
	}

	async fetchBarsBefore(symbol: string, timeframe: Timeframe, before: Date, limit = 100): Promise<readonly OHLCVBar[]> {
		const beforeTime = before.getTime();
		const filtered = this.parsedBars.filter((bar) => bar.date.getTime() < beforeTime);
		return filtered.slice(-limit);
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
		return [{ symbol: "CSV_DATA", name: "Offline CSV Data" }];
	}
}
