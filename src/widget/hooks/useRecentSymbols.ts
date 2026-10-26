/**
 * Recent-symbols storage (SYMBOL_SEARCH P1).
 * Single owner of the `vni_recent_symbols` localStorage key.
 */
import { useCallback, useState } from "react";
import type { SymbolSearchItem } from "../types/symbolSearch";
import { MAX_RECENT, RECENT_SYMBOLS_KEY } from "../constants/symbolSearch";

function readRecentItems(): SymbolSearchItem[] {
	try {
		const raw = localStorage.getItem(RECENT_SYMBOLS_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as SymbolSearchItem[];
	} catch {
		return [];
	}
}

/** Reads recent items once + appends with dedupe (most-recent-first, capped). */
export function useRecentSymbols(): [SymbolSearchItem[], (item: SymbolSearchItem) => void] {
	const [recentItems, setRecentItems] = useState<SymbolSearchItem[]>(() => readRecentItems());
	const saveRecentItem = useCallback((item: SymbolSearchItem) => {
		setRecentItems((prev) => {
			const deduped = [item, ...prev.filter((s) => s.symbol !== item.symbol)].slice(0, MAX_RECENT);
			try {
				localStorage.setItem(RECENT_SYMBOLS_KEY, JSON.stringify(deduped));
			} catch { /* ignore */ }
			return deduped;
		});
	}, []);
	return [recentItems, saveRecentItem];
}
