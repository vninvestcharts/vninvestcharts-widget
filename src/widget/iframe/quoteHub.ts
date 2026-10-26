import type { WatchlistAdapter, WatchlistQuoteUpdate } from "../types/watchlist";

/**
 * E5: in-iframe quote fan-out hub.
 *
 * Host subscribes once per symbol set (`request:subscribeQuotes`); the hub
 * taps the current watchlist adapter's `subscribeQuotes` (when it supports
 * streaming) and re-emits latest-wins batches (`event:quotes`, ≥250ms).
 * Static adapters yield zero updates until a streaming VN adapter lands
 * (credentials-blocked — see ledger E5).
 */
export interface QuoteHub {
	subscribe(symbols: readonly string[]): void;
	unsubscribe(symbols?: readonly string[]): void;
	subscriberCount(): number;
	dispose(): void;
}

const FLUSH_MS = 250;

export function createQuoteHub(source: {
	getAdapter: () => WatchlistAdapter | null | undefined;
	emit: (updates: WatchlistQuoteUpdate[]) => void;
}): QuoteHub {
	let wanted = new Set<string>();
	let off: (() => void) | void = undefined;
	let pending = new Map<string, WatchlistQuoteUpdate>();
	let timer: ReturnType<typeof setTimeout> | null = null;
	let disposed = false;

	const flush = () => {
		timer = null;
		if (pending.size === 0 || disposed) return;
		const batch = [...pending.values()];
		pending = new Map();
		source.emit(batch);
	};

	const schedule = () => {
		if (timer || disposed) return;
		timer = setTimeout(flush, FLUSH_MS);
	};

	const resubscribe = () => {
		if (typeof off === "function") {
			try { off(); } catch { /* ignore */ }
			off = undefined;
		}
		if (disposed || wanted.size === 0) return;
		const adapter = source.getAdapter();
		if (!adapter?.subscribeQuotes) return;
		const symbols = [...wanted];
		off = adapter.subscribeQuotes(symbols, (update) => {
			if (!update || typeof update.symbol !== "string") return;
			if (!wanted.has(update.symbol.toUpperCase()) && !wanted.has(update.symbol)) return;
			pending.set(update.symbol, update);
			schedule();
		});
	};

	return {
		subscribe(symbols: readonly string[]): void {
			if (disposed) return;
			for (const s of symbols) {
				if (typeof s === "string" && s.trim() !== "") wanted.add(s.trim().toUpperCase());
			}
			resubscribe();
		},
		unsubscribe(symbols?: readonly string[]): void {
			if (!symbols) {
				wanted = new Set();
			} else {
				for (const s of symbols) {
					wanted.delete(s.toUpperCase());
					wanted.delete(s);
				}
			}
			resubscribe();
		},
		subscriberCount(): number {
			return wanted.size;
		},
		dispose(): void {
			disposed = true;
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			pending = new Map();
			if (typeof off === "function") {
				try { off(); } catch { /* ignore */ }
				off = undefined;
			}
			wanted = new Set();
		},
	};
}
