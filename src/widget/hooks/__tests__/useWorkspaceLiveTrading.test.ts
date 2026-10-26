import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWorkspaceLiveTrading } from "../useWorkspaceLiveTrading";

// Task M3: shared live broker — singleton dùng chung, broadcast best-effort.
describe("useWorkspaceLiveTrading", () => {
	it("place + fill qua broker chung, log ghi fill", () => {
		const { result } = renderHook(() => useWorkspaceLiveTrading({}));
		act(() => {
			result.current.broker.placeOrder(
				{ symbol: "FPT", side: "buy", type: "market", quantity: 100 },
				{ skipValidation: true },
			);
			result.current.broker.onBar(
				"FPT",
				{ open: 128500, high: 129000, low: 128000, close: 128800, date: 1000 },
				1000,
			);
		});
		expect(result.current.broker.getPositions()).toHaveLength(1);
		expect(result.current.log.length).toBeGreaterThan(0);
	});

	it("brokerFor: VN spot -> shared, crypto -> undefined (giữ broker cục bộ)", () => {
		const { result } = renderHook(() => useWorkspaceLiveTrading({}));
		expect(result.current.brokerFor("FPT")).toBeDefined();
		expect(result.current.brokerFor("VNM")).toBeDefined();
		expect(result.current.brokerFor("BTCUSDT")).toBeUndefined();
		expect(result.current.brokerFor("VN30F1M")).toBeUndefined();
	});

	it("reverse + cancel + reset qua hook", () => {
		const { result } = renderHook(() => useWorkspaceLiveTrading({}));
		act(() => {
			result.current.broker.placeOrder(
				{ symbol: "FPT", side: "buy", type: "market", quantity: 100 },
				{ skipValidation: true },
			);
			result.current.broker.onBar(
				"FPT",
				{ open: 128500, high: 129000, low: 128000, close: 128800, date: 1000 },
				1000,
			);
		});
		const posId = result.current.broker.getPositions()[0].id;
		act(() => {
			// Spot T+2: vị thế mới khớp chưa khả dụng — tua settlement trước khi đảo.
			result.current.broker.onBar(
				"FPT",
				{ open: 128500, high: 129000, low: 128000, close: 128800, date: 1000 },
				1000 + 10 * 86400_000,
			);
			result.current.reversePosition(posId);
		});
		expect(result.current.broker.getPositions()).toHaveLength(0);
		act(() => {
			result.current.reset();
		});
		expect(result.current.log).toHaveLength(0);
	});

	it("broadcast không chặn luồng chính khi adapter lỗi", () => {
		const broken = {
			postMessage: () => {
				throw new Error("channel down");
			},
			onMessage: () => () => undefined,
			close: () => undefined,
			isAvailable: () => true,
		} as never;
		const { result } = renderHook(() => useWorkspaceLiveTrading({ syncAdapter: broken }));
		expect(() => {
			act(() => {
				result.current.broker.placeOrder(
					{ symbol: "FPT", side: "buy", type: "market", quantity: 100 },
					{ skipValidation: true },
				);
			});
		}).not.toThrow();
	});
});
