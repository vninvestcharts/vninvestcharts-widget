import { useEffect, useCallback, useRef } from 'react';
import { useWidgetI18n } from '../context/WidgetI18nContext';

export interface ShortcutAction {
  id: string;
  keys: string[];           // e.g., ['Control', 'KeyS'] for Ctrl+S
  description: string;      // i18n key for description
  handler: () => void;
  preventDefault?: boolean; // Whether to prevent default browser behavior
  global?: boolean;         // Whether to listen globally (outside input fields)
}

interface ShortcutManagerState {
  shortcuts: Map<string, ShortcutAction>;
}

const globalState: ShortcutManagerState = {
	shortcuts: new Map(),
};

/**
 * Register a keyboard shortcut
 * @param action Shortcut action to register
 * @returns Unregister function
 */
export function registerShortcut(action: ShortcutAction): () => void {
	globalState.shortcuts.set(action.id, action);
	return () => globalState.shortcuts.delete(action.id);
}

/**
 * Unregister a keyboard shortcut by ID
 * @param id Shortcut ID to unregister
 */
export function unregisterShortcut(id: string): void {
	globalState.shortcuts.delete(id);
}

/**
 * Hook to register shortcuts for a component's lifecycle
 * @param shortcuts Array of shortcut actions to register
 */
export function useShortcuts(shortcuts: ShortcutAction[]): void {
	const registeredRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		// Register all shortcuts
		shortcuts.forEach(action => {
			registerShortcut(action);
			registeredRef.current.add(action.id);
		});

		// Cleanup on unmount
		return () => {
			registeredRef.current.forEach(id => unregisterShortcut(id));
			registeredRef.current.clear();
		};
	}, [shortcuts]);
}

/**
 * Global keyboard event handler
 * Should be called once at app root level
 */
export function useGlobalShortcutHandler(): void {
	const { t } = useWidgetI18n();

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			// Check if we're in an input field (unless shortcut is global)
			const target = event.target as HTMLElement;
			const isInputField = target.tagName === 'INPUT' ||
                          target.tagName === 'TEXTAREA' ||
                          target.isContentEditable;

			globalState.shortcuts.forEach(action => {
				// Skip non-global shortcuts when in input field
				if (isInputField && !action.global) return;

				// Check if keys match
				const keysMatch = action.keys.every(key => {
					switch (key.toLowerCase()) {
						case 'control':
						case 'ctrl':
							return event.ctrlKey || event.metaKey;
						case 'shift':
							return event.shiftKey;
						case 'alt':
							return event.altKey;
						case 'meta':
							return event.metaKey;
						default:
							return event.code === key || event.key === key;
					}
				});

				if (keysMatch) {
					if (action.preventDefault) {
						event.preventDefault();
					}
					action.handler();
				}
			});
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);
}

/**
 * Predefined shortcut categories for the UnifiedHeader
 */
