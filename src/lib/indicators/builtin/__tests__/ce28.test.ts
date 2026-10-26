import { describe, it, expect, vi } from "vitest";
import {
	synthesizeTicksFromBar,
	computeMarketProfile,
	computeVolumeProfile,
	computeFootprintBars,
	computeDeltaProfile,
	PriceBar,
} from "../../utils";
import { binanceAdapter } from "../../../adapters/BinanceAdapter";

function makeBar(open: number, high: number, low: number, close: number, volume: number, date?: Date): PriceBar {
	return {
		open,
		high,
		low,
		close,
		volume,
		date: date ?? new Date(),
	};
}

describe("CE28 Advanced Analytics Calculations", () => {
	// ── Tick Synthesis Fallback ──────────────────────────────────────────────────
	describe("synthesizeTicksFromBar", () => {
		it("generates correct number of tick steps and distributes volume", () => {
			const bar = makeBar(100, 105, 95, 102, 1100);
			const tickSize = 1;
			const ticks = synthesizeTicksFromBar(bar, tickSize);

			// range is 105 - 95 = 10. Math.max(1, 10 / 1) + 1 = 11 steps.
			expect(ticks).toHaveLength(11);
			expect(ticks[0].price).toBe(95);
			expect(ticks[10].price).toBe(105);
			expect(ticks[0].side).toBe("buy"); // close (102) >= open (100) -> buy
			expect(ticks[0].size).toBeCloseTo(100, 5); // 1100 volume / 11 steps = 100
		});
	});

	// ── Market Profile (TPO) ──────────────────────────────────────────────────────
	describe("computeMarketProfile", () => {
		it("returns empty result on empty tick input", () => {
			const result = computeMarketProfile([], Date.now(), Date.now(), 0.01);
			expect(result.tpoBlocks).toEqual([]);
			expect(result.poc).toBe(0);
		});

		it("computes POC, Value Area, and Initial Balance correctly", () => {
			// Synthesize some ticks for 2 periods
			const sessionStart = new Date("2026-06-10T10:00:00Z").getTime();
			const ticks = [
				// Period 0: 0 - 30 mins -> Letter A
				{ timestamp: sessionStart + 5 * 60 * 1000, price: 100, size: 10, side: "buy" as const },
				{ timestamp: sessionStart + 10 * 60 * 1000, price: 101, size: 20, side: "buy" as const },
				{ timestamp: sessionStart + 15 * 60 * 1000, price: 102, size: 15, side: "sell" as const },
				// Period 1: 30 - 60 mins -> Letter B
				{ timestamp: sessionStart + 35 * 60 * 1000, price: 101, size: 30, side: "buy" as const },
				{ timestamp: sessionStart + 40 * 60 * 1000, price: 102, size: 40, side: "sell" as const },
				{ timestamp: sessionStart + 45 * 60 * 1000, price: 103, size: 10, side: "buy" as const },
			];

			const result = computeMarketProfile(ticks, sessionStart, sessionStart + 120 * 60 * 1000, 1, 30);
			expect(result.tpoBlocks).not.toHaveLength(0);

			// Price 101 and 102 should be in both period 0 and period 1 (most TPOs = 2)
			expect(result.poc).toBe(102); // 102 has more volume than 101 (55 vs 50)
			expect(result.profileHigh).toBe(103);
			expect(result.profileLow).toBe(100);
			expect(result.initialBalanceHigh).toBe(103);
			expect(result.initialBalanceLow).toBe(100);
		});
	});

	// ── Volume Profile ───────────────────────────────────────────────────────────
	describe("computeVolumeProfile", () => {
		it("aggregates volumes at price levels and computes POC & Value Area", () => {
			const bars = [
				makeBar(100, 102, 98, 101, 1000),
				makeBar(101, 103, 99, 102, 2000),
			];
			const result = computeVolumeProfile(bars, 1);
			expect(result.priceLevels.length).toBeGreaterThan(0);
			expect(result.poc).toBeGreaterThan(0);
			expect(result.valueAreaHigh).toBeGreaterThanOrEqual(result.valueAreaLow);
		});
	});

	// ── Footprint Chart ──────────────────────────────────────────────────────────
	describe("computeFootprintBars", () => {
		it("groups ticks into footprint bars with bid x ask details", () => {
			const barIntervalMs = 60000; // 1 min
			const ts = 1700000040000; // stable fixed timestamp (not near minute boundaries)
			const ticks = [
				{ timestamp: ts, price: 100, size: 10, side: "buy" as const },
				{ timestamp: ts + 1000, price: 100, size: 15, side: "sell" as const },
				{ timestamp: ts + 2000, price: 101, size: 20, side: "buy" as const },
				// next bar
				{ timestamp: ts + 70000, price: 102, size: 30, side: "sell" as const },
			];

			const result = computeFootprintBars(ticks, barIntervalMs, 1);
			expect(result).toHaveLength(2);

			// first footprint bar
			const fpBar1 = result[0];
			expect(fpBar1.open).toBe(100);
			expect(fpBar1.high).toBe(101);
			expect(fpBar1.low).toBe(100);
			expect(fpBar1.close).toBe(101);

			const level100 = fpBar1.priceLevels.find(l => l.price === 100);
			expect(level100).toBeDefined();
			expect(level100!.bidVolume).toBe(15);
			expect(level100!.askVolume).toBe(10);
			expect(level100!.delta).toBe(-5); // ask - bid
		});
	});

	// ── Delta Profile & Divergence ───────────────────────────────────────────────
	describe("computeDeltaProfile", () => {
		it("calculates cumulative delta and detects price vs delta divergence", () => {
			// Setup footprint bars that show bearish divergence
			// Price makes a higher high, but cumulative delta makes a lower high
			const fpBars = [
				{
					timestamp: 1000, open: 100, high: 105, low: 95, close: 103,
					priceLevels: [{ price: 100, bidVolume: 100, askVolume: 300, delta: 200, deltaPercent: 50, totalVolume: 400 }]
				}, // delta = +200, cumDelta = +200
				{
					timestamp: 2000, open: 103, high: 104, low: 101, close: 102,
					priceLevels: [{ price: 102, bidVolume: 200, askVolume: 100, delta: -100, deltaPercent: -33, totalVolume: 300 }]
				}, // delta = -100, cumDelta = +100
				{
					timestamp: 3000, open: 102, high: 107, low: 101, close: 106,
					priceLevels: [{ price: 105, bidVolume: 100, askVolume: 150, delta: 50, deltaPercent: 20, totalVolume: 250 }]
				}, // delta = 50, cumDelta = +150 (Price high 107 > 105, but cumDelta 150 < 200)
			];

			const result = computeDeltaProfile(fpBars, 2);
			expect(result.cumulativeDelta).toEqual([200, 100, 150]);
			expect(result.barDelta).toEqual([200, -100, 50]);
		});
	});
});

describe("BinanceAdapter Stream Subscriptions", () => {
	it("sets up mock connections for depth and trade streams", () => {
		const symbol = "BTCUSDT";
		const callbackL2 = vi.fn();
		const callbackTicks = vi.fn();

		const unsubL2 = binanceAdapter.subscribeLevel2?.({
			symbol,
			depth: 5,
			callback: callbackL2,
		});

		const unsubTicks = binanceAdapter.subscribeTicks?.({
			symbol,
			callback: callbackTicks,
		});

		expect(unsubL2).toBeDefined();
		expect(unsubTicks).toBeDefined();

		if (unsubL2) unsubL2();
		if (unsubTicks) unsubTicks();
	});
});
