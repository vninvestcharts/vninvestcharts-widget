// @vitest-environment jsdom
/**
 * Phase 5 Slice 5.1: useReplayTrading hook contract tests.
 * Drives placeOrder → processBar → position → closePosition → journal
 * và batched F6 queue (3 candle advance nhanh).
 */
import { act, renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useReplayTrading } from "../useReplayTrading";
import type { ReplayOHLCBar } from "../../../lib/core/replay/replayTradingTypes";

function bar(close: number, date: number): ReplayOHLCBar {
	return { open: close, high: close, low: close, close, date };
}

describe("useReplayTrading", () => {
	it("placeOrder → processBar → opens position", () => {
		const { result, rerender } = renderHook(
			({ currentBar }: { currentBar: number }) =>
				useReplayTrading({ currentBar, bars: [bar(100, 0), bar(110, 1)], enabled: true }),
			{ initialProps: { currentBar: 0 } },
		);
		act(() => {
			result.current.placeOrder({ type: "market", side: "buy", quantity: 2, symbol: "X" });
		});
		// Advance cursor to bar 1 → effect processes bar 1 (fill at high=110).
		act(() => {
			rerender({ currentBar: 1 });
		});
		expect(result.current.positions.length).toBe(1);
		expect(result.current.positions[0].side).toBe("long");
		expect(result.current.positions[0].quantity).toBe(2);
	});

	it("batched F6: 3 candle advance nhanh → fill tại bar đầu, không miss", () => {
		const bars = [bar(100, 0), bar(105, 1), bar(110, 2), bar(120, 3)];
		const { result, rerender } = renderHook(
			({ currentBar }: { currentBar: number }) =>
				useReplayTrading({ currentBar, bars, enabled: true, slippageBps: 0 }),
			{ initialProps: { currentBar: 0 } },
		);
		act(() => {
			result.current.placeOrder({ type: "market", side: "buy", quantity: 1, symbol: "X" });
		});
		// Jump từ bar 0 → bar 3 (tua nhanh). Queue phải process bar 1,2,3.
		act(() => {
			rerender({ currentBar: 3 });
		});
		// Position phải mở (fill tại bar 1, giá 105).
		expect(result.current.positions.length).toBe(1);
		expect(result.current.positions[0].entryPrice).toBe(105);
	});

	it("closePosition → journal entry + PnL", () => {
		// bar0 (seed), bar1.high=105 (fill entry), bar2.close=120 (exit price).
		const bars = [bar(100, 0), bar(105, 1), bar(120, 2)];
		const { result, rerender } = renderHook(
			({ currentBar }: { currentBar: number }) =>
				useReplayTrading({ currentBar, bars, enabled: true, slippageBps: 0 }),
			{ initialProps: { currentBar: 0 } },
		);
		act(() => {
			result.current.placeOrder({ type: "market", side: "buy", quantity: 2, symbol: "X" });
		});
		// currentBar 0 đã bị skip (prevBar khởi = 0). Advance → 1 để fill, → 2 để cập nhật giá.
		act(() => {
			rerender({ currentBar: 1 });
		});
		expect(result.current.positions.length).toBe(1);
		act(() => {
			rerender({ currentBar: 2 });
		});
		act(() => {
			result.current.closePosition(result.current.positions[0].id);
		});
		expect(result.current.positions.length).toBe(0);
		expect(result.current.closedTrades.length).toBe(1);
		expect(result.current.closedTrades[0].pnl).toBe(30); // (120-105)*2
		expect(result.current.totalPnl).toBe(30);
	});

	it("placeOrder works while paused (enabled=false) — F-07", () => {
		const bars = [bar(100, 0), bar(110, 1)];
		const { result, rerender } = renderHook(
			({ currentBar, enabled }: { currentBar: number; enabled: boolean }) =>
				useReplayTrading({ currentBar, bars, enabled, slippageBps: 0 }),
			{ initialProps: { currentBar: 0, enabled: false } },
		);
		// Place order while paused (enabled=false)
		act(() => {
			result.current.placeOrder({ type: "market", side: "buy", quantity: 1, symbol: "X" });
		});
		// Order accepted (pending in order book, not yet filled)
		expect(result.current.orderCount).toBe(1);
		// Resume: enabled=true + advance bar → processBar fills the pending order
		act(() => {
			rerender({ currentBar: 1, enabled: true });
		});
		expect(result.current.positions.length).toBe(1);
		expect(result.current.positions[0].side).toBe("long");
	});
});
