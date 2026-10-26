import { useCallback, useEffect, useMemo, useReducer, type Dispatch } from "react";
import type { PaneDescriptor, SeriesConfig, SeriesTypeId, YAxisSide } from "../types/pane-descriptor";
import { normalizeSeriesTypeId } from "../types/pane-descriptor";
import { DEFAULT_PANES, PANE_LAYOUT_STORAGE_KEY, PANE_MAX_VISIBLE, isDefaultPaneId } from "../types/pane-descriptor";
import { applySplitterDelta, calculatePaneHeights, equalizePairHeights, getPaneMinHeight } from "./paneSizingHelpers";

const FRAME_VERTICAL_MARGIN = 36;

export interface StoredPaneLayout {
	version: 1;
	panes: readonly PaneDescriptor[];
}

export interface PaneLayoutStorageLike {
	getItem: (key: string) => string | null;
	setItem: (key: string, value: string) => void;
	removeItem: (key: string) => void;
}

export interface UseDynamicPanesOptions {
	maxVisiblePanes?: number;
	panesOverride?: readonly PaneDescriptor[];
	dispatchOverride?: Dispatch<DynamicPaneAction>;
	/** Per-chart storage namespace (multi-chart cell id). Absent = legacy shared key. */
	storageScopeId?: string | null;
}

/** Scoped pane-layout key: `<base>:<chartId>` in multi, legacy base in single. */
export function scopedPaneLayoutKey(scopeId?: string | null): string {
	return scopeId ? `${PANE_LAYOUT_STORAGE_KEY}:${scopeId}` : PANE_LAYOUT_STORAGE_KEY;
}

export type DynamicPaneAction =
	| { type: "toggleVisible"; id: string; maxVisiblePanes?: number }
	| { type: "addPane"; pane: Omit<PaneDescriptor, "id">; maxVisiblePanes?: number }
	| { type: "removePane"; id: string }
	| { type: "deletePane"; id: string }
	| { type: "renamePane"; paneId: string; label: string }
	| { type: "restorePane"; id: string; maxVisiblePanes?: number }
	| { type: "addSeries"; paneId: string; series: SeriesConfig; maxVisiblePanes?: number }
	| { type: "removeSeries"; paneId: string; seriesType: SeriesTypeId; seriesIndex?: number }
	| { type: "toggleSeriesVisible"; paneId: string; seriesType: SeriesTypeId; seriesIndex?: number; maxVisiblePanes?: number }
	| { type: "updateSeriesParams"; paneId: string; seriesType: SeriesTypeId; params: Record<string, unknown>; seriesIndex?: number }
	| { type: "updateSeriesType"; paneId: string; seriesType: SeriesTypeId; seriesIndex?: number }
	| { type: "updateSeriesYAxis"; paneId: string; seriesType: SeriesTypeId; yAxis: YAxisSide; seriesIndex?: number }
	| { type: "updateSeriesColor"; paneId: string; seriesType: SeriesTypeId; color: string; seriesIndex?: number }
	| { type: "updateSeriesLineWidth"; paneId: string; seriesType: SeriesTypeId; lineWidth?: number; seriesIndex?: number }
	| { type: "updateSeriesSubColor"; paneId: string; seriesType: SeriesTypeId; subKey: string; color: string; seriesIndex?: number }
	| { type: "updateSeriesSource"; paneId: string; seriesType: SeriesTypeId; sourceType?: "price" | "indicator"; sourceId?: string; sourceKey?: string; seriesIndex?: number }
	| { type: "applyDelta"; splitterIndex: number; deltaY: number; available: number }
	| { type: "equalizePair"; splitterIndex: number; available: number }
	| { type: "replaceLayout"; panes: readonly PaneDescriptor[] }
	| { type: "resetToDefault" }
	| { type: "reorderPanes"; fromVisibleIndex: number; toVisibleIndex: number };

