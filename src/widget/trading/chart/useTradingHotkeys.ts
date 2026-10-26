// Task 07: useTradingHotkeys — Shift+B/S/C mở ticket / yêu cầu đóng.
// BẮT BUỘC: isTypingTarget guard + keydown-only (bài học double-fire P3-06b,
// commit 8173eec). Shift+C chỉ phát onCloseRequest — host (Task 09) quyết định
// hiện ConfirmDialog có sẵn hay đóng thẳng (oneKeyClose).
import { useEffect, useRef } from "react";
import { isTypingTarget } from "@vninvestcharts/engine-drawing";

export interface TradingHotkeyHandlers {
	onBuy: () => void;
	onSell: () => void;
	onCloseRequest: () => void;
}

/**
 * SSOT cho các phím Shift mà module này SỞ HỮU.
 *
 * Xuất ra để `useDrawingToolShortcuts` loại đúng các phím này khi giữ Shift — vì
 * `toolShortcuts.ts` cũng map `B`/`S`/`C` (`shortPosition`…). Cả hai listener cùng
 * `window` và không `stopImmediatePropagation` ⇒ trước đây `Shift+S` **vừa** chọn công cụ
 * **vừa** mở phiếu bán. Không hardcode danh sách thứ hai ở nơi khác: nó ở đây.
 *
 * ⚠️ `Shift+L` / `Shift+P` / `Shift+M` **KHÔNG** thuộc về đây — chúng là binding hợp lệ
 * của drawing tool / magnet, phải tiếp tục chạy.
 */
export const TRADING_HOTKEY_KEYS = ["B", "S", "C"] as const;

export interface TradingHotkeyOptions extends TradingHotkeyHandlers {
	enabled?: boolean;
}

export function useTradingHotkeys(options: TradingHotkeyOptions): void {
	const handlersRef = useRef<TradingHotkeyHandlers>({
		onBuy: options.onBuy,
		onSell: options.onSell,
		onCloseRequest: options.onCloseRequest,
	});
	handlersRef.current = {
		onBuy: options.onBuy,
		onSell: options.onSell,
		onCloseRequest: options.onCloseRequest,
	};

	useEffect(() => {
		if (options.enabled === false) return;
		const handleKey = (e: KeyboardEvent) => {
			if (e.type !== "keydown") return;
			if (isTypingTarget(e)) return;
			if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
			const key = e.key.toUpperCase();
			if (key === "B") {
				e.preventDefault();
				handlersRef.current.onBuy();
			} else if (key === "S") {
				e.preventDefault();
				handlersRef.current.onSell();
			} else if (key === "C") {
				e.preventDefault();
				handlersRef.current.onCloseRequest();
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [options.enabled]);
}
