/**
 * ReplayFillSimulator unit tests — F-02: resolveMarketPrice is independent of useSpreadFill and useOHLC.
 */
import { describe, it, expect } from "vitest";
import { ReplayFillSimulator } from "../ReplayFillSimulator";
import type { ReplayOHLCBar, ReplayOrder } from "../replayTradingTypes";

const bar: ReplayOHLCBar = { open: 100, high: 110, low: 95, close: 105, date: 0 };
const baseOrder: Omit<ReplayOrder, "id" | "timestamp"> = {
	type: "market",
	side: "buy",
	quantity: 1,
	symbol: "TEST",
};

describe("ReplayFillSimulator", () => {
	it("market buy fills at high regardless of useSpreadFill", () => {
		const withSpread = new ReplayFillSimulator({ useSpreadFill: true, slippageBps: 0 });
		const noSpread = new ReplayFillSimulator({ useSpreadFill: false, slippageBps: 0 });
		const r1 = withSpread.simulateFill({ ...baseOrder, id: "1", timestamp: 0 } as ReplayOrder, bar, 0);
		const r2 = noSpread.simulateFill({ ...baseOrder, id: "2", timestamp: 0 } as ReplayOrder, bar, 0);
		expect(r1.fillPrice).toBe(110); // bar.high
		expect(r2.fillPrice).toBe(110); // identical — dead branch removed
	});

	it("market sell fills at low regardless of useSpreadFill", () => {
		const withSpread = new ReplayFillSimulator({ useSpreadFill: true, slippageBps: 0 });
		const noSpread = new ReplayFillSimulator({ useSpreadFill: false, slippageBps: 0 });
		const r1 = withSpread.simulateFill({ ...baseOrder, id: "1", timestamp: 0, side: "sell" } as ReplayOrder, bar, 0);
		const r2 = noSpread.simulateFill({ ...baseOrder, id: "2", timestamp: 0, side: "sell" } as ReplayOrder, bar, 0);
		expect(r1.fillPrice).toBe(95); // bar.low
		expect(r2.fillPrice).toBe(95); // identical
	});

	it("useOHLC still changes limit/stop trigger (not affected by F-02)", () => {
		const withOHLC = new ReplayFillSimulator({ useOHLC: true, slippageBps: 0 });
		const noOHLC = new ReplayFillSimulator({ useOHLC: false, slippageBps: 0 });
		// Limit buy at 98: useOHLC triggers (bar.low=95 <= 98), noOHLC doesn't (bar.close=105 > 98)
		const limitOrder1 = { ...baseOrder, id: "1", timestamp: 0, type: "limit" as const, price: 98 } as ReplayOrder;
		const limitOrder2 = { ...baseOrder, id: "2", timestamp: 0, type: "limit" as const, price: 98 } as ReplayOrder;
		const r1 = withOHLC.simulateFill(limitOrder1, bar, 0);
		const r2 = noOHLC.simulateFill(limitOrder2, bar, 0);
		expect(r1.filled).toBe(true);
		expect(r2.filled).toBe(false);
	});

	it("fillOnNextBar: checkTrigger detects limit buy on trigger bar", () => {
		const sim = new ReplayFillSimulator({ fillOnNextBar: true, slippageBps: 0 });
		const limitOrder = { ...baseOrder, id: "1", timestamp: 0, type: "limit" as const, price: 98 } as ReplayOrder;
		expect(sim.checkTrigger(limitOrder, bar)).toBe(true);
	});

	it("fillOnNextBar: resolveFillFromNextBar fills at next bar open", () => {
		const sim = new ReplayFillSimulator({ fillOnNextBar: true, slippageBps: 0 });
		const nextBar: ReplayOHLCBar = { open: 102, high: 108, low: 100, close: 106, date: 1 };
		const order = { ...baseOrder, id: "1", timestamp: 0 } as ReplayOrder;
		const result = sim.resolveFillFromNextBar(order, nextBar, 0);
		expect(result.filled).toBe(true);
		expect(result.fillPrice).toBe(102); // nextBar.open
	});

	it("fillOnNextBar: resolveFillFromNextBar falls back to close if open is 0", () => {
		const sim = new ReplayFillSimulator({ fillOnNextBar: true, slippageBps: 0 });
		const nextBar: ReplayOHLCBar = { open: 0, high: 108, low: 100, close: 106, date: 1 };
		const order = { ...baseOrder, id: "1", timestamp: 0 } as ReplayOrder;
		const result = sim.resolveFillFromNextBar(order, nextBar, 0);
		expect(result.filled).toBe(true);
		expect(result.fillPrice).toBe(106); // nextBar.close fallback
	});
});
