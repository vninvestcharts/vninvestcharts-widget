/**
 * BL-03B extraction from VNInvestCharts.tsx (behavior-identical move).
 * Slice S4: the `isForkRuntime` arm of the chart-surface ternary (VNC :2417-2610, 194 lines)
 * moved verbatim. Exactly two tokens changed, both equivalent inside this arm:
 *   `{isForkRuntime && props.showFloatingBar !== false && (` -> `{props.showFloatingBar !== false && (`
 *   `{isForkRuntime && scaleOverlays.scrollbar && ...` -> `{scaleOverlays.scrollbar && ...`
 * Plan: docs/PLAN_BL03B_S4_FORK_SURFACE_2026-10-17.md
 */
import { type ComponentProps, type RefObject } from "react";
import { EngineHost, EngineTrademark, requiresAds, type useTrademarkCompliance } from "@vninvestcharts/engine-react";
import { type EngineOverlayState, type VisibleRange as EngineVisibleRange } from "@vninvestcharts/engine-core";
import { type DrawingObject, type DrawingToolType } from "@vninvestcharts/engine-drawing";
import { ChartRenderContext, type PaneDescriptor } from "../../../lib/core";
import { StockChartProvider } from "../../../lib/StockChartContext";
import { WhaleMarketBubbleOverlay } from "../../../lib/indicators/overlays/WhaleMarketBubbleOverlay";
import { CVDIndicator } from "../../../lib/indicators/overlays/CVDIndicator";
import { ExternalCVDOverlay } from "../../../lib/indicators/overlays/ExternalCVDOverlay";
import { CorporateEventsOverlay, type CorporateEvent } from "../events/CorporateEventsOverlay";
import { TradingChartSurface } from "../../trading";
import DrawingPriceLabelsOverlay from "../../DrawingPriceLabelsOverlay";
import MeasurementOverlay from "../../MeasurementOverlay";
import { ForkXAxisOverlay } from "../ForkXAxisOverlay";
import { ForkPaneTooltips } from "../ForkPaneTooltips";
import { ForkYAxisCrosshairLabels } from "../ForkYAxisCrosshairLabels";
import { ForkPaneSeparators } from "../ForkPaneSeparators";
import { ReplayCutOverlay } from "../replay/ReplayCutOverlay";
import { WidgetEmptyState } from "../../WidgetEmptyState";
import { FloatingChartBar } from "../toolbar/FloatingChartBar";
import { TimeAxisScrollbar } from "../canvas/TimeAxisScrollbar";
import { priceFormat, type WidgetPaneRuntimeSnapshot } from "../../utils/widgetHelpers";
import type { VNInvestChartsProps } from "../../VNInvestCharts";
import type { CanvasSize } from "../../hooks/useResizeAdapter";
import type { useWidgetData } from "../../hooks/useWidgetData";
import type { useWidgetSettings } from "../../hooks/useWidgetSettings";
import type { useForkRuntime } from "../../hooks/useForkRuntime";
import type { useWidgetForkInteraction } from "../../hooks/useWidgetForkInteraction";
import type { useScaleOverlays } from "../../hooks/useScaleOverlays";
import type { useWidgetOverlays } from "../../hooks/useWidgetOverlays";
import type { useWidgetCoordinateBridge } from "../../hooks/useWidgetCoordinateBridge";
import type { usePatTierAuthentication } from "../../hooks/usePatTierAuthentication";
import type { useFeatureGate } from "../../hooks/useFeatureGate";
import type { useFloatingChartBar } from "../../hooks/useFloatingChartBar";
import type { CVDPoint } from "../../../lib/types/vninvest";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";
import styles from "../../styles/fork-overlays.module.css";

type EngineHostProps = ComponentProps<typeof EngineHost>;
type CoordBridge = ReturnType<typeof useWidgetCoordinateBridge>;
type PatAuth = ReturnType<typeof usePatTierAuthentication>;
type FeatureGate = ReturnType<typeof useFeatureGate>;