export const HeaderShortcuts = {
	// Symbol search
	symbolSearch: (onOpen: () => void): ShortcutAction => ({
		id: 'header.symbolSearch',
		keys: ['KeyK'], // K key
		description: 'shortcuts.symbolSearch',
		handler: onOpen,
		preventDefault: true,
		global: true,
	}),

	// Symbol search modal (Ctrl+K / Cmd+K) — additive, no conflict with plain KeyK
	symbolSearchModal: (onOpen: () => void): ShortcutAction => ({
		id: 'header.symbolSearchModal',
		keys: ['ctrl', 'KeyK'], // Ctrl+K or Cmd+K ('ctrl' matches metaKey too)
		description: 'shortcuts.symbolSearch',
		handler: onOpen,
		preventDefault: true,
		global: true,
	}),

	// Timeframe cycle next
	timeframeNext: (onCycle: () => void): ShortcutAction => ({
		id: 'header.timeframeNext',
		keys: ['Period'], // . key
		description: 'shortcuts.timeframeNext',
		handler: onCycle,
		global: true,
	}),

	// Timeframe cycle previous
	timeframePrev: (onCycle: () => void): ShortcutAction => ({
		id: 'header.timeframePrev',
		keys: ['Comma'], // , key
		description: 'shortcuts.timeframePrev',
		handler: onCycle,
		global: true,
	}),

	// Chart type cycle
	chartTypeCycle: (onCycle: () => void): ShortcutAction => ({
		id: 'header.chartTypeCycle',
		keys: ['KeyT'], // T key
		description: 'shortcuts.chartTypeCycle',
		handler: onCycle,
		global: true,
	}),

	// Toggle sync visible range
	toggleSyncVisibleRange: (onToggle: () => void): ShortcutAction => ({
		id: 'header.toggleSyncVisibleRange',
		// ĐÃ ĐỔI (2026-09-30): trước là `Control+KeyR` = **reload trình duyệt** ⇒ phím này
		// không bao giờ tới được handler, và người dùng reload mất trạng thái chart.
		// Chọn `Control+Shift+KeyH` (crosshair) + `Control+Shift+KeyV` (visible) làm cặp
		// **dễ nhớ** (H/V), và cả hai đều không bị trình duyệt chiếm.
		keys: ['Control', 'Shift', 'KeyV'], // Ctrl+Shift+V
		description: 'shortcuts.toggleSyncVisibleRange',
		handler: onToggle,
		global: true,
	}),

	// Toggle sync crosshair
	toggleSyncCrosshair: (onToggle: () => void): ShortcutAction => ({
		id: 'header.toggleSyncCrosshair',
		// ĐÃ ĐỔI (2026-09-30): trước là `Control+KeyH`, trùng với binding **đang chạy**
		// `useWidgetDrawings.ts` (ẩn/hiện drawing). Hai cơ chế phân phối độc lập
		// (combo map của KeyboardAdapter vs listener window ở `:106`), không dedupe, không
		// phát hiện xung đột — nối binding này vào là **cả hai handler chạy**.
		// Chuyển sang Control+Shift+KeyH (không trùng, không bị browser chiếm).
		// ⚠️ Lựa chọn key cuối cùng là quyết định sản phẩm — nhưng
		// `ShortcutManager.collision.test.ts` chặn việc trùng key vĩnh viễn.
		keys: ['Control', 'Shift', 'KeyH'], // Ctrl+Shift+H
		description: 'shortcuts.toggleSyncCrosshair',
		handler: onToggle,
		global: true,
	}),

	// Open system menu
	openSystemMenu: (onOpen: () => void): ShortcutAction => ({
		id: 'header.openSystemMenu',
		// ĐÃ ĐỔI (2026-09-30): trước là `KeyM` trần, trùng `M: "toggleMagnet"` trong
		// `TOOL_SHORTCUT_KEYS` ⇒ khi `useHeaderShortcuts` được nối, M sẽ mở menu VÀ cycle
		// magnet. `Alt+M` thì chưa ai chiếm (`ALT_TOOL_SHORTCUTS` chỉ T/H/F/R, cộng Alt+S).
		keys: ['Alt', 'KeyM'], // Alt+M
		description: 'shortcuts.openSystemMenu',
		handler: onOpen,
		global: true,
	}),

	// Toggle drawing tools
	toggleDrawingTools: (onToggle: () => void): ShortcutAction => ({
		id: 'header.toggleDrawingTools',
		keys: ['KeyD'], // D key
		description: 'shortcuts.toggleDrawingTools',
		handler: onToggle,
		global: true,
	}),

	// Toggle drawing dock panel
	dockToggle: (onToggle: () => void): ShortcutAction => ({
		id: 'header.dockToggle',
		keys: ['Control', 'Shift', 'KeyL'], // Ctrl+Shift+L
		description: 'drawing.dock.toggleShortcut',
		handler: onToggle,
		global: true,
	}),
};

/**
 * ~~Hook to register all header shortcuts~~ — **XOÁ 2026-09-30 (dead, 0 caller).**
 *
 * Hook này từng đăng ký **cả 9 binding cùng lúc**. Nhưng không host nào gọi nó: cả
 * `VNInvestCharts.tsx:986` và `VNInvestMultiCharts.tsx:828` đăng ký thủ công qua
 * `useShortcuts([...])` và **chỉ lấy 2 binding** — `dockToggle` + `symbolSearchModal`.
 *
 * ⚠️ **Hệ quả cần biết trước khi ai đó "sửa lại":** 7 binding còn lại
 * (`timeframeNext`, `timeframePrev`, `chartTypeCycle`, `toggleSyncVisibleRange`,
 * `toggleSyncCrosshair`, `openSystemMenu`, `toggleDrawingTools`) **chưa từng chạy được**
 * bằng bàn phím. Chart hiện **không có phím tắt đồng bộ crosshair / vùng nhìn**.
 *
 * Muốn bật chúng thì phải đăng ký **chọn lọc** tại host (như 2 binding kia), **không** gọi
 * lại hook 9-binding này — vì lúc đó `M` (openSystemMenu) sẽ đụng `M: toggleMagnet` của
 * `TOOL_SHORTCUT_KEYS`, và `K` sẽ đụng `K: toggleCursor`. Collision guard
 * (`ShortcutManager.collision.test.ts`) sẽ bắt, nhưng guard chỉ so `ctrl+*` cộng **key trần**
 * khai báo tại đó — nó **không** kiểm tra phím đã được host dùng hay chưa.
 *
 * `HeaderShortcuts.*` factories được giữ lại: chúng là nơi khai báo key + i18n, và là mục
 * tiêu của collision guard. Xem `openSystemMenu` (nay `Alt+M`) và
 * `toggleSyncVisibleRange` (nay `Ctrl+Shift+V`).
 */

// Initialize global handler (call once at app root)
let handlerInitialized = false;
export function initializeGlobalShortcutHandler(): void {
	if (handlerInitialized) return;
	handlerInitialized = true;
	// The actual handler is set up by useGlobalShortcutHandler hook
	// This function is just a marker for initialization
}

export default {
	registerShortcut,
	unregisterShortcut,
	useShortcuts,
	useGlobalShortcutHandler,
	HeaderShortcuts,
	initializeGlobalShortcutHandler,
};