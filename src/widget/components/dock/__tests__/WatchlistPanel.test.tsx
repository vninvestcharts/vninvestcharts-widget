// @vitest-environment jsdom
// P4b regression lock: VN30 fallback, adapter load, click-to-switch, live merge.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { WatchlistPanel } from "../WatchlistPanel";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) act(() => { root?.unmount(); });
	root = null;
	container?.remove();
	container = null;
});

describe("WatchlistPanel", () => {
	it("falls back to the VN30 basket without adapter and marks active", () => {
		act(() => { root?.render(createElement(WatchlistPanel, { symbol: "HPG" })); });
		const rows = container?.querySelectorAll('[role="option"]');
		expect(rows?.length).toBe(30);
		expect(container?.querySelector('[aria-selected="true"]')?.textContent).toContain("HPG");
	});
	it("clicking a row switches symbol", () => {
		const onSymbolChange = vi.fn();
		act(() => { root?.render(createElement(WatchlistPanel, { symbol: "HPG", onSymbolChange })); });
		const first = container?.querySelector('[role="option"]') as HTMLButtonElement | null;
		act(() => { first?.click(); });
		expect(onSymbolChange).toHaveBeenCalledTimes(1);
		expect(onSymbolChange).toHaveBeenCalledWith("VIC");
	});

	it("D3: APG listbox — arrows move focus, Enter selects, roving tabindex", () => {
		const onSymbolChange = vi.fn();
		act(() => { root?.render(createElement(WatchlistPanel, { symbol: "HPG", onSymbolChange })); });
		const listbox = container?.querySelector('[role="listbox"]') as HTMLElement;
		const rows = () => Array.from(container?.querySelectorAll('[role="option"]') ?? []) as HTMLElement[];
		expect(rows()[0]?.getAttribute("tabindex")).toBe("0");
		expect(rows()[1]?.getAttribute("tabindex")).toBe("-1");
		rows()[0]?.focus();
		act(() => {
			listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		});
		expect(document.activeElement).toBe(rows()[1]);
		expect(rows()[1]?.getAttribute("tabindex")).toBe("0");
		act(() => {
			listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(onSymbolChange).toHaveBeenCalledWith(rows()[1]?.getAttribute("data-testid")?.replace("watchlist-row-", ""));
	});

	it("loads adapter data and merges live quote updates", async () => {
		let listener: ((u: { symbol: string; price?: number }) => void) | null = null;
		const adapter = {
			getWatchlist: () => Promise.resolve([{ symbol: "HPG", name: "Hoa Phat", price: 10, changePercent: 1.5, sparkline: [9, 9.5, 10] }]),
			subscribeQuotes: (_symbols: string[], cb: (u: { symbol: string; price?: number }) => void) => {
				listener = cb;
				return () => { listener = null; };
			},
		};
		await act(async () => {
			root?.render(createElement(WatchlistPanel, { symbol: "HPG", adapter }));
		});
		expect(container?.textContent).toContain("Hoa Phat");
		expect(container?.textContent).toContain("+1.50%");
		await act(async () => { listener?.({ symbol: "HPG", price: 11 }); });
		expect(container?.textContent).toContain("11");
	});
});
