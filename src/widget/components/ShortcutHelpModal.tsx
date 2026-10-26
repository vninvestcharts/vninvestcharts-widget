import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWidgetI18n } from "../context/WidgetI18nContext";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { ALT_TOOL_SHORTCUTS, TOOL_SHORTCUT_KEYS, shortcutDisplayLabel } from "../config/toolShortcuts";
import { isTypingTarget } from "@vninvestcharts/engine-drawing";

const SEEN_KEY = "vnsc_seenShortcuts";

/**
 * MULTI-GRID single-modal claim: every chart cell mounts its own modal with
 * a window-global `?` listener — without a shared guard one keypress opens N
 * dialogs (2x2 = 4 stacked helps). Module-level count lets exactly one
 * responder open; `?`/Esc while any is open closes it. Sync (never in a
 * setState updater) so all handlers in the same keypress dispatch see it.
 */
let openDialogCount = 0;
/**
 * Same-dispatch guard: all cell listeners receive the SAME event object, so
 * without this the first handler's close (count 1→0) would let the second
 * handler see count 0 and reopen — toggle could never reach zero.
 */
let lastHandledKeyStamp = -1;

function readSeen(): boolean {
	try {
		return typeof localStorage !== "undefined" && localStorage.getItem(SEEN_KEY) === "1";
	} catch {
		return true;
	}
}

function markSeen() {
	try {
		localStorage?.setItem(SEEN_KEY, "1");
	} catch {
		/* storage unavailable — hint shows again next visit */
	}
}

/**
 * Core rows — **DỰA TRÊN NƠI BINDING THẬT**, không phải bản ghi tay.
 *
 * Trước 2026-09-30 đây là mảng literal 6 dòng, trong khi docblock dưới nói
 * "rows are built from the shortcut SSOT so they can never drift" — **không đúng** với
 * chính 6 dòng đó. Tệ hơn: modal **thiếu** 7 phím đang chạy thật.
 *
 * Mỗi dòng khai báo `key` + nơi bind thật, để drift lộ ra khi ai đó đổi binding mà quên
 * cập nhật modal. `ShortcutManager.collision.test.ts` kiểm phần còn lại (trùng phím).
 */
export const CORE_ROWS: Array<{ keys: string; label: string; binding: string }> = [
	{ keys: "Ctrl+Z / Ctrl+Y", label: "shortcuts.undoRedo", binding: "useWidgetDrawings.ts:192,197" },
	{ keys: "Delete / Backspace", label: "shortcuts.removeDrawing", binding: "useWidgetDrawings.ts:165-180" },
	{ keys: "Ctrl+C / Ctrl+V", label: "shortcuts.copyPaste", binding: "useWidgetDrawings.ts:219,229" },
	// Ctrl+H ẩn/hiện drawing. Sync crosshair đã chuyển sang Ctrl+Shift+H (không trùng).
	{ keys: "Ctrl+L / Ctrl+H", label: "shortcuts.lockHide", binding: "useWidgetDrawings.ts:252,262" },
	{ keys: "Ctrl+K", label: "shortcuts.symbolSearch", binding: "ShortcutManager.ts:128 (live)" },
	{ keys: "Ctrl+Shift+L", label: "shortcuts.dockToggle", binding: "ShortcutManager.ts:201 (live)" },
	{ keys: "Ctrl+Shift+H / Ctrl+Shift+V", label: "shortcuts.syncToggles", binding: "ShortcutManager.ts:172,163 (live)" },
	{ keys: "Alt+S", label: "shortcuts.toggleFavorites", binding: "useWidgetDrawings.ts:203-207 (live)" },
	{ keys: "Shift+B / Shift+S / Shift+C", label: "shortcuts.paperTrading", binding: "useTradingHotkeys.ts:37,40,43 (live)" },
	{ keys: "Space / ← / →", label: "shortcuts.replay", binding: "OHLCHeader.ts:238-250 (showReplay only)" },
	{ keys: "Alt+Enter", label: "shortcuts.maximizeCell", binding: "GridContainer.ts:888" },
	{ keys: "Esc", label: "shortcuts.cursorCancel", binding: "toolShortcuts.ts:24" },
	{ keys: "?", label: "shortcuts.thisHelp", binding: "ShortcutHelpModal.ts:122" },
];

