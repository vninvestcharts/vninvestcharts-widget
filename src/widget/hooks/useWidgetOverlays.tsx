import React, { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useMultiSelectActions } from "./overlays/useMultiSelectActions";
import { type PaneDescriptor, type SeriesTier, IndicatorLegend, ChartSplitter } from "../../lib/core";
import type { SeriesConfig, SeriesTypeId } from "../../lib/core/types/pane-descriptor";
import { calculateSplitterBounds } from "../../lib/core/hooks/paneSizingHelpers";
import type { SettingsModalProps } from "../components/settings/SettingsModal";
import { type DrawingObject, createDrawingSelectionToolbarModel, resolveDrawingSelectionToolbarPosition, type DrawingSelectionToolbarLabels, type DrawingSelectionToolbarActionId } from "@vninvestcharts/engine-drawing";
import { type DrawingWorkspaceController, type DrawingDockTab, FloatingSelectionToolbar } from "@vninvestcharts/engine-react";
import { isTypingTarget } from "@vninvestcharts/engine-drawing";
import { type WidgetPaneRuntimeSnapshot } from "../utils/widgetHelpers";
import { type WidgetTimezone } from "../../lib/utils/timezoneFormatter";
import { type EnrichedDatum } from "../../lib/core/calculators/types";
import { SettingsModal } from "../components/settings/SettingsModal";
import { SnapshotPreviewModal } from "../components/settings/SnapshotPreviewModal";
import DrawingInspector from "../components/drawing/DrawingInspector";
import FloatingDrawingInspector from "../components/drawing/FloatingDrawingInspector";
import InlineTextEditor from "../components/drawing/InlineTextEditor";
import DrawingListPanel from "../components/drawing/DrawingListPanel";
import TemplateManagerPanel from "../components/drawing/TemplateManagerPanel";
import { AdvisoryPanel } from "../../lib/advisory/AdvisoryPanel";
import { TapePanel } from "../../lib/tape/TapePanel";
import type { PortalAdapter, StorageAdapter } from "@vninvestcharts/engine-react";
import { PaneHeaderWithPickerWrapper } from "./overlays/PaneHeaderWrapper";
import { buildLegendSeriesValue, PANE_HEADER_AXIS_GAP_PX, resolveGlobalLeftAxisWidth, resolveHasLeftAxis, resolveLeftAxisWidth, resolveRailReservePx, type LegendSeriesValue } from "./overlays/overlayHelpers";

import { useLegendChrome, useCompareLegendNode } from "./overlays/useLegendChrome";
import { useDrawingDockNode } from "./overlays/useDrawingDockNode";
import { buildDockObjectsContent, buildDockPropertiesContent, buildDockTemplatesContent } from "../components/dock/drawingDockContentBuilders";

export { buildLegendSeriesValue, resolveGlobalLeftAxisWidth, resolveLeftAxisWidth };
export type { LegendSeriesValue };

/** BL-14 group 1/3: pane structure, sizing, splitters and pane chrome. */
export interface OverlaysPaneOptions {
	useForkRuntime: boolean;
	visiblePanes: readonly PaneDescriptor[];
	paneSnapshotMap: Map<string, WidgetPaneRuntimeSnapshot>;
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	size: { width: number; height: number };
	hoveredPaneId: string | null;
	claimForkPointerOwner: (owner: any) => void;
	releaseForkPointerOwner: (owner: any) => void;
	handlePaneToggleVisible: (paneId: string) => void;
	handlePaneRemove: (paneId: string) => void;
	handlePaneAddSeries: (paneId: string) => void;
	handlePaneEditSeries: (paneId: string) => void;
	handlePaneToggleSeries: (paneId: string, seriesType: any, seriesIndex?: number) => void;
	handlePaneRemoveSeries: (paneId: string, seriesType: any, seriesIndex?: number) => void;
	localizePane: (pane: PaneDescriptor) => PaneDescriptor;
	localAvailable: number;
	localHeights: number[];
	localApplyDelta: (splitterIndex: number, delta: number) => void;
	localEqualizePair?: (splitterIndex: number) => void;
	localResetToDefault: () => void;
	renderPaneToolbar?: any;
	renderPaneSplitter?: any;
	renderDrawingChrome?: any;
	/** True while the drawing rail is docked (chart column carries the dock margin). */
	toolbarLocked?: boolean;
	showToolbar?: boolean;
}

/** BL-14 group 2/3: drawing workspace, selection and drawing dock. */
export interface OverlaysDrawingOptions {
	drawingWorkspace: DrawingWorkspaceController;
	resolvedSelectedDrawing: DrawingObject | null;
	resolvedLegacyVisibleRange: any;
	effectiveForkVisibleRange: any;
	magnetSensitivity: any;
	isDark: boolean;
	plotData: readonly EnrichedDatum[];
	visibleDomainRef: React.MutableRefObject<[Date, Date] | null>;
	cloneSelectedDrawing: () => void;
	toggleSelectedLock: () => void;
	handleStartTextEdit: (draft: string) => void;
	isEditingText: boolean;
	drawingTextDraft: string;
	setDrawingTextDraft: (value: string) => void;
	handleCommitTextEdit: (commitCallback: (draft: string) => void) => void;
	handleCancelTextEdit: () => void;
	bringSelectedToFront: () => void;
	sendSelectedToBack: () => void;
	showDrawingDock?: boolean;
	renderDrawingDock?: any;
	defaultDrawingDockTab?: DrawingDockTab;
}

