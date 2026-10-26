/**
 * WE2 P1-04: VNInvestChartsStateContext
 *
 * Medium-frequency state context: panes, drawings, activeTool, selectedDrawing.
 * These change on user interactions (add pane, select tool, etc.) but not
 * per-frame like hover coordinates.
 *
 * High-frequency data (mouse X/Y, hoveredDatum) must go through the
 * HoverEmitter (EventTarget ref) — NOT this context — to avoid re-render storms.
 */

import { createContext, useCallback, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import type { PaneDescriptor, SeriesConfig, SeriesTypeId, YAxisSide } from "../../lib/core/types/pane-descriptor";
import { DEFAULT_PANES } from "../../lib/core/types/pane-descriptor";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import { useDrawingInteraction } from "@vninvestcharts/engine-react";
import type { DrawingInteractionState, DrawingInteractionAction, UseDrawingInteractionReturn } from "@vninvestcharts/engine-react";
import { dynamicPanesReducer, type DynamicPaneAction, loadPaneLayout, normalizeLoadedPaneLayout } from "../../lib/core/hooks/useDynamicPanes";

// ── Pane state ───────────────────────────────────────────────────────────────

export interface PaneState {
	panes: readonly PaneDescriptor[];
	dispatch: Dispatch<DynamicPaneAction>;
	toggleVisible: (id: string) => void;
	addPane: (pane: Omit<PaneDescriptor, "id">) => void;
	removePane: (id: string) => void;
	deletePane: (id: string) => void;
	renamePane: (paneId: string, label: string) => void;
	restorePane: (id: string) => void;
	addSeries: (paneId: string, series: SeriesConfig) => void;
	removeSeries: (paneId: string, seriesType: SeriesTypeId, seriesIndex?: number) => void;
	toggleSeriesVisible: (paneId: string, seriesType: SeriesTypeId, seriesIndex?: number) => void;
	reorderPanes: (fromVisibleIndex: number, toVisibleIndex: number) => void;
}

// ── Drawing state (delegated to useDrawingInteraction) ───────────────────────

export type DrawingInteraction = UseDrawingInteractionReturn;

// ── Active tool ──────────────────────────────────────────────────────────────

export interface ActiveToolState {
	activeTool: string | undefined;
	setActiveTool: (tool: string | undefined) => void;
}

// ── Combined state context value ─────────────────────────────────────────────

export interface VNInvestChartsStateContextValue {
	paneState: PaneState;
	drawingInteraction: DrawingInteraction;
	activeTool: ActiveToolState;
}

const defaultValue: VNInvestChartsStateContextValue = undefined as unknown as VNInvestChartsStateContextValue;

export const VNInvestChartsStateContext = createContext<VNInvestChartsStateContextValue>(defaultValue);

export function useVNInvestChartsState() {
	const ctx = useContext(VNInvestChartsStateContext);
	if (ctx === defaultValue) {
		throw new Error("useVNInvestChartsState must be used within VNInvestChartsStateProvider");
	}
	return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export interface VNInvestChartsStateProviderProps {
	initialPanes?: readonly PaneDescriptor[];
	initialDrawings?: readonly DrawingObject[];
	initialActiveTool?: string;
	/** Per-chart storage namespace (multi-chart cell id). Absent = legacy shared key. */
	storageScopeId?: string | null;
	children: ReactNode;
}

export function VNInvestChartsStateProvider({
	initialPanes,
	initialDrawings,
	initialActiveTool,
	storageScopeId,
	children,
}: VNInvestChartsStateProviderProps) {
	// Pane state
	const [panes, dispatch] = useReducer(
		dynamicPanesReducer,
		undefined,
		() => {
			if (initialPanes) return normalizeLoadedPaneLayout(initialPanes);
			const isTestEnv = typeof globalThis !== "undefined" && (
				(globalThis as any).vi !== undefined || // ARC-1-keep: legacy bridge
				(globalThis as any).describe !== undefined || // ARC-1-keep: legacy bridge
				(globalThis as any).process?.env?.NODE_ENV === "test" // ARC-1-keep: legacy bridge
			);
			return loadPaneLayout(typeof localStorage !== "undefined" && !isTestEnv ? localStorage : undefined, storageScopeId);
		}
	);

	const toggleVisible = useCallback((id: string) => {
		dispatch({ type: "toggleVisible", id });
	}, [dispatch]);

	const addPane = useCallback((pane: Omit<PaneDescriptor, "id">) => {
		dispatch({ type: "addPane", pane });
	}, [dispatch]);

	const removePane = useCallback((id: string) => {
		dispatch({ type: "removePane", id });
	}, [dispatch]);

	const deletePane = useCallback((id: string) => {
		dispatch({ type: "deletePane", id });
	}, [dispatch]);

	const renamePane = useCallback((paneId: string, label: string) => {
		dispatch({ type: "renamePane", paneId, label });
	}, [dispatch]);

	const restorePane = useCallback((id: string) => {
		dispatch({ type: "restorePane", id });
	}, [dispatch]);

	const addSeries = useCallback((paneId: string, series: SeriesConfig) => {
		dispatch({ type: "addSeries", paneId, series });
	}, [dispatch]);

	const removeSeries = useCallback((paneId: string, seriesType: SeriesTypeId, seriesIndex?: number) => {
		dispatch({ type: "removeSeries", paneId, seriesType, seriesIndex });
	}, [dispatch]);

	const toggleSeriesVisible = useCallback((paneId: string, seriesType: SeriesTypeId, seriesIndex?: number) => {
		dispatch({ type: "toggleSeriesVisible", paneId, seriesType, seriesIndex });
	}, [dispatch]);

	const reorderPanes = useCallback((fromVisibleIndex: number, toVisibleIndex: number) => {
		dispatch({ type: "reorderPanes", fromVisibleIndex, toVisibleIndex });
	}, [dispatch]);

	const paneState: PaneState = useMemo(() => ({
		panes,
		dispatch,
		toggleVisible,
		addPane,
		removePane,
		deletePane,
		renamePane,
		restorePane,
		addSeries,
		removeSeries,
		toggleSeriesVisible,
		reorderPanes,
	}), [panes, dispatch, toggleVisible, addPane, removePane, deletePane, renamePane, restorePane, addSeries, removeSeries, toggleSeriesVisible, reorderPanes]);

	// Drawing state
	const drawingInteraction = useDrawingInteraction(initialDrawings ?? []);

	// Active tool state
	const [activeTool, setActiveToolState] = useReducer(
		(_state: string | undefined, next: string | undefined) => next,
		initialActiveTool,
	);
	const setActiveTool = useCallback((tool: string | undefined) => {
		setActiveToolState(tool);
	}, []);

	const activeToolState: ActiveToolState = useMemo(() => ({
		activeTool,
		setActiveTool,
	}), [activeTool, setActiveTool]);

	const value = useMemo<VNInvestChartsStateContextValue>(() => ({
		paneState,
		drawingInteraction,
		activeTool: activeToolState,
	}), [paneState, drawingInteraction, activeToolState]);

	return (
		<VNInvestChartsStateContext.Provider value={value}>
			{children}
		</VNInvestChartsStateContext.Provider>
	);
}