/**
 * BL-16 + BL-21: discoverability for the window-global keyboard UX. Opens on `?`
 * (Shift+/).
 *
 * Tool rows derive from `ALT_TOOL_SHORTCUTS` / `TOOL_SHORTCUT_KEYS` (SSOT, xem phần render
 * bên dưới). Core rows thì **không** suy ra được từ một danh sách duy nhất — chúng thuộc
 * nhiều module (`useWidgetDrawings`, `ShortcutManager`, `useTradingHotkeys`, `OHLCHeader`,
 * `GridContainer`) — nên `CORE_ROWS` khai **kèm `binding` là nơi bind thật**, để khi ai đó
 * đổi binding mà quên sửa modal thì đó là việc phải sửa tường minh chứ không phải drift
 * âm thầm. (Trước 2026-09-30 đây là literal 6 dòng, thiếu 7 phím đang chạy, còn docblock
 * lại khẳng định "derived from SSOT".)
 *
 * `CORE_ROWS` export ra để test kiểm **từng dòng có thực sự render** — thay vì đếm tổng
 * số dòng cứng (xem `ShortcutHelpModal.test.tsx` HELP-COMPACT).
 *
 * UI-AUDIT: the first-run hint renders INLINE (no absolute floating) —
 * mount this component inside the footer right cluster. The modal overlay
 * itself stays absolutely anchored to .vnsc-root.
 */
