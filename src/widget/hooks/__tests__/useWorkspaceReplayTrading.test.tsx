import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWorkspaceReplayTrading } from "../useWorkspaceReplayTrading";
import type { ReplayOHLCBar } from "../../../lib/core/replay/replayTradingTypes";

function bar(o: number, h: number, l: number, c: number, date: number): ReplayOHLCBar {
	return { open: o, high: h, low: l, close: c, date };
}

const BARS: ReplayOHLCBar[] = [
	bar(100, 100, 100, 100, 0),
	bar(101, 105, 100, 104, 1),
	bar(104, 108, 103, 107, 2),
	bar(107, 110, 106, 109, 3),
];

function mountClaimed() {
	const hook = renderHook(() => useWorkspaceReplayTrading({ slippageBps: 0 }));
	act(() => {
		hook.result.current.claimSessionOwner("chart-1");
	});
	return hook;
}

describe("useWorkspaceReplayTrading A6 owner + one book", () => {
	it("starts idle, claims synchronously, and clear resets the shared book", () => {
		const { result } = renderHook(() => useWorkspaceReplayTrading({ slippageBps: 0 }));

		expect(result.current.isReplayActive).toBe(false);
		expect(result.current.sessionOwnerId).toBeNull();

		act(() => {
			result.current.claimSessionOwner("chart-1");
			result.current.placeOrder({ type: "market", side: "buy", quantity: 10, symbol: "AAA" });
			result.current.feedBar(BARS[1], 1, 1000, "AAA", BARS);
		});
		expect(result.current.isReplayActive).toBe(true);
		expect(result.current.sessionOwnerId).toBe("chart-1");
		expect(result.current.positions.length).toBeGreaterThan(0);

		act(() => {
			result.current.clearSessionOwner();
		});
		expect(result.current.isReplayActive).toBe(false);
		expect(result.current.sessionOwnerId).toBeNull();
		expect(result.current.positions).toHaveLength(0);
	});

	it("feeds the shared MarketDataPort for the active symbol", () => {
		const { result } = mountClaimed();

		act(() => {
			result.current.feedBar(BARS[1], 1, 1000, "AAA", BARS);
		});
		expect(result.current.port.getLatestQuote("AAA")?.lastPrice).toBe(104);
	});

	it("keeps FPT positions and only feeds the current bar for a newly seen VNM symbol", () => {
		const { result } = mountClaimed();

		act(() => {
			result.current.placeOrder({ type: "market", side: "buy", quantity: 10, symbol: "FPT" });
			result.current.feedBar(BARS[1], 1, 1000, "FPT", BARS);
		});
		expect(result.current.positions).toHaveLength(1);

		const onBar = vi.spyOn(result.current.broker, "onBar");
		act(() => {
			result.current.placeOrder({ type: "market", side: "buy", quantity: 10, symbol: "VNM" });
			result.current.feedBar(BARS[3], 3, 3000, "VNM", BARS);
		});

		expect(result.current.positions).toHaveLength(2);
		expect(onBar).toHaveBeenCalledTimes(1);
		expect(onBar.mock.calls[0]?.[1]?.date).toBe(3);
		onBar.mockRestore();
	});

	it("clears per-symbol cursors on reset so Rewind only feeds bar 0", () => {
		const { result } = mountClaimed();

		act(() => {
			result.current.feedBar(BARS[1], 1, 1000, "AAA", BARS);
		});
		const onBar = vi.spyOn(result.current.broker, "onBar");
		act(() => {
			result.current.feedBar(BARS[3], 3, 3000, "AAA", BARS);
		});
		expect(onBar).toHaveBeenCalledTimes(2);

		onBar.mockClear();
		act(() => {
			result.current.reset();
			result.current.feedBar(BARS[0], 0, 0, "AAA", BARS);
		});
		expect(onBar).toHaveBeenCalledTimes(1);
		expect(onBar.mock.calls[0]?.[1]?.date).toBe(0);
		onBar.mockRestore();
	});
});

describe("useWorkspaceReplayTrading F-11 resetForNewMaster", () => {
	it("clears positions + closedTrades when master changes", () => {
		const { result } = mountClaimed();

		act(() => {
			result.current.placeOrder({ type: "market", side: "buy", quantity: 10, symbol: "AAA" });
			result.current.feedBar(BARS[1], 1, 1000, "AAA", BARS);
		});
		expect(result.current.positions.length).toBeGreaterThan(0);

		act(() => {
			result.current.resetForNewMaster("chart-B");
		});
		expect(result.current.positions).toHaveLength(0);
		expect(result.current.closedTrades).toHaveLength(0);
		expect(result.current.totalPnl).toBe(0);
	});

	it("resetForNewMaster allows same-symbol feed to start fresh", () => {
		const { result } = mountClaimed();

		act(() => {
			result.current.placeOrder({ type: "market", side: "buy", quantity: 10, symbol: "AAA" });
			result.current.feedBar(BARS[1], 1, 1000, "AAA", BARS);
		});
		expect(result.current.positions.length).toBeGreaterThan(0);

		act(() => {
			result.current.resetForNewMaster("chart-B");
		});
		expect(result.current.positions).toHaveLength(0);
	});
});
