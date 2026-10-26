import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDrawingToolShortcuts } from "../useDrawingToolShortcuts";
import { useTradingHotkeys } from "../../trading/chart/useTradingHotkeys";

/**
 * Regression lock — `Shift+S` chạy HAI handler cùng lúc (bug ACTIVE, tìm ra 2026-09-30).
 *
 * `useDrawingToolShortcuts.ts:33` lọc `altKey|ctrlKey|metaKey` nhưng **KHÔNG lọc
 * `shiftKey`** ⇒ `toolShortcuts.ts:29` `S: "shortPosition"` chọn công cụ.
 * `useTradingHotkeys.ts:35,40` cùng nhận event đó ⇒ mở phiếu lệnh bán.
 * Cả hai đều listener `window`, không ai `stopImmediatePropagation`.
 *
 * Gắn CẢ HAI hook vào cùng một window rồi bấm phím MỘT lần — đó là cách tái hiện
 * đúng thông điệp thật, không phải mô phỏng.
 *
 * ⚠️ Sửa KHÔNG được làm hỏng `Shift+L` / `Shift+P` / `Shift+M` — chúng là binding hợp lệ
 * của drawing tool / magnet. Chỉ 3 phím do `useTradingHotkeys` sở hữu mới phải bị loại.
 */
const TRADING_OWNED = ["B", "S", "C"] as const;

function press(key: string, init: KeyboardEventInit = {}) {
	window.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey: true, bubbles: true, ...init }));
}

function setup() {
	const onToolSelect = vi.fn();
	const onPremiumToolClick = vi.fn();
	const onMagnetCycle = vi.fn();
	const onBuy = vi.fn();
	const onSell = vi.fn();
	const onCloseRequest = vi.fn();

	const tools = renderHook(() =>
		useDrawingToolShortcuts({ onToolSelect, patTier: "pro", onPremiumToolClick, onMagnetCycle, enabled: true }),
	);
	const trading = renderHook(() =>
		useTradingHotkeys({ enabled: true, onBuy, onSell, onCloseRequest }),
	);

	return {
		onToolSelect,
		onPremiumToolClick,
		onMagnetCycle,
		onBuy,
		onSell,
		onCloseRequest,
		unmount: () => {
			tools.unmount();
			trading.unmount();
		},
	};
}

describe("Shift+<key>: drawing tool và trading hotkey không được cùng nhận", () => {
	it("Shift+S chỉ mở phiếu lệnh bán, KHÔNG chọn công cụ shortPosition", () => {
		const h = setup();
		press("S");
		// Đây là hành vi ĐÚNG: lệnh bán chạy, công cụ drawing không bị kích hoạt.
		expect(h.onSell).toHaveBeenCalledTimes(1);
		expect(h.onToolSelect, "Shift+S không được chọn công cụ drawing").not.toHaveBeenCalled();
		h.unmount();
	});

	it.each(TRADING_OWNED)("Shift+%s không được chọn công cụ drawing", (key) => {
		const h = setup();
		press(key);
		expect(h.onToolSelect, `Shift+${key} phải thuộc về trading`).not.toHaveBeenCalled();
		h.unmount();
	});

	it("Shift+B mở phiếu MUA, Shift+C yêu cầu đóng — không chọn công cụ", () => {
		const b = setup();
		press("B");
		expect(b.onBuy).toHaveBeenCalledTimes(1);
		b.unmount();

		const c = setup();
		press("C");
		expect(c.onCloseRequest).toHaveBeenCalledTimes(1);
		c.unmount();
	});
});

describe("Shift+<key> hợp lệ của drawing vẫn phải chạy", () => {
	it("Shift+L chọn longPosition (không phải phím của trading)", () => {
		const h = setup();
		press("L");
		expect(h.onToolSelect).toHaveBeenCalledWith("longPosition");
		h.unmount();
	});

	it("Shift+P chọn pitchfork", () => {
		const h = setup();
		press("P");
		expect(h.onToolSelect).toHaveBeenCalledWith("pitchfork");
		h.unmount();
	});

	it("Shift+M chạy magnet cycle (action, không phải tool)", () => {
		const h = setup();
		press("M");
		expect(h.onMagnetCycle).toHaveBeenCalledTimes(1);
		expect(h.onToolSelect).not.toHaveBeenCalled();
		h.unmount();
	});
});

describe("không có modifier: phím trần vẫn chọn công cụ", () => {
	it("S trần vẫn chọn shortPosition (không có Shift nên không thuộc trading)", () => {
		const h = setup();
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "S", bubbles: true }));
		expect(h.onToolSelect).toHaveBeenCalledWith("shortPosition");
		// Phím trần không phải hotkey trading (cần Shift).
		expect(h.onSell).not.toHaveBeenCalled();
		h.unmount();
	});
});