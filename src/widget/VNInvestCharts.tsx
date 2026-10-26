import { forwardRef, lazy, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, Suspense, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { type AxisSide, type EngineOverlayInputs, type EngineInstance, type EngineOptions, type EngineHistoryPatch, type EngineOverlayState, type VisibleRange as EngineVisibleRange, type PaneRuntimeSnapshot, createPaneSpecsFromDescriptors, resolvePanePixelAtDataIndex, resolvePanePixelAtValue } from "@vninvestcharts/engine-core";
import { EngineHost, defaultKeyboardAdapter, defaultWindowEventAdapter, defaultNotificationAdapter, defaultAudioAdapter, defaultLocalStorageAdapter, useTrademarkCompliance, EngineTrademark, requiresAds } from "@vninvestcharts/engine-react";
import type { CrosshairPayload, DrawingData, DrawingOperation, VisibleRangePayload, SymbolLinkGroupId } from "@vninvestcharts/engine-react";
import { DEFAULT_PANES, toSeriesTier, type PaneDescriptor, type SeriesConfig, type ChartTheme, type SeriesTier, type SeriesTypeId, type VisibleRange, ChartRenderContext, useChartTheme, useDynamicPanes } from "../lib/core";
import { StockChartProvider } from "../lib/StockChartContext";
import { useResizeAdapter } from "./hooks/useResizeAdapter";
import { useChartImperativeHandle } from "./hooks/useChartImperativeHandle";
import { computePaneScaleSlotDomains } from "../lib/core/paneScaleSlotDomains";
import { WhaleMarketBubbleOverlay } from "../lib/indicators/overlays/WhaleMarketBubbleOverlay";
import { CVDIndicator } from "../lib/indicators/overlays/CVDIndicator";

import { getSeriesStyleOverride, subscribeSeriesStyleChanges } from "../lib/core";
import { ExternalCVDOverlay } from "../lib/indicators/overlays/ExternalCVDOverlay";
import { DarkFlowBadge } from "../lib/indicators/overlays/DarkFlowBadge";
import { useCanvasTheme } from "./hooks/useCanvasTheme";
import { useChartDiagSnapshot } from "./hooks/useChartDiagSnapshot";
import { useDrawingWorkspaceController, type DrawingDockTab, type DrawingWorkspaceController } from "@vninvestcharts/engine-react";
import { type DrawingStorageAdapter, isDrawingToolName, isTypingTarget, type DrawingAlertCondition, type DrawingSelectionToolbarActionId } from "@vninvestcharts/engine-drawing";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import { createDrawingObject } from "@vninvestcharts/engine-drawing";
import { type StockDataAdapter, type Timeframe } from "../lib/types/adapter";
import { type OHLCVBar } from "../lib/types/ohlcv";
import { type WidgetPaneRuntimeSnapshot, type WidgetRuntimeCapabilities, isWidgetTestEnvironment, priceFormat, dateFormat, volumeFormat, CHART_MARGIN, FALLBACK_ADAPTER, NORMALIZED_DEFAULT_PANES, type ForkTooltipToken, type ForkXAxisTick, type ForkXAxisHoverLabel, type WidgetRuntimeResolutionReason, type WidgetCoordinateBridge } from "./utils/widgetHelpers";
import { resolveLocalXIndexFromTimestamp } from "./utils/crosshairSync";
import { resolveForkEngineTheme } from "./utils/resolveForkEngineTheme";
import { resolveCandleStyleApplication } from "./utils/resolveCandleStyleChartType";
import { isContainedEcho } from "./utils/rangeSync";
import { buildDrawingOperations, convertToDrawingData as convertDrawingsToData, nextDrawingOpTimestamp } from "./utils/drawingSync";
import { hashEnrichedData } from "./utils/enrichedHash";
import { pineSeriesSignature, toPineCompileBars } from "./utils/pineSeriesData";
import { filterPanesBySeriesTier } from "../lib/core/registry/filterPanesBySeriesTier";
import { pineScriptIdFromSeriesType } from "../lib/core/seriesValueResolver";
import { usePineScriptRestore } from "./hooks/usePineScriptRestore";
import { ERROR_MESSAGE_KEYS, toWidgetError } from "./utils/widgetErrors";
import { emitTelemetry } from "./utils/telemetry";
import { ToastHost, ToastProvider, useToasts } from "./components/Toast";
import { ChartDiagOverlay } from "./components/ChartDiagOverlay";
import { applyTheme, readThemeFromElement } from "./theme/applyTheme";
import type { ThemeConfig } from "./theme/ThemeConfig";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";
import { WidgetEmptyState } from "./WidgetEmptyState";
import DrawingPriceLabelsOverlay from "./DrawingPriceLabelsOverlay";
import { injectVNInvestChartsCSS } from "./styles/injectStyles";
import { SaaSFeatureProvider } from "./contexts/SaaSFeatureContext";
import { SaaSFeatureFlags } from "./types/saas";
import type { WatchlistAdapter } from "./types/watchlist";
import type { VNInvestClient } from "./adapters/VNInvestClient";
import { useFeatureGate } from "./hooks/useFeatureGate";
import { usePatTierAuthentication } from "./hooks/usePatTierAuthentication";
import { isForkSupportedDrawingAuthoringTool, isForkSupportedDrawingManipulationType } from "@vninvestcharts/engine-drawing";
import { useWidgetData } from "./hooks/useWidgetData";
import { comparisonSeriesId, useComparisonState } from "./hooks/useComparisonState";
import { useWidgetDrawings } from "./hooks/useWidgetDrawings";
import { useDrawingToolShortcuts } from "./hooks/useDrawingToolShortcuts";
import { TOOL_SHORTCUT_KEYS } from "./config/toolShortcuts";
import { useWidgetInteractionActions } from "./hooks/useWidgetInteractionActions";
import { useWidgetForkInteraction } from "./hooks/useWidgetForkInteraction";
import { useWidgetRuntime } from "./hooks/useWidgetRuntime";
import { useWidgetCoordinateBridge } from "./hooks/useWidgetCoordinateBridge";
import { useWidgetSettings } from "./hooks/useWidgetSettings";
import { useChartSettingsSections } from "./hooks/useChartSettingsSections";
import { useWidgetWorkspaceIO } from "./hooks/useWidgetWorkspaceIO";
import { useWidgetOverlays } from "./hooks/useWidgetOverlays";
import { useForkRuntime } from "./hooks/useForkRuntime";
import { useShortcuts, useGlobalShortcutHandler, HeaderShortcuts } from "./hooks/ShortcutManager";
import { useReplayState } from "./hooks/useReplayState";
import { useReplayTrading } from "./hooks/useReplayTrading";
import { usePaperTradeInteraction } from "./hooks/usePaperTradeInteraction";
import { usePaperTradeConfig } from "./hooks/usePaperTradeConfig";
import { useOptionalWorkspaceReplayTrading } from "./context/WorkspaceReplayTradingContext";
import { useOptionalWorkspaceLiveTrading } from "./context/WorkspaceLiveTradingContext";
import { createReplayTradeMarkerInputs } from "../lib/core/replay/createReplayTradeMarkerPrimitives";
import { emitReplayEvent } from "../lib/core/replay/ReplayEventBus";
import { toPaperPosition, toPaperJournal } from "./utils/paperTradeAdapters";
import MeasurementOverlay from "./MeasurementOverlay";
import { setGlobalTimezone, type WidgetTimezone } from "../lib/utils/timezoneFormatter";
import { VNInvestChartsProvider, useVNInvestChartsState, useHoverEmitterRef } from "./context/VNInvestChartsContext";
import { useWidgetI18n } from "./context/WidgetI18nContext";
import { useTierGatedFeatures } from "./capabilities/useTierGatedFeatures";
import { CapabilityProvider } from "./components/CapabilityGate";
import { DrawingAlertsHost } from "./alerts/DrawingAlertsHost";
import { DrawingToolbar } from "./components/toolbar/DrawingToolbar";
import { OHLCHeader } from "./components/header/OHLCHeader";
import { FloatingReplayToolbar } from "./components/replay/FloatingReplayToolbar";
import { FloatingChartBar } from "./components/toolbar/FloatingChartBar";
import { ReplayCutOverlay } from "./components/replay/ReplayCutOverlay";
import { ChartFooter } from "./components/footer/ChartFooter";
import { TimeAxisScrollbar } from "./components/canvas/TimeAxisScrollbar";
import { ChartA11ySummary } from "./components/canvas/ChartA11ySummary";
import { PriceScaleMenu } from "./components/canvas/PriceScaleMenu";
import { useScaleOverlays } from "./hooks/useScaleOverlays";
import { useFloatingChartBar } from "./hooks/useFloatingChartBar";

import { DowngradeBanner } from "./components/DowngradeBanner";
import { ForkXAxisOverlay } from "./components/ForkXAxisOverlay";
import { ForkPaneTooltips } from "./components/ForkPaneTooltips";
import { ForkYAxisCrosshairLabels } from "./components/ForkYAxisCrosshairLabels";
import { ForkPaneSeparators } from "./components/ForkPaneSeparators";
import { ForkEngineSurface } from "./components/fork/ForkEngineSurface";
import { ForkBottomPanel } from "./components/fork/ForkBottomPanel";
import { useSingleChartPanelCollapse, SINGLE_FOOTER_HEIGHT_PX } from "./hooks/useBottomPanelBehavior";
import { defaultBottomPanelHeightForTab, useBottomPanelHeight } from "./hooks/useBottomPanelHeight";
import { useIndicatorsShareApplier } from "./hooks/useIndicatorsShareApplier";
import type { WhaleOrder, CVDPoint, DarkFlowSignalType, AdvisoryResult, TapeEntry } from "../lib/types/vninvest";
import { type RequestedWidgetRuntime } from "./runtimePolicy";
import { type WidgetLocale, type WidgetMessages } from "./i18n/types";
import { type EnrichedDatum } from "../lib/core/calculators/types";
import { VNSymbolSearch } from "./components/search/VNSymbolSearch";
import { SymbolSearchModal } from "./components/search/SymbolSearchModal";
import { SymbolCompareModal } from "./components/search/SymbolCompareModal";
import { resolveTimeframeMs } from "../lib/indicators/builtin/MTFWrapper";
import { DrawingContextMenu } from "@vninvestcharts/engine-react";
// VNInvestChartsLegacy removed — dead code (Phase 3)
import { resolveHasLeftAxis, resolveRailReservePx } from "./hooks/overlays/overlayHelpers";
import { CorporateEventsOverlay, type CorporateEvent } from "./components/events/CorporateEventsOverlay";
import { fetchCorporateEvents } from "./adapters/corporateEvents";

// Adapter types for dependency injection
import type {
	ResizeAdapter,
	KeyboardAdapter,
	ClockAdapter,
	StorageAdapter,
	PortalAdapter,
	ChartRegistryAdapter,
	BroadcastChannelAdapter,
	WindowEventAdapter,
	NotificationAdapter,
	AudioAdapter,
} from "@vninvestcharts/engine-react";
import { RightDockRail } from "./components/dock/RightDockRail";
import { buildBarsCsv, buildDrawingsCsv, csvFilename, downloadCsv } from "./export/chartCsv";
import type { CanonicalBar } from "./data/DataEnvelope";
import { createWidgetCoordinateBridge } from "./utils/coordinateBridge";
import { clampIndex } from "./visibleRangeBridge";
import { resolveChartRangeExtents } from "./utils/chartRange";
import { areVisibleDomainsEqual, areEngineVisibleRangesEqual } from "./visibleRangeDiagnostics";
import { resolveDateDomainFromDiscontinuous } from "./utils/widgetHelpers";
import { AlertManager, selectAlertableSeries } from "../lib/alerts/AlertManager";
import { ChartSerializer } from "./runtime/ChartSerializer";
import { TradingProvider, TradingChartSurface, ConnectedTradingDockPanel } from "./trading";

// BL-15: rarely-opened heavy panels load as separate chunks (the shared
// right-dock rail lazy-loads its host the same way). TradingProvider stays static (always mounted).
const LazyAlertsModal = lazy(() =>
	import("./components/settings/AlertsModal").then((m) => ({ default: m.AlertsModal })),
);

// CSS injection is now handled by mountVNInvestCharts in iife-entry.ts
// injectVNInvestChartsCSS();

export { type WidgetPaneRuntimeSnapshot, type WidgetRuntimeCapabilities, normalizePaneDescriptorsForExplicitScaleSlots } from "./utils/widgetHelpers";


// BL-03B: canonical definitions live in ./VNInvestChartsProps (type-only
// move). Local import + re-export keeps every existing import path working.
import type {
	WidgetAuthHandler,
	VNInvestChartsProps,
	VNInvestChartsContentProps,
} from "./VNInvestChartsProps";
export type { WidgetAuthHandler, VNInvestChartsProps, VNInvestChartsContentProps };
export type { VNInvestChartsRef } from "./utils/widgetHelpers";

const VNInvestChartsContent = forwardRef<import("./types/fullChartHandle").FullChartHandle, VNInvestChartsContentProps>((props, forwardedRef) => {
	// UX-03 follow-up: the a11y summary id must be unique PER CHART INSTANCE.
	// A hardcoded id produced duplicate ids in a multi-chart workspace, and every
	// chart's aria-describedby then resolved to the first match in document
	// order — so chart #2..N announced chart #1's symbol/OHLC.
	const a11ySummaryId = useId();
	const { ref: canvasResizeRef, size } = useResizeAdapter<HTMLDivElement>({
		resizeAdapter: props.resizeAdapter,
	});
	const containerRef = useRef<HTMLDivElement | null>(null);
	const trademarkBadgeRef = useRef<HTMLDivElement | null>(null);
	const ref = useCallback((node: HTMLDivElement | null) => {
		containerRef.current = node;
		canvasResizeRef(node);
	}, [canvasResizeRef]);

	const selfHandleRef = useRef<any>(null);
	const hoveredPaneIdRef = useRef<string | null>(null);
	const forkPaneSnapshotsRef = useRef<readonly WidgetPaneRuntimeSnapshot[]>([]);
	const forkVisibleRangeRef = useRef<EngineVisibleRange | null>(null);
	const lastStableForkSpanRef = useRef<number | null>(null);
	const pendingForkVisibleRangeRef = useRef<EngineVisibleRange | null>(null);
	const pendingForkVisibleRangeRafRef = useRef<number | null>(null);
	const pendingHistoryPatchRef = useRef<EngineHistoryPatch | null>(null);
	const lastEmittedPaneSnapshotsRef = useRef<readonly WidgetPaneRuntimeSnapshot[]>([]);
	const lastPaneSnapshotsSubscriberRef = useRef<typeof props.onPaneSnapshotsChange>(undefined);
	const lastRuntimeCapabilitiesRef = useRef<WidgetRuntimeCapabilities | null>(null);
	const lastRuntimeCapabilitiesSubscriberRef = useRef<typeof props.onRuntimeCapabilitiesChange>(undefined);
	const engineInstanceRef = useRef<EngineInstance | null>(null);
	const syncDrawingHandlersRef = useRef<Set<(operation: DrawingOperation) => void>>(new Set());
	const syncViewportHandlersRef = useRef<Set<(payload: VisibleRangePayload | CrosshairPayload) => void>>(new Set());
	const isRemoteDrawingChangeRef = useRef<boolean>(false);
	const isRemoteCrosshairRef = useRef<boolean>(false);
	const isRemoteVisibleRangeRef = useRef<boolean>(false);
	// P1-H: timestamps of the last remotely-applied range, for content-based
	// echo suppression (a re-emit is an echo only if timestamps match).
	const lastRemoteRangeRef = useRef<{ from: number; to: number } | null>(null);
	const visibleRangeTimeoutRef = useRef<any>(null);
	const pendingSyncTimeRangeRef = useRef<{ from: number, to: number } | null>(null);
	const lastDrawingsRef = useRef<readonly DrawingObject[]>([]);
	const lastDrawingOpTsRef = useRef<number>(0);
	const labelColorByPaneRef = useRef<Map<string, string>>(new Map());

	const [forkEngineInstance, setForkEngineInstance] = useState<EngineInstance | null>(null);
	const [isFrozen, setIsFrozen] = useState(false);
	const [paneSnapshots, setPaneSnapshots] = useState<readonly WidgetPaneRuntimeSnapshot[]>([]);

	// Price pane bounds for scoping overlays (CVD, whale)
	const pricePaneBounds = useMemo(() => {
		const priceSnapshot = paneSnapshots.find((s) => s.paneId === "price");
		if (!priceSnapshot) return null;
		return priceSnapshot.bounds;
	}, [paneSnapshots]);
	const [hoveredPaneId, setHoveredPaneId] = useState<string | null>(null);
	const [forkOverlayState, setForkOverlayState] = useState<EngineOverlayState | null>(null);
	const [forkVisibleRange, setForkVisibleRange] = useState<EngineVisibleRange | null>(null);
	const [snapshotRevision, setSnapshotRevision] = useState(0);
	const incrementSnapshotRevision = useCallback(() => {
		setSnapshotRevision((prev) => prev + 1);
	}, []);

	// Keep labelColorByPaneRef in sync with snapshot pane IDs and axisLabelColor
	useEffect(() => {
		const axisColor = props.axisLabelColor;
		const map = labelColorByPaneRef.current;
		map.clear();
		for (const sp of paneSnapshots) {
			map.set(sp.paneId, axisColor ?? "");
		}
	}, [paneSnapshots, props.axisLabelColor]);

	const [localSymbol, setLocalSymbol] = useState(props.symbol || "BTCUSDT");
	useEffect(() => {
		if (props.symbol) {
			if (props.syncOverrides?.symbol === false) {
				return;
			}
			setLocalSymbol(props.symbol);
		}
	}, [props.symbol, props.syncOverrides?.symbol]);

	const [legacyVisibleRange, setLegacyVisibleRange] = useState<VisibleRange | null>(null);
	const [chartType, setChartType] = useState<string>(
		(props.initialEngineState?.chartType as string) ?? "candlestick"
	);
	const CHART_TYPE_MAP: Record<string, SeriesTypeId> = {
		candlestick: "Candlestick",
		line: "Line",
		area: "Area",
		heikinAshi: "HeikinAshi",
		hollow: "HollowCandle",
		ohlc: "OHLC",
		// Gỡ 2026-10-03: `bar` không còn map sang `Bar`. `Bar` là chart type giá
		// nhưng tên trùng heuristic `type.includes("bar")` của engine nên bị định
		// tuyến vào mode zero-based của volume: cột vẽ từ 0 tới close, trục Y chạy
		// 0→100.000, biến động giá nén ~8% trên cùng. `ohlc` ở trên đã cho đúng
		// chart nến-tick. Ledger `WA_BAR_RUNTIME_2026-10-03`.
		// A3 Baseline + A11 Renko/Kagi/PointAndFigure/LineBreak (2026-09-29). Năm key
		// này chỉ được thêm SAU khi cả ba tầng đều đã có:
		//   1. producer    `core/calculators/exoticChartData.ts` (renko bricks, kagi state,
		//                  pnf columns + pnfColumnStart, line-break levels, và
		//                  `normalizePricesToBaseline` phát normalized price cho symbol chính)
		//   2. resolver    `case` trong `seriesValueResolver.ts` cho cả năm
		//   3. render mode `exoticSeriesModes.ts` ở engine
		// Trước đó, chỉ cần `registerSeries` + key map là ĐỦ ĐỂ vẽ ra thứ sai: series rơi
		// vào `default: return datum.close` (`seriesValueResolver.ts`) và engine chỉ có
		// `"line" | "area" | "bar"` ⇒ chọn xong thấy đường Line dưới nhãn khác. Đó là lý do
		// comment cũ dài 30 dòng nói "KHÔNG thêm baseline ở đây" — lý do đó ĐÃ hết hiệu lực.
		//
		// Baseline vẽ PHẦN TRĂM so với bar mốc, KHÔNG phải giá tuyệt đối: đó là thứ
		// `normalizePricesToBaseline` phát ra (`((close - base) / base) * 100`) và là thứ mà
		// mọi consumer sẵn có của map đó đọc (`resolveOverlayValue`, overlay `valueMode:
		// "percent"` của engine). Dùng giá tuyệt đối sẽ cần một normaliser thứ hai cho cùng
		// một khái niệm. Khoá bằng `registry/__tests__/chartTypeContract.test.ts`.
		//
		// `pointAndFigure` KHÔNG thể alias sang renko: một cột P&F gom mọi box vào cùng
		// một x, còn `toBarPoints` đặt mỗi bar một x riêng. Nó dùng mode
		// `pointandfigure` (`pointAndFigureColumns.ts`) — x lấy từ `pnfColumnStart`.
		baseline: "Baseline",
		renko: "Renko",
		kagi: "Kagi",
		pointAndFigure: "PointAndFigure",
		lineBreak: "LineBreak",
	};



	const hasExternalData = Array.isArray(props.data);

	// S2.3/F-04 (PASS, no logic change): `engineRuntime` arriving here is
	// ALREADY `effectiveRuntime` from `useWidgetRuntime` (wrapper below) —
	// single source of truth; do not re-derive.
	//
	// G4 2026-10-03: this used to be `=== "fork"`, which sent a host still passing
	// "auto" down the legacy branch. With the legacy lane deleted that would render
	// nothing at all, so the comparison is now against the resolved value, which is
	// always fork. Kept as a boolean rather than deleted because ~20 downstream
	// branches read it.
	const isForkRuntime = true;
	const resolvedLegacyVisibleRangeRef = useRef<VisibleRange | null>(null);

	// A4: tier cho watermark PNG. Ref vì `effectiveToolbarTier` chỉ có sau :685, còn
	// `useWidgetSettings` dựng ở :288 — truyền giá trị sẽ đọc trong TDZ.
	const exportTierRef = useRef<string | undefined>(undefined);
	// 1. Settings hook
	const settings = useWidgetSettings({
		...props,
		containerRef,
		size,
		plotData: [],
		syncOverrides: props.syncOverrides,
		tierRef: exportTierRef,
	});

	// Batch B: reactive access to the settings sections that no runtime consumer
	// read before (Appearance / Symbol / Trading) + the crosshair mode SSOT.
	const settingsSections = useChartSettingsSections({
		chartId: props.id,
		storageAdapter: props.storageAdapter,
		isDark: settings.isDark,
	});

	// A4: scales.showSymbolLastValue & showPrevCloseValue reach engineOptions.
	const engineOptions = useMemo<EngineOptions>(
		() => ({
			useWebGL: props.useWebGL ?? false,
			priceLines: {
				lastValue: settingsSections.sections.scales.showSymbolLastValue,
				prevClose: settingsSections.sections.scales.showPrevCloseValue,
			},
		}),
		[
			props.useWebGL,
			settingsSections.sections.scales.showSymbolLastValue,
			settingsSections.sections.scales.showPrevCloseValue,
		],
	);

	// B1: the multi-chart grid enables the per-cell status line through this
	// context; the single chart keeps its own (full) header.

	// B5: the trading section of the settings drives the corporate events and
	// the paper-trading overlays. A host prop always wins over the setting.
	const tradingVisibility = useMemo(() => {
		const tradingEvents = settingsSections.sections.tradingEvents;
		return {
			showCorporateEvents: props.showCorporateEvents ?? tradingEvents.showCorporateEvents ?? true,
			showPaperOrders: tradingEvents.showPaperOrders ?? true,
			showPaperPositions: tradingEvents.showPaperPositions ?? true,
		};
	}, [settingsSections.sections.tradingEvents, props.showCorporateEvents]);

	const comparisonState = useComparisonState(props.id ?? null);

	// Emit comparison changes up to parent
	const onComparisonChangeRef = useRef(props.onComparisonChange);
	onComparisonChangeRef.current = props.onComparisonChange;
	useEffect(() => {
		onComparisonChangeRef.current?.(comparisonState.overlays);
	}, [comparisonState.overlays]);

	// Hover emitter ref for OHLC hover tooltip
	const hoverEmitterRef = useHoverEmitterRef();

	const emitCoordinateBridgeRef = useRef<(snapshots: readonly WidgetPaneRuntimeSnapshot[], range: EngineVisibleRange | null) => void>(() => {});
	const handleVisibleDomainChangeRef = useRef<(domain: [Date | number, Date | number]) => void>(() => {});

	const emitCoordinateBridgeWrapper = useCallback((snapshots: readonly WidgetPaneRuntimeSnapshot[], range: EngineVisibleRange | null) => {
		emitCoordinateBridgeRef.current(snapshots, range);
	}, []);

	const handleVisibleDomainChangeWrapper = useCallback((domain: [Date | number, Date | number]) => {
		handleVisibleDomainChangeRef.current(domain);
	}, []);

	const resolvedPanes = useMemo<readonly PaneDescriptor[]>(() => {
		const basePanes = settings.visiblePanes;
		const customHeader = !!props.renderPaneToolbar;
		const overlayTimeframe = settings.overlayTimeframe;
		const overlayStyle = settings.overlayStyle;
		const hasOverlay = overlayTimeframe && overlayTimeframe !== "Same as chart" && overlayTimeframe !== settings.localTimeframe;
		const validOverlay = hasOverlay && resolveTimeframeMs(overlayTimeframe) / resolveTimeframeMs(settings.localTimeframe) <= 24;
		const hasCompareOverlays = comparisonState.overlays.length > 0;

		if (!customHeader && !validOverlay && !hasCompareOverlays) return basePanes;

		return basePanes.map((pane): PaneDescriptor => {
			if (pane.id !== "price") return pane;
			const mapped: PaneDescriptor = { ...pane };
			if (customHeader) mapped.tooltip = "none";
			if (validOverlay) {
				mapped.series = [
					...mapped.series,
					{
						id: "htf-overlay",
						type: "HTFOverlay" as any, // ARC-1-keep: legacy bridge
						yAxis: "right",
						params: { timeframe: overlayTimeframe, overlayStyle },
						visible: true,
					},
				];
			}
			if (hasCompareOverlays) {
				mapped.series = mapped.series.concat(
					comparisonState.overlays.map((ov) => ({
						// Must be the same string useComparisonState builds its overlay state around, since
						// paneScaleSlotDomains looks the style up by series id. Built here by hand
						// before; sharing the hook's scope is what keeps the two from drifting.
						id: comparisonSeriesId(comparisonState.scope, ov.symbolId),
						type: "Comparison" as any, // ARC-1-keep: legacy bridge
						yAxis: ov.yAxis,
						overlaySymbolId: ov.symbolId,
						normalizeToBaseline: ov.normalizeToBaseline,
						// DATA-02: engine phải đọc CÙNG buffer mà trục format.
						// `percent` → datum.normalizedPrices[sym] (% từ baseline);
						// `absolute` → datum.symbolData[sym].close.
						valueMode: ov.normalizeToBaseline ? "percent" : "absolute",
						color: ov.color,
						lineWidth: ov.lineWidth,
						lineStyle: ov.lineStyle,
						visible: ov.visible,
						fillArea: ov.fillArea,
						overlay: true,
					}))
				);
			}
			return mapped;
		});
	}, [settings.visiblePanes, settings.overlayTimeframe, settings.overlayStyle, settings.localTimeframe, props.renderPaneToolbar, comparisonState.overlays]);

	// 1.3b. Declared here, immediately after resolvedPanes, because BOTH consumers come
	// earlier than the tier gate: the push chokepoint (:590) and the useWidgetData call
	// (:436). Computing it after seriesTierGate (:755) is a TDZ error - tsc caught exactly
	// that during implementation. Unfiltered on purpose: the re-push decision is about
	// whether the Pine SET changed, which holds regardless of tier.
	const pineSeriesSignatureValue = useMemo(() => pineSeriesSignature(resolvedPanes), [resolvedPanes]);

	// 1.6b: only Pine types already present on the chart are eligible for restore. Unfiltered on
	// purpose — the tier gate must not decide whether a saved script is worth re-registering, and
	// the `useWidgetData` call at :436 runs before `seriesTierGate` exists.
	const restorableSeriesTypes = useMemo(() => {
		const types: string[] = [];
		for (const pane of resolvedPanes) {
			for (const s of pane.series ?? []) {
				if (pineScriptIdFromSeriesType(String(s.type))) types.push(String(s.type));
			}
		}
		return types;
	}, [resolvedPanes]);

	// 1.6b: re-register saved Pine scripts at WIDGET mount, not in the (lazy-loaded) panel, and
	// expose a version so `renderPanes` recomputes once the registry is populated. The plugin
	// registry is a module-level Map, so registering does not invalidate any memo by itself.
	const pineRestoreVersion = usePineScriptRestore(restorableSeriesTypes);

	// 2. Data hook
	const outerOnVisibleRangeChangeRef = useRef(props.onVisibleRangeChange);
	outerOnVisibleRangeChangeRef.current = props.onVisibleRangeChange;
	const syncVisibleRangeGuardRef = useRef<((range: any) => void) | undefined>(undefined);
	if (!syncVisibleRangeGuardRef.current) {
		syncVisibleRangeGuardRef.current = (range: any) => {
			if (isRemoteVisibleRangeRef.current) {
				// P1-H: drop only TRUE echoes (same timestamps as applied).
				// Genuine pans release the guard immediately instead of waiting
				// out the 200ms backstop (which used to eat rapid pans).
				if (!isContainedEcho(range?.timeRange, lastRemoteRangeRef.current)) {
					isRemoteVisibleRangeRef.current = false;
					lastRemoteRangeRef.current = null;
					if (visibleRangeTimeoutRef.current) {
						clearTimeout(visibleRangeTimeoutRef.current);
						visibleRangeTimeoutRef.current = undefined;
					}
				} else {
					return;
				}
			}
			outerOnVisibleRangeChangeRef.current?.(range);
		};
	}
	// Ref flag read by useWidgetData to suppress its full-dataset feed while
	// replay is active (the fork camera effect becomes the sole data feed).
	const replayActiveForFeedRef = useRef(false);

	const dataResult = useWidgetData({
		...props,
		// 1.3b. Computed from `resolvedPanes` inline rather than reusing the memo below,
		// because this call site (:436) runs long before `seriesTierGate` (:755) — passing a
		// value declared there would be a TDZ error. `resolvedPanes` has existed since :351.
		// Using the UNFILTERED list is deliberate: the re-push decision is about "the Pine set
		// changed", which is true whether or not the current tier is allowed to render it.
		pineSeriesSignature: pineSeriesSignature(resolvedPanes),
		// Restore is async (dynamic import), so it can land after the first enrichment pass.
		// Forwarding the version lets `useWidgetData` rebuild its canonical store, which is what
		// prevents cached `undefined` values from surviving a late restore.
		pineRestoreVersion,
		symbol: localSymbol,
		onVisibleRangeChange: syncVisibleRangeGuardRef.current,
		timeframe: settings.localTimeframe,
		useForkRuntime: isForkRuntime,
		engineInstanceRef,
		forkVisibleRangeRef,
		forkVisibleRange,
		setForkVisibleRange,
		incrementSnapshotRevision,
		emitCoordinateBridge: emitCoordinateBridgeWrapper,
		forkPaneSnapshotsRef,
		paneSnapshots,
		panes: resolvedPanes,
		forkEngineInstance,
		onVisibleDomainChange: handleVisibleDomainChangeWrapper,
		controlledXExtents: props.xExtents,
		initialXExtents: props.xExtents !== undefined ? undefined : settings.internalXExtents,
		pendingForkVisibleRangeRef,
		pendingForkVisibleRangeRafRef,
		lastStableForkSpanRef,
		pendingHistoryPatchRef,
		pendingSyncTimeRangeRef,
		overlayTimeframe: settings.overlayTimeframe,
		replayActiveRef: replayActiveForFeedRef,
	});

	// R3.1: broadcast every local controller tick immediately (same frame).
	const suppressReplayTickRef = useRef(false);
	const emitReplayTick = useCallback((barIndex: number, currentBarDate: number | undefined) => {
		if (props.isActiveChart === false || !props.id || currentBarDate === undefined) return;
		emitReplayEvent({ type: "REPLAY_SEEK", chartId: props.id, timestamp: Date.now(), barIndex, currentBarDate }, props.replayInstanceId);
	}, [props.isActiveChart, props.id, props.replayInstanceId]);

	// 1.6: the single-chart mount site passed NO bars, so the Pine worker validated every script
	// against an empty dataset. Declared after `dataResult` (:457) for that reason — `tsc`
	// rejects reading it earlier. Pure projection, so memoising on `dataResult.bars` is enough.
	const pineCompileBars = useMemo(() => toPineCompileBars(dataResult.bars), [dataResult.bars]);

	const replay = useReplayState(dataResult.plotData, { onTick: emitReplayTick, suppressTickRef: suppressReplayTickRef });
	const replayActive = replay.replayActive && replay.replayData;
	const replayAwaitingStartBarRef = useRef(false);
	const [replayAwaitingStartBar, setReplayAwaitingStartBar] = useState(false);
	const [showReplayBar, setShowReplayBar] = useState(false);
	const replayBarVisibleRef = useRef(false);
	const replayPlayingRef = useRef(replay.playing);
	const drawingsResultRef = useRef<any>(undefined);

	const replayBars = useMemo(() => (dataResult.plotData as Array<{ open: number; high: number; low: number; close: number; date: Date | number }>).map(
		(d) => ({ open: d.open, high: d.high, low: d.low, close: d.close, date: d.date })
	), [dataResult.plotData]);

	const workspaceReplay = useOptionalWorkspaceReplayTrading();
	// Task M3: shared LIVE broker của workspace (multi) — single-chart không có provider nên undefined.
	const workspaceLive = useOptionalWorkspaceLiveTrading();

	// A6: single-chart replay book is local; the workspace owns the multi-chart one.
	// Provider always consumes one of these books instead of creating its own replay pair.
	const localReplayTrading = useReplayTrading({
		currentBar: replay.currentBar,
		bars: replayBars,
		enabled: Boolean(replay.sessionActive && !workspaceReplay),
		symbol: dataResult.activeSymbol,
		sessionEpoch: replay.sessionEpoch,
	});

	const replayTrading = workspaceReplay ?? localReplayTrading;
	const effectiveReplayActive = workspaceReplay ? workspaceReplay.isReplayActive : replay.sessionActive;
	const isSessionOwner = workspaceReplay ? workspaceReplay.sessionOwnerId === props.id : replay.sessionActive;
	replayActiveForFeedRef.current = effectiveReplayActive;
	// Task M3: chỉ VN-spot mới share book (crypto/phái sinh giữ broker cục bộ đúng lot/tick).
	const sharedLive = workspaceLive?.brokerFor(dataResult.activeSymbol);

	// A6: only the owning chart feeds the shared workspace book; the old
	// isActiveChart gate lost the session as soon as chart focus moved.
	const isReplayFeedActive = Boolean(workspaceReplay && isSessionOwner && replay.sessionActive && replayBars.length > 0);
	const workspaceEpochRef = useRef(replay.sessionEpoch);
	useLayoutEffect(() => {
		if (!workspaceReplay || workspaceReplay.sessionOwnerId !== props.id) return;
		if (workspaceEpochRef.current === replay.sessionEpoch) return;
		workspaceEpochRef.current = replay.sessionEpoch;
		workspaceReplay.reset();
	}, [workspaceReplay, props.id, replay.sessionEpoch]);
	useEffect(() => {
		if (!isReplayFeedActive) return;
		const bar = replayBars[replay.currentBar];
		if (bar) workspaceReplay!.feedBar(bar, replay.currentBar, replay.currentBarTimestamp, dataResult.activeSymbol, replayBars);
	}, [isReplayFeedActive, workspaceReplay, replayBars, replay.currentBar, replay.currentBarTimestamp, replay.sessionEpoch]);

	useEffect(() => {
		replayPlayingRef.current = replay.playing;
	}, [replay.playing]);

	const claimReplayOwner = useCallback(() => {
		if (workspaceReplay && props.id) workspaceReplay.claimSessionOwner(props.id);
	}, [workspaceReplay, props.id]);
	const handleReplayPlay = useCallback(() => {
		claimReplayOwner();
		replay.onReplayPlay();
	}, [claimReplayOwner, replay.onReplayPlay]);
	const handleReplayStepForward = useCallback(() => {
		claimReplayOwner();
		replay.onReplayStepForward();
	}, [claimReplayOwner, replay.onReplayStepForward]);
	const handleReplayStepBack = useCallback(() => {
		claimReplayOwner();
		replay.onReplayStepBack();
	}, [claimReplayOwner, replay.onReplayStepBack]);
	const handleReplayRewind = useCallback(() => {
		claimReplayOwner();
		replay.onReplayRewind();
	}, [claimReplayOwner, replay.onReplayRewind]);
	const handleReplaySeek = useCallback((barIndex: number) => {
		claimReplayOwner();
		replay.onReplaySeek(barIndex);
	}, [claimReplayOwner, replay.onReplaySeek]);
	const handleReplayStop = useCallback(() => {
		if (workspaceReplay && workspaceReplay.sessionOwnerId === props.id) {
			workspaceReplay.clearSessionOwner();
		}
		replay.onReplayStop();
		replayAwaitingStartBarRef.current = false;
		setReplayAwaitingStartBar(false);
	}, [workspaceReplay, props.id, replay.onReplayStop]);

	const handleReplayStartBarSelect = useCallback((date: Date | number) => {
		claimReplayOwner();
		replay.onReplaySeekByDate(date);
		replayAwaitingStartBarRef.current = false;
		setReplayAwaitingStartBar(false);
		// Multi-chart: Alt+click chọn start bar trên chart này phải là authoritative —
		// broadcast timestamp cho tất cả chart khác sync theo (không bị election kéo về cuối).
		if (props.id) {
			emitReplayEvent({
				type: "REPLAY_SEEK",
				chartId: props.id,
				timestamp: Date.now(),
				barIndex: 0,
				currentBarDate: date instanceof Date ? date.getTime() : date,
				forceBroadcast: true,
			}, props.replayInstanceId);
		}
	}, [claimReplayOwner, replay, props.id, props.replayInstanceId]);

	const replayTradeMarkerFn = useCallback(
		(
			visibleRange: EngineVisibleRange,
			paneSnapshots: readonly PaneRuntimeSnapshot[],
		) => {
			if (!replayActive || (replayTrading.positions.length === 0 && replayTrading.closedTrades.length === 0)) {
				return null;
			}
			const mainPane = paneSnapshots[0];
			if (!mainPane) return null;
			const scaleSlotId = Object.keys(mainPane.scaleSlotStates)[0] ?? "default";
			return createReplayTradeMarkerInputs(
				{ positions: replayTrading.positions, closedTrades: replayTrading.closedTrades },
				mainPane,
				visibleRange,
				scaleSlotId,
			);
		},
		[replayActive, replayTrading.positions, replayTrading.closedTrades],
	);

	const paperTradeConfig = usePaperTradeConfig({
		symbol: dataResult.activeSymbol,
		sizingMode: props.sizingMode,
		riskPercent: props.riskPercent,
		initialEquity: props.initialEquity,
	});
	const wrappedOnClick = usePaperTradeInteraction({
		replayTrading,
		replayActive: Boolean(replayActive),
		replaySelectionEnabled: props.replaySelectionEnabled ?? showReplayBar,
		isCutMode: replayAwaitingStartBar,
		baseOnClick: props.onClick,
		handleReplayStartBarSelect,
		resolveActiveTool: () => drawingsResultRef.current?.drawingWorkspace?.state?.activeTool,
		defaultQty: paperTradeConfig.defaultQty,
		symbol: paperTradeConfig.symbol,
		feeRate: paperTradeConfig.feeRate,
		sizingMode: paperTradeConfig.sizingMode,
		riskPercent: paperTradeConfig.riskPercent,
		initialEquity: paperTradeConfig.initialEquity,
	}).wrappedOnClick;

	const forkEnrichedData = useMemo(
		() => (replay.replayActive ? dataResult.enrichedData.slice(0, replay.currentBar + 1) : dataResult.enrichedData),
		[replay.replayActive, replay.currentBar, dataResult.enrichedData],
	);
	const forkPlotData: readonly EnrichedDatum[] = replay.replayActive ? forkEnrichedData : dataResult.plotData;
	const forkBars = useMemo(
		() => (replay.replayActive ? dataResult.bars.slice(0, replay.currentBar + 1) : dataResult.bars),
		[replay.replayActive, replay.currentBar, dataResult.bars],
	);
	const prevForkDataRef = useRef<readonly EnrichedDatum[]>(dataResult.enrichedData);
	const prevForkDataHashRef = useRef<string>("");
	const prevPineSignatureRef = useRef<string>("");
	const prevReplayActiveRef = useRef(replay.replayActive);
	const replayWindowPinnedRef = useRef(false);
	useEffect(() => {
		const engine = engineInstanceRef.current;
		if (!engine || !isForkRuntime) return;
		const nextData = replay.replayActive ? forkEnrichedData : dataResult.enrichedData;
		const hash = hashEnrichedData(nextData, { includeComparison: true });

		const wasActive = prevReplayActiveRef.current;
		const prevPushedLen = prevForkDataRef.current.length;
		prevReplayActiveRef.current = replay.replayActive;

		// BUG-3: replay mode transitions must always reconcile the camera,
		// even when the data hash is unchanged (hash-only skip would strand
		// the viewport in the replay window after exit).
		const replayModeChanged = wasActive !== replay.replayActive;
		// 1.3b: `hashEnrichedData` reads date/OHLCV/symbolData and is therefore BLIND to
		// `indicatorValues`. Adding or removing a Pine series changes no bar and no comparison
		// overlay, so the hash is identical and this chokepoint returns early — the freshly
		// enriched `indicatorValues` (which is what the tooltip and the Y-domain read) would
		// never reach the engine. The Pine series list is the cheap signal that the hash cannot
		// see; it is O(#series), not O(#bars).
		const pineListChanged = pineSeriesSignatureValue !== prevPineSignatureRef.current;
		if (!replayModeChanged && !pineListChanged && hash === prevForkDataHashRef.current) {
			return;
		}
		prevPineSignatureRef.current = pineSeriesSignatureValue;
		prevForkDataHashRef.current = hash;
		prevForkDataRef.current = nextData;

		// Flicker fix: the engine's syncCameraAfterDataChange runs INSIDE
		// setEnrichedData (before any camera override we apply afterwards).
		// If followLatest is already true when setEnrichedData fires, it just
		// auto-scrolls to the playhead (no zoom-to-fit) — so we set the camera
		// BEFORE pushing data. We must NOT call zoomToRange on every tick:
		// that re-fits the camera after the engine already drew, producing the
		// full-chart flash frame on every new candle.
		if (replay.replayActive && replay.playing) {
			if (!replayWindowPinnedRef.current) {
				// Pin the view window once on entering playback, then hand
				// control to followLatest so the window scrolls with the
				// playhead without re-fitting each tick.
				pinReplayCutEdge(engine, nextData.length);
				replayWindowPinnedRef.current = true;
			}
			engine.setCameraState({ followLatest: true, rightOffsetBars: 0 });
		} else if (replay.replayActive && !replay.playing) {
			// Paused: the engine holds sliced replay history (R1.1), so release
			// followLatest and let the user pan the replay window freely.
			engine.setCameraState({ followLatest: false });
			replayWindowPinnedRef.current = false;
			// R1.1b: pin once on activation/shrink (never on paused growth).
			if (!wasActive || nextData.length < prevPushedLen) {
				pinReplayCutEdge(engine, nextData.length);
			}
		} else {
			replayWindowPinnedRef.current = false;
			if (wasActive) {
				// BUG-3 (first divergence): exiting replay must resume the live
				// edge — the paused branch set followLatest:false and nothing
				// else restores it, so live ticks would stop scrolling.
				// Camera BEFORE data (same flicker-fix ordering as above).
				engine.setCameraState({ followLatest: true, rightOffsetBars: 0 });
			}
		}

		engine.setEnrichedData(nextData as unknown as readonly Record<string, unknown>[]);
		// BLACKSCREEN-FIX: forkEngineInstance (null → engine on ready) re-runs
		// this effect when the engine finishes init AFTER data already landed.
		// Without it the push above is skipped once and never retried → black
		// chart until the next data change (e.g. adding a comparison).
	}, [replay.replayActive, forkEnrichedData, dataResult.enrichedData, isForkRuntime, engineInstanceRef, forkEngineInstance, pineSeriesSignatureValue]);

	function pinReplayCutEdge(engine: { getVisibleRange: () => { from: number; to: number } | null; zoomToRange: (range: { from: number; to: number }) => void }, dataLen: number) {
		const prevRange = engine.getVisibleRange();
		const visibleBars = prevRange ? Math.round(prevRange.to - prevRange.from) : 100;
		engine.zoomToRange({ from: Math.max(0, dataLen - Math.min(visibleBars, dataLen)), to: dataLen });
	}
	const { paneState } = useVNInvestChartsState();
	const prevEngineChartTypeRef = useRef<string | undefined>(
		props.initialEngineState?.chartType as string | undefined
	);
	useEffect(() => {
		const engineCt = props.initialEngineState?.chartType as string | undefined;
		const prevCt = prevEngineChartTypeRef.current;
		prevEngineChartTypeRef.current = engineCt;
		if (engineCt !== undefined && engineCt !== prevCt) {
			if (props.syncOverrides?.chartType === false) {
				return;
			}
			setChartType(engineCt);
			const seriesType = CHART_TYPE_MAP[engineCt];
			if (seriesType) {
				paneState.dispatch({ type: "updateSeriesType", paneId: "price", seriesType, seriesIndex: 0 });
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [props.initialEngineState?.chartType, props.syncOverrides?.chartType]);

	// B3: the "Display Style" control of the symbol tab (settings.symbol.candleStyle)
	// had no reader. It is applied only when the stored style really changes, so
	// it never fights the chart-type picker and never replaces the series of the
	// price pane on mount (the first run only records the current style).
	const appliedCandleStyleRef = useRef<string | undefined>(undefined);
	useEffect(() => {
		const style = settingsSections.sections.symbol.candleStyle;
		const decision = resolveCandleStyleApplication({
			appliedStyle: appliedCandleStyleRef.current,
			style,
		});
		appliedCandleStyleRef.current = style;
		if (!decision.apply) return;
		setChartType(decision.chartType);
		const seriesType = CHART_TYPE_MAP[decision.chartType];
		if (seriesType) {
			paneState.dispatch({ type: "updateSeriesType", paneId: "price", seriesType, seriesIndex: 0 });
		}
	}, [settingsSections.sections.symbol.candleStyle, paneState]);

	const [activeBottomTab, setActiveBottomTab] = useState<"strategy_tester" | "pine_editor" | "paper_trade" | null>(null);
	// Chiều cao theo tab khi chưa kéo tay (đồng nhất multi) — xem useBottomPanelHeight.
	const bottomPanelHeight = useBottomPanelHeight(defaultBottomPanelHeightForTab(activeBottomTab));
	// UI-D1: collapse indicator subpanes while the bottom panel squeezes the chart.
	useSingleChartPanelCollapse({
		panelOpen: activeBottomTab !== null,
		chartAreaHeight: activeBottomTab !== null ? size.height - bottomPanelHeight.heightPx - SINGLE_FOOTER_HEIGHT_PX : size.height,
		visiblePaneIds: settings.visiblePanes.map((pane) => pane.id),
		onTogglePaneVisible: settings.handlePaneToggleVisible,
	});
	// P2: footer scale buttons mirror the main price-slot mode (SSOT in
	// useScaleOverlays, persisted per pane). Engine log/percent is live.
	const [alertsModalOpen, setAlertsModalOpen] = useState(false);
	const [compareDialogOpen, setCompareDialogOpen] = useState(false);

	// P0-a — webhook entitlement. The manager is built once (it owns alert state and persistence),
	// so the predicate travels in a ref that is refreshed every render rather than being captured
	// in a factory: `tierGated` does not exist until :798, and the licence resolves asynchronously,
	// so capturing either here would freeze the answer at mount and lock out a customer who
	// validates late. Fail-closed default lives in `AlertManager` itself.
	const webhookAllowedRef = useRef<() => boolean>(() => false);
	const alertManager = useMemo(() => new AlertManager(() => webhookAllowedRef.current()), []);

	// i18n for ad popup locale
	const { t } = useWidgetI18n();
	const adLocale = useMemo(() => ({
		popupTitle: t("ads.title"),
		popupDescription: t("ads.description"),
		upgradeText: t("ads.upgrade"),
		closeText: t("ads.close"),
		closeCountdownText: (countdown: number) => t("ads.closeCountdown", { countdown }),
		badgePromo: "PROMO",
		badgeAd: "AD",
		imageAlt: t("ads.imageAlt"),
		closeAriaLabel: t("ads.close"),
	}), [t]);

	// Free tier Ads & Trademark system
	const { flags, isValid, adCampaign, checkFeature } = useFeatureGate();
	// PAT tier auth SSOT (fail-closed; see usePatTierAuthentication).
	const {
		validatePat,
		effectiveToolbarTier,
		enginePat,
		handleTierValidated,
		showDowngradeBanner,
		handleDismissDowngrade,
		licenseCapabilities,
	} = usePatTierAuthentication({ client: props.client });

	// A4: tier thật chỉ tồn tại từ đây trở đi; gán vào ref cho lúc export đọc.
	exportTierRef.current = effectiveToolbarTier;
	// W0.5: capability gate + cờ SaaS là ĐIỀN KIỆN CẦN (AND, không phải OR). Thay thế
	// `checkFeature("isReplayEnabled")` đơn lẻ ở dưới (chỉ đọc cờ ⇒ replay miễn phí).
	// H0.9 — `debugTier` MUST be inert in a production build. It used to feed the tier
	// straight into both gates with no production guard (its sibling `debugFeatures` had
	// one at contexts/SaaSFeatureContext.tsx:474) AND set `narrowing: undefined`, which
	// strips the signed licence's capability allowlist — so one prop raised the tier and
	// removed the safety rail. Rule 15 forbids exactly that.
	//
	// INLINE and BARE `process.env.NODE_ENV` on purpose: behind a helper call the branch
	// survives into the shipped bytes even once provably dead, and the bare member is
	// what tsup's `define` / webpack's DefinePlugin substitute. Same two constraints as
	// the dev-license hook at contexts/SaaSFeatureContext.tsx:54-65.
	// Runtime lock: VNInvestCharts.runtimeMounts.contract.test.tsx. Shape lock:
	// __tests__/debugTier.production.test.ts. Full rationale: AUDIT_LEDGER H0.9.
	const debugTierOverride = typeof process !== "undefined" && process.env.NODE_ENV !== "production"
		? props.debugTier : undefined;
	const tierGated = useTierGatedFeatures(debugTierOverride ?? effectiveToolbarTier, {
		narrowing: debugTierOverride ? undefined : licenseCapabilities,
	});
	const canUseReplay = tierGated.canUseReplay;
	// Assigned (not captured) after `tierGated` exists, so the manager's predicate reflects the
	// live tier including an async licence that lands after mount. AC-A5.
	webhookAllowedRef.current = () => tierGated.allows("webhook");
	// `alert_local` is Pro (engine `capabilities.ts:135`). The engine already knew; the widget
	// never asked, so the surface rendered for everyone. Asking is the whole fix.
	const canUseAlertLocal = tierGated.allows("alert_local");

	// Trademark compliance (widget renders badge, engine monitors)
	const trademarkCompliance = useTrademarkCompliance({
		patTier: effectiveToolbarTier,
		enforcementEnabled: requiresAds(effectiveToolbarTier),
		badgeRef: trademarkBadgeRef,
	});

	// S3b-1/S5b: map PAT tier (7 mức engine) về SeriesTier 3 mức (SSOT toSeriesTier).
	const seriesTierGate: SeriesTier = toSeriesTier(effectiveToolbarTier);

	// 1.7 tier render gate. This MUST sit here, not in `resolvedPanes` (:351) and not at
	// `forkEnginePanes` (:1153):
	//  - `resolvedPanes` is built before `effectiveToolbarTier` exists (:713), so reading the
	//    tier there is a TDZ error (:315 already warns about this).
	//  - `forkEnginePanes` is not the only consumer: `ForkPaneTooltips` (:2543) reads
	//    `resolvedPanes` directly and calls `getSeries` UNGUARDED (`widgetHelpers.ts:447`), which
	//    throws `SeriesRegistry: unknown type` for an unregistered Pine type — on hover, so no
	//    unit test that only inspects the engine's pane list would ever see it.
	// `resolvedPanes` itself stays UNFILTERED so the settings composer can still show a locked
	// series as an upgrade prompt; only the render tree is gated.
	const renderPanes = useMemo(
		() => filterPanesBySeriesTier(resolvedPanes, seriesTierGate),
		// `pineRestoreVersion` is load-bearing, not decorative: the tier gate reads a module-level
		// registry, so a restore that happens after the first render would otherwise leave the
		// saved series dropped until something unrelated invalidated this memo.
		[resolvedPanes, seriesTierGate, pineRestoreVersion],
	);

	const upgradeUrl = props.upgradeUrl;
	const trademarkUrl = props.trademarkUrl || "https://vninvest.edusuccess.vn";
	const handlePremiumToolClick = useCallback((_tool: string) => {
		// Every locked Pro tool lands here, including alerts: opening a surface that cannot
		// deliver would be worse than sending the user to upgrade.
		if (upgradeUrl) window.open(upgradeUrl, "_blank", "noopener,noreferrer");
	}, [upgradeUrl]);

	/** Open the alerts modal when granted; otherwise send the user to upgrade, like every
	 *  other locked Pro tool. Silent no-op was the alternative. */
	const openAlertsModal = useCallback(() => {
		if (canUseAlertLocal) {
			setAlertsModalOpen(true);
			return;
		}
		if (upgradeUrl) window.open(upgradeUrl, "_blank", "noopener,noreferrer");
	}, [canUseAlertLocal, upgradeUrl]);

	const handleUpgradeFromBanner = useCallback(() => {
		if (upgradeUrl) window.open(upgradeUrl, "_blank", "noopener,noreferrer");
	}, [upgradeUrl]);

	// W1.4: export PNG đã có sẵn từ lâu (SaveChartAsImage → previewImageDataUrl) và
	// **chưa bao giờ** bị gate — cùng bệnh với replay trước W0.5. Gate ở MỘT handler
	// để bắt được cả nút header (OHLCHeader:427/:718) lẫn public API
	// `saveAsImage` (useChartImperativeHandle:1949). Chỗ này đặt ngay sau
	// `handleUpgradeFromBanner` vì `useWidgetSettings` được tạo ở ~288, TRƯỚC
	// `useTierGatedFeatures` (~693) nên không thể gate bên trong hook đó.
	// Khi chưa đủ quyền ⇒ dẫn tới đường nâng cấp, KHÔNG export rồi mới báo.
	const handleGatedSnapshot = useCallback(() => {
		if (!tierGated.allows("export_png")) {
			handleUpgradeFromBanner();
			return;
		}
		settings.handleSnapshot();
	}, [tierGated, handleUpgradeFromBanner, settings]);

	// A5: CSV export — mirrors handleGatedSnapshot (W1.4): gate `export_csv`
	// via the same tierGated path, then export the chart's in-memory bars
	// (dataResult.plotData — the array the chart renders) + visible drawings
	// through chartCsv.ts (scope `loaded-in-memory`); drawings via ref (declared below).
	const handleGatedCsvExport = useCallback(() => {
		if (!tierGated.allows("export_csv")) {
			handleUpgradeFromBanner();
			return;
		}
		const bars: CanonicalBar[] = dataResult.plotData.map((d) => ({
			timestamp: d.date.getTime(),
			open: Number.isFinite(d.open) ? d.open : null,
			high: Number.isFinite(d.high) ? d.high : null,
			low: Number.isFinite(d.low) ? d.low : null,
			close: Number.isFinite(d.close) ? d.close : null,
			// `volume` đi thẳng: `DataEnvelope` đã ép về `number` (toNumOrZero ở
			// DataEnvelope.ts:150/:245) nên nhánh `Number.isFinite ? … : 0` là dead code —
			// và `: 0` là một giá trị sai bị giấu. Vấn đề gốc (thiếu volume bị ép 0 thay vì
			// null) nằm ở SSOT `DataEnvelope`, đã ghi vào ledger làm follow-up.
			volume: d.volume,
			adjClose: null, adjFactor: null, isPartial: false, source: "unknown",
		}));
		const base = `${dataResult.activeSymbol}-${dataResult.activeTimeframe}`;
		downloadCsv(csvFilename(base), buildBarsCsv({ symbol: dataResult.activeSymbol, timeframe: dataResult.activeTimeframe, bars }));
		const drawings = drawingsResultRef.current?.resolvedDrawings ?? [];
		if (drawings.length > 0) downloadCsv(csvFilename(`${base}-drawings`), buildDrawingsCsv({ drawings }));
	}, [tierGated, handleUpgradeFromBanner, dataResult]);

	/**
	 * Series an alert is allowed to reference. The predicate itself lives in
	 * `selectAlertableSeries` (`src/lib/alerts/AlertManager.ts`) because it is the whole
	 * fix and a predicate buried in a `useMemo` is untestable — which is how the previous
	 * version, an eight-entry type blacklist applied to `settings.visiblePanes`, returned
	 * an empty list and left 100% of indicator-sourced alerts inert. See that function's
	 * comment for the measurement.
	 *
	 * The pane list must match the one the alerts modal offers (`paneState.panes`), or the
	 * instance ids the modal persists can never be resolved.
	 */
	const activeIndicatorConfigs = useMemo(
		() => selectAlertableSeries(paneState.panes),
		[paneState.panes],
	);

	// Alert evaluation loop on data updates
	useEffect(() => {
		const data = dataResult.enrichedData;
		if (data.length < 2) return;
		const current = data[data.length - 1];
		const previous = data[data.length - 2];
		alertManager.checkAlerts(
			dataResult.activeSymbol,
			dataResult.activeTimeframe,
			current,
			previous,
			activeIndicatorConfigs
		);
	}, [dataResult.enrichedData, dataResult.activeSymbol, dataResult.activeTimeframe, alertManager, activeIndicatorConfigs]);

	const [loadedEvents, setLoadedEvents] = useState<CorporateEvent[]>([]);
	useEffect(() => {
		if (props.corporateEvents) {
			setLoadedEvents(props.corporateEvents as any); // ARC-1-keep: legacy bridge
			return;
		}
		if (tradingVisibility.showCorporateEvents === false) {
			setLoadedEvents([]);
			return;
		}
		const plotData = dataResult.plotData;
		if (plotData.length < 50) {
			setLoadedEvents([]);
			return;
		}

		let active = true;
		const from = plotData[0]?.date?.getTime() || 0;
		const to = plotData[plotData.length - 1]?.date?.getTime() || 0;

		fetchCorporateEvents(props.adapter, dataResult.activeSymbol, from, to, plotData, {
			allowMockEvents: props.corporateEventsMode === "demo",
		})
			.then(evts => {
				if (active) setLoadedEvents(evts);
			})
			.catch(() => {
				if (active) setLoadedEvents([]);
			});

		return () => {
			active = false;
		};
	}, [props.corporateEvents, tradingVisibility.showCorporateEvents, props.corporateEventsMode, dataResult.activeSymbol, dataResult.plotData, props.adapter]);

	// Alert trigger listener (plays sound and alerts).
	//
	// The disposer is returned, and that is the whole fix. This effect had no cleanup
	// while `AlertManager.onAlertTriggered` only ever pushed, so under `StrictMode` the
	// double-mounted effect left two listeners on one instance and a single alert firing
	// raised two native dialogs and played the sound twice — measured, not inferred.
	// Without the cleanup, ALERT-04 cannot pass however correct the alert itself is.
	useEffect(() => {
		const notificationAdapter = props.notificationAdapter;
		const audioAdapter = props.audioAdapter;
		return alertManager.onAlertTriggered((alert) => {
			if (alert.actions.popup) {
				notificationAdapter?.alert(`ALERT TRIGGERED: ${alert.message}`);
			}
			if (alert.actions.sound && settings.activeAlertAudioEnabled) {
				audioAdapter?.playAlertSound(880, 300, 0.5);
			}
		});
	}, [alertManager, props.notificationAdapter, props.audioAdapter, settings.activeAlertAudioEnabled]);

	// Timezone SSOT: prop thắng; không có prop thì dùng giá trị hydrated (S-02).
	// Trước đây effect này nằm ở wrapper (chỉ thấy props) nên lựa chọn trong modal
	// không bao giờ tới formatter — relocate vào content nơi có cả props lẫn settings.
	useEffect(() => {
		setGlobalTimezone(props.timezone || props.defaultTimezone || settings.activeTimezone);
	}, [props.timezone, props.defaultTimezone, settings.activeTimezone]);

	// Template save/load handlers
	const handleSaveTemplate = useCallback(() => {
		const notificationAdapter = props.notificationAdapter;
		const name = notificationAdapter?.prompt(settings.t("ui.template.name") || "Enter template name:");
		if (!name) return;
		ChartSerializer.saveTemplate(name, {
			activeSeriesConfigs: [...paneState.panes],
			isDark: settings.isDark,
			timeframe: dataResult.activeTimeframe,
		});
		notificationAdapter?.alert((settings.t("settings.setSaved") || "Saved set \"{name}\"").replace("{name}", name));
	}, [paneState.panes, settings.isDark, dataResult.activeTimeframe, settings.t, props.notificationAdapter]);

	const handleLoadTemplate = useCallback(() => {
		const notificationAdapter = props.notificationAdapter;
		const templates = ChartSerializer.getAllTemplates();
		if (templates.size === 0) {
			notificationAdapter?.alert(settings.t("ui.template.noTemplates") || "No saved templates found");
			return;
		}
		const names = Array.from(templates.keys()).join(", ");
		const name = notificationAdapter?.prompt((settings.t("ui.template.select") || "Enter template name to load:") + ` (${names})`);
		if (!name) return;
		const tpl = ChartSerializer.loadTemplate(name);
		if (tpl) {
			paneState.dispatch({ type: "replaceLayout", panes: tpl.activeSeriesConfigs });
			if (tpl.timeframe) {
				settings.handleTimeframeChange(tpl.timeframe as any); // ARC-1-keep: legacy bridge
			}
			notificationAdapter?.alert((settings.t("settings.setApplied") || "Applied set \"{name}\"").replace("{name}", name));
		} else {
			notificationAdapter?.alert(settings.t("ui.template.notFound") || "Template not found");
		}
	}, [paneState.dispatch, settings.handleTimeframeChange, settings.t, props.notificationAdapter]);

	const scaleSlotDomains = useMemo(() => {
		// GATED on purpose: this feeds pane snapshots, the coordinate bridge, the crosshair and the
		// engine host. Deriving it from unfiltered panes let a locked Pro Pine series contribute a
		// value domain that no visible series owns — i.e. the tier gate would be bypassed through
		// the scale surface instead of the series list.
		return computePaneScaleSlotDomains(
			renderPanes,
			dataResult.plotData
		);
	}, [renderPanes, dataResult.plotData]);
	// 3. Drawings hook
	const drawingsResult = useWidgetDrawings({
		...props,
		plotData: dataResult.plotData,
		useForkRuntime: isForkRuntime,
		symbol: dataResult.activeSymbol,
		timeframe: dataResult.activeTimeframe,
		keyboardAdapter: props.keyboardAdapter!,
		isEditingText: settings.isEditingText,
		// P1-03/05: surface drawing persistence failures (quota/import) via the
		// injected notification adapter instead of console-only warnings.
		onStorageError: ({ operation }) => {
			const message = operation === "import"
				? settings.t("drawing.importFailed") || "Could not import drawings file"
				: settings.t("drawing.saveFailed") || "Could not save drawings (storage full)";
			(props.notificationAdapter ?? defaultNotificationAdapter)?.alert(message);
		},
	});
	drawingsResultRef.current = drawingsResult;

	// S2.1/D-03: single-letter tool shortcuts for STANDALONE single-chart only.
	// Multichart mounts its own (VNInvestMultiCharts:950, active-slot routing) —
	// per-slot mount here must stay disabled inside multichart (isActiveChart is
	// always set for multichart slots via GridContainer:719) or one keypress
	// would set the tool on every slot.
	const isStandaloneChart = props.isActiveChart === undefined;
	const handleDrawingToolSelect = useCallback((toolId: string) => {
		drawingsResultRef.current?.drawingWorkspace.setActiveTool(toolId as never);
	}, []);
	// S4/BUG-6: shared magnet cycle (toolbar button + Shift+M keyboard).
	const handleMagnetCycle = useCallback(() => {
		settings.setMagnetSensitivity((prev: any) => {
			if (prev === "off") return "weak";
			if (prev === "weak") return "normal";
			if (prev === "normal") return "strong";
			return "off";
		});
	}, [settings]);
	useDrawingToolShortcuts({
		onToolSelect: handleDrawingToolSelect,
		patTier: effectiveToolbarTier,
		onPremiumToolClick: handlePremiumToolClick,
		enabled: isStandaloneChart && (props.drawingUiEnabled ?? true) && !settings.isEditingText,
		onMagnetCycle: handleMagnetCycle,
	});

	// Initialize global keyboard shortcut handler for single-chart widget
	useGlobalShortcutHandler();

	// Register Ctrl+Shift+L dock toggle shortcut
	const handleToggleDock = useCallback(() => {
		const dw = drawingsResultRef.current?.drawingWorkspace;
		if (!dw) return;
		if (dw.state.dock.isOpen) {
			dw.closeDock();
		} else {
			dw.openDock("properties");
		}
	}, []);
	useShortcuts([
		HeaderShortcuts.dockToggle(handleToggleDock),
		HeaderShortcuts.symbolSearchModal(() => { setQuickEntryPrefix(""); settings.setSearchOpen(true); }),
	]);

	// Convert DrawingObject[] to DrawingData[] for sync
	//
	// BL-03B slice: the literal this replaced had already drifted from two sibling
	// literals — `opacity` was present in only ONE of three (see the header of
	// src/widget/utils/drawingSync.ts). It also read `localSymbol`, `props.timeframe`
	// and `dataResult.plotData` out of this closure, so none of it could be tested
	// without mounting the whole chart.
	const syncScope = useMemo(
		() => ({
			fallbackSymbol: localSymbol,
			fallbackTimeframe: settings.localTimeframe,
			plotData: dataResult.plotData,
		}),
		[localSymbol, settings.localTimeframe, dataResult.plotData],
	);
	const convertToDrawingData = useCallback(
		(drawings: readonly DrawingObject[]): DrawingData[] =>
			convertDrawingsToData(drawings, syncScope) as DrawingData[],
		[syncScope],
	);

	// Emit drawing changes for MultiCharts sync
	useEffect(() => {
		if (props.onDrawingChange) {
			const drawingData = convertToDrawingData(drawingsResult.resolvedDrawings);
			props.onDrawingChange(drawingData);
		}
	}, [drawingsResult.resolvedDrawings, props.onDrawingChange, convertToDrawingData]);

	// Diff drawings and emit DrawingOperations for real-time CRDT sync
	useEffect(() => {
		const prevDrawings = lastDrawingsRef.current;
		const nextDrawings = drawingsResult.resolvedDrawings;
		lastDrawingsRef.current = nextDrawings;

		if (isRemoteDrawingChangeRef.current) {
			isRemoteDrawingChangeRef.current = false;
			return;
		}

		if (prevDrawings === nextDrawings || !props.onSyncDrawing) {
			return;
		}

		// E2-fix: strictly monotonic per-writer clock. Sequential ops from this
		// chart share one writer key with rising counters, so the engine CRDT
		// never version-ties them into a bogus "remote won" conflict — not even
		// on the chart that drew last. True concurrent writers still diverge.
		const writerKey = props.id || "standalone";
		const now = nextDrawingOpTimestamp(lastDrawingOpTsRef.current);
		lastDrawingOpTsRef.current = now;

		for (const op of buildDrawingOperations({
			prev: prevDrawings,
			next: nextDrawings,
			writerKey,
			symbol: localSymbol || "",
			timeframe: settings.localTimeframe,
			plotData: dataResult.plotData,
			now,
			// Raw type on purpose — the deliberate asymmetry is documented in drawingSync.ts.
			opType: (d) => d.type as DrawingData["type"],
		})) {
			props.onSyncDrawing(op as unknown as DrawingOperation);
		}
	}, [drawingsResult.resolvedDrawings, props.id, localSymbol, settings.localTimeframe, props.onSyncDrawing, convertToDrawingData, dataResult.plotData]);

	const activeForkManipulationDrawing = useMemo(() => {
		if (!isForkRuntime || !(props.drawingUiEnabled ?? true) || drawingsResult.drawingWorkspace.state.activeTool !== "cursor") {
			return null;
		}
		return drawingsResult.drawingWorkspace.state.selectedIds.length === 1
			? drawingsResult.resolvedForkSingleSelection
			: null;
	}, [props.drawingUiEnabled, drawingsResult.drawingWorkspace.state.activeTool, drawingsResult.drawingWorkspace.state.selectedIds, drawingsResult.resolvedForkSingleSelection, isForkRuntime]);

	const forkMovableSelectionIds = useMemo(() => {
		if (!isForkRuntime || !(props.drawingUiEnabled ?? true) || drawingsResult.drawingWorkspace.state.activeTool !== "cursor") {
			return [] as string[];
		}

		const selectedIdSet = new Set(drawingsResult.drawingWorkspace.state.selectedIds);
		if (selectedIdSet.size === 0) {
			return [] as string[];
		}

		return drawingsResult.resolvedDrawings
			.filter((drawing) => selectedIdSet.has(drawing.id))
			.filter((drawing) => drawing.visible !== false)
			.filter((drawing) => drawing.locked !== true)
			.filter((drawing) => isForkSupportedDrawingManipulationType(drawing.type))
			.map((drawing) => drawing.id);
	}, [props.drawingUiEnabled, drawingsResult.drawingWorkspace.state.activeTool, drawingsResult.drawingWorkspace.state.selectedIds, drawingsResult.resolvedDrawings, isForkRuntime]);

	const resolvedForkPriceMarkerSelection = useMemo(() => {
		if (!settings.activeShowDrawingPriceMarkers) {
			return null;
		}

		if (drawingsResult.drawingWorkspace.state.selectedIds.length !== 1) {
			return null;
		}

		const selectedId = drawingsResult.drawingWorkspace.state.selectedIds[0];
		if (!selectedId) {
			return null;
		}

		const selectedDrawingFromWorkspace = drawingsResult.resolvedDrawings.find((drawing) => drawing.id === selectedId) ?? null;
		if (selectedDrawingFromWorkspace) {
			return selectedDrawingFromWorkspace;
		}

		return drawingsResult.resolvedForkSingleSelection?.id === selectedId ? drawingsResult.resolvedForkSingleSelection : null;
	}, [drawingsResult.drawingWorkspace.state.selectedIds, drawingsResult.resolvedDrawings, drawingsResult.resolvedForkSingleSelection, settings.activeShowDrawingPriceMarkers]);

	const resolvedForkPrimitiveSelection = useMemo(() => {
		const singleSelection = drawingsResult.resolvedForkSingleSelection;
		if (!singleSelection) {
			return null;
		}

		return drawingsResult.resolvedDrawings.find((drawing) => drawing.id === singleSelection.id) ?? singleSelection;
	}, [drawingsResult.resolvedDrawings, drawingsResult.resolvedForkSingleSelection]);

	// 4. Interaction Actions hook
	const interactionActions = useWidgetInteractionActions({
		...props,
		drawingWorkspace: drawingsResult.drawingWorkspace,
		useForkRuntime: isForkRuntime,
		resolvedDrawings: drawingsResult.resolvedDrawings,
		resolvedSelectedDrawing: drawingsResult.resolvedSelectedDrawing,
		windowEventAdapter: props.windowEventAdapter ?? defaultWindowEventAdapter,
	});

	const activeForkDrawingTool = useMemo(() => {
		const activeTool = props.drawingActiveTool ?? drawingsResult.drawingWorkspace.state.activeTool;
		return isDrawingToolName(activeTool) && isForkSupportedDrawingAuthoringTool(activeTool) ? activeTool : null;
	}, [props.drawingActiveTool, drawingsResult.drawingWorkspace.state.activeTool]);

	const forkEnginePanes = useMemo(() => createPaneSpecsFromDescriptors(renderPanes), [renderPanes]);
	// SYM-AXIS: the 48px left gutter hosts the 10px rail grip itself, so the
	// column reserve drops to 0 and the frame stays symmetric (48 == 48).
	const hasLeftYAxis = useMemo(
		() => resolveHasLeftAxis(paneSnapshots, resolvedPanes),
		[paneSnapshots, resolvedPanes],
	);
	const forkEngineMode: "dark" | "light" = settings.isDark ? "dark" : "light";
	const canvasTheme = useCanvasTheme(containerRef);
	const settingsCrosshairColor = settingsSections.sections.appearance.crosshairColor;
	const forkEngineTheme = useMemo(
		() =>
			resolveForkEngineTheme({
				mode: forkEngineMode,
				gridColor: canvasTheme.colors.grid,
				gridDash: canvasTheme.colors.gridDash,
				gridWidth: Number(canvasTheme.colors.gridWidth) || 0.5,
				bullish: canvasTheme.colors.bullish,
				bearish: canvasTheme.colors.bearish,
				// B2: the crosshair colour of the appearance tab reaches the engine.
				crosshairColor: settingsCrosshairColor,
				fallbackCrosshairColor: canvasTheme.colors.crosshair,
				// A1: the per-direction grid switches and colours of the
				// appearance tab reach the engine too. They used to stop at
				// the tab, so the control had no effect on the chart.
				vertGridVisible: settingsSections.sections.appearance.vertGridVisible,
				horzGridVisible: settingsSections.sections.appearance.horzGridVisible,
				vertGridColor: settingsSections.sections.appearance.vertGridColor,
				horzGridColor: settingsSections.sections.appearance.horzGridColor,
			}),
		[
			forkEngineMode,
			canvasTheme.colors.grid,
			canvasTheme.colors.gridDash,
			canvasTheme.colors.gridWidth,
			canvasTheme.colors.bullish,
			canvasTheme.colors.bearish,
			canvasTheme.colors.crosshair,
			settingsCrosshairColor,
			settingsSections.sections.appearance.vertGridVisible,
			settingsSections.sections.appearance.horzGridVisible,
			settingsSections.sections.appearance.vertGridColor,
			settingsSections.sections.appearance.horzGridColor,
		],
	);


	// 5. Fork Interaction hook
	const forkInteraction = useWidgetForkInteraction({
		...props,
		onClick: wrappedOnClick,
		drawingUiEnabled: props.drawingUiEnabled ?? true,
		activeForkDrawingTool,
		visiblePanes: settings.visiblePanes,
		useForkRuntime: isForkRuntime,
		drawingWorkspace: drawingsResult.drawingWorkspace,
		resolvedDrawings: drawingsResult.resolvedDrawings,
		resolvedSelectedDrawing: drawingsResult.resolvedSelectedDrawing,
		resolvedForkSingleSelection: drawingsResult.resolvedForkSingleSelection,
		magnetSensitivity: settings.magnetSensitivity,
		paneSnapshots,
		plotData: forkPlotData,
		forkMovableSelectionIds,
		activeForkManipulationDrawing,
		forkSelectionModifierPressed: interactionActions.forkSelectionModifierPressed,
		closeForkDrawingContextMenu: interactionActions.closeForkDrawingContextMenu,
		setForkDrawingContextMenu: interactionActions.setForkDrawingContextMenu,
		size,
		engineInstanceRef,
		forkAltShortcutPressedRef: interactionActions.forkAltShortcutPressedRef,
		cloneSelectedDrawing: interactionActions.cloneSelectedDrawing,
		toggleSelectedLock: interactionActions.toggleSelectedLock,
		updateForkReadonlySelection: interactionActions.updateForkReadonlySelection,
		updateForkReadonlySelectionByIds: interactionActions.updateForkReadonlySelectionByIds,
		forkVisibleRangeRef,
		forkPaneSnapshotsRef,
		windowEventAdapter: props.windowEventAdapter,
		isEditingText: settings.isEditingText,
		handleStartTextEdit: settings.handleStartTextEdit,
	});

	const handleWrappedVisibleRangeChange = useCallback(
		(range: any) => {
			if (isRemoteVisibleRangeRef.current) {
				return;
			}
			props.onVisibleRangeChange?.(range);
		},
		[props.onVisibleRangeChange]
	);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const handleInteraction = () => {
			pendingSyncTimeRangeRef.current = null;
		};
		container.addEventListener("pointerdown", handleInteraction, { passive: true });
		container.addEventListener("wheel", handleInteraction, { passive: true });
		return () => {
			container.removeEventListener("pointerdown", handleInteraction);
			container.removeEventListener("wheel", handleInteraction);
		};
	}, []);

	// 6. Coordinate bridge hook
	const {
		legacyCoordinateBridge,
		forkChartRenderContextValue,
		forkStockChartContextValue,
		legacyPaneSnapshots,
		resolvedLegacyVisibleRange,
		paneSnapshotMap,
		emitPaneSnapshots,
		handleVisibleDomainChange,
		emitCoordinateBridge,
		legacyChartScale,
	} = useWidgetCoordinateBridge({
		useForkRuntime: isForkRuntime,
		plotData: forkPlotData,
		enrichedData: forkEnrichedData,
		bars: forkBars,
		visiblePanes: settings.visiblePanes,
		size,
		scaleSlotDomains,
		activeHeights: settings.activeHeights,
		forkEngineInstance,
		forkVisibleRange,
		setForkVisibleRange,
		forkVisibleRangeRef,
		forkPaneSnapshotsRef,
		paneSnapshots,
		setPaneSnapshots,
		snapshotRevision,
		incrementSnapshotRevision,
		legacyVisibleRange,
		setLegacyVisibleRange,
		onCoordinateBridgeChange: props.onCoordinateBridgeChange,
		onPaneSnapshotsChange: props.onPaneSnapshotsChange,
		onVisibleDomainChange: props.onVisibleDomainChange,
		onVisibleRangeChange: handleWrappedVisibleRangeChange,
		controlledXExtents: props.xExtents,
		internalXExtents: settings.internalXExtents,
		setInternalXExtents: settings.setInternalXExtents,
		symbol: localSymbol,
		localRange: settings.localRange,
		showNonTradingDays: settings.activeShowNonTradingDays,
		chartSurfaceReady: dataResult.plotData.length > 0 && size.width > 0 && size.height > 0 && (!(dataResult.loading && !hasExternalData)),
		pendingForkVisibleRangeRef,
		pendingForkVisibleRangeRafRef,
		lastStableForkSpanRef,
		pendingHistoryPatchRef,
		lastEmittedPaneSnapshotsRef,
		lastPaneSnapshotsSubscriberRef,
		resolvedLegacyVisibleRangeRef,
		engineInstanceRef,
		storageAdapter: props.storageAdapter,
	});

	// Assign refs to bridge the circular dependency
	emitCoordinateBridgeRef.current = emitCoordinateBridge;
	handleVisibleDomainChangeRef.current = handleVisibleDomainChange;

	const handleLegacyVisibleRangeChange = useCallback(
		(range: VisibleRange) => {
			setLegacyVisibleRange((currentRange) => {
				if (currentRange?.startIndex === range.startIndex && currentRange?.endIndex === range.endIndex) {
					return currentRange;
				}
				return range;
			});
			handleWrappedVisibleRangeChange(range);
		},
		[handleWrappedVisibleRangeChange],
	);

	const handleLegacyVisibleDomainChange = useCallback((domain: [Date | number, Date | number]) => {
		const resolvedDomain = !legacyChartScale.usesDiscontinuousScale
			? [domain[0] instanceof Date ? domain[0] : new Date(domain[0]), domain[1] instanceof Date ? domain[1] : new Date(domain[1])] as [Date, Date]
			: resolveDateDomainFromDiscontinuous(domain, legacyChartScale.data, legacyChartScale.xAccessor as (datum: EnrichedDatum) => number);
		const currentVisibleDomain = dataResult.visibleDomainRef.current;
		if (currentVisibleDomain && areVisibleDomainsEqual(currentVisibleDomain, resolvedDomain)) {
			return;
		}

		handleVisibleDomainChange(resolvedDomain);
		dataResult.requestVisibleHistoryWindowSync(resolvedDomain, { updateVisibleDomainRef: true });
	}, [dataResult.visibleDomainRef, legacyChartScale.data, legacyChartScale.xAccessor, legacyChartScale.usesDiscontinuousScale, handleVisibleDomainChange, dataResult.requestVisibleHistoryWindowSync]);

	// 7. Fork Runtime hook
	const forkRuntimeResult = useForkRuntime({
		...props,
		useForkRuntime: isForkRuntime,
		visiblePanes: renderPanes,
		size,
		plotData: forkPlotData,
		enrichedData: forkEnrichedData,
		bars: forkBars,
		scaleSlotDomains,
		activeHeights: settings.activeHeights,
		engineInstanceRef,
		updateForkReadonlySelection: interactionActions.updateForkReadonlySelection,
		updateForkReadonlySelectionByIds: interactionActions.updateForkReadonlySelectionByIds,
		forkEngineInstance,
		setForkEngineInstance,
		forkVisibleRange,
		setForkVisibleRange,
		forkVisibleRangeRef,
		forkPaneSnapshotsRef,
		paneSnapshots,
		setPaneSnapshots,
		snapshotRevision,
		incrementSnapshotRevision,
		onPaneSnapshotsChange: props.onPaneSnapshotsChange,
		onVisibleDomainChange: props.onVisibleDomainChange,
		controlledXExtents: props.xExtents,
		internalXExtents: settings.internalXExtents,
		setInternalXExtents: settings.setInternalXExtents,
		symbol: localSymbol,
		localRange: settings.localRange,
		showNonTradingDays: settings.activeShowNonTradingDays,
		chartSurfaceReady: dataResult.plotData.length > 0 && size.width > 0 && size.height > 0 && (!(dataResult.loading && !hasExternalData)),
		emitCoordinateBridge: emitCoordinateBridgeWrapper,
		pendingForkVisibleRangeRef,
		pendingForkVisibleRangeRafRef,
		lastStableForkSpanRef,
		pendingHistoryPatchRef,
		lastEmittedPaneSnapshotsRef,
		lastPaneSnapshotsSubscriberRef,
		resolvedLegacyVisibleRangeRef,
		drawingUiEnabled: props.drawingUiEnabled ?? true,
		drawingWorkspace: drawingsResult.drawingWorkspace,
		resolvedDrawings: drawingsResult.resolvedDrawings,
		resolvedSelectedDrawing: drawingsResult.resolvedSelectedDrawing,
		resolvedForkSingleSelection: drawingsResult.resolvedForkSingleSelection,
		onSelectedDrawingChange: props.onSelectedDrawingChange,
		magnetSensitivity: settings.magnetSensitivity,
		crosshairMode: settingsSections.crosshairMode,
		forkMovableSelectionIds,
		activeForkManipulationDrawing,
		forkSelectionModifierPressed: interactionActions.forkSelectionModifierPressed,
		closeForkDrawingContextMenu: interactionActions.closeForkDrawingContextMenu,
		setForkDrawingContextMenu: interactionActions.setForkDrawingContextMenu,
		onContextMenu: props.onContextMenu,
		onClick: props.onClick,
		forkAltShortcutPressedRef: interactionActions.forkAltShortcutPressedRef,
		copySelectedDrawing: interactionActions.copySelectedDrawing,
		pasteCopiedDrawing: interactionActions.pasteCopiedDrawing,
		bringSelectedToFront: interactionActions.bringSelectedToFront,
		sendSelectedToBack: interactionActions.sendSelectedToBack,
		onRuntimeDegraded: props.onRuntimeDegraded,
		resolvedTheme: settings.resolvedTheme,
		activeLocale: settings.activeLocale,
		forkCameraEnvelopeMode: dataResult.forkCameraEnvelopeMode,
		setForkCameraEnvelopeMode: dataResult.setForkCameraEnvelopeMode as any, // ARC-1-keep: invariant Dispatch<string> vs "shared" | "extended"
		handleForkVisibleRangeChange: dataResult.handleForkVisibleRangeChange,
		activeTimeframe: settings.localTimeframe,
		dateFormatPattern: settings.scalesSettings.dateFormat,
		// B4: the `scales.timeFormat` control now reaches the X-axis labels.
		timeFormat: settingsSections.sections.scales.timeFormat === "12h" ? "12h" : "24h",
		enableCVD: settings.activeEnableCVD,
		cvdMode: settings.activeCvdMode,
		externalCvdSeries: (props.externalCvdSeries ?? []) as CVDPoint[],
		cvdData: settings.activeEnableCVD ? dataResult.plotData : [],
		whaleEvents: dataResult.whaleEvents,
		showDrawingPriceMarkers: settings.activeShowDrawingPriceMarkers,
		resolvedForkPriceMarkerSelection,
		isEditingText: settings.isEditingText,
		forkOverlayState,
		setForkOverlayState,
		measurementEnabled: props.measurementEnabled ?? false,
		forkRenderableDrawings: forkInteraction.forkRenderableDrawings,
		forkPointerOwnerRef: forkInteraction.forkPointerOwnerRef,
		claimForkPointerOwner: forkInteraction.claimForkPointerOwner,
		releaseForkPointerOwner: forkInteraction.releaseForkPointerOwner,
		handleForkPointerDown: forkInteraction.handleForkPointerDown,
		handleForkPointerMove: forkInteraction.handleForkPointerMove,
		handleForkPointerUp: forkInteraction.handleForkPointerUp,
		handleForkPointerLeave: forkInteraction.handleForkPointerLeave,
		handleForkClick: forkInteraction.handleForkClick,
		handleForkContextMenu: forkInteraction.handleForkContextMenu,
		handleForkHostContextMenu: forkInteraction.handleForkHostContextMenu,
		handleForkDrawingClick: forkInteraction.handleForkDrawingClick,
		cancelForkInteraction: forkInteraction.cancelForkInteraction,
		forkSurfaceCursor: (forkInteraction.forkSurfaceCursor as string) || "default",
		forkPreviewRevision: forkInteraction.forkPreviewRevision,
		forkManipulationActive: forkInteraction.forkManipulationActive,
		forkManipulationActiveRef: forkInteraction.forkManipulationActiveRef,
		forkRubberBandSelection: forkInteraction.forkRubberBandSelection,
		forkDrawingContextMenu: interactionActions.forkDrawingContextMenu,
		resolvedForkPrimitiveSelection,
		onRuntimeCapabilitiesChange: props.onRuntimeCapabilitiesChange,
		t: settings.t,
		containerRef,
		legacyPaneSnapshots,
		legacyChartScale,
		visibleDomainRef: dataResult.visibleDomainRef,
		requestVisibleHistoryWindowSync: dataResult.requestVisibleHistoryWindowSync,
		onPaneHover: props.onPaneHover,
		onCrosshairChange: props.onCrosshairChange ? (crosshair: CrosshairPayload) => {
			if (isRemoteCrosshairRef.current) {
				isRemoteCrosshairRef.current = false;
				return;
			}
			props.onCrosshairChange!(crosshair);
		} : undefined,
		hoveredPaneId,
		setHoveredPaneId,
		hoveredPaneIdRef,
		activeSymbol: localSymbol,
		adapterLabel: dataResult.adapterLabel,
		forkChartRenderContextValue,
		forkStockChartContextValue,
		replayTradeMarkerFn,
		replayActiveRef: replayActiveForFeedRef,
	});

	// P2: price-scale menu + time scrollbar + main-slot mode SSOT (persisted per pane).
	const scaleOverlays = useScaleOverlays({
		enabled: isForkRuntime,
		snapshots: paneSnapshots,
		plotData: forkPlotData,
		visibleRange: forkVisibleRange,
		getEngine: () => engineInstanceRef.current,
		altPressedRef: interactionActions.forkAltShortcutPressedRef,
		chartId: props.id,
	});
	const scrollbarCloses = useMemo(() => forkPlotData.map((datum) => datum.close), [forkPlotData]);

	// Clear fork editing state when chart becomes inactive to prevent racing block
	// where synced drawings retain active editing state on multiple charts simultaneously.
	useEffect(() => {
		if (props.active === false) {
			forkInteraction.cancelForkInteraction();
		}
	}, [props.active, forkInteraction.cancelForkInteraction]);

	// Connect props.hoverEmitterRef to the internal hoverEmitterRef
	// Synchronous write so child effects (PricePaneHeader useHoverSubscription) see the emitter
	// immediately — avoids React bottom-up effect ordering where children subscribe before parent connects.
	const prevExternalRef = useRef<React.RefObject<any> | null>(null);
	if (props.hoverEmitterRef && props.hoverEmitterRef !== prevExternalRef.current) {
		prevExternalRef.current = props.hoverEmitterRef;
		if (hoverEmitterRef.current) {
			(props.hoverEmitterRef as any).current = hoverEmitterRef.current; // ARC-1-keep: legacy bridge
		}
	}

	// Dispatch hover events to the hoverEmitterRef for Legend updates
	useEffect(() => {
		const emitter = hoverEmitterRef.current;
		if (!emitter) return;

		const paneId = isForkRuntime ? (hoveredPaneId ?? "price") : undefined;
		const datum = isForkRuntime
			? (forkRuntimeResult.forkHoveredDatum ?? dataResult.plotData[dataResult.plotData.length - 1])
			: undefined;

		if (datum) {
			emitter.dispatchEvent(new CustomEvent("hover", {
				detail: { datum, pixelX: 0, pixelY: 0, paneId }
			}));
		} else {
			emitter.dispatchEvent(new CustomEvent("hover-clear"));
		}
	}, [hoverEmitterRef, isForkRuntime, forkRuntimeResult.forkHoveredDatum, hoveredPaneId, dataResult.plotData]);

	// Workspace import/export handlers
	// Workspace import/export + comparison legend suffix live in
	// useWidgetWorkspaceIO (P4-prep split — behavior unchanged).
	// Toast stack (BL-10 provider wraps content) feeds workspace feedback.
	const { pushToast } = useToasts();

	// BLACKSCREEN-DIAG: snapshot builder for the ?vnsc_diag=1 overlay.
	// BL-03B S3: builder extracted to useChartDiagSnapshot (behavior unchanged).
	const getDiagSnapshot = useChartDiagSnapshot({
		engineInstanceRef,
		forkEngineInstance,
		isForkRuntime,
		bars: dataResult.bars,
		enrichedData: dataResult.enrichedData,
		plotData: dataResult.plotData,
		dataError: dataResult.error,
		visiblePanes: settings.visiblePanes,
		chartType,
		effectiveToolbarTier,
		diagDocument: typeof document !== "undefined" ? document : null,
	});
	const { handleExportLayout, handleImportLayout, compareLegendSuffix } = useWidgetWorkspaceIO({
		paneState,
		drawingsInteraction: drawingsResult.drawingWorkspace.interaction,
		settings,
		activeSymbol: dataResult.activeSymbol,
		activeTimeframe: dataResult.activeTimeframe,
		enrichedData: dataResult.enrichedData,
		// 1.7: deliberately UNFILTERED. `compareLegendSuffix` resolves a series by POSITIONAL
		// index (`useWidgetWorkspaceIO.ts:169`), so feeding it `renderPanes` would shift every
		// index after a dropped series and label the wrong line. It also backs layout
		// import/export, which must round-trip a locked series untouched.
		resolvedPanes,
		portalAdapter: props.portalAdapter,
		// BL-17: import/export feedback goes through the toast stack.
		notify: useCallback((message: string, tone: "success" | "error") => {
			pushToast(message, tone);
		}, [pushToast]),
	});

	// Sync state machine editing → UI isEditingText, plus clear engine textBoxWidth
	useEffect(() => {
		const ds = drawingsResult.drawingWorkspace?.interaction.drawingState;
		if (ds?.type === "editing") {
			settings.handleStartTextEdit(ds.text ?? "");
			const drawing = (drawingsResult.drawingWorkspace?.state.drawings ?? []).find((d) => d.id === ds.objectId);
			if (drawing?.style?.textBoxWidth != null) {
				const cleanStyle = { ...drawing.style };
				delete (cleanStyle as Record<string, unknown>).textBoxWidth;
				delete (cleanStyle as Record<string, unknown>).textBoxHeight;
				drawingsResult.drawingWorkspace.interaction.updateDrawing(ds.objectId, { style: cleanStyle });
			}
		}
	}, [drawingsResult.drawingWorkspace?.interaction.drawingState, settings.handleStartTextEdit]);

	// Inline text editor renders its own textarea on top of the overlay canvas.
	// The overlay should remain visible so that drawings do not disappear during
	// style changes (e.g. color picker). A 1-frame double-render is acceptable.
	useEffect(() => {
		const root = containerRef.current;
		if (!root) return;
		const canvas = root.querySelector<HTMLCanvasElement>("canvas[data-vn-kline-engine='overlay']");
		if (canvas) {
			if (settings.isEditingText) {
				canvas.style.pointerEvents = "none";
			} else {
				canvas.style.pointerEvents = "";
			}
		}
	}, [settings.isEditingText]);

	// 8. Overlays hook (DECLUTTER_V4: compare chips render below the OHLC
	// statusline row instead of the pane-header legend in single-chart).
	// F-07: host pin `theme` prop ⇒ preset chọn trong modal bị che khỏi `resolvedTheme`;
	// khi host cung cấp callback, route setTheme của modal qua host (local state giữ nguyên).
	const hostThemePresetChange = props.onThemePresetChange;
	const overlaysThemeState = useMemo(
		() =>
			hostThemePresetChange
				? { ...settings.themeState, setTheme: hostThemePresetChange }
				: settings.themeState,
		[settings.themeState, hostThemePresetChange],
	);
	const overlays = useWidgetOverlays({
		...props,
		seriesTier: seriesTierGate,
		compareLegendSlot: "statusline",
		useForkRuntime: isForkRuntime,
		visiblePanes: settings.visiblePanes,
		onExportLayout: handleExportLayout,
		onImportLayout: handleImportLayout,
		paneSnapshotMap,
		paneSnapshots,
		size,
		hoveredPaneId,
		hoveredDatum: forkRuntimeResult.forkHoveredDatum ?? dataResult.plotData[dataResult.plotData.length - 1] ?? null,
		claimForkPointerOwner: forkInteraction.claimForkPointerOwner,
		releaseForkPointerOwner: forkInteraction.releaseForkPointerOwner,
		handlePaneToggleVisible: settings.handlePaneToggleVisible,
		handlePaneRemove: settings.handlePaneRemove,
		handlePaneAddSeries: settings.handlePaneAddSeries,
		handlePaneEditSeries: settings.handlePaneEditSeries,
		handlePaneToggleSeries: (paneId: string, seriesType: any, seriesIndex?: number) => {
			// Route Comparison series to comparison state instead of pane series handler
			if (seriesType === "Comparison" && seriesIndex !== undefined) {
				const pane = resolvedPanes.find((p) => p.id === paneId);
				const series = pane?.series[seriesIndex];
				if (series?.overlaySymbolId) {
					comparisonState.toggleVisibility(series.overlaySymbolId);
					return;
				}
			}
			settings.handlePaneToggleSeries(paneId, seriesType, seriesIndex);
		},
		handlePaneRemoveSeries: (paneId: string, seriesType: any, seriesIndex?: number) => {
			if (seriesType === "Comparison" && seriesIndex !== undefined) {
				const pane = resolvedPanes.find((p) => p.id === paneId);
				const series = pane?.series[seriesIndex];
				if (series?.overlaySymbolId) {
					comparisonState.removeSymbol(series.overlaySymbolId);
					return;
				}
			}
			settings.handlePaneRemoveSeries(paneId, seriesType, seriesIndex);
		},
		localizePane: settings.localizePane,
		localAvailable: settings.localAvailable,
		localHeights: settings.activeHeights,
		localApplyDelta: settings.localApplyDelta,
		localEqualizePair: settings.localEqualizePair,
		localResetToDefault: settings.localResetToDefault,
		drawingWorkspace: drawingsResult.drawingWorkspace,
		resolvedSelectedDrawing: drawingsResult.resolvedSelectedDrawing,
		toolbarLocked: settings.toolbarLocked,
		resolvedLegacyVisibleRange,
		effectiveForkVisibleRange: forkRuntimeResult.effectiveForkVisibleRange,
		magnetSensitivity: settings.magnetSensitivity,
		isDark: settings.isDark,
		plotData: dataResult.plotData,
		visibleDomainRef: dataResult.visibleDomainRef,
		cloneSelectedDrawing: interactionActions.cloneSelectedDrawing,
		toggleSelectedLock: interactionActions.toggleSelectedLock,
		handleStartTextEdit: settings.handleStartTextEdit,
		isEditingText: settings.isEditingText,
		drawingTextDraft: settings.drawingTextDraft,
		setDrawingTextDraft: settings.setDrawingTextDraft,
		handleCommitTextEdit: settings.handleCommitTextEdit,
		handleCancelTextEdit: settings.handleCancelTextEdit,
		bringSelectedToFront: interactionActions.bringSelectedToFront,
		sendSelectedToBack: interactionActions.sendSelectedToBack,
		showDrawingDock: props.showDrawingDock,
		renderDrawingDock: props.renderDrawingDock,
		defaultDrawingDockTab: props.defaultDrawingDockTab,
		activeSettingsOpen: settings.activeSettingsOpen,
		activeOnSettingsClose: settings.activeOnSettingsClose,
		dataAdapterName: props.dataAdapterName,
		onDataAdapterChange: props.onDataAdapterChange,
		localSelectedPaneId: settings.localSelectedPaneId,
		setLocalSelectedPaneId: settings.setLocalSelectedPaneId,
		activeMaxVisiblePanes: settings.activeMaxVisiblePanes,
		setLocalMaxVisiblePanes: settings.setLocalMaxVisiblePanes,
		activeMaxVisibleBars: settings.activeMaxVisibleBars,
		setLocalMaxVisibleBars: settings.setLocalMaxVisibleBars,
		activeShowNonTradingDays: settings.activeShowNonTradingDays,
		setLocalShowNonTradingDays: settings.setLocalShowNonTradingDays,
		activeShowDrawingPriceMarkers: settings.activeShowDrawingPriceMarkers,
		setLocalShowDrawingPriceMarkers: settings.setLocalShowDrawingPriceMarkers,
		activeEnableWhale: settings.activeEnableWhale,
		setLocalEnableWhale: settings.setLocalEnableWhale,
		activeWhaleThreshold: settings.activeWhaleThreshold,
		setLocalWhaleThreshold: settings.setLocalWhaleThreshold,
		activeEnableCVD: settings.activeEnableCVD,
		setLocalEnableCVD: settings.setLocalEnableCVD,
		activeCvdMode: settings.activeCvdMode,
		setLocalCvdMode: settings.setLocalCvdMode,
		themeState: overlaysThemeState,
		activeTimezone: settings.activeTimezone,
		setLocalTimezone: settings.setLocalTimezone,
		activeAlertAudioEnabled: settings.activeAlertAudioEnabled,
		setLocalAlertAudioEnabled: settings.setLocalAlertAudioEnabled,
		previewImageDataUrl: settings.previewImageDataUrl,
		setPreviewImageDataUrl: settings.setPreviewImageDataUrl,
		showAdvisoryPanel: props.showAdvisoryPanel,
		advisoryResult: props.advisoryResult,
		isAdvisoryLoading: props.isAdvisoryLoading,
		onAdvisoryRefresh: props.onAdvisoryRefresh,
		showTapePanel: props.showTapePanel,
		tapeEntries: props.tapeEntries,
		isTapeLoading: props.isTapeLoading,
		tapeFilterBillions: props.tapeFilterBillions,
		onTapeFilterChange: props.onTapeFilterChange,
		onPaperTradePanelClose: props.onPaperTradePanelClose,
		showDrawingPriceMarkers: settings.activeShowDrawingPriceMarkers,
		showTimeScrollbar: settings.scalesSettings.showTimeScrollbar,
		resolvedForkPriceMarkerSelection,
		t: settings.t,
		onDrawingsChange: props.onDrawingsChange,
		overlayTimeframe: settings.overlayTimeframe,
		setOverlayTimeframe: settings.setOverlayTimeframe,
		overlayStyle: settings.overlayStyle,
		setOverlayStyle: settings.setOverlayStyle,
		storageAdapter: props.storageAdapter,
		portalAdapter: props.portalAdapter,
		themePreset: settings.resolvedTheme,
		chartId: props.id,
		comparisonOverlays: comparisonState.overlays,
		onComparisonRemove: comparisonState.removeSymbol,
		onComparisonUpdate: comparisonState.updateOverlay,
		onQuickAddSeries: (paneId: string, series: SeriesConfig) => {
			paneState.addSeries(paneId, series);
		},
		onQuickRemoveSeries: (paneId: string, seriesType: SeriesTypeId) => {
			paneState.removeSeries(paneId, seriesType);
		},
		legendPanes: renderPanes,
		legendSeriesSuffix: compareLegendSuffix,
	});

	const axisStroke = settings.isDark ? "#64748b" : "#475569";
	const axisTickFill = settings.isDark ? "#e2e8f0" : "#0f172a";

	const lastSymbolRef = useRef<string | null>(null);
	const lastRangeRef = useRef<string | undefined>(undefined);
	const lastAutoScaleSymbolRef = useRef<string | null>(null);
	const internalXExtentsFromCacheRef = useRef(false);

	useEffect(() => {
		if (props.xExtents !== undefined || dataResult.plotData.length === 0 || !localSymbol) {
			return;
		}

		const symbolChanged = lastSymbolRef.current !== localSymbol;
		const rangeChanged = lastRangeRef.current !== settings.localRange;

		lastSymbolRef.current = localSymbol;
		lastRangeRef.current = settings.localRange;

		if (!symbolChanged && !rangeChanged) {
			return;
		}


		if (symbolChanged) {
			internalXExtentsFromCacheRef.current = false;
			try {
				const storageAdapter = props.storageAdapter;
				const raw = storageAdapter?.getItem?.(`vninvest:chart-state:${localSymbol}`);
				if (raw) {
					const cache = JSON.parse(raw);
					if (cache.range) {
						settings.setLocalRange(cache.range);
					}
					// Do NOT restore absolute cached xExtents dates: they pin a window
					// that cannot resolve against freshly-loaded data (a stale start
					// clamps to index 0, so backfill never fetches the real history)
					// and the now-ending zoomToRange they imply freezes the camera.
					// The rangeChanged branch below re-derives xExtents from live data.
				} else {
					settings.setLocalRange(props.defaultPeriod || "6M");
					settings.setInternalXExtents(undefined);
				}
			} catch (e) {
				console.warn("Failed to load chart range state from storage:", e);
			}
		} else if (rangeChanged && settings.localRange && !internalXExtentsFromCacheRef.current) {
			const targetRange = settings.localRange;
			const extents = resolveChartRangeExtents(dataResult.plotData, targetRange as any); // ARC-1-keep: legacy bridge
			if (extents) {
				settings.setInternalXExtents(extents);
				lastRangeRef.current = targetRange;
				try {
					const storageAdapter = props.storageAdapter;
					storageAdapter?.setItem?.(`vninvest:chart-state:${localSymbol}`, JSON.stringify({
						range: targetRange,
						xExtents: [extents[0].getTime(), extents[1].getTime()],
					}));
				} catch (e) {
					console.warn("Failed to save chart state to storage:", e);
				}
			}
		}
	}, [props.xExtents, dataResult.plotData, localSymbol, settings.localRange, props.defaultPeriod]);

	// FIX: expand internalXExtents right edge on live tick append so crosshair/time-axis follows "now"
	const lastDataDateRef = useRef<number | null>(null);
	useEffect(() => {
		if (props.xExtents !== undefined || dataResult.plotData.length === 0) return;
		const lastBar = dataResult.plotData[dataResult.plotData.length - 1];
		const lastMs = lastBar?.date?.getTime();
		if (lastMs == null) return;
		const prev = lastDataDateRef.current;
		lastDataDateRef.current = lastMs;
		if (prev != null && lastMs > prev) {
			// new bar appended to the right → push extent to absolute last bar date
			const firstBar = dataResult.plotData[0];
			settings.setInternalXExtents([firstBar.date, new Date(lastMs)]);
		}
	}, [dataResult.plotData.length, dataResult.plotData, props.xExtents]);

	// Auto-scale when symbol changes and new data is loaded
	useEffect(() => {
		if (!localSymbol || dataResult.plotData.length === 0) return;
		if (lastAutoScaleSymbolRef.current !== localSymbol && lastAutoScaleSymbolRef.current !== null) {
			if (isForkRuntime) {
				engineInstanceRef.current?.zoomToRange({
					from: 0,
					to: dataResult.plotData.length - 1,
				});
			} else {
				setLegacyVisibleRange({
					startIndex: 0,
					endIndex: dataResult.plotData.length - 1,
					startDate: dataResult.plotData[0]?.date ?? new Date(0),
					endDate: dataResult.plotData[dataResult.plotData.length - 1]?.date ?? new Date(0),
					timeRange: {
						from: dataResult.plotData[0]?.date.getTime() ?? 0,
						to: dataResult.plotData[dataResult.plotData.length - 1]?.date.getTime() ?? 0,
					},
					barCount: dataResult.plotData.length,
				});
			}
		}
		lastAutoScaleSymbolRef.current = localSymbol;
	}, [localSymbol, dataResult.plotData, isForkRuntime]);

	// Keyboard quick entry: type letters/digits to open symbol search (TradingView-style)
	const [quickEntryPrefix, setQuickEntryPrefix] = useState("");
	const quickEntryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		if (!props.showHeader) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
			if (isTypingTarget(e)) return;
			if (!/^[a-zA-Z0-9]$/.test(e.key)) return;
			// S2.2/D-05: tool letter shortcuts win over quick-entry (TV parity).
			// Yield unconditionally — premium gating belongs to
			// useDrawingToolShortcuts (tier gate + onPremiumToolClick there).
			if (TOOL_SHORTCUT_KEYS[e.key] !== undefined) return;
			const isCursorTool = typeof drawingsResult !== "undefined" &&
				drawingsResult.drawingWorkspace?.state.activeTool === "cursor";
			if (!isCursorTool) return;
			e.preventDefault();
			e.stopPropagation();
			if (quickEntryTimeoutRef.current) clearTimeout(quickEntryTimeoutRef.current);
			setQuickEntryPrefix(prev => prev + e.key.toUpperCase());
			settings.setSearchOpen(true);
			// Buffer keystrokes for 800ms before clearing — allows multi-char input
			quickEntryTimeoutRef.current = setTimeout(() => { setQuickEntryPrefix(""); }, 800);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [props.showHeader, settings.setSearchOpen, drawingsResult]);

	useEffect(() => {
		if (pendingSyncTimeRangeRef.current && dataResult.plotData.length > 0) {
			const { from, to } = pendingSyncTimeRangeRef.current;
			const earliestMs = dataResult.plotData[0].date.getTime();
			const isLeftBoundaryExhausted = dataResult.historyBackfillBeforeRef.current !== null;
			if (from >= earliestMs || isLeftBoundaryExhausted) {
				pendingSyncTimeRangeRef.current = null;
				const plotData = dataResult.plotData;
				let fromIdx = plotData.findIndex(d => d.date.getTime() >= from);
				let toIdx = -1;
				for (let i = plotData.length - 1; i >= 0; i--) {
					if (plotData[i].date.getTime() <= to) {
						toIdx = i;
						break;
					}
				}
				if (fromIdx < 0) fromIdx = 0;
				if (toIdx < 0) toIdx = plotData.length - 1;
				if (fromIdx < toIdx) {
					isRemoteVisibleRangeRef.current = true;
					if (visibleRangeTimeoutRef.current) {
						clearTimeout(visibleRangeTimeoutRef.current);
					}
					visibleRangeTimeoutRef.current = setTimeout(() => {
						isRemoteVisibleRangeRef.current = false;
					}, 200);

					if (isForkRuntime) {
					// Same half-open convention as setVisibleRange: toIdx is the
					// last rendered bar (inclusive) → +1, else the pending sync
					// drops one bar and feeds the zoom-in ratchet.
						engineInstanceRef.current?.zoomToRange({ from: fromIdx, to: toIdx + 1 });
					} else {
						setLegacyVisibleRange({
							startIndex: fromIdx,
							endIndex: toIdx,
							startDate: plotData[fromIdx]?.date ?? new Date(from),
							endDate: plotData[toIdx]?.date ?? new Date(to),
							timeRange: { from, to },
							barCount: toIdx - fromIdx,
						});
					}
				}
			} else {
				dataResult.requestVisibleHistoryWindowSync([new Date(from), new Date(to)], { force: true });
			}
		}
	}, [dataResult.plotData, isForkRuntime]);

	// Refs for data/indicator change subscriptions (MC-1)
	const onDataChangeCallbacks = useRef<Set<(data: EnrichedDatum[]) => void>>(new Set());
	const onIndicatorsChangeCallbacks = useRef<Set<(indicators: SeriesConfig[]) => void>>(new Set());

	useEffect(() => {
		onDataChangeCallbacks.current.forEach(cb => cb(dataResult.plotData));
	}, [dataResult.plotData]);

	useEffect(() => {
		const flatIndicators = paneState.panes.flatMap(p => p.series);
		onIndicatorsChangeCallbacks.current.forEach(cb => cb(flatIndicators));
	}, [paneState.panes]);

	useEffect(() => {
		return () => {
			if (visibleRangeTimeoutRef.current) {
				clearTimeout(visibleRangeTimeoutRef.current);
			}
		};
	}, []);

	const fanoutRef = useCallback((node: any) => {
		if (typeof forwardedRef === "function") forwardedRef(node);
		else if (forwardedRef) (forwardedRef as any).current = node;
		selfHandleRef.current = node;
	}, [forwardedRef]);
	useChartImperativeHandle(fanoutRef, {
		props,
		localSymbol,
		settings,
		isForkRuntime,
		// W1.4: host gọi `handle.saveAsImage()` không đi qua header ⇒ gate ở đây nữa.
		canExportImage: tierGated.allows("export_png"),
		onExportBlocked: handleUpgradeFromBanner,
		engineInstanceRef,
		dataResult,
		resolvedLegacyVisibleRange,
		paneState,
		comparisonState,
		drawingsResult,
		replay,
		canUseReplay,
		replayTrading,
		replayAwaitingStartBar,
		setLegacyVisibleRange,
		setChartType,
		setIsFrozen,
		isFrozen,
		openAlertsModal,
		setReplayAwaitingStartBar,
		isRemoteVisibleRangeRef,
		lastRemoteRangeRef,
		visibleRangeTimeoutRef,
		pendingSyncTimeRangeRef,
		isRemoteCrosshairRef,
		isRemoteDrawingChangeRef,
		syncDrawingHandlersRef,
		syncViewportHandlersRef,
		replayBarVisibleRef,
		replayAwaitingStartBarRef,
		suppressReplayTickRef,
		onDataChangeCallbacks,
		onIndicatorsChangeCallbacks,
		containerRef,
		handleSaveTemplate,
		handleLoadTemplate,
		legacyPaneSnapshots,
		paneSnapshots,
		legacyCoordinateBridge,
		CHART_TYPE_MAP,
	});

	useIndicatorsShareApplier(props.id);
	const floatingBar = useFloatingChartBar({
		zoomIn: () => selfHandleRef.current?.zoomIn(),
		zoomOut: () => selfHandleRef.current?.zoomOut(),
		fitToData: () => selfHandleRef.current?.fitToData(),
		scrollbar: scaleOverlays.scrollbar,
		onToggleLayout: props.onToggleLayout,
		isSoloMode: props.isSoloMode,
	});

	// BL-10: surface data errors as toasts (mapped via taxonomy) in addition
	// to the parent callback — previously silent unless the host listened.
	const lastToastedErrorRef = useRef<unknown>(null);
	useEffect(() => {
		if (dataResult.error) {
			props.onError?.(dataResult.error);
			const coded = toWidgetError(dataResult.error, "DATA_FETCH");
			// BL-18: forward classified errors to the host telemetry sink.
			emitTelemetry(props.onTelemetry, "data-error", coded.message, {
				code: coded.code,
				context: { symbol: dataResult.activeSymbol, timeframe: dataResult.activeTimeframe },
			});
			if (dataResult.error !== lastToastedErrorRef.current) {
				lastToastedErrorRef.current = dataResult.error;
				pushToast(t(ERROR_MESSAGE_KEYS[coded.code]), "error");
			}
		}
	}, [dataResult.error, props.onError, props.onTelemetry, pushToast, t]);

	const ready = size.width > 0 && size.height > 0;

	// UX-03: DOM alternative for the canvas. Derived from the same sources the
	// visible OHLC header uses so the two never disagree.
	const a11yDatum = forkRuntimeResult.forkHoveredDatum ?? dataResult.plotData[dataResult.plotData.length - 1];
	const a11yOhlc = a11yDatum
		? {
			open: Number(a11yDatum.open) || 0,
			high: Number(a11yDatum.high) || 0,
			low: Number(a11yDatum.low) || 0,
			close: Number(a11yDatum.close) || 0,
		}
		: null;
	const a11yVisibleRange = (() => {
		const raw = resolvedLegacyVisibleRange as { from?: number; to?: number } | null | undefined;
		if (!raw || typeof raw.from !== "number" || typeof raw.to !== "number") return null;
		return { from: Math.round(raw.from), to: Math.round(raw.to) };
	})();
	const a11yStatus = dataResult.plotData.length === 0 ? t("a11y.chart.noData", { defaultValue: "No data" }) : undefined;

	// B1: OHLC values of the status line (hovered bar, else the last bar) — the
	// same source the single-chart header uses, so the two never disagree.
	const statusLineOhlc = useMemo(() => {
		const d = forkRuntimeResult.forkHoveredDatum ?? dataResult.plotData[dataResult.plotData.length - 1];
		if (!d) return undefined;
		const o = Number(d.open) || 0;
		const c = Number(d.close) || 0;
		return {
			open: o,
			high: Number(d.high) || 0,
			low: Number(d.low) || 0,
			close: c,
			change: c - o,
			changePercent: o ? ((c - o) / o) * 100 : 0,
			volume: typeof d.volume === "number" ? d.volume : undefined,
		};
	}, [forkRuntimeResult.forkHoveredDatum, dataResult.plotData]);

	if (!ready) {
		return (
			<div
				ref={ref}
				className={props.className}
				style={{
					display: "flex",
					flexDirection: "column",
					width: "100%",
					height: "100%",
					minHeight: 0,
					...props.style,
				}}
			/>
		);
	}

	// UX-04: `ImageBitmap` browser-only; `instanceof` on an absent global throws and the
	// error boundary turns that into a blank chart. Type predicate keeps the narrowing.
	const frozenSnapshotIsImageBitmap = (value: unknown): value is ImageBitmap =>
		typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap;
	// S2: no provider ⇒ useCapabilityGate reads tier=null ⇒ locked at EVERY tier.
	// S1: whale = `pro_plugin` AND cờ SaaS (trước chỉ hỏi cờ ⇒ mọi tier mở, mẫu F5).
	const canUseWhale = tierGated.allows("pro_plugin") && flags.isWhalePanelEnabled;
	return (
		<CapabilityProvider tier={debugTierOverride ?? effectiveToolbarTier} narrowing={debugTierOverride ? undefined : licenseCapabilities}>
			<div
				ref={ref}
				className={`vnsc-root ${props.className || ""}`}
				data-testid="vninvest-charts"
				// BL-21: chart root is keyboard-focusable (shortcuts are window-global;
				// focusability gives SR users a landmark + visible focus context).
				tabIndex={0}
				role="region"
				aria-label={t("widget.title")}
				// UX-03: announce the text alternative when the chart region is focused.
				aria-describedby={a11ySummaryId}
				data-chart-theme={settings.resolvedTheme}
				data-chart-mode={settings.isDark ? "dark" : "light"}
				data-vn-camera-envelope={isForkRuntime ? dataResult.forkCameraEnvelopeMode : "shared"}
				onPointerMove={forkRuntimeResult.handleWidgetPointerMove}
				onPointerLeave={forkRuntimeResult.handleWidgetPointerLeave}
				style={{
					position: "relative",
					display: "flex",
					flexDirection: "column",
					width: "100%",
					height: "100%",
					minHeight: 0,
					...props.style,
				}}
			>
				{/* UX-03: DOM alternative for the canvas. The engine draws to a bare
			    <canvas> that no screen reader can parse; this region exposes the
			    same facts as text and is linked via aria-describedby. */}
				<ChartA11ySummary
					id={a11ySummaryId}
					symbol={dataResult.activeSymbol}
					timeframe={dataResult.activeTimeframe}
					ohlc={a11yOhlc}
					barCount={dataResult.plotData.length}
					visibleRange={a11yVisibleRange}
					status={a11yStatus}
				/>
				{/* UIUX_MULTI_CELL_HEADER: dải header thừa (`CellStatusLine`) đã bị bỏ —
				    nó TRÙNG với dòng status line trong pane (`ChartStatusLine` qua `ForkPaneTooltips`),
				    vốn đã hiện mã + O/H/L/C + % trong mọi ô multi. Giữ lại dải ⇒ mỗi ô hiện 2 lần
				    cùng dữ liệu và tốn 18px chiều cao. 3 cờ `statusLine` (showTicker/showOHLC/
				    showBarChange) giờ điều khiển dòng status line trong pane. */}
				{props.showHeader ? (
					props.renderHeader ? (
						props.renderHeader({ symbol: dataResult.activeSymbol, timeframe: dataResult.activeTimeframe })
					) : (
						<OHLCHeader
							isMobile={props.isMobile}
							canUseReplay={canUseReplay}
							patTier={effectiveToolbarTier}
							symbol={dataResult.activeSymbol}
							timeframe={dataResult.activeTimeframe}
							showLogo={settings.statusLineSettings.showLogo}
							showTicker={settings.statusLineSettings.showTicker}
							showOHLCV={settings.statusLineSettings.showOHLC}
							showVolume={settings.statusLineSettings.showVolume}
							showBarChange={settings.statusLineSettings.showBarChange}
							ohlcData={statusLineOhlc}
							chartType={chartType}

							onChartTypeChange={(ct) => {
								setChartType(ct);
								const seriesType = CHART_TYPE_MAP[ct];
								if (seriesType) {
									paneState.dispatch({ type: "updateSeriesType", paneId: "price", seriesType, seriesIndex: 0 });
								}
								props.onChartTypeChange?.(ct);
							}}
							replayPlaying={replay.playing}
							replaySpeed={replay.speed}
							replayCurrentBar={replay.currentBar}
							replayTotalBars={replay.totalBars}
							onReplayPlay={handleReplayPlay}
							onReplayPause={replay.onReplayPause}
							onReplayStop={handleReplayStop}
							onReplayStepForward={handleReplayStepForward}
							onReplayStepBack={handleReplayStepBack}
							onReplayRewind={handleReplayRewind}
							onReplaySpeedChange={replay.onReplaySpeedChange}
							onReplaySeek={handleReplaySeek}
							replayAwaitingStartBar={replayAwaitingStartBar}
							onReplayStartBarSelect={(date) => {
							// R1.2: no magic date=0 — a missing date only enters selection mode.
								if (date !== undefined && date !== null) {
									handleReplayStartBarSelect(date);
								}
								replayAwaitingStartBarRef.current = true;
								setReplayAwaitingStartBar(true);
							}}
							onReplayEnterSelectionMode={() => {
								replayAwaitingStartBarRef.current = true;
								setReplayAwaitingStartBar(true);
							}}
							replayTotalPnl={replayTrading.totalPnl}
							replayAnalytics={replayTrading.analytics}
							replayInterval="source"
							onReplayIntervalChange={(interval) => {
							// TODO(PROD-TRACK-1): wire replay interval change to engine; full interval logic planned post-launch.
							}}
							showMenu={true}
							isFullscreen={settings.isFullscreen}
							searchOpen={settings.searchOpen}
							onSearchToggle={() => { settings.setSearchOpen((prev) => !prev); setQuickEntryPrefix(""); }}
							onSettingsClick={() => settings.setLocalSettingsOpen(true)}
							onFullscreenClick={settings.handleFullscreenToggle}
							onSnapshotClick={handleGatedSnapshot}
							onCsvExportClick={handleGatedCsvExport}
							onAlertsClick={openAlertsModal}
							onSaveTemplate={handleSaveTemplate}
							onLoadTemplate={handleLoadTemplate}
							compareOpen={compareDialogOpen}
							onCompareToggle={() => setCompareDialogOpen((prev) => !prev)}
							crosshairMode={settingsSections.crosshairMode}
							onCrosshairModeChange={settingsSections.setCrosshairMode}
							showReplayBar={showReplayBar}
							onShowReplayBarChange={setShowReplayBar}
						/>
					)
				) : null}

				{compareDialogOpen && props.adapter && (
					<SymbolCompareModal
						adapter={props.adapter}
						mainSymbol={dataResult.activeSymbol}
						onSwitch={(sym) => {
							setLocalSymbol(sym);
							props.onSymbolChange?.(sym);
							setCompareDialogOpen(false);
						}}
						onTimeframeChange={(tf) => {
							props.onTimeframeChange?.(tf as Timeframe);
						}}
						existing={comparisonState.overlays.map((o) => o.symbolId)}
						entries={comparisonState.overlays}
						onAdd={(symbolId) => comparisonState.addSymbol(symbolId)}
						onRemove={(symbolId) => comparisonState.removeSymbol(symbolId)}
						onUpdate={(symbolId, partial) => comparisonState.updateOverlay(symbolId, partial)}
						onClose={() => setCompareDialogOpen(false)}
					/>
				)}

				{props.showHeader && settings.searchOpen && (
					<SymbolSearchModal
						open
						onClose={() => { settings.setSearchOpen(false); setQuickEntryPrefix(""); }}
					>
						<VNSymbolSearch
							adapter={props.adapter}
							value={dataResult.activeSymbol}
							flat
							onChange={(sym) => {
								setLocalSymbol(sym);
								props.onSymbolChange?.(sym);
								settings.setSearchOpen(false);
								setQuickEntryPrefix("");
							}}
							onTimeframeChange={(tf) => {
								props.onTimeframeChange?.(tf as Timeframe);
							}}
							quickEntryPrefix={quickEntryPrefix || undefined}
						/>
					</SymbolSearchModal>
				)}

				<div style={{ position: "relative", display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
					{props.showToolbar ? (
						props.renderToolbar ? (
							props.renderToolbar({
								activeTool: drawingsResult.drawingWorkspace.state.activeTool,
								onToolSelect: (tool: string) => drawingsResult.drawingWorkspace.setActiveTool(tool as never),
							})
						) : (
							<div className={`vnsc-drawing-toolbar-shell${settings.toolbarLocked ? " vnsc-drawing-toolbar-shell--docked" : ""}`} role="toolbar" aria-label={settings.t("toolbar.title") || "Drawing Toolbar"}>
								<span className="vnsc-drawing-toolbar-handle" aria-hidden="true" />
								<DrawingToolbar
									activeTool={drawingsResult.drawingWorkspace.state.activeTool}
									onToolSelect={(tool: string) => drawingsResult.drawingWorkspace.setActiveTool(tool as never)}
									magnetSensitivity={settings.magnetSensitivity === "strong" ? 3 : settings.magnetSensitivity === "normal" ? 2 : settings.magnetSensitivity === "weak" ? 1 : 0}
									onMagnetCycle={handleMagnetCycle}
									isLocked={settings.toolbarLocked}
									onToggleLock={() => settings.setToolbarLocked((prev: boolean) => !prev)}
									patTier={effectiveToolbarTier}
									onPremiumToolClick={handlePremiumToolClick}
									isDockOpen={drawingsResult.drawingWorkspace.state.dock.isOpen}
									onToggleDock={() => {
										const dw = drawingsResult.drawingWorkspace;
										if (dw.state.dock.isOpen) {
											dw.closeDock();
										} else {
											dw.openDock("properties");
										}
									}}
								/>
							</div>
						)
					) : null}

					{showReplayBar && (
						<FloatingReplayToolbar
							replayPlaying={replay.playing}
							replaySpeed={replay.speed}
							replayCurrentBar={replay.currentBar}
							replayTotalBars={replay.totalBars}
							onReplayPlay={handleReplayPlay}
							onReplayPause={replay.onReplayPause}
							onReplayStop={handleReplayStop}
							onReplayStepForward={handleReplayStepForward}
							onReplayStepBack={handleReplayStepBack}
							onReplayRewind={handleReplayRewind}
							onReplaySpeedChange={replay.onReplaySpeedChange}
							onReplaySeek={handleReplaySeek}
							replayInterval="source"
							onReplayIntervalChange={() => {}}
							replayTotalPnl={replayTrading.totalPnl}
							replayAnalytics={replayTrading.analytics}
							onJumpToBar={() => {
								replay.onReplayPause();
								replayAwaitingStartBarRef.current = true;
								setReplayAwaitingStartBar(true);
							}}
							onClose={() => {
								handleReplayStop();
								setShowReplayBar(false);
							}}
						/>
					)}
					<TradingProvider symbol={dataResult.activeSymbol} bars={dataResult.plotData || []} replayActive={effectiveReplayActive} replayPlaying={replay.playing === true} replayBar={replay.sessionActive && replay.playing === true ? (replayBars[replay.currentBar] ?? null) : null} replayEpoch={replay.sessionEpoch} audioAdapter={defaultAudioAdapter} chartId={props.id} isActiveChart={props.isActiveChart} externalBroker={sharedLive?.broker} externalPort={sharedLive?.port} externalReplayBroker={replayTrading.broker} externalReplayPort={replayTrading.port}>
						{/* Rail reserve: full 44px only while locked (docked); the
				auto-hide rail needs its 10px grip cleared only when no left
				axis exists — otherwise the gutter hosts the grip (SYM-AXIS). */}
						<div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden", position: "relative", marginLeft: resolveRailReservePx(props.showToolbar, settings.toolbarLocked, hasLeftYAxis) }}>
							{isFrozen ? (
								props.frozenSnapshot ? (
									<div
										className="vnsc-frozen-snapshot"
										style={{
											display: "flex",
											flex: 1,
											alignItems: "center",
											justifyContent: "center",
											background: settings.isDark ? "#111820" : "#ffffff",
											position: "relative",
											overflow: "hidden",
										}}
									>
										{frozenSnapshotIsImageBitmap(props.frozenSnapshot) ? (
											<canvas
												ref={(canvas) => {
													if (canvas) {
														const ctx = canvas.getContext("2d", { willReadFrequently: true });
														if (ctx) {
															canvas.width = props.frozenSnapshot!.width;
															canvas.height = props.frozenSnapshot!.height;
															ctx.drawImage(props.frozenSnapshot!, 0, 0);
														}
													}
												}}
												style={{
													maxWidth: "100%",
													maxHeight: "100%",
													objectFit: "contain",
												}}
											/>
										) : (
											<img
												src={props.frozenSnapshot.toDataURL ? props.frozenSnapshot.toDataURL() : ""}
												alt="Chart snapshot"
												style={{
													maxWidth: "100%",
													maxHeight: "100%",
													objectFit: "contain",
												}}
											/>
										)}
									</div>
								) : (
									<div
										className="vnsc-frozen-placeholder"
										style={{
											display: "flex",
											flex: 1,
											alignItems: "center",
											justifyContent: "center",
											background: settings.isDark ? "#111820" : "#ffffff",
											color: "var(--vnsc-text-secondary, #a0a0a0)",
											fontSize: "13px",
											fontWeight: 500,
										}}
									>
										{t("drawing.resourcesSuspended", { reason: "Frozen" })}
									</div>
								)
							) : isForkRuntime ? (
								<ForkEngineSurface
									props={props}
									settings={settings}
									dataResult={dataResult}
									forkRuntimeResult={forkRuntimeResult}
									forkInteraction={forkInteraction}
									scaleOverlays={scaleOverlays}
									overlays={overlays}
									forkChartRenderContextValue={forkChartRenderContextValue}
									forkStockChartContextValue={forkStockChartContextValue}
									emitPaneSnapshots={emitPaneSnapshots}
									effectiveToolbarTier={effectiveToolbarTier}
									enginePat={enginePat}
									validatePat={validatePat}
									handleTierValidated={handleTierValidated}
									adCampaign={adCampaign}
									adLocale={adLocale}
									engineOptions={engineOptions}
									trademarkCompliance={trademarkCompliance}
									trademarkUrl={trademarkUrl}
									trademarkBadgeRef={trademarkBadgeRef}
									labelColorByPaneRef={labelColorByPaneRef}
									paneSnapshots={paneSnapshots}
									forkOverlayState={forkOverlayState}
									forkVisibleRange={forkVisibleRange}
									replayAwaitingStartBar={replayAwaitingStartBar}
									forkPlotData={forkPlotData}
									forkEnginePanes={forkEnginePanes}
									forkEngineTheme={forkEngineTheme}
									renderPanes={renderPanes}
									loadedEvents={loadedEvents}
									size={size}
									resolvedForkPriceMarkerSelection={resolvedForkPriceMarkerSelection}
									activeForkDrawingTool={activeForkDrawingTool}
									canUseWhale={canUseWhale}
									hasExternalData={hasExternalData}
									floatingBar={floatingBar}
									scrollbarCloses={scrollbarCloses}
									showPaperOrders={tradingVisibility.showPaperOrders}
									showPaperPositions={tradingVisibility.showPaperPositions}
								/>
							) : null}

							{/* Collapsible Bottom Panel */}
							<ForkBottomPanel
								activeBottomTab={activeBottomTab}
								setActiveBottomTab={setActiveBottomTab}
								bottomPanelHeight={bottomPanelHeight}
								tierGated={tierGated}
								dataResult={dataResult}
								activeIndicatorConfigs={activeIndicatorConfigs}
								pineCompileBars={pineCompileBars}
								restorableSeriesTypes={restorableSeriesTypes}
								paneState={paneState}
								pushToast={pushToast}
								t={t}
							/>
						</div>

						{typeof props.darkFlowStrength === "number" && Number.isFinite(props.darkFlowStrength) ? (
							<DarkFlowBadge strength={props.darkFlowStrength} signalType={props.darkFlowSignalType} />
						) : null}
						{overlays.paneToolbarNodes}
						{overlays.paneSplitterNodes}
						{overlays.drawingChromeNode}
						{overlays.floatingInspectorNode}
						{overlays.inlineEditorNode}
						{isForkRuntime && interactionActions.forkDrawingContextMenu ? (
							<DrawingContextMenu
								ariaLabel={settings.t("drawing.contextMenuTitle")}
								title={settings.t("drawing.contextMenuTitle")}
								isDark={settings.isDark}
								position={{ x: interactionActions.forkDrawingContextMenu.x, y: interactionActions.forkDrawingContextMenu.y }}
								onClose={interactionActions.closeForkDrawingContextMenu}
								items={resolvedForkPrimitiveSelection ? forkRuntimeResult.forkDrawingContextMenuItems : forkRuntimeResult.forkCanvasContextMenuItems}
							/>
						) : null}
						{/* P2: Y-axis price-scale menu (Auto/Log/% + reset zoom). */}
						{isForkRuntime ? (
							<PriceScaleMenu
								menu={scaleOverlays.priceMenu}
								isDark={settings.isDark}
								t={settings.t}
								onSelectMode={scaleOverlays.applyMenuMode}
								onResetZoom={scaleOverlays.resetMenuZoom}
								onClose={scaleOverlays.closeMenu}
							/>
						) : null}

						{overlays.settingsModalNode}
						{overlays.snapshotPreviewModalNode}
						{/* Mounted only when granted, not merely hidden: a stale `true` can never leave an
				    ungated surface on screen. */}
						{alertsModalOpen && canUseAlertLocal && (
							<Suspense fallback={null}>
								<LazyAlertsModal
									open={alertsModalOpen}
									onClose={() => setAlertsModalOpen(false)}
									symbol={dataResult.activeSymbol}
									timeframe={dataResult.activeTimeframe}
									alertManager={alertManager}
									portalAdapter={props.portalAdapter}
									isDark={settings.isDark}
									themePreset={settings.resolvedTheme}
								/>
							</Suspense>
						)}
						{/* DOCK_SSOT_B3 (RD-02, S2): quyết định mount single = `showDock !== false`
						    (mặc định BẬT); shell dùng chung RightDockRail (tier gate + nudge + lazy
						    host nằm trong rail). Refresh khi dòng này dịch: AUDIT_LEDGER B3. */}
						{props.showDock !== false && (
							<RightDockRail
								dockTierGate={props.dockTierGate}
								tier={effectiveToolbarTier}
								symbol={dataResult.activeSymbol}
								timeframe={dataResult.activeTimeframe}
								datum={forkRuntimeResult.forkHoveredDatum ?? dataResult.plotData[dataResult.plotData.length - 1]}
								onSymbolChange={(sym: string) => { setLocalSymbol(sym); props.onSymbolChange?.(sym); }}
								watchlistAdapter={props.watchlistAdapter}
								drawingDockNode={overlays.drawingDockNode}
								tradingDockNode={<ConnectedTradingDockPanel canUseAdvancedOrders={tierGated.allows("paper_advanced")} canUseReplayTrading={tierGated.allows("replay_trading")} isReplayMode={Boolean(replayActive)} />}
								tape={props.showTapePanel ? { show: true, entries: props.tapeEntries ?? [], isLoading: props.isTapeLoading ?? false, filterBillions: props.tapeFilterBillions ?? 0, onFilterChange: props.onTapeFilterChange } : undefined}
								advisory={props.showAdvisoryPanel ? { show: true, result: props.advisoryResult ?? null, isLoading: props.isAdvisoryLoading ?? false, onRefresh: props.onAdvisoryRefresh } : undefined}
								onAlertsOpen={openAlertsModal}
								customPanelNode={props.renderRightPanel?.({ chartId: props.id || "", activeChartHandle: selfHandleRef.current })}
								isMobile={props.isMobile}
								restoreOpenOnMount
							/>
						)}
					</TradingProvider>
				</div>

				{/* BL-03B: footer lives in components/footer/ChartFooter. */}
				<ChartFooter
					showFooter={props.showFooter}
					renderFooter={props.renderFooter}
					timeframe={dataResult.activeTimeframe}
					localRange={settings.localRange}
					onTimeframeChange={settings.handleTimeframeChange}
					onRangeChange={settings.handleRangeChange}
					scaleMode={scaleOverlays.mainSlotMode === "linear" ? "auto" : scaleOverlays.mainSlotMode}
					onScaleModeChange={(mode) => scaleOverlays.applyMainSlotMode(mode === "auto" ? "linear" : mode)}
					timezone={settings.activeTimezone}
					t={settings.t}
					activeBottomTab={activeBottomTab}
					onBottomTabChange={setActiveBottomTab}
				/>

				<DowngradeBanner
					open={showDowngradeBanner}
					upgradeUrl={upgradeUrl}
					onDismiss={handleDismissDowngrade}
					onUpgrade={handleUpgradeFromBanner}
				/>
				{/* BL-10: anchored to .vnsc-root (position:relative) */}
				<ToastHost />
				{/* W1.1: alert engine đã có sẵn ở engine, trước đây không ai render.
			    Gate bằng capability `alert_drawing` (pro) — Community không bắn alert. */}
				<DrawingAlertsHost
					enabled={tierGated.allows("alert_drawing")}
					drawings={drawingsResult.resolvedDrawings}
					plotData={dataResult.plotData}
					updateDrawing={drawingsResult.drawingWorkspace.interaction.updateDrawing}
				/>
				{/* BLACKSCREEN-DIAG: renders only with ?vnsc_diag=1 / localStorage. */}
				<ChartDiagOverlay getSnapshot={getDiagSnapshot} />
			</div>
		</CapabilityProvider>
	);
});
VNInvestChartsContent.displayName = "VNInvestChartsContent";

export const VNInvestCharts = forwardRef<import("./types/fullChartHandle").FullChartHandle, VNInvestChartsProps>((props, ref) => {
	// Provide default keyboard adapter if not injected
	const keyboardAdapter = props.keyboardAdapter ?? defaultKeyboardAdapter;
	// Provide default windowEventAdapter if not injected
	const windowEventAdapter = props.windowEventAdapter ?? defaultWindowEventAdapter;
	// Provide default notificationAdapter if not injected
	const notificationAdapter = props.notificationAdapter ?? defaultNotificationAdapter;
	// Provide default audioAdapter if not injected
	const audioAdapter = props.audioAdapter ?? defaultAudioAdapter;
	// Provide default pixelRatio if not injected
	const pixelRatio = props.pixelRatio ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
	// Provide default searchParams if not injected
	const searchParams = props.searchParams ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams());
	// Provide default storageAdapter if not injected
	const storageAdapter = props.storageAdapter ?? defaultLocalStorageAdapter;

	const {
		effectiveRuntime,
		handleRuntimeDegraded,
	} = useWidgetRuntime({
		engineRuntime: props.engineRuntime,
		drawingUiEnabled: props.drawingUiEnabled ?? true,
		drawingActiveTool: (props.drawingActiveTool as string) ?? "cursor",
		selectedDrawingType: props.selectedDrawing?.type ?? null,
		onRuntimeResolved: props.onRuntimeResolved,
	});

	const handleBoundaryError = useCallback((caughtError: Error) => {
		props.onError?.(caughtError);
		// BL-18: render crashes go to telemetry too (boundary already shows UI).
		emitTelemetry(props.onTelemetry, "render-error", caughtError.message, {
			context: { stack: caughtError.stack?.slice(0, 500) },
		});
	}, [props.onError, props.onTelemetry]);

	const contentRuntimeKey = `${effectiveRuntime}-${props.showNonTradingDays ? "calendar" : "trading"}`;

	// Container ref for responsive ad slot calculation
	const containerRef = useRef<HTMLDivElement>(null);

	return (
		<SaaSFeatureProvider tenantPat={props.tenantPat} licenseKey={props.licenseKey} onLicenseDiagnostic={props.onLicenseDiagnostic} debugFeatures={props.debugFeatures} client={props.client} advActivationDate={props.advActivationDate}>
			<VNInvestChartsProvider
				adapter={props.adapter ?? FALLBACK_ADAPTER}
				symbol={props.symbol}
				timeframe={props.timeframe}
				locale={props.locale}
				messages={props.messages}
				theme={props.theme}
				panes={props.panes}
				drawings={props.drawings}
				activeTool={props.drawingActiveTool}
				storageScopeId={props.id}
				portalRoot={(props as any).portalRoot ?? (props as unknown as { __vnscPortalRoot?: HTMLElement | null }).__vnscPortalRoot ?? (props as unknown as { __portalRoot?: HTMLElement | null }).__portalRoot ?? null}
				shadowRoot={(props as any).shadowRoot ?? (props as unknown as { __vnscShadowRoot?: ShadowRoot | null }).__vnscShadowRoot ?? null}
			>
				<ToastProvider>
					<WidgetErrorBoundary key={effectiveRuntime} onError={handleBoundaryError}>
						<VNInvestChartsContent ref={ref} key={contentRuntimeKey} {...props} adapter={props.adapter ?? FALLBACK_ADAPTER} engineRuntime={effectiveRuntime} onRuntimeDegraded={handleRuntimeDegraded} keyboardAdapter={keyboardAdapter} windowEventAdapter={windowEventAdapter} notificationAdapter={notificationAdapter} audioAdapter={audioAdapter} pixelRatio={pixelRatio} searchParams={searchParams} storageAdapter={storageAdapter} />
					</WidgetErrorBoundary>
				</ToastProvider>
			</VNInvestChartsProvider>
		</SaaSFeatureProvider>
	);
});
VNInvestCharts.displayName = "VNInvestCharts";

