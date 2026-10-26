import type { EnrichedDatum } from "../../../lib/core/calculators/types";
import type { SeriesConfig } from "../../../lib/core/types/pane-descriptor";
import { resolveSeriesValue } from "../../../lib/core/seriesValueResolver";
import { priceFormat } from "../../utils/widgetHelpers";
import { formatPrice } from "../../utils/numberFormat";
import type { WidgetPaneRuntimeSnapshot } from "../../utils/widgetHelpers";

export interface LegendSeriesValue {
	text: string;
	color?: string;
}

export function buildLegendSeriesValue(
	datum: EnrichedDatum,
	series: SeriesConfig | undefined,
): LegendSeriesValue | undefined {
	if (!series) return undefined;
	const value = resolveSeriesValue(datum, series);
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	if (series.type === "Volume") {
		const up = datum.close >= datum.open;
		return {
			text: formatPrice(value),
			color: up ? "var(--vnsc-up, #0ecb81)" : "var(--vnsc-down, #f23645)",
		};
	}
	return { text: priceFormat(value), color: series.color };
}

export function resolveLeftAxisWidth(
	axisBounds: WidgetPaneRuntimeSnapshot["axisBounds"] | undefined,
): number {
	return axisBounds?.left?.width ?? 0;
}

/**
 * Global left-gutter offset for pane headers (VOL_FIX).
 * Engine `PaneLayoutEngine.layout` shifts `plotBounds` globally as soon as ANY
 * pane owns a left slot, but `axisBounds.left` stays per-pane — so a Vol pane
 * without a left series reports width 0 while its plot area is still pushed
 * right by the global gutter. Headers must therefore use the max left width
 * across ALL visible pane snapshots, matching the plot shift; otherwise the
 * Vol header sits inside the left-axis zone and slides under the docked
 * drawing toolbar (left:0, z-60 above pane wraps z-40).
 */
/**
 * Gap between a pane header (label/chips/actions) and the Y-axis gutters.
 * Headers must sit just OUTSIDE the axes — hugging them with a small uniform
 * clearance — never floating deep inside the plot area.
 */
export const PANE_HEADER_AXIS_GAP_PX = 4;

/**
 * Horizontal room the docked (locked) drawing rail reserves inside the chart
 * column (`VNInvestCharts` chart-column `marginLeft`). Must stay in sync with
 * that margin — the pane-chrome overlay layer is anchored at the OUTER
 * container origin while the engine measures the INNER (margined) box.
 */
export const DOCKED_TOOLBAR_OFFSET_PX = 44;

/**
 * Grip-strip width of the auto-hide drawing rail
 * (`.vnsc-drawing-toolbar-shell`, toolbar.css). The rail overlays content on
 * hover — only this strip needs permanent clearance, not the full 44px.
 */
export const RAIL_GRIP_PX = 10;

/**
 * True when a left Y axis is actually rendered. Live snapshots win (the
 * engine's reconcileEmptyLeftAxis can drop an empty gutter); pane
 * descriptors are the pre-first-paint fallback.
 */
export function resolveHasLeftAxis(
	snapshots: Iterable<WidgetPaneRuntimeSnapshot | undefined> | undefined,
	panes: readonly { series?: readonly { visible?: boolean; yAxis?: string }[] }[] | undefined,
): boolean {
	if (snapshots) {
		const list = [...snapshots].filter((s) => !!s);
		if (list.length > 0) return list.some((s) => !!s?.axisBounds?.left);
	}
	return (panes ?? []).some((pane) =>
		(pane.series ?? []).some((s) => s?.visible !== false && s?.yAxis === "left"),
	);
}

/**
 * Single source of truth for the chart-column left reserve. Mirrors the
 * `marginLeft` on the VNInvestCharts chart column: full 44px only while the
 * rail is locked (docked); zero with no rail. While auto-hiding, the 10px
 * grip strip needs clearance ONLY when no left axis exists — with a 48px
 * left gutter (compare/RSI mode) the grip overlays the gutter itself, so the
 * frame stays perfectly symmetric (48 left == 48 right). Both the column
 * margin and the outer-layer `dockOffset` must use this.
 */
export function resolveRailReservePx(
	showToolbar: boolean | undefined,
	toolbarLocked: boolean | undefined,
	hasLeftAxis = false,
): number {
	if (!showToolbar) return 0;
	if (toolbarLocked) return DOCKED_TOOLBAR_OFFSET_PX;
	return hasLeftAxis ? 0 : RAIL_GRIP_PX;
}

export function resolveGlobalLeftAxisWidth(
	snapshots: Iterable<WidgetPaneRuntimeSnapshot | undefined> | undefined,
): number {
	if (!snapshots) return 0;
	let max = 0;
	for (const snapshot of snapshots) {
		const width = resolveLeftAxisWidth(snapshot?.axisBounds);
		if (width > max) max = width;
	}
	return max;
}