export interface ForkEngineSurfaceProps {
	props: VNInvestChartsProps;
	settings: ReturnType<typeof useWidgetSettings>;
	dataResult: ReturnType<typeof useWidgetData>;
	forkRuntimeResult: ReturnType<typeof useForkRuntime>;
	forkInteraction: ReturnType<typeof useWidgetForkInteraction>;
	scaleOverlays: ReturnType<typeof useScaleOverlays>;
	overlays: ReturnType<typeof useWidgetOverlays>;
	forkChartRenderContextValue: CoordBridge["forkChartRenderContextValue"];
	forkStockChartContextValue: CoordBridge["forkStockChartContextValue"];
	emitPaneSnapshots: CoordBridge["emitPaneSnapshots"];
	effectiveToolbarTier: PatAuth["effectiveToolbarTier"];
	enginePat: PatAuth["enginePat"];
	validatePat: PatAuth["validatePat"];
	handleTierValidated: PatAuth["handleTierValidated"];
	adCampaign: FeatureGate["adCampaign"];
	adLocale: EngineHostProps["adLocale"];
	engineOptions: EngineHostProps["engineOptions"];
	trademarkCompliance: ReturnType<typeof useTrademarkCompliance>;
	trademarkUrl: string;
	trademarkBadgeRef: RefObject<HTMLDivElement | null>;
	labelColorByPaneRef: RefObject<Map<string, string>>;
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	forkOverlayState: EngineOverlayState | null;
	forkVisibleRange: EngineVisibleRange | null;
	replayAwaitingStartBar: boolean;
	forkPlotData: readonly EnrichedDatum[];
	forkEnginePanes: EngineHostProps["panes"];
	forkEngineTheme: EngineHostProps["theme"];
	renderPanes: readonly PaneDescriptor[];
	loadedEvents: CorporateEvent[];
	/** B5: paper-trading visibility coming from the trading settings section. */
	showPaperOrders?: boolean;
	showPaperPositions?: boolean;
	size: CanvasSize;
	resolvedForkPriceMarkerSelection: DrawingObject | null;
	activeForkDrawingTool: DrawingToolType | null;
	canUseWhale: boolean;
	hasExternalData: boolean;
	floatingBar: ComponentProps<typeof FloatingChartBar>;
	scrollbarCloses: number[];
}

