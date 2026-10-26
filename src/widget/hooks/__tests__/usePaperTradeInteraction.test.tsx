// @vitest-environment jsdom
/**
 * Phase 5 Slice 5.2: usePaperTradeInteraction contract test.
 * Verify click → placeOrder / closePosition mapping (H1 Option A):
 * - Alt+click → seek (gọi handleReplayStartBarSelect), KHÔNG placeOrder.
 * - click (cursor tool, replay active) với không vị thế → placeOrder (long).
 * - Shift+click → placeOrder side "sell".
 * - click khi đã có vị thế → closePosition.
 * - click khi replay chưa active → baseOnClick fallback, KHÔNG placeOrder.
 * - H4: sizingMode="percent" computes quantity from equity + risk% + currentItem.close
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePaperTradeInteraction } from "../usePaperTradeInteraction";

function makeReplayTrading() {
	const positions: any[] = [];
	let nextId = 1;
	return {
		positions,
		placeOrder: vi.fn((o: any) => positions.push({ id: `pos-${nextId++}`, ...o })),
		closePosition: vi.fn((id: string) => {
			const idx = positions.findIndex((p) => p.id === id);
			if (idx >= 0) positions.splice(idx, 1);
		}),
	};
}

describe("usePaperTradeInteraction", () => {
	it("Alt+click → seek, không placeOrder", () => {
		const rt = makeReplayTrading();
		const seek = vi.fn();
		const base = vi.fn();
		const { result } = renderHook(() =>
			usePaperTradeInteraction({
				replayTrading: rt,
				replayActive: true,
				baseOnClick: base,
				handleReplayStartBarSelect: seek,
				resolveActiveTool: () => "cursor",
			}),
		);
		act(() => {
			result.current.wrappedOnClick({ currentItem: { date: 123 } }, { altKey: true, shiftKey: false });
		});
		expect(seek).toHaveBeenCalledWith(123);
		expect(rt.placeOrder).not.toHaveBeenCalled();
		expect(base).not.toHaveBeenCalled();
	});

	it("click replay active, không vị thế → placeOrder long", () => {
		const rt = makeReplayTrading();
		const { result } = renderHook(() =>
			usePaperTradeInteraction({
				replayTrading: rt,
				replayActive: true,
				resolveActiveTool: () => "cursor",
				defaultQty: 1,
				symbol: "BTC",
				feeRate: 0,
			}),
		);
		act(() => {
			result.current.wrappedOnClick({ currentItem: { date: 123 } }, { altKey: false, shiftKey: false });
		});
		expect(rt.placeOrder).toHaveBeenCalledTimes(1);
		expect(rt.placeOrder.mock.calls[0][0].side).toBe("buy");
		expect(rt.placeOrder.mock.calls[0][0].symbol).toBe("BTC");
	});

	it("Shift+click → placeOrder sell", () => {
		const rt = makeReplayTrading();
		const { result } = renderHook(() =>
			usePaperTradeInteraction({
				replayTrading: rt,
				replayActive: true,
				resolveActiveTool: () => "cursor",
				defaultQty: 1,
			}),
		);
		act(() => {
			result.current.wrappedOnClick({ currentItem: { date: 123 } }, { altKey: false, shiftKey: true });
		});
		expect(rt.placeOrder.mock.calls[0][0].side).toBe("sell");
	});

	it("click khi đã có vị thế → closePosition", () => {
		const rt = makeReplayTrading();
		rt.positions.push({ id: "pos-1", side: "long", quantity: 1 });
		const { result } = renderHook(() =>
			usePaperTradeInteraction({
				replayTrading: rt,
				replayActive: true,
				resolveActiveTool: () => "cursor",
				defaultQty: 1,
			}),
		);
		act(() => {
			result.current.wrappedOnClick({ currentItem: { date: 123 } }, { altKey: false, shiftKey: false });
		});
		expect(rt.closePosition).toHaveBeenCalledWith("pos-1");
		expect(rt.placeOrder).not.toHaveBeenCalled();
	});

	it("Alt+click khi replayActive=false NHƯNG replaySelectionEnabled=true (sau Stop) → vẫn seek start bar", () => {
		const rt = makeReplayTrading();
		const seek = vi.fn();
		const base = vi.fn();
		const { result } = renderHook(() =>
			usePaperTradeInteraction({
				replayTrading: rt,
				replayActive: false,
				replaySelectionEnabled: true,
				baseOnClick: base,
				handleReplayStartBarSelect: seek,
				resolveActiveTool: () => "cursor",
			}),
		);
		act(() => {
			result.current.wrappedOnClick({ currentItem: { date: 456 } }, { altKey: true, shiftKey: false });
		});
		expect(seek).toHaveBeenCalledWith(456);
		expect(rt.placeOrder).not.toHaveBeenCalled();
		expect(base).not.toHaveBeenCalled();
	});

	it("click thường khi replayActive=false và replaySelectionEnabled=true → baseOnClick (không placeOrder replay)", () => {
		const rt = makeReplayTrading();
		const seek = vi.fn();
		const base = vi.fn();
		const { result } = renderHook(() =>
			usePaperTradeInteraction({
				replayTrading: rt,
				replayActive: false,
				replaySelectionEnabled: true,
				baseOnClick: base,
				handleReplayStartBarSelect: seek,
				resolveActiveTool: () => "cursor",
			}),
		);
		act(() => {
			result.current.wrappedOnClick({ currentItem: { date: 456 } }, { altKey: false, shiftKey: false });
		});
		expect(seek).not.toHaveBeenCalled();
		expect(rt.placeOrder).not.toHaveBeenCalled();
		expect(base).toHaveBeenCalled();
	});

	it("click khi replay chưa active → baseOnClick, không placeOrder", () => {
		const rt = makeReplayTrading();
		const base = vi.fn();
		const { result } = renderHook(() =>
			usePaperTradeInteraction({
				replayTrading: rt,
				replayActive: false,
				baseOnClick: base,
				resolveActiveTool: () => "cursor",
			}),
		);
		act(() => {
			result.current.wrappedOnClick({ currentItem: { date: 123 } }, { altKey: false, shiftKey: false });
		});
		expect(base).toHaveBeenCalled();
		expect(rt.placeOrder).not.toHaveBeenCalled();
	});

	it("click khi đang dùng drawing tool → baseOnClick, không placeOrder", () => {
		const rt = makeReplayTrading();
		const base = vi.fn();
		const { result } = renderHook(() =>
			usePaperTradeInteraction({
				replayTrading: rt,
				replayActive: true,
				baseOnClick: base,
				resolveActiveTool: () => "trendline",
			}),
		);
		act(() => {
			result.current.wrappedOnClick({ currentItem: { date: 123 } }, { altKey: false, shiftKey: false });
		});
		expect(base).toHaveBeenCalled();
		expect(rt.placeOrder).not.toHaveBeenCalled();
	});

	describe("H4: sizingMode percent", () => {
		it("sizingMode='percent' computes quantity from equity*risk%/price", () => {
			const rt = makeReplayTrading();
			const { result } = renderHook(() =>
				usePaperTradeInteraction({
					replayTrading: rt,
					replayActive: true,
					resolveActiveTool: () => "cursor",
					defaultQty: 1,
					sizingMode: "percent",
					riskPercent: 2,
					initialEquity: 10000,
				}),
			);
			// currentItem.close = 100 → risk = 10000*2% = 200 → qty = floor(200/100) = 2
			act(() => {
				result.current.wrappedOnClick({ currentItem: { date: 123, close: 100 } }, { altKey: false, shiftKey: false });
			});
			expect(rt.placeOrder).toHaveBeenCalledTimes(1);
			expect(rt.placeOrder.mock.calls[0][0].quantity).toBe(2);
		});

		it("sizingMode='percent' falls back to defaultQty when currentItem.close <= 0", () => {
			const rt = makeReplayTrading();
			const { result } = renderHook(() =>
				usePaperTradeInteraction({
					replayTrading: rt,
					replayActive: true,
					resolveActiveTool: () => "cursor",
					defaultQty: 5,
					sizingMode: "percent",
					riskPercent: 2,
					initialEquity: 10000,
				}),
			);
			act(() => {
				result.current.wrappedOnClick({ currentItem: { date: 123, close: 0 } }, { altKey: false, shiftKey: false });
			});
			expect(rt.placeOrder).toHaveBeenCalledTimes(1);
			expect(rt.placeOrder.mock.calls[0][0].quantity).toBe(5);
		});

		it("sizingMode='fixed' uses defaultQty regardless of equity", () => {
			const rt = makeReplayTrading();
			const { result } = renderHook(() =>
				usePaperTradeInteraction({
					replayTrading: rt,
					replayActive: true,
					resolveActiveTool: () => "cursor",
					defaultQty: 3,
					sizingMode: "fixed",
					riskPercent: 10, // ignored
					initialEquity: 10000, // ignored
				}),
			);
			act(() => {
				result.current.wrappedOnClick({ currentItem: { date: 123, close: 100 } }, { altKey: false, shiftKey: false });
			});
			expect(rt.placeOrder).toHaveBeenCalledTimes(1);
			expect(rt.placeOrder.mock.calls[0][0].quantity).toBe(3);
		});
	});

	describe("R2.1 CutMode (plain click selects start bar, no Alt)", () => {
		function setupCutMode(overrides: Record<string, unknown> = {}) {
			const rt = makeReplayTrading();
			const seek = vi.fn();
			const base = vi.fn();
			const { result } = renderHook(() =>
				usePaperTradeInteraction({
					replayTrading: rt,
					replayActive: true,
					replaySelectionEnabled: true,
					isCutMode: true,
					baseOnClick: base,
					handleReplayStartBarSelect: seek,
					resolveActiveTool: () => "cursor",
					defaultQty: 1,
					...overrides,
				} as never),
			);
			return { rt, seek, base, result };
		}

		it("plain click in CutMode → seek, no order, no baseOnClick", () => {
			const { rt, seek, base, result } = setupCutMode();
			act(() => {
				result.current.wrappedOnClick({ currentItem: { date: 123 } }, { altKey: false, shiftKey: false });
			});
			expect(seek).toHaveBeenCalledWith(123);
			expect(rt.placeOrder).not.toHaveBeenCalled();
			expect(base).not.toHaveBeenCalled();
		});

		it("Shift+click in CutMode → seek, not a sell order", () => {
			const { rt, seek, result } = setupCutMode();
			act(() => {
				result.current.wrappedOnClick({ currentItem: { date: 123 } }, { altKey: false, shiftKey: true });
			});
			expect(seek).toHaveBeenCalledWith(123);
			expect(rt.placeOrder).not.toHaveBeenCalled();
		});

		it("click with open position in CutMode → seek, does NOT close", () => {
			const { rt, seek, result } = setupCutMode();
			rt.positions.push({ id: "pos-1", side: "long", quantity: 1 });
			act(() => {
				result.current.wrappedOnClick({ currentItem: { date: 123 } }, { altKey: false, shiftKey: false });
			});
			expect(seek).toHaveBeenCalledWith(123);
			expect(rt.closePosition).not.toHaveBeenCalled();
		});

		it("Alt+click in CutMode → seek (backward compat)", () => {
			const { seek, result } = setupCutMode();
			act(() => {
				result.current.wrappedOnClick({ currentItem: { date: 123 } }, { altKey: true, shiftKey: false });
			});
			expect(seek).toHaveBeenCalledWith(123);
		});

		it("pre-first-cut (replayActive=false) plain click → seek, mobile-safe", () => {
			const { rt, seek, base, result } = setupCutMode({ replayActive: false });
			act(() => {
				result.current.wrappedOnClick({ currentItem: { date: 456 } }, { altKey: false, shiftKey: false });
			});
			expect(seek).toHaveBeenCalledWith(456);
			expect(rt.placeOrder).not.toHaveBeenCalled();
			expect(base).not.toHaveBeenCalled();
		});

		it("drawing tool + CutMode → baseOnClick (drawing wins)", () => {
			const { seek, base, result } = setupCutMode({ resolveActiveTool: () => "trendline" });
			act(() => {
				result.current.wrappedOnClick({ currentItem: { date: 123 } }, { altKey: false, shiftKey: false });
			});
			expect(seek).not.toHaveBeenCalled();
			expect(base).toHaveBeenCalled();
		});
	});
});
