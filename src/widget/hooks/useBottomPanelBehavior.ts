import { useCallback, useEffect, useRef, useState } from "react";

/** Default bottom-panel height (must match `--vnsc-bottom-panel-height` fallback in CSS). */
export const BOTTOM_PANEL_HEIGHT_PX = 260;
/** Approximate single-chart footer height used for chart-area estimation. */
export const SINGLE_FOOTER_HEIGHT_PX = 48;
/** Collapse indicator subpanes when the chart area drops below this height. */
export const COLLAPSE_CHART_AREA_PX = 300;

export interface SingleChartPanelCollapseInput {
	panelOpen: boolean;
	chartAreaHeight: number;
	collapseBelowPx?: number;
	visiblePaneIds: readonly string[];
	onTogglePaneVisible: (paneId: string) => void;
}

/**
 * UI-D1: auto-collapse indicator subpanes (single chart) while the bottom
 * panel is open and the chart area is squeezed. Restores exactly the panes
 * this hook hid (panes the user re-shows mid-collapse are left alone).
 */
export function useSingleChartPanelCollapse({
	panelOpen,
	chartAreaHeight,
	collapseBelowPx = COLLAPSE_CHART_AREA_PX,
	visiblePaneIds,
	onTogglePaneVisible,
}: SingleChartPanelCollapseInput): void {
	const collapsedRef = useRef<string[] | null>(null);
	const visibleRef = useRef(visiblePaneIds);
	visibleRef.current = visiblePaneIds;
	const toggleRef = useRef(onTogglePaneVisible);
	toggleRef.current = onTogglePaneVisible;

	const shouldCollapse = panelOpen && chartAreaHeight < collapseBelowPx;

	useEffect(() => {
		if (!shouldCollapse) {
			const collapsed = collapsedRef.current;
			collapsedRef.current = null;
			if (collapsed) {
				for (const id of collapsed) {
					if (!visibleRef.current.includes(id)) {
						toggleRef.current(id);
					}
				}
			}
			return;
		}
		if (collapsedRef.current) {
			return;
		}
		const ids = visibleRef.current.filter((id) => id !== "price");
		if (ids.length === 0) {
			return;
		}
		collapsedRef.current = ids;
		for (const id of ids) {
			toggleRef.current(id);
		}
	}, [shouldCollapse]);
}

export type MultiBottomTab = "strategy_tester" | "pine_editor" | "paper_trade" | null;

export interface MultiChartPanelFocusInput {
	activeTab: MultiBottomTab;
	activeChartId: string | null;
}

export interface MultiChartPanelFocus {
	/** Chart id that should render maximized, or null for grid. */
	maximizedChartId: string | null;
	/** Manual Solo/Grid override (marks intent so auto-focus stops fighting the user). */
	setMaximizedChartId: (id: string | null) => void;
	/** Toggle between Solo (active chart) and grid. */
	toggleSolo: () => void;
}

/**
 * UI-D2: focus-first behavior (multi chart). Opening Pine Editor or Strategy
 * Tester auto-maximizes the active chart; closing the tab restores the grid.
 * Paper Trading keeps the grid (flexible-height panel instead).
 */
export function useMultiChartPanelFocus({
	activeTab,
	activeChartId,
}: MultiChartPanelFocusInput): MultiChartPanelFocus {
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const manualRef = useRef(false);
	const activeChartIdRef = useRef(activeChartId);
	activeChartIdRef.current = activeChartId;
	// Start from null so mounting with an already-open tab still triggers focus.
	const prevTabRef = useRef<MultiBottomTab>(null);

	useEffect(() => {
		const prev = prevTabRef.current;
		prevTabRef.current = activeTab;
		if (activeTab === null) {
			manualRef.current = false;
			setFocusedId(null);
			return;
		}
		if ((activeTab === "pine_editor" || activeTab === "strategy_tester") && prev !== activeTab) {
			manualRef.current = false;
			if (activeChartId) {
				setFocusedId(activeChartId);
			}
		}
	}, [activeTab, activeChartId]);

	const setMaximizedChartId = useCallback((id: string | null) => {
		manualRef.current = true;
		setFocusedId(id);
	}, []);

	const toggleSolo = useCallback(() => {
		manualRef.current = true;
		setFocusedId((prev) => (prev !== null ? null : (activeChartIdRef.current ?? null)));
	}, []);

	return { maximizedChartId: focusedId, setMaximizedChartId, toggleSolo };
}
