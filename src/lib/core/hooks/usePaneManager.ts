import { useCallback, useReducer } from "react";
import type { IndicatorConfig, PaneConfig } from "../../types/pane";

export type PaneInput = Omit<PaneConfig, "id"> & { id?: string };

export interface PaneManagerState {
	panes: PaneConfig[];
	addPane: (pane: PaneInput) => string;
	removePane: (paneId: string) => void;
	resizePane: (paneId: string, heightPx: number) => void;
	addIndicator: (paneId: string, indicator: IndicatorConfig) => void;
	removeIndicator: (paneId: string, indicatorName: string) => void;
	updateIndicator: (paneId: string, indicatorName: string, patch: Partial<IndicatorConfig>) => void;
}

export type PaneManagerAction =
	| { type: "addPane"; pane: PaneInput }
	| { type: "removePane"; paneId: string }
	| { type: "resizePane"; paneId: string; heightPx: number }
	| { type: "addIndicator"; paneId: string; indicator: IndicatorConfig }
	| { type: "removeIndicator"; paneId: string; indicatorName: string }
	| { type: "updateIndicator"; paneId: string; indicatorName: string; patch: Partial<IndicatorConfig> };

let paneIdSeed = 0;

function createPaneId() {
	paneIdSeed += 1;
	return `pane-${paneIdSeed}`;
}

function normalizePane(input: PaneInput): PaneConfig {
	return {
		...input,
		id: input.id ?? createPaneId(),
		indicators: input.indicators ?? [],
	};
}

function clampHeight(pane: PaneConfig, heightPx: number) {
	return Math.max(pane.minHeightPx ?? 40, heightPx);
}

export function paneManagerReducer(state: PaneConfig[], action: PaneManagerAction): PaneConfig[] {
	switch (action.type) {
		case "addPane":
			return [...state, normalizePane(action.pane)];
		case "removePane":
			return state.filter((pane) => pane.id !== action.paneId);
		case "resizePane":
			return state.map((pane) => (
				pane.id === action.paneId
					? { ...pane, heightPx: clampHeight(pane, action.heightPx) }
					: pane
			));
		case "addIndicator":
			return state.map((pane) => (
				pane.id === action.paneId
					? { ...pane, indicators: [...pane.indicators, action.indicator] }
					: pane
			));
		case "removeIndicator":
			return state.map((pane) => (
				pane.id === action.paneId
					? { ...pane, indicators: pane.indicators.filter((indicator) => indicator.name !== action.indicatorName) }
					: pane
			));
		case "updateIndicator":
			return state.map((pane) => (
				pane.id === action.paneId
					? {
						...pane,
						indicators: pane.indicators.map((indicator) => (
							indicator.name === action.indicatorName ? { ...indicator, ...action.patch } : indicator
						)),
					}
					: pane
			));
		default:
			return state;
	}
}

export function usePaneManager(initialPanes: readonly PaneInput[] = []): PaneManagerState {
	const [panes, dispatch] = useReducer(paneManagerReducer, initialPanes, (seed) => seed.map(normalizePane));

	const addPane = useCallback((pane: PaneInput) => {
		const normalizedPane = normalizePane(pane);
		dispatch({ type: "addPane", pane: normalizedPane });
		return normalizedPane.id;
	}, []);

	const removePane = useCallback((paneId: string) => {
		dispatch({ type: "removePane", paneId });
	}, []);

	const resizePane = useCallback((paneId: string, heightPx: number) => {
		dispatch({ type: "resizePane", paneId, heightPx });
	}, []);

	const addIndicator = useCallback((paneId: string, indicator: IndicatorConfig) => {
		dispatch({ type: "addIndicator", paneId, indicator });
	}, []);

	const removeIndicator = useCallback((paneId: string, indicatorName: string) => {
		dispatch({ type: "removeIndicator", paneId, indicatorName });
	}, []);

	const updateIndicator = useCallback((paneId: string, indicatorName: string, patch: Partial<IndicatorConfig>) => {
		dispatch({ type: "updateIndicator", paneId, indicatorName, patch });
	}, []);

	return {
		panes,
		addPane,
		removePane,
		resizePane,
		addIndicator,
		removeIndicator,
		updateIndicator,
	};
}