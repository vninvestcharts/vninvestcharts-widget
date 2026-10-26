import { useEffect, useRef, useState } from "react";
import { VNInvestWebSocketClient, type TickerUpdateEvent } from "./VNInvestWebSocketClient";

export interface UseWatchlistRealtimeSyncOptions {
	/** Instance of the VNInvest WebSocket client. */
	wsClient: VNInvestWebSocketClient | null;
	/** Array of symbols to subscribe to in the watchlist/heatmap. */
	symbols: string[];
	/** Optional callback triggered on each state flush with the accumulated updates. */
	onUpdate?: (updatedData: Map<string, TickerUpdateEvent>) => void;
	/** Throttle duration in milliseconds. Defaults to 500ms. */
	throttleMs?: number;
}

/**
 * Hook to synchronize a list of symbols in real-time using VNInvestWebSocketClient.
 * Uses throttled state updates to ensure smooth rendering of large watchlists/heatmaps.
 */
export function useWatchlistRealtimeSync({
	wsClient,
	symbols,
	onUpdate,
	throttleMs = 500,
}: UseWatchlistRealtimeSyncOptions) {
	const [tickerData, setTickerData] = useState<Map<string, TickerUpdateEvent>>(new Map());
	const bufferRef = useRef<Map<string, TickerUpdateEvent>>(new Map());
	const onUpdateRef = useRef(onUpdate);
	onUpdateRef.current = onUpdate;

	// Keep track of active subscriptions to avoid double subscriptions
	const subscribedSymbolsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!wsClient || symbols.length === 0) return;

		const ws = wsClient;
		const uppercaseSymbols = symbols.map(s => s.trim().toUpperCase()).filter(Boolean);

		// Subscribe to the symbols
		ws.subscribe(uppercaseSymbols);
		for (const sym of uppercaseSymbols) {
			subscribedSymbolsRef.current.add(sym);
		}

		// Handle incoming ticker updates
		const handleTickerUpdate = (event: TickerUpdateEvent) => {
			const sym = event.symbol.toUpperCase();
			if (subscribedSymbolsRef.current.has(sym)) {
				bufferRef.current.set(sym, event);
			}
		};

		ws.setOnTickerUpdate(handleTickerUpdate);

		// Setup throttling interval to flush buffer to state
		const intervalId = setInterval(() => {
			if (bufferRef.current.size === 0) return;

			setTickerData((prev) => {
				const next = new Map(prev);
				bufferRef.current.forEach((value, key) => {
					next.set(key, value);
				});
				onUpdateRef.current?.(next);
				return next;
			});

			bufferRef.current.clear();
		}, throttleMs);

		return () => {
			clearInterval(intervalId);
			// Unsubscribe from all symbols we registered
			const activeSymbols = Array.from(subscribedSymbolsRef.current);
			if (activeSymbols.length > 0) {
				ws.unsubscribe(activeSymbols);
			}
			subscribedSymbolsRef.current.clear();
			bufferRef.current.clear();
		};
	}, [wsClient, symbols, throttleMs]);

	return tickerData;
}
