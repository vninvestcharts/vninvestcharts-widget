import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTradingHotkeys } from "../useTradingHotkeys";

// Task 07: Shift+B/S/C + guard gõ phím + keydown-only (hồi quy P3-06b).
function key(target: EventTarget, type: string, init: KeyboardEventInit) {
	target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, ...init }));
}

describe("useTradingHotkeys", () => {
	it("Shift+B/S/C gọi đúng callback", () => {
		const onBuy = vi.fn();
		const onSell = vi.fn();
		const onCloseRequest = vi.fn();
		renderHook(() => useTradingHotkeys({ onBuy, onSell, onCloseRequest }));
		key(window, "keydown", { key: "B", shiftKey: true });
		key(window, "keydown", { key: "S", shiftKey: true });
		key(window, "keydown", { key: "C", shiftKey: true });
		expect(onBuy).toHaveBeenCalledTimes(1);
		expect(onSell).toHaveBeenCalledTimes(1);
		expect(onCloseRequest).toHaveBeenCalledTimes(1);
	});

	it("keyup Shift+B KHÔNG kích hoạt (khóa double-fire P3-06b)", () => {
		const onBuy = vi.fn();
		renderHook(() => useTradingHotkeys({ onBuy, onSell: () => {}, onCloseRequest: () => {} }));
		key(window, "keyup", { key: "B", shiftKey: true });
		expect(onBuy).not.toHaveBeenCalled();
	});

	it("đang gõ trong input -> bỏ qua (isTypingTarget)", () => {
		const onBuy = vi.fn();
		renderHook(() => useTradingHotkeys({ onBuy, onSell: () => {}, onCloseRequest: () => {} }));
		const input = document.createElement("input");
		document.body.appendChild(input);
		key(input, "keydown", { key: "B", shiftKey: true });
		expect(onBuy).not.toHaveBeenCalled();
		document.body.removeChild(input);
	});

	it("phím thường không shift / enabled=false -> im lặng", () => {
		const onBuy = vi.fn();
		const onSell = vi.fn();
		const { rerender } = renderHook(
			({ enabled }: { enabled?: boolean }) => useTradingHotkeys({ onBuy, onSell, onCloseRequest: () => {}, enabled }),
			{ initialProps: {} },
		);
		key(window, "keydown", { key: "b" });
		expect(onBuy).not.toHaveBeenCalled();
		rerender({ enabled: false });
		key(window, "keydown", { key: "B", shiftKey: true });
		key(window, "keydown", { key: "S", shiftKey: true });
		expect(onBuy).not.toHaveBeenCalled();
		expect(onSell).not.toHaveBeenCalled();
	});
});