export function ShortcutHelpModal({
	hintInline = false,
	showHint = false,
}: {
	hintInline?: boolean;
	/**
	 * UI-AUDIT / multicharts: hint **mặc định ẩn**. Trước đây mọi ô chart đều render một
	 * chip "? Phím tắt", nên 4 ô là 4 chip lặp lại — rất vô duyên và ăn chiều cao footer.
	 * Modal vẫn mở bằng phím `?` ở bất kỳ đâu, và một modal duy nhất cho cả grid (đã khoá
	 * bằng `openDialogCount`), nên ẩn hint **không** làm mất khả năng tiếp cận.
	 */
	showHint?: boolean;
}) {
	const panelRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const { t } = useWidgetI18n();
	const [open, setOpen] = useState(false);
	// First-visit hint (non-blocking chip, NOT an auto-open modal — a modal
	// overlay would intercept hover and hide the drawing rail, breaking
	// both UX and the P3 E2E rail checks).
	const [hintVisible, setHintVisible] = useState(() => showHint && !readSeen());
	// Sync mirror of `open` for the module guard (refs don't double-fire).
	const openRef = useRef(false);

	const close = useCallback(() => {
		if (openRef.current) {
			openRef.current = false;
			openDialogCount = Math.max(0, openDialogCount - 1);
		}
		setOpen(false);
		markSeen();
		setHintVisible(false);
	}, []);

	const doOpen = useCallback(() => {
		if (openRef.current) return;
		openRef.current = true;
		openDialogCount++;
		setOpen(true);
	}, []);

	const openFromHint = useCallback(() => {
		markSeen();
		setHintVisible(false);
		doOpen();
	}, [doOpen]);

	// UX-02: shared dialog focus contract (initial focus, Tab loop, Escape,
	// focus restore). The close button is the first focusable node, so focusing
	// it on open lets keyboard users dismiss immediately.
	useDialogFocus(panelRef, { open, onEscape: close, initialFocusRef: closeRef });

	// Unmount while open (cell removed) must release the claim.
	useEffect(() => () => {
		if (openRef.current) {
			openRef.current = false;
			openDialogCount = Math.max(0, openDialogCount - 1);
		}
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e)) {
				e.preventDefault();
				if (e.timeStamp === lastHandledKeyStamp) return;
				lastHandledKeyStamp = e.timeStamp;
				if (openDialogCount > 0) close();
				else {
					markSeen();
					setHintVisible(false);
					doOpen();
				}
			} else if (e.key === "Escape" && openRef.current) {
				close();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [close, doOpen]);

	if (!open) {
		if (!hintVisible) return null;
		// UI-AUDIT: inline mode flows with the footer (no overlap with
		// timeframe chips); floating mode is legacy and must not be used.
		return (
			<button
				type="button"
				onClick={openFromHint}
				aria-label={t("shortcuts.title") ?? "Keyboard shortcuts"}
				title={t("shortcuts.hint") ?? "Press ? anytime to reopen this help."}
				style={hintInline ? {
					border: "1px solid var(--vnsc-border, #2a2e39)",
					borderRadius: 999,
					background: "transparent",
					color: "inherit",
					fontSize: 12,
					fontWeight: 600,
					padding: "2px 8px",
					marginLeft: 4,
					cursor: "pointer",
					whiteSpace: "nowrap",
				} : {
					position: "absolute",
					left: 12,
					bottom: 12,
					zIndex: 1240,
					border: "1px solid var(--vnsc-border, #2a2e39)",
					borderRadius: 999,
					background: "var(--vnsc-bg-secondary, #111820)",
					color: "var(--vnsc-text-primary, #d1d4dc)",
					fontSize: 12,
					fontWeight: 600,
					padding: "6px 12px",
					cursor: "pointer",
					boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
				}}
			>
				? {t("shortcuts.title") ?? "Keyboard shortcuts"}
			</button>
		);
	}

	const toolLabel = (tool: string) => t(`drawingTool.${tool}`) ?? tool;
	const coreRows: Array<[string, string]> = CORE_ROWS.map(({ keys, label }) => [keys, t(label) ?? label]);
	// HELP-DEDUPE: group every binding of one action into a single row
	// ("Alt+T / L — Trend"), so Alt+letter and single-letter twins (and the
	// P/Shift+P pitchfork pair) never render as two look-alike rows. The old
	// hand-written "Shift+M / Magnet cycle" row is dropped — the SSOT-derived
	// M → toggleMagnet row below IS that same action (useDrawingToolShortcuts
	// branches M straight to onMagnetCycle).
	const toolRows: Array<[string, string]> = (() => {
		const keysByLabel = new Map<string, string[]>();
		const push = (keyLabel: string, tool: string) => {
			const label = toolLabel(tool);
			const arr = keysByLabel.get(label);
			if (arr) arr.push(keyLabel);
			else keysByLabel.set(label, [keyLabel]);
		};
		for (const [key, tool] of Object.entries(ALT_TOOL_SHORTCUTS)) push(`Alt+${shortcutDisplayLabel(key)}`, tool);
		for (const [key, tool] of Object.entries(TOOL_SHORTCUT_KEYS)) {
			if (key === "Escape") continue;
			push(shortcutDisplayLabel(key), tool);
		}
		return [...keysByLabel.entries()].map(([label, keys]): [string, string] => [keys.join(" / "), label]);
	})();

	// HELP-PORTAL: the dialog portals to document.body (fixed) — anchored to a
	// grid cell it would cover only that cell and clip its own content (2x2).
	if (typeof document === "undefined") return null;
	return createPortal(
		<div
			role="dialog"
			aria-modal="true"
			aria-label={t("shortcuts.title") ?? "Keyboard shortcuts"}
			onClick={close}
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 1250,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "rgba(0,0,0,0.45)",
			}}
		>
			<div
				ref={panelRef}
				onClick={(e) => e.stopPropagation()}
				style={{
					maxWidth: 560,
					width: "calc(100% - 48px)",
					maxHeight: "86%",
					overflow: "auto",
					// HELP-THEME: --modal-bg/--text-primary never existed in the
					// widget token set — fallbacks forced a white box in dark
					// mode. Use --vnsc-* tokens (theme-aware, correct both modes).
					background: "var(--vnsc-bg-primary, #131722)",
					color: "var(--vnsc-text-primary, #d1d4dc)",
					border: "1px solid var(--vnsc-border, #2a2e39)",
					borderRadius: 12,
					padding: "16px 20px",
					boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
					<strong>{t("shortcuts.title") ?? "Keyboard shortcuts"}</strong>
					<button ref={closeRef} type="button" onClick={close} aria-label={t("toast.dismiss") ?? "Close"} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>
						×
					</button>
				</div>
				<p style={{ margin: "0 0 12px", fontSize: 13, opacity: 0.75 }}>
					{t("shortcuts.hint") ?? "Press ? anytime to reopen this help."}
				</p>
				{/* HELP-COMPACT: CSS multi-columns auto-flow (2 cols on desktop,
				    1 col on narrow screens via column-width) + compact type so
				    all 22 rows fit without scrolling wherever space allows.
				    breakInside avoids splitting a row across columns. */}
				<div role="list" aria-label={t("shortcuts.title") ?? "Keyboard shortcuts"} style={{ columns: "240px 2", columnGap: 28, fontSize: 12, width: "100%" }}>
					{[...coreRows, ...toolRows].map(([keys, action]) => (
						<div key={`${keys}-${action}`} role="listitem" style={{ breakInside: "avoid", display: "flex", gap: 8, padding: "2px 0" }}>
							<span style={{ minWidth: 118, whiteSpace: "nowrap", fontWeight: 600 }}>{keys}</span>
							<span>{action}</span>
						</div>
					))}
				</div>
			</div>
		</div>,
		document.body,
	);
}