/** BL-14 group 3/3: settings, dock panels, legend, chart chrome and callbacks. */
export interface OverlaysSettingsOptions {
	activeSettingsOpen: boolean;
	activeOnSettingsClose: () => void;
	dataAdapterName?: string;
	onDataAdapterChange?: any;
	localSelectedPaneId: string;
	setLocalSelectedPaneId: (id: string) => void;
	activeMaxVisiblePanes: number;
	setLocalMaxVisiblePanes: (n: number) => void;
	activeMaxVisibleBars: number;
	setLocalMaxVisibleBars: (n: number) => void;
	activeShowNonTradingDays: boolean;
	setLocalShowNonTradingDays: (b: boolean) => void;
	activeShowDrawingPriceMarkers: boolean;
	setLocalShowDrawingPriceMarkers: (b: boolean) => void;
	activeEnableWhale: boolean;
	setLocalEnableWhale: (b: boolean) => void;
	activeWhaleThreshold: number;
	setLocalWhaleThreshold: (n: number) => void;
	activeEnableCVD: boolean;
	setLocalEnableCVD: (b: boolean) => void;
	activeCvdMode: "oscillator" | "histogram";
	setLocalCvdMode: (m: "oscillator" | "histogram") => void;
	themeState: any;
	activeTimezone: WidgetTimezone;
	setLocalTimezone: (tz: WidgetTimezone) => void;
	onTimezoneChange?: (tz: WidgetTimezone) => void;
	activeAlertAudioEnabled: boolean;
	setLocalAlertAudioEnabled: (b: boolean) => void;
	previewImageDataUrl: string | null;
	setPreviewImageDataUrl: (url: string | null) => void;
	renderSettings?: any;
	renderPaperTradePanel?: any;
	/**
	 * D2: explicit dock switch. `true` forces the sidebar open (watchlist /
	 * dataWindow alone suffice); `false` forces closed; `undefined` keeps the
	 * legacy behavior (open when drawing/paperTrade/advisory/tape present).
	 */
	showAdvisoryPanel?: boolean;
	advisoryResult?: any;
	isAdvisoryLoading?: boolean;
	onAdvisoryRefresh?: () => void;
	showTapePanel?: boolean;
	tapeEntries?: readonly any[];
	isTapeLoading?: boolean;
	tapeFilterBillions?: number;
	onTapeFilterChange?: (b: number) => void;
	onPaperTradePanelClose?: () => void;
	showDrawingPriceMarkers: boolean;
	resolvedForkPriceMarkerSelection: DrawingObject | null;
	t: (key: string, options?: any) => string;
	onDrawingsChange?: any;
	showTimeScrollbar?: boolean;
	onShowTimeScrollbarChange?: (next: boolean) => void;
	overlayTimeframe?: string;
	comparisonOverlays?: SettingsModalProps["comparisonOverlays"];
	onComparisonRemove?: SettingsModalProps["onComparisonRemove"];
	onComparisonUpdate?: SettingsModalProps["onComparisonUpdate"];
	setOverlayTimeframe: (tf: string | undefined) => void;
	overlayStyle: "hollow" | "step" | "area" | "candle";
	setOverlayStyle: (style: "hollow" | "step" | "area" | "candle") => void;
	onExportLayout?: () => void;
	onImportLayout?: (layoutJson: string) => void;
	portalAdapter?: PortalAdapter;
	storageAdapter?: StorageAdapter;
	themePreset?: string;
	chartId?: string;
	/** Locked-at-open header context (from own chart props, never ambient active). */
	symbol?: string;
	/** Locked-at-open header context (from own chart props). */
	timeframe?: string;
	/** S3b-2: tier gate cho composer thêm series (undefined = không gate, legacy). */
	seriesTier?: SeriesTier;
	/** Optional callback returning a suffix (e.g. "+2.34%") for an indicator legend chip by pane and series index. */
	legendSeriesSuffix?: (paneId: string, seriesIndex: number) => string | undefined;
	/** UI-P3: hovered (or last-bar fallback) datum used for legend live values. Fork runtime; undefined hides values. */
	hoveredDatum?: EnrichedDatum | null;
	/**
	 * If provided, use these panes for IndicatorLegend rendering instead of visiblePanes.
	 * This allows showing comparison overlays that were injected into the pane series
	 * (e.g. via resolvedPanes in VNInvestCharts.tsx).
	 */
	legendPanes?: readonly PaneDescriptor[];
	/** Directly add a series to a pane (bypass SettingsModal) via quick-add picker. */
	onQuickAddSeries?: (paneId: string, series: SeriesConfig) => void;
	/** Directly remove a series from a pane via quick-add picker (toggle off). */
	onQuickRemoveSeries?: (paneId: string, seriesType: SeriesTypeId) => void;
	/**
	 * DECLUTTER_V4: where compare chips render. `"embedded"` (default) keeps
	 * them in the pane-header legend (multichart). `"statusline"` hides them
	 * from the embedded legend so the caller can render
	 * `renderCompareLegendNode(paneId)` below the OHLC row instead (single).
	 */
	compareLegendSlot?: "embedded" | "statusline";
}

/**
 * BL-14: backward-compatible union of the three option groups.
 * Existing flat-object call-sites typecheck unchanged; new code can
 * construct/pass each group independently.
 */
export interface UseWidgetOverlaysOptions extends OverlaysPaneOptions, OverlaysDrawingOptions, OverlaysSettingsOptions {}

export interface UseWidgetOverlaysReturn {
	paneToolbarNodes: React.ReactNode[];
	paneSplitterNodes: React.ReactNode[];
	drawingChromeNode: React.ReactNode;
	drawingDockNode: React.ReactNode;
	floatingInspectorNode: React.ReactNode;
	inlineEditorNode: React.ReactNode;
	settingsModalNode: React.ReactNode;
	snapshotPreviewModalNode: React.ReactNode;
	/** DECLUTTER_V4: compare-only legend node for the statusline slot (null unless slot is "statusline"). */
	renderCompareLegendNode: (paneId: string) => React.ReactNode;
}

