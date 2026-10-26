/**
 * Unified symbol search logic (SYMBOL_SEARCH P1).
 * Single owner of query/results state, adapter/client fan-out and the
 * futures/crypto merge. Components only render.
 */
import { useCallback, useState } from "react";
import type { StockDataAdapter } from "../../lib/types/adapter";
import type { VNInvestClient } from "../adapters/VNInvestClient";
import type { SymbolSearchItem } from "../types/symbolSearch";
import { CRYPTO_SYMBOLS, FUTURES_SYMBOLS, type ExchangeFilter } from "../constants/symbolSearch";

export interface UseSymbolSearchOptions {
	adapter?: StockDataAdapter;
	client?: VNInvestClient;
	exchangeFilter: ExchangeFilter;
	/** Symbols to exclude from results (compare mode: already-compared). */
	compareExisting?: string[];
}

export interface UseSymbolSearchResult {
	query: string;
	setQuery: (q: string) => void;
	results: SymbolSearchItem[];
	loading: boolean;
	highlightIndex: number;
	setHighlightIndex: (n: number) => void;
	/**
	 * Runs one search pass. Resolves with the combined result count,
	 * or null when the query is empty (no-op — caller keeps dropdown state).
	 */
	search: (q: string, exFilter?: ExchangeFilter) => Promise<number | null>;
}

/**
 * Facade (D-S08): single search entry — legacy client first, adapter fallback.
 * The component never branches on client vs adapter itself.
 */
export function useStockSearchAdapter(adapter?: StockDataAdapter, client?: VNInvestClient) {
	return useCallback(async (q: string, exchange?: string): Promise<SymbolSearchItem[]> => {
		if (client) {
			// Legacy path: direct VNInvestClient
			const stocks = await client.getStocks(q, exchange);
			return stocks.map((s) => ({ symbol: s.symbol, company_name: s.company_name, exchange: s.exchange }));
		}
		if (adapter) {
			// New path: StockDataAdapter
			const symbols = await adapter.searchSymbols(q);
			return symbols
				.filter((s) => !exchange || s.exchange?.toUpperCase() === exchange)
				.map((s) => ({ symbol: s.symbol, company_name: s.name ?? "", exchange: s.exchange ?? "" }));
		}
		return [];
	}, [adapter, client]);
}

export function useSymbolSearch(opts: UseSymbolSearchOptions): UseSymbolSearchResult {
	const { adapter, client, exchangeFilter, compareExisting } = opts;
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SymbolSearchItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [highlightIndex, setHighlightIndex] = useState(0);
	const searchStocks = useStockSearchAdapter(adapter, client);

	const search = useCallback(async (q: string, exFilter: ExchangeFilter = exchangeFilter): Promise<number | null> => {
		if (!q) { setResults([]); setLoading(false); return null; }
		setLoading(true);
		try {
			const exchange = exFilter !== "ALL" ? exFilter : undefined;
			const mapped = await searchStocks(q, exchange);
			const upperQ = q.toUpperCase();
			const matchingFutures = FUTURES_SYMBOLS.filter(
				(f) =>
					(!exchange || f.exchange === exchange) &&
					(f.symbol.includes(upperQ) || f.company_name.toUpperCase().includes(upperQ))
			);
			const matchingCrypto = CRYPTO_SYMBOLS.filter(
				(c) => c.symbol.includes(upperQ) || c.company_name.toUpperCase().includes(upperQ)
			);
			let combined = [
				...matchingFutures,
				...matchingCrypto.filter((c) => !matchingFutures.some((f) => f.symbol === c.symbol)),
				...mapped.filter((m) => !matchingFutures.some((f) => f.symbol === m.symbol) && !matchingCrypto.some((c) => c.symbol === m.symbol)),
			];
			if (compareExisting && compareExisting.length > 0) {
				combined = combined.filter((r) => !compareExisting.includes(r.symbol));
			}
			setResults(combined);
			setHighlightIndex(0);
			setLoading(false);
			return combined.length;
		} catch {
			setResults([]);
			setLoading(false);
			return 0;
		}
	}, [exchangeFilter, compareExisting, searchStocks]);

	return { query, setQuery, results, loading, highlightIndex, setHighlightIndex, search };
}