export interface UseDynamicPanesResult {
	panes: PaneDescriptor[];
	visiblePanes: PaneDescriptor[];
	heights: number[];
	available: number;
	toggleVisible: (id: string) => void;
	addPane: (pane: Omit<PaneDescriptor, "id">) => void;
	removePane: (id: string) => void;
	deletePane: (id: string) => void;
	renamePane: (paneId: string, label: string) => void;
	restorePane: (id: string) => void;
	addSeries: (paneId: string, series: SeriesConfig) => void;
	removeSeries: (paneId: string, seriesType: SeriesTypeId, seriesIndex?: number) => void;
	toggleSeriesVisible: (paneId: string, seriesType: SeriesTypeId, seriesIndex?: number) => void;
	updateSeriesParams: (paneId: string, seriesType: SeriesTypeId, params: Record<string, unknown>, seriesIndex?: number) => void;
	updateSeriesType: (paneId: string, seriesType: SeriesTypeId, seriesIndex?: number) => void;
	updateSeriesYAxis: (paneId: string, seriesType: SeriesTypeId, yAxis: YAxisSide, seriesIndex?: number) => void;
	updateSeriesColor: (paneId: string, seriesType: SeriesTypeId, color: string, seriesIndex?: number) => void;
	updateSeriesLineWidth: (paneId: string, seriesType: SeriesTypeId, lineWidth: number | undefined, seriesIndex?: number) => void;
	updateSeriesSubColor: (paneId: string, seriesType: SeriesTypeId, subKey: string, color: string, seriesIndex?: number) => void;
	updateSeriesSource: (paneId: string, seriesType: SeriesTypeId, sourceType?: "price" | "indicator", sourceId?: string, sourceKey?: string, seriesIndex?: number) => void;
	applyDelta: (splitterIndex: number, deltaY: number) => void;
	equalizePair: (splitterIndex: number) => void;
	replaceLayout: (panes: readonly PaneDescriptor[]) => void;
	resetToDefault: () => void;
	reorderPanes: (fromVisibleIndex: number, toVisibleIndex: number) => void;
	canAddPane: boolean;
}