export function useWidgetOverlays({
	useForkRuntime,
	visiblePanes,
	paneSnapshotMap,
	paneSnapshots,
	size,
	hoveredPaneId,
	hoveredDatum,
	claimForkPointerOwner,
	releaseForkPointerOwner,
	handlePaneToggleVisible,
	handlePaneRemove,
	handlePaneAddSeries,
	handlePaneEditSeries,
	handlePaneToggleSeries,
	handlePaneRemoveSeries,
	localizePane,
	localAvailable,
	localHeights,
	localApplyDelta,
	localEqualizePair,
	localResetToDefault,
	renderPaneToolbar,
	renderPaneSplitter,
	renderDrawingChrome,
	toolbarLocked = false,
	showToolbar = true,
	drawingWorkspace,
	resolvedSelectedDrawing,
	resolvedLegacyVisibleRange,
	effectiveForkVisibleRange,
	magnetSensitivity,
	isDark,
	plotData,
	visibleDomainRef,
	cloneSelectedDrawing,
	toggleSelectedLock,
	handleStartTextEdit,
	isEditingText,
	drawingTextDraft,
	setDrawingTextDraft,
	handleCommitTextEdit,
	handleCancelTextEdit,
	bringSelectedToFront,
	sendSelectedToBack,
	showDrawingDock,
	renderDrawingDock,
	defaultDrawingDockTab,
	activeSettingsOpen,
	activeOnSettingsClose,
	dataAdapterName,
	onDataAdapterChange,
	localSelectedPaneId,
	setLocalSelectedPaneId,
	activeMaxVisiblePanes,
	setLocalMaxVisiblePanes,
	activeMaxVisibleBars,
	setLocalMaxVisibleBars,
	activeShowNonTradingDays,
	setLocalShowNonTradingDays,
	activeShowDrawingPriceMarkers,
	setLocalShowDrawingPriceMarkers,
	activeEnableWhale,
	setLocalEnableWhale,
	activeWhaleThreshold,
	setLocalWhaleThreshold,
	activeEnableCVD,
	setLocalEnableCVD,
	activeCvdMode,
	setLocalCvdMode,
	themeState,
	activeTimezone,
	setLocalTimezone,
	onTimezoneChange,
	activeAlertAudioEnabled,
	setLocalAlertAudioEnabled,
	previewImageDataUrl,
	setPreviewImageDataUrl,
	renderSettings,
	renderPaperTradePanel,
	showAdvisoryPanel,
	advisoryResult,
	isAdvisoryLoading,
	onAdvisoryRefresh,
	showTapePanel,
	tapeEntries,
	isTapeLoading,
	tapeFilterBillions,
	onTapeFilterChange,
	onPaperTradePanelClose,
	showDrawingPriceMarkers,
	resolvedForkPriceMarkerSelection,
	t,
	onDrawingsChange,
	showTimeScrollbar,
	onShowTimeScrollbarChange,
	overlayTimeframe,
	setOverlayTimeframe,
	overlayStyle,
	setOverlayStyle,
	onExportLayout,
	onImportLayout,
	portalAdapter,
	storageAdapter,
	themePreset,
	chartId,
	symbol,
	timeframe,
	comparisonOverlays,
	onComparisonRemove,
	onComparisonUpdate,
	legendSeriesSuffix,
	legendPanes,
	onQuickAddSeries,
	onQuickRemoveSeries,
	compareLegendSlot = "embedded",
	seriesTier,
}: UseWidgetOverlaysOptions): UseWidgetOverlaysReturn {
	const handleToolbarAction = useCallback((actionId: DrawingSelectionToolbarActionId) => {
		switch (actionId) {
			case "clone":
				cloneSelectedDrawing();
				break;
			case "toggleLock":
				toggleSelectedLock();
				break;
			case "toggleVisibility":
				if (resolvedSelectedDrawing && drawingWorkspace) {
					drawingWorkspace.interaction.updateDrawing(resolvedSelectedDrawing.id, {
						visible: resolvedSelectedDrawing.visible === false,
					});
				}
				break;
			case "editText":
				handleStartTextEdit(resolvedSelectedDrawing?.text ?? "");
				break;
			case "bringToFront":
				bringSelectedToFront();
				break;
			case "sendToBack":
				sendSelectedToBack();
				break;
			case "delete":
				if (resolvedSelectedDrawing && drawingWorkspace) {
					const nextDrawings = drawingWorkspace.interaction.allDrawings.filter(
						(d: DrawingObject) => d.id !== resolvedSelectedDrawing.id,
					);
					drawingWorkspace.interaction.replaceDrawings(nextDrawings);
					drawingWorkspace.selectDrawing(null);
				}
				break;
			case "openProperties":
				drawingWorkspace?.openDock("properties");
				break;
			default:
				break;
		}
	}, [
		cloneSelectedDrawing,
		toggleSelectedLock,
		resolvedSelectedDrawing,
		drawingWorkspace,
		handleStartTextEdit,
		bringSelectedToFront,
		sendSelectedToBack,
	]);

	// S1.1/D-01 (2026-09-24): the window keydown Delete/Backspace channel lived
	// here and double-fired with useWidgetDrawings (2 history entries, 1 undo
	// no-op). useWidgetDrawings is now the SOLE Delete/Backspace channel —
	// do NOT re-add a global Delete listener in this file. Toolbar buttons,
	// dock and inspector keep calling handleToolbarAction("delete") directly.

	// Legend chrome + compare node live in overlays/useLegendChrome (D0 split).
	const legendChrome = useLegendChrome(t);
	const renderCompareLegendNode = useCompareLegendNode({
		compareLegendSlot,
		visiblePanes,
		legendPanes,
		localizePane,
		legendSeriesSuffix,
		handlePaneToggleSeries,
		handlePaneRemoveSeries,
		handlePaneEditSeries,
		legendChrome,
		hoveredDatum,
	});

	const paneToolbarNodes = useMemo(() => {
		// VOL_FIX: global left-gutter offset — matches the engine plot shift
		// (PaneLayoutEngine offsets plotBounds for ALL panes when ANY pane
		// owns a left slot, while axisBounds.left stays per-pane). Per-pane
		// width left the Vol header at padding 0 inside the left-axis zone,
		// under the docked drawing toolbar.
		// DOCK_FIX: the overlay layer is anchored at the OUTER container origin
		// while the engine measures the INNER (rail-reserved) box — every
		// snapshot-anchored overlay shifts right by the same reserve the chart
		// column uses (44 locked / 10 auto-hide grip / 0 with left axis).
		const dockOffset = resolveRailReservePx(showToolbar, toolbarLocked, resolveHasLeftAxis(paneSnapshotMap.values(), visiblePanes));
		const globalLeftAxisWidth = resolveGlobalLeftAxisWidth(paneSnapshotMap.values());
		return visiblePanes.map((pane) => {
			const snapshot = paneSnapshotMap.get(pane.id);
			if (!snapshot) return null;
			const hovered = hoveredPaneId === pane.id;

			const actions = {
				toggleVisibility: () => handlePaneToggleVisible(pane.id),
				removePane: () => handlePaneRemove(pane.id),
				addSeries: () => handlePaneAddSeries(pane.id),
				toggleSeries: (seriesType: any, seriesIndex?: number) => handlePaneToggleSeries(pane.id, seriesType, seriesIndex),
				removeSeries: (seriesType: any, seriesIndex?: number) => handlePaneRemoveSeries(pane.id, seriesType, seriesIndex),
				editSeries: () => handlePaneEditSeries(pane.id),
			};

			const legendPane = legendPanes?.find((lp) => lp.id === pane.id) ?? localizePane(pane);
			const paneSuffix = legendSeriesSuffix ? (idx: number) => legendSeriesSuffix(pane.id, idx) : undefined;

			// UI-P4: flush-left when no left axis anywhere; when one appears,
			// every pane header sits just OUTSIDE the axis frames with a small
			// uniform gap (global max — a Vol pane without its own left series
			// still shifts, matching the global plot offset; snapshots flow live).
			const leftAxisWidth = globalLeftAxisWidth;
			const rightAxisWidth = snapshot.axisBounds?.right?.width ?? 48;
			const paneHeaderStyle: CSSProperties = {
				paddingLeft: leftAxisWidth > 0 ? `calc(${leftAxisWidth}px + ${PANE_HEADER_AXIS_GAP_PX}px)` : 0,
				paddingRight: `calc(${rightAxisWidth}px + ${PANE_HEADER_AXIS_GAP_PX}px)`,
			};
			const legendStyle: CSSProperties = {
				left: `calc(${leftAxisWidth}px - 3mm)`,
				right: `calc(${rightAxisWidth}px + 3mm)`,
			};

			const wrapPaneHeader = (header: React.ReactNode, legend?: React.ReactNode) => (
				<div
					key={pane.id}
					className={`rsc-pane-wrap${hovered ? " rsc-pane-wrap--active" : ""}`}
					style={{
						position: "absolute",
						top: snapshot.bounds.top,
						left: snapshot.bounds.left + dockOffset,
						width: snapshot.bounds.width,
						height: snapshot.bounds.height,
						pointerEvents: "none",
						zIndex: 40,
					}}
				>
					<div style={{ pointerEvents: "auto", width: "100%", minHeight: 24 }}>{header}</div>
					{legend}
				</div>
			);

			if (renderPaneToolbar) {
				const toolbarEl = renderPaneToolbar({
					pane: localizePane(pane),
					snapshot,
					hovered,
					actions,
					paneHeaderStyle,
				});
				const embeddedLegend = (
					<IndicatorLegend
						pane={legendPane}
						onToggleSeries={actions.toggleSeries}
						onRemoveSeries={actions.removeSeries}
						onEditSeries={actions.editSeries}
						icons={legendChrome.icons}
						labels={legendChrome.labels}
						seriesSuffix={paneSuffix}
						seriesValue={hoveredDatum ? (_seriesType, idx) => buildLegendSeriesValue(hoveredDatum, legendPane.series[idx]) : undefined}
						embedded
						hiddenTypes={compareLegendSlot === "statusline" ? ["Comparison"] : undefined}
					/>
				);
				// Preserve the custom toolbar's own children (e.g. interactive buttons
				// bound to `actions`) and append the indicator legend after them.
				// Replacing children would silently discard custom interactivity.
				const prevChildren = (toolbarEl.props as any)?.children;
				const withLegend = React.isValidElement(toolbarEl)
					? React.cloneElement(toolbarEl as React.ReactElement<any>, {
						children: prevChildren === undefined ? embeddedLegend : <>{prevChildren}{embeddedLegend}</>,
					})
					: toolbarEl;
				return wrapPaneHeader(withLegend, undefined);
			}

			return wrapPaneHeader(
				<PaneHeaderWithPickerWrapper
					pane={localizePane(pane)}
					onToggleVisible={actions.toggleVisibility}
					onRemove={actions.removePane}
					onQuickAddSeries={onQuickAddSeries ? (series) => onQuickAddSeries(pane.id, series) : undefined}
					onQuickRemoveSeries={onQuickRemoveSeries ? (type) => onQuickRemoveSeries(pane.id, type) : undefined}
					style={paneHeaderStyle}
				>
					<IndicatorLegend
						pane={legendPane}
						onToggleSeries={actions.toggleSeries}
						onRemoveSeries={actions.removeSeries}
						onEditSeries={actions.editSeries}
						icons={legendChrome.icons}
						labels={legendChrome.labels}
						seriesSuffix={paneSuffix}
						seriesValue={hoveredDatum ? (_seriesType, idx) => buildLegendSeriesValue(hoveredDatum, legendPane.series[idx]) : undefined}
						embedded
						hiddenTypes={compareLegendSlot === "statusline" ? ["Comparison"] : undefined}
					/>
				</PaneHeaderWithPickerWrapper>,
				undefined
			);
		});
	}, [visiblePanes, paneSnapshotMap, hoveredPaneId, hoveredDatum, handlePaneToggleVisible, handlePaneRemove, handlePaneAddSeries, handlePaneEditSeries, handlePaneToggleSeries, handlePaneRemoveSeries, localizePane, renderPaneToolbar, legendPanes, legendSeriesSuffix, onQuickAddSeries, onQuickRemoveSeries, toolbarLocked, showToolbar, t, legendChrome, compareLegendSlot]);

	const paneSplitterNodes = useMemo(() => {
		// Same outer-layer origin as pane headers (see DOCK_FIX above).
		const dockOffset = resolveRailReservePx(showToolbar, toolbarLocked, resolveHasLeftAxis(paneSnapshotMap.values(), visiblePanes));
		return visiblePanes.slice(0, -1).map((pane, index) => {
			const snapshot = paneSnapshotMap.get(pane.id);
			if (!snapshot) return null;

			if (renderPaneSplitter) {
				return (
					<div
						key={pane.id}
						data-rsc-fork-pointer-owner="pane-splitter"
						onPointerDown={() => claimForkPointerOwner("pane-splitter")}
						onPointerUp={() => releaseForkPointerOwner("pane-splitter")}
						onPointerCancel={() => releaseForkPointerOwner("pane-splitter")}
						style={{ display: "contents" }}
					>
						{renderPaneSplitter({
							pane,
							snapshot,
							splitterIndex: index,
							top: snapshot.plotBounds.top + snapshot.plotBounds.height,
							left: snapshot.plotBounds.left + dockOffset,
							right: snapshot.plotBounds.left + snapshot.plotBounds.width + dockOffset,
						})}
					</div>
				);
			}

			const topH = localHeights[index] ?? 0;
			const bottomH = localHeights[index + 1] ?? 0;
			const { minDeltaY, maxDeltaY } = calculateSplitterBounds(visiblePanes[index], visiblePanes[index + 1], topH, bottomH);
			const handleEqualize = () => {
				if (localEqualizePair) localEqualizePair(index);
				else localResetToDefault();
			};

			return (
				<div
					key={pane.id}
					data-rsc-fork-pointer-owner="pane-splitter"
					onPointerDown={() => claimForkPointerOwner("pane-splitter")}
					onPointerUp={() => releaseForkPointerOwner("pane-splitter")}
					onPointerCancel={() => releaseForkPointerOwner("pane-splitter")}
					style={{ display: "contents" }}
				>
					<ChartSplitter
						splitterIndex={index}
						available={localAvailable}
						onCommitDelta={localApplyDelta}
						onDoubleClick={handleEqualize}
						minDeltaY={minDeltaY}
						maxDeltaY={maxDeltaY}
						topHeight={topH}
						bottomHeight={bottomH}
						title={t("pane.splitter.tooltip")}
						ariaLabel={t("pane.splitter.ariaLabel", { index: index + 1 })}
						badgeTopLabel={t("pane.splitter.badgeTop") ?? "Top"}
						badgeBottomLabel={t("pane.splitter.badgeBottom") ?? "Bottom"}
						style={{
							position: "absolute",
							top: snapshot.plotBounds.top + snapshot.plotBounds.height,
							left: snapshot.plotBounds.left + dockOffset,
							width: snapshot.plotBounds.width,
						}}
					/>
				</div>
			);
		});
	}, [visiblePanes, paneSnapshotMap, localAvailable, localApplyDelta, localEqualizePair, localResetToDefault, localHeights, renderPaneSplitter, toolbarLocked, showToolbar, t]);

	// S5.2: measured floating-bar rect (real size for clamp math; null =
	// 248x42 fallback). 1px-change guard prevents measure loops.
	const [measuredToolbarSize, setMeasuredToolbarSize] = useState<{ width: number; height: number } | null>(null);
	const handleMeasuredToolbarSize = useCallback((size: { width: number; height: number }) => {
		setMeasuredToolbarSize((prev) => (
			prev && Math.abs(prev.width - size.width) < 1 && Math.abs(prev.height - size.height) < 1 ? prev : size
		));
	}, []);

	// S1/BUG-1: multi-select actions (hook at top level; consumed in the memo below).
	// Anchors on the first-selected drawing via the existing single pipeline (D-04 option a).
	const multiSelectedIds = drawingWorkspace?.state.selectedIds ?? [];
	const multiDrawings = drawingWorkspace?.interaction.allDrawings ?? [];
	const multiActions = useMultiSelectActions({
		drawingWorkspace: drawingWorkspace ?? null,
		selectedIds: multiSelectedIds,
		drawings: multiDrawings,
		t,
	});
	const isMultiSelectBar = multiSelectedIds.length > 1;

	const drawingChromeNode = useMemo(() => {
		if (renderDrawingChrome) {
			return (
				<>
					{renderDrawingChrome({
						activeTool: drawingWorkspace.state.activeTool,
						drawingWorkspace,
						isDark,
						magnetSensitivity,
						paneSnapshots,
						selectedDrawing: resolvedSelectedDrawing,
						visibleRange: resolvedLegacyVisibleRange,
						size,
					})}
				</>
			);
		}

		if (!resolvedSelectedDrawing) return null;
		if (isEditingText && ["text", "callout", "priceLabel"].includes(resolvedSelectedDrawing.type)) return null;

		const labels: DrawingSelectionToolbarLabels = {
			clone: t("drawing.clone"),
			lock: t("drawing.lock"),
			unlock: t("drawing.unlock"),
			hide: t("drawing.hide"),
			show: t("drawing.show"),
			edit: t("drawing.edit"),
			bringToFront: t("drawing.bringToFront"),
			sendToBack: t("drawing.sendToBack"),
			delete: t("drawing.delete"),
			openProperties: t("drawing.properties"),
		};

		const toolbarModel = createDrawingSelectionToolbarModel(resolvedSelectedDrawing, labels);
		if (!toolbarModel) return null;

		const position = resolveDrawingSelectionToolbarPosition({
			drawing: resolvedSelectedDrawing,
			paneSnapshots,
			plotData,
			visibleDomain: visibleDomainRef.current,
			shellSize: size,
			// S5.2: clamp with the measured bar rect when known (248x42 fallback).
			...(measuredToolbarSize ? { toolbarSize: measuredToolbarSize } : {}),
		});
		if (!position) return null;

		return (
			<FloatingSelectionToolbar
				model={isMultiSelectBar ? null : toolbarModel}
				position={position}
				ariaLabel={t("drawing.inspectorTitle")}
				isDark={isDark}
				onAction={handleToolbarAction}
				drawing={resolvedSelectedDrawing}
				selectedCount={isMultiSelectBar ? multiSelectedIds.length : undefined}
				onDeleteAll={isMultiSelectBar ? multiActions.handleDeleteAll : undefined}
				onLockAll={isMultiSelectBar ? (() => multiActions.handleLockAll()) : undefined}
				onSetVisibleAll={isMultiSelectBar ? multiActions.handleSetVisibleAll : undefined}
				onBatchColor={isMultiSelectBar ? multiActions.handleBatchColor : undefined}
				onCloneAll={isMultiSelectBar ? multiActions.handleCloneAll : undefined}
				onGroupAll={isMultiSelectBar ? multiActions.handleGroupToggleAll : undefined}
				allLocked={isMultiSelectBar ? multiActions.allLocked : undefined}
				allHidden={isMultiSelectBar ? multiActions.allHidden : undefined}
				onUpdate={(patch: Partial<DrawingObject>) => {
					drawingWorkspace?.interaction.updateDrawing(resolvedSelectedDrawing.id, patch);
				}}
				labels={{
					deleteAll: t("drawing.toolbar.deleteAll"),
					lockAll: t("drawing.toolbar.lockAll"),
					unlockAll: t("drawing.toolbar.unlockAll"),
					hideAll: t("drawing.toolbar.hideAll"),
					showAll: t("drawing.toolbar.showAll"),
					batchColor: t("drawing.toolbar.batchColor"),
					duplicate: t("drawing.selection.duplicate"),
					group: t("drawing.selection.group"),
					selectedCountText: t("drawing.toolbar.selectedCount", { count: 1 }),
					dragHint: t("drawing.toolbar.dragHint"),
					all: t("drawing.toolbar.all"),
					pickColor: t("drawing.toolbar.pickColor"),
					strokeWidth: t("drawing.toolbar.strokeWidth"),
					lineStyle: t("drawing.toolbar.lineStyle"),
					solid: t("drawing.toolbar.solid"),
					dashed: t("drawing.toolbar.dashed"),
					dotted: t("drawing.toolbar.dotted"),
					pointLabelPrefix: t("drawing.toolbar.point"),
				}}
				onMeasuredSize={handleMeasuredToolbarSize}
			/>
		);
	}, [renderDrawingChrome, drawingWorkspace, isDark, magnetSensitivity, paneSnapshots, resolvedSelectedDrawing, resolvedLegacyVisibleRange, size, t, plotData, visibleDomainRef, handleToolbarAction, measuredToolbarSize, handleMeasuredToolbarSize, isMultiSelectBar, multiSelectedIds, multiActions]);

	const handleDeleteDrawing = useCallback(() => {
		if (!resolvedSelectedDrawing || !drawingWorkspace) return;
		const nextDrawings = drawingWorkspace.interaction.allDrawings.filter(
			(d: DrawingObject) => d.id !== resolvedSelectedDrawing.id,
		);
		drawingWorkspace.interaction.replaceDrawings(nextDrawings);
		drawingWorkspace.selectDrawing(null);
	}, [resolvedSelectedDrawing, drawingWorkspace]);

	const handleToggleVisibility = useCallback(() => {
		if (!resolvedSelectedDrawing || !drawingWorkspace) return;
		drawingWorkspace.interaction.updateDrawing(resolvedSelectedDrawing.id, {
			visible: resolvedSelectedDrawing.visible === false,
		});
	}, [resolvedSelectedDrawing, drawingWorkspace]);

	const handleCloseFloatingInspector = useCallback(() => {
		drawingWorkspace?.closeDock();
	}, [drawingWorkspace]);

	const floatingInspectorNode = useMemo(() => {
		if (!drawingWorkspace || !drawingWorkspace.state.dock.isOpen || drawingWorkspace.state.dock.activeTab !== "properties" || !resolvedSelectedDrawing) {
			return null;
		}

		return (
			<FloatingDrawingInspector
				drawing={resolvedSelectedDrawing}
				isDark={isDark}
				t={t}
				textEditor={["text", "callout", "priceLabel"].includes(resolvedSelectedDrawing.type) ? {
					active: isEditingText,
					value: drawingTextDraft,
					labels: {
						title: t("drawing.textEditorTitle"),
						label: t("drawing.textEditorLabel"),
						placeholder: t("drawing.textEditorPlaceholder"),
						edit: t("drawing.textEditorEdit"),
						save: t("drawing.textEditorSave"),
						cancel: t("drawing.textEditorCancel"),
						empty: t("drawing.textEditorEmpty"),
					},
					onChange: setDrawingTextDraft,
					onStartEdit: () => handleStartTextEdit(resolvedSelectedDrawing.text ?? ""),
					onCommit: () => handleCommitTextEdit((draft: string) => {
						drawingWorkspace.interaction.updateDrawing(resolvedSelectedDrawing.id, { text: draft });
					}),
					onCancel: handleCancelTextEdit,
				} : undefined}
				onClose={handleCloseFloatingInspector}
				onUpdate={(patch: any) => {
					drawingWorkspace.interaction.updateDrawing(resolvedSelectedDrawing.id, patch);
				}}
				onDelete={handleDeleteDrawing}
				onClone={cloneSelectedDrawing}
				onToggleLock={toggleSelectedLock}
				onToggleVisible={handleToggleVisibility}
				onBringToFront={bringSelectedToFront}
				onSendToBack={sendSelectedToBack}
				plotData={plotData as any[]} // ARC-1-keep: legacy bridge
			/>
		);
	}, [drawingWorkspace, resolvedSelectedDrawing, isDark, t, handleCloseFloatingInspector, cloneSelectedDrawing, toggleSelectedLock, handleToggleVisibility, handleDeleteDrawing, bringSelectedToFront, sendSelectedToBack, plotData, isEditingText, drawingTextDraft, setDrawingTextDraft, handleStartTextEdit, handleCommitTextEdit, handleCancelTextEdit]);

	// S3 (P5 parity F2): shared builders (single + multi dùng chung, Rule 6).
	const dockTextEdit = useMemo(() => ({
		isEditingText,
		drawingTextDraft,
		setDrawingTextDraft,
		onStartTextEdit: handleStartTextEdit,
		onCommitTextEdit: handleCommitTextEdit,
		onCancelTextEdit: handleCancelTextEdit,
	}), [
		isEditingText,
		drawingTextDraft,
		setDrawingTextDraft,
		handleStartTextEdit,
		handleCommitTextEdit,
		handleCancelTextEdit,
	]);
	const dockSelectedActions = useMemo(() => ({
		onDeleteDrawing: handleDeleteDrawing,
		onCloneSelected: cloneSelectedDrawing,
		onToggleSelectedLock: toggleSelectedLock,
		onToggleSelectedVisibility: handleToggleVisibility,
		onBringSelectedToFront: bringSelectedToFront,
		onSendSelectedToBack: sendSelectedToBack,
	}), [
		handleDeleteDrawing,
		cloneSelectedDrawing,
		toggleSelectedLock,
		handleToggleVisibility,
		bringSelectedToFront,
		sendSelectedToBack,
	]);
	const dockPropertiesContent = useMemo(() => buildDockPropertiesContent({
		workspace: drawingWorkspace,
		selected: resolvedSelectedDrawing,
		t,
		textEdit: dockTextEdit,
		actions: dockSelectedActions,
	}), [
		resolvedSelectedDrawing,
		drawingWorkspace,
		t,
		dockTextEdit,
		dockSelectedActions,
	]);

	const dockObjectsContent = useMemo(() => buildDockObjectsContent({
		workspace: drawingWorkspace,
		selected: resolvedSelectedDrawing,
		t,
		textEdit: dockTextEdit,
		actions: dockSelectedActions,
	}), [drawingWorkspace, resolvedSelectedDrawing, t, dockTextEdit, dockSelectedActions]);

	const dockTemplatesContent = useMemo(() => buildDockTemplatesContent({
		workspace: drawingWorkspace,
		selected: resolvedSelectedDrawing,
		t,
		textEdit: dockTextEdit,
		actions: dockSelectedActions,
	}), [resolvedSelectedDrawing, drawingWorkspace, t, dockTextEdit, dockSelectedActions]);

	// Drawing dock node lives in overlays/useDrawingDockNode (D0 split).
	const drawingDockNode = useDrawingDockNode({
		showDrawingDock,
		drawingWorkspace,
		renderDrawingDock,
		t,
		dockPropertiesContent,
		dockObjectsContent,
		dockTemplatesContent,
	});

	const settingsModalNode = useMemo(() => {
		if (!activeSettingsOpen) return null;
		return (
			<SettingsModal
				open={activeSettingsOpen}
				onClose={activeOnSettingsClose}
				dataAdapterName={dataAdapterName}
				onDataAdapterChange={onDataAdapterChange}
				selectedPaneId={localSelectedPaneId}
				onSelectedPaneIdChange={setLocalSelectedPaneId}
				maxVisiblePanes={activeMaxVisiblePanes}
				onMaxVisiblePanesChange={setLocalMaxVisiblePanes}
				maxVisibleBars={activeMaxVisibleBars}
				onMaxVisibleBarsChange={setLocalMaxVisibleBars}
				showNonTradingDays={activeShowNonTradingDays}
				onShowNonTradingDaysChange={setLocalShowNonTradingDays}
				showTimeScrollbar={showTimeScrollbar}
				onShowTimeScrollbarChange={onShowTimeScrollbarChange}
				showDrawingPriceMarkers={activeShowDrawingPriceMarkers}
				onShowDrawingPriceMarkersChange={setLocalShowDrawingPriceMarkers}
				enableWhale={activeEnableWhale}
				onEnableWhaleChange={setLocalEnableWhale}
				whaleThreshold={activeWhaleThreshold}
				onWhaleThresholdChange={setLocalWhaleThreshold}
				enableCVD={activeEnableCVD}
				onEnableCVDChange={setLocalEnableCVD}
				cvdMode={activeCvdMode}
				onCVDModeChange={setLocalCvdMode}
				isDark={isDark}
				toggleTheme={themeState.toggleTheme}
				onThemePresetChange={themeState.setTheme}
				timezone={activeTimezone}
				onTimezoneChange={(next) => {
					setLocalTimezone(next as WidgetTimezone);
					if (onTimezoneChange) {
						onTimezoneChange(next as WidgetTimezone);
					}
				}}
				alertAudioEnabled={activeAlertAudioEnabled}
				onAlertAudioEnabledChange={setLocalAlertAudioEnabled}
				storageAdapter={storageAdapter}
				portalAdapter={portalAdapter}
				themePreset={themePreset}
				chartId={chartId}
				symbol={symbol}
				timeframe={timeframe}
				overlayTimeframe={overlayTimeframe}
				onOverlayTimeframeChange={setOverlayTimeframe}
				overlayStyle={overlayStyle}
				onOverlayStyleChange={setOverlayStyle}
				onExportLayout={onExportLayout}
				onImportLayout={onImportLayout}
				comparisonOverlays={comparisonOverlays}
				onComparisonRemove={onComparisonRemove}
				onComparisonUpdate={onComparisonUpdate}
				seriesTier={seriesTier}
				onReset={() => {
					localResetToDefault();
					setLocalMaxVisiblePanes(6);
					setLocalMaxVisibleBars(40000);
					setLocalShowNonTradingDays(false);
					setLocalShowDrawingPriceMarkers(true);
					setLocalEnableWhale(true);
					setLocalWhaleThreshold(1000000);
					setLocalEnableCVD(false);
					setLocalCvdMode("oscillator");
					setLocalTimezone("Asia/Ho_Chi_Minh");
					setLocalAlertAudioEnabled(false);
					setOverlayTimeframe(undefined);
					setOverlayStyle("candle");
				}}
			/>
		);
	}, [activeSettingsOpen, renderSettings, activeOnSettingsClose, dataAdapterName, onDataAdapterChange, localSelectedPaneId, setLocalSelectedPaneId, activeMaxVisiblePanes, setLocalMaxVisiblePanes, activeMaxVisibleBars, setLocalMaxVisibleBars, activeShowNonTradingDays, setLocalShowNonTradingDays, showTimeScrollbar, onShowTimeScrollbarChange, activeShowDrawingPriceMarkers, setLocalShowDrawingPriceMarkers, activeEnableWhale, setLocalEnableWhale, activeWhaleThreshold, setLocalWhaleThreshold, activeEnableCVD, setLocalEnableCVD, activeCvdMode, setLocalCvdMode, isDark, themeState, activeTimezone, setLocalTimezone, onTimezoneChange, activeAlertAudioEnabled, setLocalAlertAudioEnabled, localResetToDefault, comparisonOverlays, onComparisonRemove, onComparisonUpdate, storageAdapter, portalAdapter, themePreset, chartId, symbol, timeframe, overlayTimeframe, setOverlayTimeframe, overlayStyle, setOverlayStyle, onExportLayout, onImportLayout]);

	const snapshotPreviewModalNode = useMemo(() => {
		if (!previewImageDataUrl) return null;
		return (
			<SnapshotPreviewModal
				isOpen={!!previewImageDataUrl}
				imageDataUrl={previewImageDataUrl}
				isDark={isDark}
				themePreset={themePreset}
				onClose={() => setPreviewImageDataUrl(null)}
				onSave={() => {
					if (previewImageDataUrl) {
						const a = document.createElement("a");
						a.setAttribute("href", previewImageDataUrl);
						a.setAttribute("download", "Chart-Viewport.png");
						const container = portalAdapter?.getContainer?.() ?? (typeof document !== "undefined" ? document.body : null);
						if (container) {
							container.appendChild(a);
							a.click();
							container.removeChild(a);
						}
						setPreviewImageDataUrl(null);
					}
				}}
				portalAdapter={portalAdapter}
			/>
		);
	}, [previewImageDataUrl, isDark, setPreviewImageDataUrl, portalAdapter]);

	const handleTextInlineUpdate = useCallback((id: string, patch: any) => {
		drawingWorkspace?.interaction.updateDrawing(id, patch);
	}, [drawingWorkspace]);

	const handleTextInlineCommit = useCallback((commitCallback: (draft: string) => void) => {
		handleCommitTextEdit(commitCallback);
		drawingWorkspace?.interaction.cancelDrawing();
	}, [handleCommitTextEdit, drawingWorkspace]);

	const handleTextInlineCancel = useCallback(() => {
		handleCancelTextEdit();
		drawingWorkspace?.interaction.cancelDrawing();
	}, [handleCancelTextEdit, drawingWorkspace]);

	const inlineEditorNode = useMemo(() => {
		if (!isEditingText || !resolvedSelectedDrawing) return null;
		return (
			<InlineTextEditor
				selectedDrawing={resolvedSelectedDrawing}
				paneSnapshots={paneSnapshots}
				isEditingText={isEditingText}
				drawingTextDraft={drawingTextDraft}
				setDrawingTextDraft={setDrawingTextDraft}
				handleCommitTextEdit={handleTextInlineCommit}
				handleCancelTextEdit={handleTextInlineCancel}
				handleUpdateDrawing={handleTextInlineUpdate}
				plotData={plotData}
				visibleDomainRef={visibleDomainRef}
				shellSize={size}
			/>
		);
	}, [isEditingText, resolvedSelectedDrawing, paneSnapshots, drawingTextDraft, setDrawingTextDraft, handleTextInlineCommit, handleTextInlineCancel, handleTextInlineUpdate, plotData, visibleDomainRef, size]);

	// DOCK_SSOT_B3 (RD-02): memo `hasRightSidebar` + resize fields đã gỡ — quyết định
	// mount giờ thuộc VNInvestCharts (`showDock !== false`) và width thuộc RightDockRail
	// (useSidebarResize nội bộ, cùng key `vnsc_dock_width`). `showDock` không còn vào hook.

	return {
		paneToolbarNodes,
		paneSplitterNodes,
		drawingChromeNode,
		drawingDockNode,
		floatingInspectorNode,
		inlineEditorNode,
		settingsModalNode,
		snapshotPreviewModalNode,
		renderCompareLegendNode,
	};
}