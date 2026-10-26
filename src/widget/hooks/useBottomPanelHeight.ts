/**
 * useBottomPanelHeight — user-resizable bottom-panel height (drag splitter).
 *
 * Single persisted preference (localStorage) shared by the multi-chart
 * BottomPanelHost and the single-chart forkBottomPanel. JS clamp [180, 900];
 * the visual 60% cap stays in CSS (maxHeight). Default reuses
 * BOTTOM_PANEL_HEIGHT_PX so hook/CSS never drift.
 *
 * Drag perf (grid-splitter parity): the splitter writes preview height
 * straight to the panel container DOM during the drag (no React state, no
 * storage I/O per move) and commits ONCE on pointer-up via `resizeTo`.
 * Hence persistence lives in the explicit commit paths below — NOT in a
 * per-change effect (that re-rendered the whole multi grid + localStorage
 * write on every pointermove, which is what made the drag feel sluggish).
 */

import { useCallback, useRef, useState } from "react";
import { BOTTOM_PANEL_HEIGHT_PX } from "./useBottomPanelBehavior";

const STORAGE_KEY = "vnsc_bottomPanelHeight";
export const BOTTOM_PANEL_MIN_PX = 180;
export const BOTTOM_PANEL_MAX_PX = 900;
export const BOTTOM_PANEL_NUDGE_PX = 20;

/**
 * Per-tab sensible heights (measured content needs): empty paper panels fit
 * ~200px, strategy needs room for stats + ~5 table rows, pine needs editor
 * space. Used ONLY while untouched (no persisted manual height) — user drag
 * always wins (persisted). Null/unknown tabs fall back to global default.
 */
export const BOTTOM_PANEL_TAB_DEFAULTS: Record<string, number> = {
	paper_trade: 240,
	strategy_tester: 340,
	pine_editor: 320,
};

export function defaultBottomPanelHeightForTab(tab: string | null | undefined): number {
	if (tab && BOTTOM_PANEL_TAB_DEFAULTS[tab] !== undefined) {
		return BOTTOM_PANEL_TAB_DEFAULTS[tab];
	}
	return BOTTOM_PANEL_HEIGHT_PX;
}

export function clampBottomPanelHeight(px: number): number {
	if (!Number.isFinite(px)) return BOTTOM_PANEL_HEIGHT_PX;
	return Math.min(BOTTOM_PANEL_MAX_PX, Math.max(BOTTOM_PANEL_MIN_PX, Math.round(px)));
}

/**
 * Persisted manual height, or null when untouched. A stored value EQUAL to the
 * legacy global default counts as untouched (indistinguishable from never
 * dragged) so existing users also benefit from per-tab auto-follow.
 */
function loadManual(): number | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw == null) return null;
		const parsed = clampBottomPanelHeight(Number(raw));
		return parsed === BOTTOM_PANEL_HEIGHT_PX ? null : parsed;
	} catch {
		return null;
	}
}

export interface BottomPanelHeightApi {
	heightPx: number;
	/** Grow when deltaUpPx > 0 (drag up / ArrowUp). Clamped + persisted. */
	resizeBy: (deltaUpPx: number) => void;
	/** Absolute commit (drag release). Clamped + persisted. Single render. */
	resizeTo: (px: number) => void;
	/** Keyboard step: dir +1 taller, -1 shorter. */
	nudge: (dir: 1 | -1) => void;
	/** Double-click reset to default. */
	reset: () => void;
}

function persist(px: number): void {
	try {
		localStorage.setItem(STORAGE_KEY, String(px));
	} catch {
		// Bỏ qua khi storage bị chặn (private mode).
	}
}

export function useBottomPanelHeight(defaultHeightPx: number = BOTTOM_PANEL_HEIGHT_PX): BottomPanelHeightApi {
	// null = auto-follow tab defaults (chưa từng kéo tay). Mọi thao tác tay
	// (drag/nudge/resizeTo) ghim manual + persist; reset trở về auto.
	const [manualPx, setManualPx] = useState<number | null>(loadManual);
	// Mirror chiều cao hiện tại cho callbacks (functional setState + sequential acts).
	const heightRef = useRef<number>(manualPx ?? defaultHeightPx);
	heightRef.current = manualPx ?? defaultHeightPx;
	const heightPx = manualPx ?? defaultHeightPx;

	const commitManual = useCallback((next: number) => {
		const clamped = clampBottomPanelHeight(next);
		persist(clamped);
		setManualPx(clamped);
	}, []);

	const resizeBy = useCallback((deltaUpPx: number) => {
		commitManual(heightRef.current + deltaUpPx);
	}, [commitManual]);

	const resizeTo = useCallback((px: number) => {
		commitManual(px);
	}, [commitManual]);

	const nudge = useCallback((dir: 1 | -1) => {
		commitManual(heightRef.current + dir * BOTTOM_PANEL_NUDGE_PX);
	}, [commitManual]);

	const reset = useCallback(() => {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// Bỏ qua khi storage bị chặn (private mode).
		}
		setManualPx(null);
	}, []);

	return { heightPx, resizeBy, resizeTo, nudge, reset };
}
