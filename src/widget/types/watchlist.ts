/**
 * P4b: WatchlistAdapter contract (F1 approved).
 *
 * Host apps provide an adapter for live quotes; without one the widget
 * falls back to the static VN30 basket (symbols only, no prices).
 * Mirrors the StockDataAdapter pattern used by VNSymbolSearch.
 */
export interface WatchlistItem {
	symbol: string;
	name?: string;
	price?: number;
	change?: number;
	changePercent?: number;
	sparkline?: number[];
}

export interface WatchlistQuoteUpdate {
	symbol: string;
	price?: number;
	change?: number;
	changePercent?: number;
	sparkline?: number[];
}

export interface WatchlistAdapter {
	getWatchlist: () => Promise<WatchlistItem[]> | WatchlistItem[];
	subscribeQuotes?: (
		symbols: string[],
		onUpdate: (update: WatchlistQuoteUpdate) => void,
	) => (() => void) | void;
}
