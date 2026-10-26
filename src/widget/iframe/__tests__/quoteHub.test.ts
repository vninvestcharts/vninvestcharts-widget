import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createQuoteHub } from "../quoteHub";
import type { WatchlistQuoteUpdate } from "../../types/watchlist";

describe("createQuoteHub (E5)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function makeHub() {
		const emitted: WatchlistQuoteUpdate[][] = [];
		let subscribeCalls = 0;
		let offCalls = 0;
		let push: ((u: WatchlistQuoteUpdate) => void) | null = null;
		const adapter = {
			getWatchlist: () => [],
			subscribeQuotes: (_symbols: string[], cb: (u: WatchlistQuoteUpdate) => void) => {
				subscribeCalls += 1;
				push = cb;
				return () => { offCalls += 1; push = null; };
			},
		};
		const hub = createQuoteHub({
			getAdapter: () => adapter,
			emit: (updates) => { emitted.push(updates); },
		});
		return { hub, emitted, push: () => push, counts: () => ({ subscribeCalls, offCalls }) };
	}

	it("batches rapid updates latest-wins per symbol (≥250ms cadence)", () => {
		const { hub, emitted, push } = makeHub();
		try {
			hub.subscribe(["HPG", "FPT"]);
			push()?.({ symbol: "HPG", price: 10 });
			push()?.({ symbol: "HPG", price: 11 });
			push()?.({ symbol: "FPT", price: 20 });
			expect(emitted).toHaveLength(0);
			vi.runAllTimers();
			expect(emitted).toHaveLength(1);
			expect(emitted[0]).toEqual([
				{ symbol: "HPG", price: 11 },
				{ symbol: "FPT", price: 20 },
			]);
		} finally {
			hub.dispose();
		}
	});

	it("unsubscribe stops flow; empty adapter yields silence", () => {
		const { hub, emitted, push } = makeHub();
		try {
			hub.subscribe(["HPG"]);
			hub.unsubscribe(["HPG"]);
			push()?.({ symbol: "HPG", price: 99 });
			vi.runAllTimers();
			expect(emitted).toHaveLength(0);
			expect(hub.subscriberCount()).toBe(0);
		} finally {
			hub.dispose();
		}
	});

	it("10 subscribe/unsubscribe cycles leave zero dangling subscriptions", () => {
		const { hub, counts } = makeHub();
		try {
			for (let i = 0; i < 10; i++) {
				hub.subscribe(["HPG"]);
				hub.unsubscribe();
			}
			expect(counts().subscribeCalls).toBe(10);
			expect(counts().offCalls).toBe(10);
			expect(hub.subscriberCount()).toBe(0);
		} finally {
			hub.dispose();
		}
	});
});
