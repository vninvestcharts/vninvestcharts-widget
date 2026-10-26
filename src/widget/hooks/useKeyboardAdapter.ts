import { useEffect, useRef, useCallback } from "react";
import type { KeyboardAdapter } from "@vninvestcharts/engine-react";

export interface UseKeyboardAdapterOptions {
  keyboardAdapter: KeyboardAdapter;
  enabled?: boolean;
}

export function useKeyboardAdapter(options: UseKeyboardAdapterOptions) {
	const { keyboardAdapter, enabled = true } = options;
	const keydownHandlersRef = useRef<Set<(e: KeyboardEvent) => void>>(new Set());
	const shortcutHandlersRef = useRef<Map<string, Set<() => void>>>(new Map());

	// Register a keydown handler
	const onKeyDown = useCallback((handler: (e: KeyboardEvent) => void) => {
		if (!enabled) return () => {};

		keydownHandlersRef.current.add(handler);

		return () => {
			keydownHandlersRef.current.delete(handler);
		};
	}, [enabled]);

	// Register a shortcut handler
	const onShortcut = useCallback((combo: string, handler: () => void) => {
		if (!enabled) return () => {};

		const normalized = normalizeCombo(combo);
		if (!shortcutHandlersRef.current.has(normalized)) {
			shortcutHandlersRef.current.set(normalized, new Set());
		}
    shortcutHandlersRef.current.get(normalized)!.add(handler);

    return () => {
    	const handlers = shortcutHandlersRef.current.get(normalized);
    	handlers?.delete(handler);
    	if (handlers?.size === 0) {
    		shortcutHandlersRef.current.delete(normalized);
    	}
    };
	}, [enabled]);

	// Set up global listener via injected adapter (required)
	useEffect(() => {
		if (!enabled) return;

		const handleKeyboardEvent = (e: KeyboardEvent) => {
			// Call all registered handlers
			keydownHandlersRef.current.forEach(handler => handler(e));

			if (e.type === "keydown") {
				// Check for shortcut combos
				const combo = getComboString(e);
				const comboHandlers = shortcutHandlersRef.current.get(combo);
				if (comboHandlers) {
					e.preventDefault();
					comboHandlers.forEach(handler => handler());
				}
			}
		};

		// Use injected adapter (required - no fallback)
		const cleanup = keyboardAdapter.onKeyDown(handleKeyboardEvent);

		return () => {
			cleanup?.();
		};
	}, [keyboardAdapter, enabled]);

	return { onKeyDown, onShortcut };
}

// ============================================
// Combo String Helpers (copied from KeyboardAdapter.ts)
// ============================================

function getComboString(e: KeyboardEvent): string {
	const parts: string[] = [];
	if (e.ctrlKey || e.metaKey) parts.push("ctrl");
	if (e.shiftKey) parts.push("shift");
	if (e.altKey) parts.push("alt");
	if (e.key.length === 1) {
		parts.push(e.key.toLowerCase());
	} else {
		parts.push(e.key.toLowerCase());
	}
	return parts.join("+");
}

function normalizeCombo(combo: string): string {
	return combo
		.toLowerCase()
		.split("+")
		.map(part => part.trim())
		.sort((a, b) => {
			const order = { ctrl: 0, shift: 1, alt: 2 };
			const oa = order[a as keyof typeof order] ?? 3;
			const ob = order[b as keyof typeof order] ?? 3;
			return oa - ob;
		})
		.join("+");
}

// ============================================
// Predefined Shortcut Constants — ĐÃ XOÁ 2026-09-30
// ============================================
//
// ~~`export const SHORTCUTS = {...}`~~ + ~~`export type ShortcutKey`~~ đã bị xoá: **0 consumer**.
//
// Grep toàn repo (kể cả `*.test.ts(x)`, `public-api.ts`, `index.ts`) chỉ khớp đúng dòng
// khai báo. Không phải "trông như không ai dùng" — đã đếm được.
//
// ⚠️ Nó **đúng là** một bản sao thứ hai của các binding đã có nguồn thật, và bản sao **sai**:
//   - `TOOL_CROSSHAIR: "c"` vs `toolShortcuts.ts` `C: closePosition`, `Shift+C` vs `C`
//   - `TOGGLE_SYNC_CROSSHAIR: "shift+c"` vs `ShortcutManager.tsx` `Control+Shift+KeyH`
//   - `TOOL_MEASURE: "m"` vs `M: toggleMagnet`
//   - `TOOL_TRENDLINE: "t"` vs `Alt+T: toggleTrendlineTool` (đã dời sang Alt ở P3)
//   - `SAVE_WORKSPACE: "ctrl+s"` còn **đụng phím Save của trình duyệt**
//
// Ai đó import nó lại chính là cách `Shift+S` đã từng chạy đồng thời sell ticket và
// shortPosition. Giữ SSOT thật ở `src/widget/config/toolShortcuts.ts` +
// `ShortcutManager.tsx`; **không** thêm bảng phím thứ hai ở đây.
//
// Lưu ý: `useKeyboardAdapter` **vẫn sống** — `useWidgetDrawings.ts:153` và
// `useWidgetInteractionActions.ts:47,53` dùng nó. Chỉ khối constant chết.