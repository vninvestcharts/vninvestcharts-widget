import { useEffect } from "react";
import type { PatTier } from "@vninvestcharts/engine-core";
import { isToolAvailable } from "@vninvestcharts/engine-drawing";
import { isTypingTarget } from "@vninvestcharts/engine-drawing";
import type { DrawingToolType } from "@vninvestcharts/engine-drawing";
import { TOOL_SHORTCUT_KEYS } from "../config/toolShortcuts";
import { TRADING_HOTKEY_KEYS } from "../trading/chart/useTradingHotkeys";

interface DrawingToolShortcutsOptions {
  onToolSelect: (toolId: string) => void;
  /** Current PAT tier for premium tool gating. Defaults to "free" when undefined. */
  patTier?: PatTier;
  /** Called when a premium tool is blocked via keyboard shortcut */
  onPremiumToolClick?: (tool: string) => void;
  /** S2.1: when false, no listener is registered (standalone-only mount). */
  enabled?: boolean;
  /** S4/BUG-6: Shift+M magnet cycle (non-tool action, branched before premium gate). */
  onMagnetCycle?: () => void;
}

// P4: single source of truth lives in widget/config/toolShortcuts.ts.
const KEY_MAP: Record<string, string> = TOOL_SHORTCUT_KEYS;
/** S4: action id reserved for magnet cycling — never a DrawingToolType. */
export const MAGNET_TOGGLE_ACTION = "toggleMagnet";

export function useDrawingToolShortcuts({ onToolSelect, patTier, onPremiumToolClick, enabled = true, onMagnetCycle }: DrawingToolShortcutsOptions) {
	useEffect(() => {
		if (!enabled) return;
		const handler = (e: KeyboardEvent) => {
			// S2.1: full typing/IME guard (SELECT, role=textbox, isComposing).
			if (isTypingTarget(e)) return;
			// P3: Alt/Ctrl/Meta-modified keys belong to other systems (Alt+letter
			// industry shortcuts, Ctrl+Z/Y undo/redo) - never double-fire here.
			if (e.altKey || e.ctrlKey || e.metaKey) return;
			// BUG (2026-09-30): `Shift` cũng thuộc hệ khác — `useTradingHotkeys` sở hữu
			// Shift+B/S/C. Vì cả hai đều là listener `window` và không
			// `stopImmediatePropagation`, một lần nhấn `Shift+S` **vừa** chọn công cụ
			// shortPosition **vừa** mở phiếu lệnh bán. Loại đúng các phím mà hook kia
			// sở hữu (lấy từ SSOT `TRADING_HOTKEY_KEYS`, không hardcode lần hai).
			// Shift+L / Shift+P / Shift+M là binding hợp lệ của drawing — KHÔNG bị loại.
			if (e.shiftKey && (TRADING_HOTKEY_KEYS as readonly string[]).includes(e.key.toUpperCase())) {
				return;
			}
			const toolId = KEY_MAP[e.key];
			if (!toolId) return;
			e.preventDefault();
			// S4: magnet is an action, not a tool — never enters the premium/tool path.
			if (toolId === MAGNET_TOGGLE_ACTION) {
				onMagnetCycle?.();
				return;
			}
			if (!isToolAvailable(toolId as DrawingToolType, patTier ?? "free")) {
				onPremiumToolClick?.(toolId);
				return;
			}
			onToolSelect(toolId);
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onToolSelect, patTier, onPremiumToolClick, enabled, onMagnetCycle]);
}