function createId() {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `pane-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSeriesId(type: SeriesTypeId) {
	return `${type.toLowerCase()}-${createId()}`;
}

function createScaleSlotId(paneId: string, yAxis: YAxisSide) {
	return `${paneId}-${yAxis}`;
}

function cloneSeries(series: readonly SeriesConfig[]): SeriesConfig[] {
	return series.map((item) => ({
		...item,
		// Migrate legacy aliases (BollingerBands → BollingerBand) on every clone so
		// stored layouts, replaceLayout and indicator-set applies self-heal.
		type: normalizeSeriesTypeId(item.type),
		id: item.id ?? createSeriesId(normalizeSeriesTypeId(item.type)),
		params: item.params ? { ...item.params } : undefined,
		lineWidth: typeof item.lineWidth === "number" && Number.isFinite(item.lineWidth) ? item.lineWidth : undefined,
		subColors: item.subColors ? { ...item.subColors } : undefined,
	}));
}

function clonePane(pane: PaneDescriptor): PaneDescriptor {
	return {
		...pane,
		series: cloneSeries(pane.series),
	};
}

function clonePaneList(panes: readonly PaneDescriptor[]): PaneDescriptor[] {
	return panes.map(clonePane);
}

function normalizeDefaultPane(pane: PaneDescriptor, template: PaneDescriptor): PaneDescriptor {
	return {
		...pane,
		label: template.label,
		pinned: template.pinned,
		tooltip: template.tooltip,
	};
}

export function normalizeLoadedPaneLayout(panes: readonly PaneDescriptor[]): PaneDescriptor[] {
	const cloned = clonePaneList(panes);
	const byId = new Map(cloned.map((pane) => [pane.id, pane] as const));
	const defaultPanes = DEFAULT_PANES.map((template) => {
		const stored = byId.get(template.id);
		let pane;
		if (stored) {
			pane = normalizeDefaultPane(stored, template);
		} else {
			pane = clonePane(template);
			pane.visible = false;
		}
		syncSplitScale(pane);
		return pane;
	});
	const customPanes = cloned.filter((pane) => !isDefaultPaneId(pane.id));
	customPanes.forEach(syncSplitScale);
	return normalizeVisibleRatios([...defaultPanes, ...customPanes]);
}

function syncSplitScale(pane: PaneDescriptor): void {
	pane.series.forEach((series) => {
		series.scaleSlotId = createScaleSlotId(pane.id, series.yAxis);
	});
	const activeSeries = pane.series.filter((series) => series.visible !== false);
	pane.splitScale = activeSeries.some((series) => series.yAxis === "left") && activeSeries.some((series) => series.yAxis === "right");
}

function getVisiblePanes(panes: readonly PaneDescriptor[]): PaneDescriptor[] {
	return panes.filter((pane) => pane.visible);
}

function normalizeVisibleRatios(panes: readonly PaneDescriptor[]): PaneDescriptor[] {
	const next = clonePaneList(panes);
	const visible = next.filter((pane) => pane.visible);
	const total = visible.reduce((sum, pane) => sum + pane.heightRatio, 0);

	if (visible.length === 0) {
		return next;
	}

	if (total <= 0) {
		const ratio = 1 / visible.length;
		visible.forEach((pane) => {
			pane.heightRatio = ratio;
		});
		return next;
	}

	visible.forEach((pane) => {
		pane.heightRatio = pane.heightRatio / total;
	});

	return next;
}

function visibleCount(panes: readonly PaneDescriptor[]) {
	return panes.reduce((count, pane) => count + (pane.visible ? 1 : 0), 0);
}

function visibleIndices(panes: readonly PaneDescriptor[]) {
	const indices: number[] = [];
	panes.forEach((pane, index) => {
		if (pane.visible) {
			indices.push(index);
		}
	});
	return indices;
}

function ratiosToHeights(panes: readonly PaneDescriptor[], available: number): number[] {
	return calculatePaneHeights(panes, available);
}

function heightsToRatios(heights: readonly number[]): number[] {
	const total = heights.reduce((sum, value) => sum + value, 0);
	if (total <= 0) {
		return heights.map(() => 1 / heights.length);
	}
	return heights.map((height) => height / total);
}

function validatePane(candidate: unknown): candidate is PaneDescriptor {
	if (!candidate || typeof candidate !== "object") {
		return false;
	}
	const pane = candidate as PaneDescriptor;
	return typeof pane.id === "string"
		&& typeof pane.label === "string"
		&& typeof pane.pinned === "boolean"
		&& typeof pane.visible === "boolean"
		&& typeof pane.heightRatio === "number"
		&& Array.isArray(pane.series)
		&& typeof pane.splitScale === "boolean"
		&& (pane.tooltip === "ohlc" || pane.tooltip === "value" || pane.tooltip === "none");
}

function sanitizeLayout(raw: unknown): PaneDescriptor[] | null {
	if (!raw || typeof raw !== "object") {
		return null;
	}
	const stored = raw as Partial<StoredPaneLayout>;
	if (stored.version !== 1 || !Array.isArray(stored.panes) || stored.panes.length === 0) {
		return null;
	}
	if (!stored.panes.every(validatePane)) {
		return null;
	}
	return normalizeLoadedPaneLayout(stored.panes);
}

function readStoredPaneLayout(storage?: PaneLayoutStorageLike, scopeId?: string | null): PaneDescriptor[] {
	if (!storage) {
		return makeDefaultLayout();
	}

	try {
		const raw = storage.getItem(scopedPaneLayoutKey(scopeId));
		if (!raw) {
			return makeDefaultLayout();
		}
		const parsed = JSON.parse(raw) as unknown;
		const layout = sanitizeLayout(parsed);
		return layout ?? makeDefaultLayout();
	} catch {
		return makeDefaultLayout();
	}
}

function writeStoredPaneLayout(panes: readonly PaneDescriptor[], storage?: PaneLayoutStorageLike, scopeId?: string | null): void {
	if (!storage) {
		return;
	}
	try {
		storage.setItem(scopedPaneLayoutKey(scopeId), JSON.stringify({
			version: 1,
			panes,
		} satisfies StoredPaneLayout));
	} catch {
		// ignore storage quota / sandbox errors
	}
}

function makeDefaultLayout(): PaneDescriptor[] {
	return normalizeLoadedPaneLayout(DEFAULT_PANES);
}

function replacePaneLayout(panes: readonly PaneDescriptor[]): PaneDescriptor[] {
	if (panes.length === 0) {
		return makeDefaultLayout();
	}
	return normalizeLoadedPaneLayout(panes);
}

function mutateVisibleRatio(panes: PaneDescriptor[], visiblePaneIndex: number, nextHeightRatio: number): PaneDescriptor[] {
	const next = clonePaneList(panes);
	const visible = next.filter((pane) => pane.visible);
	const pane = visible[visiblePaneIndex];
	if (!pane) {
		return next;
	}
	const ratio = Math.max(nextHeightRatio, 0);
	pane.heightRatio = ratio;
	return normalizeVisibleRatios(next);
}

function reorderVisiblePanes(panes: readonly PaneDescriptor[], fromVisibleIndex: number, toVisibleIndex: number): PaneDescriptor[] {
	if (fromVisibleIndex === toVisibleIndex) {
		return clonePaneList(panes);
	}

	const next = clonePaneList(panes);
	const visibleSlots = visibleIndices(next);
	if (fromVisibleIndex < 0 || fromVisibleIndex >= visibleSlots.length) {
		return next;
	}
	if (toVisibleIndex < 0 || toVisibleIndex >= visibleSlots.length) {
		return next;
	}
	if (toVisibleIndex === 0 || next[visibleSlots[fromVisibleIndex]]?.pinned) {
		return next;
	}

	const orderedVisible = visibleSlots.map((index) => next[index]);
	const [moved] = orderedVisible.splice(fromVisibleIndex, 1);
	if (!moved) {
		return next;
	}
	orderedVisible.splice(toVisibleIndex, 0, moved);

	let cursor = 0;
	return next.map((pane) => {
		if (!pane.visible) {
			return pane;
		}
		const replacement = orderedVisible[cursor];
		cursor += 1;
		return replacement;
	});
}

function resolveSeriesIndex(series: readonly SeriesConfig[], seriesType: SeriesTypeId, seriesIndex?: number): number {
	if (typeof seriesIndex === "number" && seriesIndex >= 0 && seriesIndex < series.length) {
		return seriesIndex;
	}
	return series.findIndex((item) => item.type === seriesType);
}

export function dynamicPanesReducer(state: readonly PaneDescriptor[], action: DynamicPaneAction): PaneDescriptor[] {
	const maxVisiblePanes = Math.max(1, ("maxVisiblePanes" in action ? action.maxVisiblePanes : undefined) ?? PANE_MAX_VISIBLE);

	switch (action.type) {
		case "toggleVisible": {
			const next = clonePaneList(state);
			const pane = next.find((item) => item.id === action.id);
			if (!pane || pane.pinned) {
				return next;
			}
			if (pane.visible && visibleCount(next) === 1) {
				return next;
			}
			if (pane.visible) {
				pane.visible = false;
			} else {
				if (visibleCount(next) >= maxVisiblePanes) {
					return next;
				}
				pane.visible = true;
			}
			return normalizeVisibleRatios(next);
		}
		case "addPane": {
			const next = clonePaneList(state);
			if (visibleCount(next) >= maxVisiblePanes) {
				return next;
			}
			const pane: PaneDescriptor = {
				...action.pane,
				id: createId(),
				series: cloneSeries(action.pane.series),
			};
			syncSplitScale(pane);
			next.push(pane);
			return normalizeVisibleRatios(next);
		}
		case "removePane": {
			const next = clonePaneList(state);
			const pane = next.find((item) => item.id === action.id);
			if (!pane || pane.pinned || isDefaultPaneId(pane.id)) {
				return next;
			}
			if (pane.visible && visibleCount(next) === 1) {
				return next;
			}
			// Soft-delete: hide the pane so it can be restored from the Panes menu
			pane.visible = false;
			return normalizeVisibleRatios(next);
		}
		case "deletePane": {
			const next = clonePaneList(state);
			const pane = next.find((item) => item.id === action.id);
			if (!pane || pane.pinned || isDefaultPaneId(pane.id)) {
				return next;
			}
			if (pane.visible && visibleCount(next) === 1) {
				return next;
			}
			return normalizeVisibleRatios(next.filter((item) => item.id !== action.id));
		}
		case "renamePane": {
			const next = clonePaneList(state);
			const pane = next.find((item) => item.id === action.paneId);
			if (!pane || pane.pinned || isDefaultPaneId(pane.id)) {
				return next;
			}
			const nextLabel = action.label.trim();
			if (nextLabel.length === 0 || nextLabel === pane.label) {
				return next;
			}
			pane.label = nextLabel;
			return next;
		}
		case "restorePane": {
			const next = clonePaneList(state);
			if (visibleCount(next) >= maxVisiblePanes) {
				return next;
			}
			const pane = next.find((item) => item.id === action.id);
			if (!pane) {
				return next;
			}
			pane.visible = true;
			// Restore all series visibility when restoring a pane
			pane.series.forEach((s) => { s.visible = true; });
			syncSplitScale(pane);
			return normalizeVisibleRatios(next);
		}
		case "addSeries": {
			const next = clonePaneList(state);
			const pane = next.find((item) => item.id === action.paneId);
			if (!pane) {
				return next;
			}
			if (!pane.visible) {
				if (visibleCount(next) >= maxVisiblePanes) {
					return next;
				}
				pane.visible = true;
			}
			pane.series.push({
				...action.series,
				type: normalizeSeriesTypeId(action.series.type),
				id: action.series.id ?? createSeriesId(normalizeSeriesTypeId(action.series.type)),
				params: action.series.params ? { ...action.series.params } : undefined,
			});
			syncSplitScale(pane);
			return normalizeVisibleRatios(next);
		}
		case "removeSeries": {
			const next = clonePaneList(state);
			const pane = next.find((item) => item.id === action.paneId);
			if (!pane) {
				return next;
			}
			const seriesIndex = resolveSeriesIndex(pane.series, action.seriesType, action.seriesIndex);
			if (seriesIndex < 0) {
				return next;
			}
			pane.series = pane.series.filter((_, index) => index !== seriesIndex);
			if (!pane.pinned) {
				const anyVisible = pane.series.some((series) => series.visible !== false);
				if (!anyVisible && pane.visible && visibleCount(next) > 1) {
					pane.visible = false;
				}
			}
			syncSplitScale(pane);
			return normalizeVisibleRatios(next);
		}
		case "applyDelta": {
			const next = clonePaneList(state);
			const visible = getVisiblePanes(next);
			const topPane = visible[action.splitterIndex];
			const bottomPane = visible[action.splitterIndex + 1];
			if (!topPane || !bottomPane) {
				return next;
			}
			const visibleSumMin = visible.reduce((sum, p) => sum + getPaneMinHeight(p), 0);
			const available = Math.max(action.available, visibleSumMin);
			const heights = ratiosToHeights(visible, available);
			const updatedHeights = applySplitterDelta(heights, action.splitterIndex, action.deltaY, visible);
			const updated = clonePaneList(next);
			let visibleCursor = 0;
			updated.forEach((pane) => {
				if (!pane.visible) {
					return;
				}
				pane.heightRatio = updatedHeights[visibleCursor] / available;
				visibleCursor += 1;
			});
			return normalizeVisibleRatios(updated);
		}
		case "equalizePair": {
			const next = clonePaneList(state);
			const visible = getVisiblePanes(next);
			if (action.splitterIndex < 0 || action.splitterIndex + 1 >= visible.length) {
				return next;
			}
			const visibleSumMin = visible.reduce((sum, p) => sum + getPaneMinHeight(p), 0);
			const available = Math.max(action.available, visibleSumMin);
			const heights = ratiosToHeights(visible, available);
			const updatedHeights = equalizePairHeights(heights, action.splitterIndex, visible);
			const updated = clonePaneList(next);
			let visibleCursor = 0;
			updated.forEach((pane) => {
				if (!pane.visible) {
					return;
				}
				pane.heightRatio = updatedHeights[visibleCursor] / available;
				visibleCursor += 1;
			});
			return normalizeVisibleRatios(updated);
		}
		case "resetToDefault":
			return makeDefaultLayout();
		case "replaceLayout":
			return replacePaneLayout(action.panes);
		case "reorderPanes":
			return reorderVisiblePanes(state, action.fromVisibleIndex, action.toVisibleIndex);
		case "toggleSeriesVisible": {
			const next = clonePaneList(state);
			const pane = next.find((p) => p.id === action.paneId);
			if (!pane) return next;
			const seriesIndex = resolveSeriesIndex(pane.series, action.seriesType, action.seriesIndex);
			const series = pane.series[seriesIndex];
			if (!series) return next;
			// Toggle: false → true, undefined/true → false
			series.visible = series.visible === false ? true : false;
			if (series.visible === true && !pane.visible) {
				if (visibleCount(next) >= maxVisiblePanes) {
					return next;
				}
				pane.visible = true;
			}
			// AD-2: auto-hide non-pinned pane when all its series are hidden
			if (!pane.pinned) {
				const anyVisible = pane.series.some((s) => s.visible !== false);
				if (!anyVisible && pane.visible && visibleCount(next) > 1) {
					pane.visible = false;
				}
			}
			syncSplitScale(pane);
			return normalizeVisibleRatios(next);
		}
		case "updateSeriesParams": {
			const next = clonePaneList(state);
			const pane = next.find((p) => p.id === action.paneId);
			if (!pane) return next;
			const seriesIndex = resolveSeriesIndex(pane.series, action.seriesType, action.seriesIndex);
			const series = pane.series[seriesIndex];
			if (!series) return next;
			series.params = { ...(series.params ?? {}), ...action.params };
			syncSplitScale(pane);
			return normalizeVisibleRatios(next);
		}
		case "updateSeriesType": {
			const next = clonePaneList(state);
			const pane = next.find((p) => p.id === action.paneId);
			if (!pane) return next;
			const seriesIndex = resolveSeriesIndex(pane.series, action.seriesType, action.seriesIndex);
			if (seriesIndex < 0) return next;
			const series = pane.series[seriesIndex];
			if (!series) return next;
			series.type = action.seriesType;
			syncSplitScale(pane);
			return normalizeVisibleRatios(next);
		}
		case "updateSeriesYAxis": {
			const next = clonePaneList(state);
			const pane = next.find((p) => p.id === action.paneId);
			if (!pane) return next;
			const seriesIndex = resolveSeriesIndex(pane.series, action.seriesType, action.seriesIndex);
			const series = pane.series[seriesIndex];
			if (!series) return next;
			series.yAxis = action.yAxis;
			syncSplitScale(pane);
			return normalizeVisibleRatios(next);
		}
		case "updateSeriesColor": {
			const next = clonePaneList(state);
			const pane = next.find((p) => p.id === action.paneId);
			if (!pane) return next;
			const seriesIndex = resolveSeriesIndex(pane.series, action.seriesType, action.seriesIndex);
			const series = pane.series[seriesIndex];
			if (!series) return next;
			series.color = action.color || undefined;
			return next;
		}
		case "updateSeriesLineWidth": {
			const next = clonePaneList(state);
			const pane = next.find((p) => p.id === action.paneId);
			if (!pane) return next;
			const seriesIndex = resolveSeriesIndex(pane.series, action.seriesType, action.seriesIndex);
			const series = pane.series[seriesIndex];
			if (!series) return next;
			series.lineWidth = typeof action.lineWidth === "number" && Number.isFinite(action.lineWidth)
				? Math.max(1, action.lineWidth)
				: undefined;
			return next;
		}
		case "updateSeriesSource": {
			const next = clonePaneList(state);
			const pane = next.find((p) => p.id === action.paneId);
			if (!pane) return next;
			const seriesIndex = resolveSeriesIndex(pane.series, action.seriesType, action.seriesIndex);
			const series = pane.series[seriesIndex];
			if (!series) return next;
			series.sourceType = action.sourceType;
			series.sourceId = action.sourceId;
			series.sourceKey = action.sourceKey;
			syncSplitScale(pane);
			return normalizeVisibleRatios(next);
		}
		case "updateSeriesSubColor": {
			const next = clonePaneList(state);
			const pane = next.find((p) => p.id === action.paneId);
			if (!pane) return next;
			const seriesIndex = resolveSeriesIndex(pane.series, action.seriesType, action.seriesIndex);
			const series = pane.series[seriesIndex];
			if (!series) return next;
			series.subColors = { ...(series.subColors ?? {}), [action.subKey]: action.color };
			return next;
		}
		default:
			return clonePaneList(state);
	}
}

export function createDefaultPaneLayout(): PaneDescriptor[] {
	return makeDefaultLayout();
}

export function loadPaneLayout(storage?: PaneLayoutStorageLike, scopeId?: string | null): PaneDescriptor[] {
	return readStoredPaneLayout(storage, scopeId);
}

export function savePaneLayout(panes: readonly PaneDescriptor[], storage?: PaneLayoutStorageLike, scopeId?: string | null): void {
	writeStoredPaneLayout(panes, storage, scopeId);
}

export function useDynamicPanes(totalHeight: number, options: UseDynamicPanesOptions = {}): UseDynamicPanesResult {
	const isTestEnv = typeof globalThis !== "undefined" && (
		(globalThis as any).vi !== undefined ||
		(globalThis as any).describe !== undefined ||
		(globalThis as any).process?.env?.NODE_ENV === "test"
	);
	const [internalPanes, internalDispatch] = useReducer(
		dynamicPanesReducer,
		undefined,
		() => loadPaneLayout(typeof localStorage !== "undefined" && !isTestEnv ? localStorage : undefined, options.storageScopeId)
	);

	const panes = options.panesOverride ?? internalPanes;
	const dispatch = options.dispatchOverride ?? internalDispatch;

	const maxVisiblePanes = Math.max(1, options.maxVisiblePanes ?? PANE_MAX_VISIBLE);

	const available = useMemo(() => {
		const visiblePanesList = panes.filter((pane) => pane.visible);
		const sumMin = visiblePanesList.reduce((sum, p) => sum + getPaneMinHeight(p), 0);
		return Math.max(totalHeight - FRAME_VERTICAL_MARGIN, sumMin);
	}, [panes, totalHeight]);

	const visiblePanes = useMemo(() => getVisiblePanes(panes), [panes]);
	const heights = useMemo(() => ratiosToHeights(panes, available), [panes, available]);

	useEffect(() => {
		savePaneLayout(panes, typeof localStorage !== "undefined" && !isTestEnv ? localStorage : undefined, options.storageScopeId);
	}, [panes, isTestEnv, options.storageScopeId]);

	const toggleVisible = useCallback((id: string) => {
		dispatch({ type: "toggleVisible", id, maxVisiblePanes });
	}, [maxVisiblePanes]);

	const addPane = useCallback((pane: Omit<PaneDescriptor, "id">) => {
		dispatch({ type: "addPane", pane, maxVisiblePanes });
	}, [maxVisiblePanes]);

	const removePane = useCallback((id: string) => {
		dispatch({ type: "removePane", id });
	}, []);

	const deletePane = useCallback((id: string) => {
		dispatch({ type: "deletePane", id });
	}, []);

	const renamePane = useCallback((paneId: string, label: string) => {
		dispatch({ type: "renamePane", paneId, label });
	}, []);

	const restorePane = useCallback((id: string) => {
		dispatch({ type: "restorePane", id, maxVisiblePanes });
	}, [maxVisiblePanes]);

	const addSeries = useCallback((paneId: string, series: SeriesConfig) => {
		dispatch({ type: "addSeries", paneId, series, maxVisiblePanes });
	}, [maxVisiblePanes]);

	const removeSeries = useCallback((paneId: string, seriesType: SeriesTypeId, seriesIndex?: number) => {
		dispatch({ type: "removeSeries", paneId, seriesType, seriesIndex });
	}, []);

	const applyDelta = useCallback((splitterIndex: number, deltaY: number) => {
		dispatch({ type: "applyDelta", splitterIndex, deltaY, available });
	}, [available]);

	const equalizePair = useCallback((splitterIndex: number) => {
		dispatch({ type: "equalizePair", splitterIndex, available });
	}, [available]);

	const replaceLayout = useCallback((panes: readonly PaneDescriptor[]) => {
		dispatch({ type: "replaceLayout", panes });
	}, []);

	const resetToDefault = useCallback(() => {
		try {
			if (typeof localStorage !== "undefined") {
				localStorage.removeItem(scopedPaneLayoutKey(options.storageScopeId));
			}
		} catch {
			// ignore storage errors
		}
		dispatch({ type: "resetToDefault" });
	}, [options.storageScopeId]);

	const reorderPanes = useCallback((fromVisibleIndex: number, toVisibleIndex: number) => {
		dispatch({ type: "reorderPanes", fromVisibleIndex, toVisibleIndex });
	}, []);

	const toggleSeriesVisible = useCallback((paneId: string, seriesType: SeriesTypeId, seriesIndex?: number) => {
		dispatch({ type: "toggleSeriesVisible", paneId, seriesType, seriesIndex, maxVisiblePanes });
	}, [maxVisiblePanes]);

	const updateSeriesParams = useCallback((paneId: string, seriesType: SeriesTypeId, params: Record<string, unknown>, seriesIndex?: number) => {
		dispatch({ type: "updateSeriesParams", paneId, seriesType, params, seriesIndex });
	}, []);

	const updateSeriesYAxis = useCallback((paneId: string, seriesType: SeriesTypeId, yAxis: YAxisSide, seriesIndex?: number) => {
		dispatch({ type: "updateSeriesYAxis", paneId, seriesType, yAxis, seriesIndex });
	}, []);

	const updateSeriesColor = useCallback((paneId: string, seriesType: SeriesTypeId, color: string, seriesIndex?: number) => {
		dispatch({ type: "updateSeriesColor", paneId, seriesType, color, seriesIndex });
	}, []);

	const updateSeriesLineWidth = useCallback((paneId: string, seriesType: SeriesTypeId, lineWidth: number | undefined, seriesIndex?: number) => {
		dispatch({ type: "updateSeriesLineWidth", paneId, seriesType, lineWidth, seriesIndex });
	}, []);

	const updateSeriesSubColor = useCallback((paneId: string, seriesType: SeriesTypeId, subKey: string, color: string, seriesIndex?: number) => {
		dispatch({ type: "updateSeriesSubColor", paneId, seriesType, subKey, color, seriesIndex });
	}, []);

	const updateSeriesType = useCallback((paneId: string, seriesType: SeriesTypeId, seriesIndex?: number) => {
		dispatch({ type: "updateSeriesType", paneId, seriesType, seriesIndex });
	}, []);

	const updateSeriesSource = useCallback((paneId: string, seriesType: SeriesTypeId, sourceType?: "price" | "indicator", sourceId?: string, sourceKey?: string, seriesIndex?: number) => {
		dispatch({ type: "updateSeriesSource", paneId, seriesType, sourceType, sourceId, sourceKey, seriesIndex });
	}, []);

	return {
		panes: panes as PaneDescriptor[],
		visiblePanes: visiblePanes as PaneDescriptor[],
		heights,
		available,
		toggleVisible,
		addPane,
		removePane,
		deletePane,
		renamePane,
		restorePane,
		addSeries,
		removeSeries,
		toggleSeriesVisible,
		updateSeriesParams,
		updateSeriesYAxis,
		updateSeriesColor,
		updateSeriesLineWidth,
		updateSeriesSubColor,
		updateSeriesType,
		updateSeriesSource,
		applyDelta,
		equalizePair,
		replaceLayout,
		resetToDefault,
		reorderPanes,
		canAddPane: visiblePanes.length < maxVisiblePanes,
	};
}
