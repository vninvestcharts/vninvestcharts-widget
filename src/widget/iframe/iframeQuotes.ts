import type { Timeframe } from "../../lib/types/adapter";
import type { OHLCVBar } from "../../lib/types/ohlcv";
import type { WatchlistAdapter, WatchlistQuoteUpdate } from "../types/watchlist";
import { createQuoteHub, type QuoteHub } from "./quoteHub";

/** Minimal structural surface needed for bar→quotes (avoids adapter-type coupling). */
export interface BarStreamSource {
	subscribeToBar: (
		symbol: string,
		timeframe: Timeframe,
		onBar: (bar: OHLCVBar) => void,
	) => () => void;
}

/**
 * E5 (split from iframeEntry): quote-hub wiring.
 * Source priority: explicit watchlist adapter with subscribeQuotes, else
 * last-price quotes derived from the bar adapter's live WS.
 */
export function createQuotesController(emit: (updates: WatchlistQuoteUpdate[]) => void): {
	setWatchlistAdapter: (adapter: WatchlistAdapter | null) => void;
	setBarAdapter: (adapter: BarStreamSource | null, timeframe: Timeframe | undefined) => void;
	getHub: () => QuoteHub;
	reset: () => void;
} {
	let watchlistAdapter: WatchlistAdapter | null = null;
	let barAdapter: BarStreamSource | null = null;
	let barTimeframe: Timeframe | undefined;
	let barQuotesAdapter: WatchlistAdapter | null = null;
	let hub: QuoteHub | null = null;

	function barAdapterAsQuotes(): WatchlistAdapter | null {
		const bar = barAdapter;
		const timeframe = barTimeframe;
		if (!bar || typeof bar.subscribeToBar !== "function" || !timeframe) return null;
		return {
			getWatchlist: () => [],
			subscribeQuotes: (symbols: string[], onUpdate: (u: { symbol: string; price?: number }) => void) => {
				const offs = symbols.map((sym) => {
					try {
						return bar.subscribeToBar(sym, timeframe, (b) => {
							if (b && Number.isFinite(b.close)) onUpdate({ symbol: sym, price: b.close });
						});
					} catch {
						return () => {};
					}
				});
				return () => {
					for (const off of offs) {
						try { off(); } catch { /* ignore */ }
					}
				};
			},
		};
	}

	function getHub(): QuoteHub {
		if (!hub) {
			hub = createQuoteHub({
				getAdapter: () => {
					if (watchlistAdapter?.subscribeQuotes) return watchlistAdapter;
					if (!barQuotesAdapter) barQuotesAdapter = barAdapterAsQuotes();
					return barQuotesAdapter;
				},
				emit,
			});
		}
		return hub;
	}

	return {
		setWatchlistAdapter: (adapter: WatchlistAdapter | null) => {
			watchlistAdapter = adapter;
		},
		setBarAdapter: (adapter: BarStreamSource | null, timeframe: Timeframe | undefined) => {
			barAdapter = adapter;
			barTimeframe = timeframe;
			barQuotesAdapter = null;
		},
		getHub,
		reset: () => {
			watchlistAdapter = null;
			barAdapter = null;
			barTimeframe = undefined;
			barQuotesAdapter = null;
			hub?.dispose();
			hub = null;
		},
	};
}

export type QuotesController = ReturnType<typeof createQuotesController>;