export function ForkEngineSurface(propsIn: ForkEngineSurfaceProps) {
	const { props, settings, dataResult, forkRuntimeResult, forkInteraction, scaleOverlays, overlays, forkChartRenderContextValue, forkStockChartContextValue, emitPaneSnapshots, effectiveToolbarTier, enginePat, validatePat, handleTierValidated, adCampaign, adLocale, engineOptions, trademarkCompliance, trademarkUrl, trademarkBadgeRef, labelColorByPaneRef, paneSnapshots, forkOverlayState, forkVisibleRange, replayAwaitingStartBar, forkPlotData, forkEnginePanes, forkEngineTheme, renderPanes, loadedEvents, size, resolvedForkPriceMarkerSelection, activeForkDrawingTool, canUseWhale, hasExternalData, floatingBar, scrollbarCloses, showPaperOrders, showPaperPositions } = propsIn;
	return (
		<>
			<div
				className="rsc-engine-surface"
				onClick={forkInteraction.handleForkClick}
				onContextMenu={(event) => scaleOverlays.handleSurfaceContextMenu(event, forkInteraction.handleForkContextMenu)}
				style={{
					position: "relative",
					display: "flex",
					flex: 1,
					minHeight: 0,
					cursor: forkInteraction.forkSurfaceCursor,
				}}
			>
				{props.adsEnabled !== false && trademarkCompliance.shouldShow && (
					<EngineTrademark
						patTier={effectiveToolbarTier}
						enforcementEnabled={requiresAds(effectiveToolbarTier)}
						containerRef={trademarkBadgeRef}
						targetUrl={trademarkUrl}
					/>
				)}
				<StockChartProvider value={forkStockChartContextValue ?? undefined}>
					<EngineHost
						panes={forkEnginePanes}
						dataSource={forkRuntimeResult.engineDataSource}
						engineOptions={engineOptions} // engine options
						effectivePat={enginePat}
						validatePat={validatePat as (pat: string) => Promise<any>}
						onTierValidated={handleTierValidated}
						overlayInputs={forkRuntimeResult.forkOverlayInputs}
						theme={forkEngineTheme}
						locale={settings.activeLocale}
						priceScaleMode={scaleOverlays.mainSlotMode}
						onEngineReady={forkRuntimeResult.handleEngineReady}
						onClick={forkInteraction.handleForkDrawingClick}
						onDoubleClick={forkInteraction.handleForkDoubleClick}
						onOverlayStateChange={forkRuntimeResult.handleForkOverlayStateChange}
						onVisibleRangeChange={dataResult.handleForkVisibleRangeChange}
						onPaneSnapshotsChange={emitPaneSnapshots}
						onPaneHover={forkRuntimeResult.emitHoveredPaneId}
						onPointerDown={forkInteraction.handleForkPointerDown}
						onPointerMove={forkInteraction.handleForkPointerMove}
						onPointerUp={forkInteraction.handleForkPointerUp}
						onPointerLeave={forkInteraction.handleForkPointerLeave}
						onContextMenu={forkInteraction.handleForkHostContextMenu}
						campaign={adCampaign}
						adLocale={adLocale}
						style={{ flex: 1, minHeight: 0 }}
					/>
					{replayAwaitingStartBar && (
						<ReplayCutOverlay crosshair={forkOverlayState?.crosshair ?? null} plotData={forkPlotData} />
					)}
					{forkChartRenderContextValue ? (
						<ChartRenderContext.Provider value={forkChartRenderContextValue}>
							{canUseWhale && dataResult.whaleEvents.length > 0 ? (
								<div data-rsc-fork-overlay="whale" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
									<WhaleMarketBubbleOverlay
										events={dataResult.whaleEvents}
										visibleRange={forkChartRenderContextValue.visibleRange}
									/>
								</div>
							) : null}
							{props.enableCVD && settings.activeEnableCVD && dataResult.plotData.length > 0 ? (
								<div data-rsc-fork-overlay="cvd" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
									<CVDIndicator
										data={dataResult.plotData}
										visibleRange={forkChartRenderContextValue.visibleRange}
										mode={settings.activeCvdMode}
									/>
								</div>
							) : null}
							{props.externalCvdSeries && props.externalCvdSeries.length > 0 ? (
								<div data-rsc-fork-overlay="external-cvd" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
									<ExternalCVDOverlay
										series={props.externalCvdSeries as CVDPoint[]}
									/>
								</div>
							) : null}
							{props.showCorporateEvents !== false && loadedEvents.length > 0 ? (
								<div data-rsc-fork-overlay="corporate-events" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
									<CorporateEventsOverlay
										events={loadedEvents}
										showEvents={true}
										isMobile={props.isMobile}
									/>
								</div>
							) : null}
							{props.children != null ? (
								<svg
									data-rsc-fork-children="true"
									width={size.width}
									height={size.height}
									style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
								>
									{props.children}
								</svg>
							) : null}
						</ChartRenderContext.Provider>
					) : props.children != null ? (
						<svg
							data-rsc-fork-children="true"
							width={size.width}
							height={size.height}
							style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
						>
							{props.children}
						</svg>
					) : null}
					<TradingChartSurface
						snapshot={paneSnapshots.find((s) => s.paneId === "price") ?? null}
						visibleRange={forkVisibleRange}
						drawingActive={activeForkDrawingTool != null}
						showPaperOrders={showPaperOrders}
						showPaperPositions={showPaperPositions}
					/>
				</StockChartProvider>
				{resolvedForkPriceMarkerSelection && settings.activeShowDrawingPriceMarkers ? (
					<DrawingPriceLabelsOverlay
						enabled
						highlighted
						renderMode="engine"
						runtime="fork"
						priceFormat={(value: number) => priceFormat(value)}
						enginePriceLabels={forkOverlayState?.drawingPriceLabels ?? null}
						height={size.height}
						width={size.width}
						paneSnapshots={paneSnapshots}
					/>
				) : null}
				<MeasurementOverlay
					enabled={props.measurementEnabled ?? false}
					isDark={settings.isDark}
					priceFormat={priceFormat}
					renderMode="engine"
					engineMeasurementState={forkOverlayState?.measurement ?? null}
					paneSnapshots={paneSnapshots}
					width={size.width}
					height={size.height}
				/>
				<ForkXAxisOverlay
					ticks={forkRuntimeResult.forkXAxisTicks}
					hoverLabel={forkRuntimeResult.forkXAxisHoverLabel}
					top={Math.max(0, (paneSnapshots[paneSnapshots.length - 1]?.bounds.top ?? 0) + (paneSnapshots[paneSnapshots.length - 1]?.bounds.height ?? 0))}
					isDark={settings.isDark}
					showHoverLabel={props.active !== false}
					width={size.width}
				/>
				<ForkPaneTooltips
					hoveredDatum={forkRuntimeResult.forkHoveredDatum}
					lastDatum={dataResult.plotData[dataResult.plotData.length - 1]}
					symbol={dataResult.activeSymbol}
					timeframe={dataResult.activeTimeframe}
					isDark={settings.isDark}
					paneSnapshots={paneSnapshots}
					panes={renderPanes}
					onSettingsClick={() => settings.setLocalSettingsOpen(true)}
					renderCompareLegend={overlays.renderCompareLegendNode}
					hideStatusOhlc={Boolean(props.showHeader) && settings.statusLineSettings.showOHLC}
					showStatusVolume={settings.statusLineSettings.showVolume !== false}
				/>
				<ForkYAxisCrosshairLabels
					overlayState={forkOverlayState}
					isDark={settings.isDark}
					paneSnapshots={paneSnapshots}
					labelColorByPane={labelColorByPaneRef.current}
				/>
				<ForkPaneSeparators paneSnapshots={paneSnapshots} />
				{forkInteraction.forkRubberBandSelection ? (
					<div
						aria-hidden="true"
						data-rsc-fork-rubber-band="true"
						className={styles.forkRubberBand}
						style={{
							left: Math.min(forkInteraction.forkRubberBandSelection.startPixel[0], forkInteraction.forkRubberBandSelection.currentPixel[0]),
							top: Math.min(forkInteraction.forkRubberBandSelection.startPixel[1], forkInteraction.forkRubberBandSelection.currentPixel[1]),
							width: Math.abs(forkInteraction.forkRubberBandSelection.currentPixel[0] - forkInteraction.forkRubberBandSelection.startPixel[0]),
							height: Math.abs(forkInteraction.forkRubberBandSelection.currentPixel[1] - forkInteraction.forkRubberBandSelection.startPixel[1]),
						}}
					/>
				) : null}
				{((dataResult.loading && !hasExternalData) || dataResult.plotData.length === 0 || dataResult.error) && (
					<div className={styles.forkLoadingOverlay}>
						<WidgetEmptyState loading={dataResult.loading} error={dataResult.error} onRetry={dataResult.reload} />
					</div>
				)}
				{props.showFloatingBar !== false && (
					<FloatingChartBar {...floatingBar} />
				)}
			</div>
			{scaleOverlays.scrollbar && settings.scalesSettings.showTimeScrollbar ? (
				<TimeAxisScrollbar
					dataLength={scaleOverlays.scrollbar.dataLength}
					from={scaleOverlays.scrollbar.from}
					to={scaleOverlays.scrollbar.to}
					closes={scrollbarCloses}
					width={size.width}
					t={settings.t}
					onWindowChange={scaleOverlays.scrollbar.onWindowChange}
				/>
			) : null}
		</>
	);
}
