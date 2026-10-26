import type { VNInvestMultiChartsRef } from "./VNInvestMultiCharts.types";
import type { WidgetChartHandle } from "./utils/widgetHelpers";

/**
 * REL-04: adapter exposing single-chart-style imperative methods for the IIFE
 * multi-workspace build.
 *
 * Why this exists: `iife-entry.ts` mounts `VNInvestMultiCharts`, whose real ref
 * (`VNInvestMultiChartsRef`) only exposes chart-management/layout/sync methods.
 * The previous `WidgetInstance` interface advertised `setSymbol`, `exportDrawings`,
 * … which no ref ever implemented, so every documented call was a no-op or a
 * TypeError. This adapter maps the documented names onto the real ref.
 *
 * Semantics (see RELEASE_DECISION_RECORD_2026-09-25 §D-03):
 * every single-chart method targets the ACTIVE chart. Symbol/timeframe changes
 * only propagate to linked charts when the workspace sync flag is enabled —
 * the adapter passes no `sourceChartId`, so the engine's own sync layer decides.
 */
export interface WidgetInstance {
	cleanupObjectUrls?: () => void;
	cleanupGlobalListeners?: () => void;

	/** Active chart targeting (canonical names). */
	setActiveSymbol: (symbol: string) => void;
	setActiveTimeframe: (timeframe: string) => void;
	setActiveVisibleRange: (range: { from: number; to: number }) => void;
	getActiveVisibleRange: () => ReturnType<WidgetChartHandle["getVisibleRange"]> | null;
	getActivePaneSnapshots: () => readonly unknown[];
	exportActiveDrawings: () => readonly unknown[];
	importActiveDrawings: (drawings: never[]) => void;
	saveActiveChartImage: () => void;
	toggleFullscreen: () => void;
	setTheme: (mode: "light" | "dark") => void;

	/** Workspace-level (real `VNInvestMultiChartsRef` methods). */
	setLayout: VNInvestMultiChartsRef["setLayout"];
	getLayout: VNInvestMultiChartsRef["getLayout"];
	setActiveChart: VNInvestMultiChartsRef["setActiveChart"];
	getActiveChart: VNInvestMultiChartsRef["getActiveChart"];
	getChartHandle: VNInvestMultiChartsRef["getChartHandle"];
	getAllChartHandles: VNInvestMultiChartsRef["getAllChartHandles"];

	/** @deprecated Use the `*Active*` names above. Kept for one release. */
	setSymbol?: (symbol: string) => void;
	setTimeframe?: (timeframe: string) => void;
	setVisibleRange?: (range: { from: number; to: number }) => void;
	exportDrawings?: () => readonly unknown[];
	importDrawings?: (drawings: never[]) => void;
	getVisibleRange?: () => ReturnType<WidgetChartHandle["getVisibleRange"]> | null;
	getPaneSnapshots?: () => readonly unknown[];
	saveAsImage?: () => void;
}

type ActiveHandle = WidgetChartHandle & {
	setSymbol?: (symbol: string) => void;
	setTheme?: (mode: "light" | "dark") => void;
	exportDrawings?: () => readonly unknown[];
	importDrawings?: (drawings: never[]) => void;
	getPaneSnapshots?: () => readonly unknown[];
	saveAsImage?: () => void;
	toggleFullscreen?: () => void;
};

function getActiveHandle(ref: VNInvestMultiChartsRef | null): ActiveHandle | null {
	if (!ref) return null;
	const activeId = ref.getActiveChart();
	if (!activeId) return (ref.getAllChartHandles()[0] as ActiveHandle | undefined) ?? null;
	return (ref.getChartHandle(activeId) as ActiveHandle | undefined) ?? null;
}

const noopIfMissing = <A extends unknown[]>(fn: ((...args: A) => void) | undefined) =>
	function (this: unknown, ...args: A) {
		if (typeof fn === "function") fn.apply(this, args);
	};

/**
 * Build the IIFE `WidgetInstance` from the live multi ref.
 * Safe to call with `null` (React ref before mount) — methods become no-ops that
 * throw nothing, so a host calling too early degrades instead of crashing.
 */
export function createWidgetInstance(
	ref: () => VNInvestMultiChartsRef | null
): WidgetInstance {
	const withActive = <R>(fn: (handle: ActiveHandle) => R, fallback: R): (() => R) =>
		function () {
			const handle = getActiveHandle(ref());
			return handle ? fn(handle) : fallback;
		};

	const instance: WidgetInstance = {
		setActiveSymbol: (symbol: string) => {
			const h = getActiveHandle(ref());
			h?.setSymbol?.(symbol);
		},
		setActiveTimeframe: (timeframe: string) => {
			const h = getActiveHandle(ref());
			if (h) h.setTimeframe(timeframe);
		},
		setActiveVisibleRange: (range) => {
			const h = getActiveHandle(ref());
			if (h) h.setVisibleRange(range as unknown as Parameters<WidgetChartHandle["setVisibleRange"]>[0]);
		},
		getActiveVisibleRange: withActive((h) => h.getVisibleRange?.() ?? null, null),
		getActivePaneSnapshots: withActive((h) => h.getPaneSnapshots?.() ?? [], [] as readonly unknown[]),
		exportActiveDrawings: withActive((h) => h.exportDrawings?.() ?? [], [] as readonly unknown[]),
		importActiveDrawings: (drawings) => {
			const h = getActiveHandle(ref());
			h?.importDrawings?.(drawings);
		},
		saveActiveChartImage: () => {
			getActiveHandle(ref())?.saveAsImage?.();
		},
		toggleFullscreen: () => {
			getActiveHandle(ref())?.toggleFullscreen?.();
		},
		setTheme: (mode) => {
			const h = getActiveHandle(ref());
			h?.setTheme?.(mode);
		},

		setLayout: (layout) => ref()?.setLayout(layout),
		getLayout: () => {
			const r = ref();
			return r ? r.getLayout() : ({ rows: 1, cols: 1 } as ReturnType<VNInvestMultiChartsRef["getLayout"]>);
		},
		setActiveChart: (chartId) => ref()?.setActiveChart(chartId),
		getActiveChart: () => ref()?.getActiveChart() ?? null,
		getChartHandle: (chartId) => ref()?.getChartHandle(chartId),
		getAllChartHandles: () => ref()?.getAllChartHandles() ?? [],
	};

	// Deprecated single-release aliases (D-03).
	instance.setSymbol = noopIfMissing(instance.setActiveSymbol as never);
	instance.setTimeframe = noopIfMissing(instance.setActiveTimeframe as never);
	instance.setVisibleRange = noopIfMissing(instance.setActiveVisibleRange as never);
	instance.exportDrawings = instance.exportActiveDrawings;
	instance.importDrawings = instance.importActiveDrawings;
	instance.getVisibleRange = instance.getActiveVisibleRange;
	instance.getPaneSnapshots = instance.getActivePaneSnapshots;
	instance.saveAsImage = instance.saveActiveChartImage;

	return instance;
}
