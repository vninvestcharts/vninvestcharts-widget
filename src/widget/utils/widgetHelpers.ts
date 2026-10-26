import { type CSSProperties, type ReactNode } from "react";
import { format } from "d3-format";
import { formatWithTimezone, formatCustomDateWithTimezone, formatTickDateWithTimezone } from "../../lib/utils/timezoneFormatter";
import {
	type PaneRuntimeSnapshot,
	type AxisSide,
	type VisibleRange as EngineVisibleRange,
	type EngineOverlayInputs,
	type EngineOverlayState,
	type EngineInstance,
} from "@vninvestcharts/engine-core";
import { type EngineHostProps, CrosshairPayload, DrawingData, type ChartHandle } from "@vninvestcharts/engine-react";
import {
	type PaneDescriptor,
	type SeriesConfig,
	type ChartTheme,
	type SeriesTypeId,
	type VisibleRange,
	DEFAULT_PANES,
} from "../../lib/core";
import { getSeries } from "../../lib/core/registry/SeriesRegistry";
import { resolveSeriesStructuredValue, resolveSeriesValue } from "../../lib/core/seriesValueResolver";
import type { DrawingWorkspaceController, DrawingDockTab } from "@vninvestcharts/engine-react";
import type { DrawingObject, DrawingAlertCondition, Point } from "@vninvestcharts/engine-drawing";
import type { MagnetSensitivity } from "@vninvestcharts/engine-drawing";
import type { ThemeConfig } from "../theme/ThemeConfig";
import type { MeasurementPoint } from "@vninvestcharts/engine-drawing";
import type { MeasurementCoordinateBridge, MeasurementCoordinateInput, MeasurementCoordinatePixelInput } from "@vninvestcharts/engine-drawing";
import { type StockDataAdapter, type Timeframe } from "../../lib/types/adapter";
import { type OHLCVBar } from "../../lib/types/ohlcv";
import { type EnrichedDatum, type IndicatorMacdValue, type IndicatorWhaleValue } from "../../lib/core/calculators/types";
import { type WhaleOrder, type CVDPoint, type DarkFlowSignalType, type AdvisoryResult, type TapeEntry } from "../../lib/types/vninvest";
import { type BackfillWorkerFlags } from "../BackfillWorkerFlags";
import { type RollbackEvent } from "../CanaryRollbackHelper";
import { type WidgetLocale, type WidgetMessages } from "../i18n/types";
import { type WidgetTimezone } from "../../lib/utils/timezoneFormatter";
import { type RequestedWidgetRuntime, type ResolvedWidgetRuntime, type WidgetRuntimeReasonCode } from "../runtimePolicy";
import { asTimeValue, clampIndex, findNearestDateIndex } from "../visibleRangeBridge";

import { type DrawingDockProps } from "../components/drawing/DrawingDock";
import { formatPrice, formatVolume } from "./numberFormat";
import { type SettingsModalProps } from "../components/settings/SettingsModal";
import { type PaperTradePanelProps } from "../components/trading/PaperTradePanel";

export const priceFormat = format(",.2f");
// V-02: compactPriceFormat removed — number SSOT lives in ./numberFormat
// (formatPrice/formatVolume). priceFormat/volumeFormat stay for frozen callers.
export const volumeFormat = format(".3s");
export const dateFormat = (d: Date, p: "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy" = "yyyy-mm-dd", timeFormat: "24h" | "12h" = "24h") => formatCustomDateWithTimezone(d, p, true, timeFormat);
export const intradayAxisFormat = (d: Date, timeFormat: "24h" | "12h" = "24h") => formatWithTimezone(d, { hour: "2-digit", minute: "2-digit", hour12: timeFormat === "12h" });
export const mixedAxisFormat = (d: Date, p?: string) => formatWithTimezone(d, p === "mm/dd/yyyy" ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
export const dailyAxisFormat = (d: Date, p: "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy" = "yyyy-mm-dd") => formatCustomDateWithTimezone(d, p, false);
export const CHART_MARGIN = { left: 60, right: 68, top: 8, bottom: 28 } as const;
export const HISTORY_BACKFILL_PAGE_LIMIT = 5000;
export const HISTORY_RECONCILE_MAX_PAGES = 12;
export const HISTORY_MIN_RESIDENT_BARS = 240;
export const FORK_DEGRADE_PIXEL_CHECK_DELAY_MS = 900;
export const FORK_DEGRADE_PIXEL_RECHECK_DELAY_MS = 350;
export const FORK_DEGRADE_REQUIRED_BLANK_CHECKS = 2;

export type WidgetHistorySessionMode = "controlled" | "uncontrolled";

export interface WidgetHistorySessionState {
	requestKey: string;
	mode: WidgetHistorySessionMode;
	revision: number;
}

export interface ForkTooltipToken {
	key: string;
	label: string;
	value: string;
	color: string;
}

export interface ForkXAxisTick {
	key: string;
	x: number;
	label: string;
}

export interface ForkXAxisHoverLabel {
	x: number;
	label: string;
}

export type WidgetPaneRuntimeSnapshot = PaneRuntimeSnapshot;

export interface WidgetRuntimeCapabilities {
	engineRuntime: ResolvedWidgetRuntime;
	forkSupported: boolean;
	paneToolbar: boolean;
	paneSplitters: boolean;
	chartCanvasOverlays: boolean;
	measurementOverlay: boolean;
	drawingOverlays: boolean;
}

export interface WidgetPaneToolbarActions {
	toggleVisibility: () => void;
	removePane: () => void;
	addSeries: () => void;
	toggleSeries: (seriesType: SeriesTypeId, seriesIndex?: number) => void;
	removeSeries: (seriesType: SeriesTypeId, seriesIndex?: number) => void;
}

export interface WidgetPaneToolbarRenderContext {
	pane: PaneDescriptor;
	snapshot: WidgetPaneRuntimeSnapshot;
	hovered: boolean;
	actions: WidgetPaneToolbarActions;
}

export interface WidgetPaneSplitterRenderContext {
	pane: PaneDescriptor;
	snapshot: WidgetPaneRuntimeSnapshot;
	splitterIndex: number;
	top: number;
	left: number;
	right: number;
}

export interface WidgetDrawingChromeRenderContext {
	activeTool: string;
	drawingWorkspace: DrawingWorkspaceController | null;
	isDark: boolean;
	magnetSensitivity: MagnetSensitivity;
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	selectedDrawing: DrawingObject | null;
	visibleRange: VisibleRange | EngineVisibleRange | null;
	size: { width: number; height: number };
}

export interface WidgetCoordinateBridge extends MeasurementCoordinateBridge {
	engineRuntime: ResolvedWidgetRuntime;
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	visibleRange: EngineVisibleRange;
}

export type WidgetRuntimeResolutionReason = WidgetRuntimeReasonCode | "FORK_RUNTIME_DEGRADED_NO_RENDER_OUTPUT";

export interface VNInvestChartsRef {
	exportDrawings(): DrawingObject[];
	importDrawings(drawings: DrawingObject[]): void;
	setTheme(config: ThemeConfig): void;
	getTheme(): ThemeConfig;
	getPlotData(): EnrichedDatum[];
	getActiveIndicators(): SeriesConfig[];
	onDataChange(callback: (data: EnrichedDatum[]) => void): () => void;
	onIndicatorsChange(callback: (indicators: SeriesConfig[]) => void): () => void;
	addIndicator(config: SeriesConfig): void;
	addCompareSymbol: (symbolId: string) => void;
	removeCompareSymbol: (symbolId: string) => void;
	getCompareOverlaySymbols: () => string[];
	getCompareOverlayEntries: () => Array<{ symbolId: string; normalizeToBaseline: boolean; visible: boolean; color: string; yAxis: "left" | "right"; lineWidth: number }>;
	updateCompareOverlay: (symbolId: string, partial: Record<string, unknown>) => void;
}

/**
 * Widget-level handle used by VNInvestMultiCharts to control individual charts.
 * Extends the engine ChartHandle with replay + compare methods.
 * Eliminates handle-as-any casts in proxy/delegation layers.
 */
export interface ReplayStateSnapshot {
	playing: boolean;
	speed: number;
	currentBar: number;
	totalBars: number;
	currentBarTimestamp?: number;
	/** A6: replay session stays active through Pause until Stop. */
	sessionActive?: boolean;
}

export interface WidgetChartHandle extends ChartHandle {
	getReplayState?(): ReplayStateSnapshot;
	replayPlay?(): void;
	replayPause?(): void;
	replayStepForward?(): void;
	replayStepBack?(): void;
	replayRewind?(): void;
	replayStop?(): void;
	replaySetSpeed?(speed: number): void;
	replaySeek?(barIndex: number): void;
	replaySeekByTimestamp?(timestamp: number): void;
	replaySelectStartBar?(): void;
	replayCancelSelection?(): void;
	getReplayTotalPnl?(): number;
	getReplayAnalytics?(): import("../../lib/core/replay/ReplaySessionAnalytics").ReplayAnalyticsStats | undefined;
	getReplayAwaitingStartBar?(): boolean;
	addCompareSymbol?(symbolId: string): void;
	removeCompareSymbol?(symbolId: string): void;
	getCompareOverlaySymbols?(): string[];
	getCompareOverlayEntries?(): Array<{
		symbolId: string;
		normalizeToBaseline?: boolean;
		visible?: boolean;
		color?: string;
		yAxis?: "left" | "right";
		lineWidth?: number;
	}>;
	updateCompareOverlay?(symbolId: string, partial: Record<string, unknown>): void;
}

export type ForkPointerContext = Parameters<NonNullable<EngineHostProps["onPointerDown"]>>[0];

export type ForkManipulationSession = {
	mode: "move" | "resize";
	objectId: string;
	objectIds: readonly string[];
	baseDrawings: readonly DrawingObject[];
	startChartPoint?: Point;
	handleIndex?: number;
	started: boolean;
};

export type ForkPointerOwner = "pane-toolbar" | "pane-splitter" | "drawing-chrome";

export type ForkRubberBandSelection = {
	startPixel: readonly [number, number];
	currentPixel: readonly [number, number];
};

export interface VNInvestChartsProps {
	adapter?: StockDataAdapter;
	data?: readonly OHLCVBar[];
	symbol?: string;
	timeframe?: Timeframe;
	drawingUiEnabled?: boolean;
	drawingActiveTool?: string;
	drawings?: readonly DrawingObject[];
	defaultDrawings?: readonly DrawingObject[];
	drawingStorageKey?: string;
	defaultDrawingDockTab?: DrawingDockTab;
	engineRuntime?: RequestedWidgetRuntime;
	useWebGL?: boolean;
	locale?: WidgetLocale;
	messages?: Partial<WidgetMessages>;
	theme?: ChartTheme;
	timezone?: WidgetTimezone;
	defaultTimezone?: WidgetTimezone;
	onTimezoneChange?: (timezone: WidgetTimezone) => void;
	panes?: readonly PaneDescriptor[];
	xExtents?: readonly [Date | number, Date | number];
	children?: ReactNode;
	className?: string;
	style?: CSSProperties;
	measurementEnabled?: boolean;
	selectedDrawing?: DrawingObject | null;
	showDrawingPriceMarkers?: boolean;
	showNonTradingDays?: boolean;
	enableWhale?: boolean;
	whaleThreshold?: number;
	whaleOrders?: readonly WhaleOrder[];
	enableCVD?: boolean;
	cvdMode?: "oscillator" | "histogram";
	externalCvdSeries?: readonly CVDPoint[];
	darkFlowStrength?: number | null;
	darkFlowSignalType?: DarkFlowSignalType;
	suppressForkCanvasFallback?: boolean;
	onClick?: (moreProps: { currentItem?: EnrichedDatum; currentCharts?: number[]; mouseXY?: [number, number] }, event: unknown) => void;
	onContextMenu?: (moreProps: { currentItem?: EnrichedDatum; currentCharts?: number[]; mouseXY?: [number, number] }, event: unknown) => void;
	onDrawingsChange?: (drawings: readonly DrawingObject[]) => void;
	onSelectedDrawingChange?: (drawing: DrawingObject | null) => void;
	onDrawingWorkspaceChange?: (workspace: DrawingWorkspaceController | null) => void;
	onVisibleDomainChange?: (domain: [Date | number, Date | number]) => void;
	onVisibleRangeChange?: (range: VisibleRange) => void;
	onHistorySyncBusyChange?: (busy: boolean) => void;
	onBarsChange?: (bars: readonly OHLCVBar[]) => void;
	resetKey?: number;
	onPaneSnapshotsChange?: (snapshots: readonly WidgetPaneRuntimeSnapshot[]) => void;
	onPaneHover?: (paneId: string | null) => void;
	onPaneToggleVisibleRequest?: (paneId: string) => void;
	onPaneRemoveRequest?: (paneId: string) => void;
	onPaneAddSeriesRequest?: (paneId: string) => void;
	onPaneToggleSeriesRequest?: (paneId: string, seriesType: SeriesTypeId, seriesIndex?: number) => void;
	onPaneRemoveSeriesRequest?: (paneId: string, seriesType: SeriesTypeId, seriesIndex?: number) => void;
	onRuntimeCapabilitiesChange?: (capabilities: WidgetRuntimeCapabilities) => void;
	onRuntimeResolved?: (runtime: ResolvedWidgetRuntime, reason: WidgetRuntimeResolutionReason) => void;
	onCoordinateBridgeChange?: (bridge: WidgetCoordinateBridge | null) => void;
	renderPaneToolbar?: (context: WidgetPaneToolbarRenderContext) => ReactNode;
	renderPaneSplitter?: (context: WidgetPaneSplitterRenderContext) => ReactNode;
	renderDrawingChrome?: (context: WidgetDrawingChromeRenderContext) => ReactNode;
	onError?: (error: Error) => void;
	onDrawingAlert?: (drawing: DrawingObject, condition: DrawingAlertCondition, currentPrice: number) => void;
	showAdvisoryPanel?: boolean;
	advisoryResult?: AdvisoryResult | null;
	isAdvisoryLoading?: boolean;
	onAdvisoryRefresh?: () => void;
	showTapePanel?: boolean;
	tapeEntries?: readonly TapeEntry[];
	isTapeLoading?: boolean;
	tapeFilterBillions?: number;
	onTapeFilterChange?: (billions: number) => void;

	showToolbar?: boolean;
	showHeader?: boolean;
	showFooter?: boolean;
	renderToolbar?: (ctx: { activeTool?: string; onToolSelect: (tool: string) => void }) => ReactNode;
	renderHeader?: (ctx: { symbol?: string; timeframe?: string }) => ReactNode;
	renderFooter?: (ctx: { timeframe?: string; range?: string }) => ReactNode;

	showDrawingDock?: boolean;
	settingsOpen?: boolean;
	onSettingsClose?: () => void;
	onPaperTradePanelClose?: () => void;
	/** @deprecated ReplayControlBarProps type preserved for backward compatibility. Was from ReplayControlBar (deleted S0.1) */
	renderReplayBar?: (ctx: {
		playing: boolean;
		speed: number;
		currentBar: number;
		totalBars: number;
		onPlay?: () => void;
		onPause?: () => void;
		onRewind?: () => void;
		onStepBack?: () => void;
		onStepForward?: () => void;
		onSpeedChange?: (speed: number) => void;
		onClose?: () => void;
		onJumpToLatest?: () => void;
	}) => ReactNode;
	renderPaperTradePanel?: (ctx: PaperTradePanelProps) => ReactNode;
	renderSettings?: (ctx: SettingsModalProps) => ReactNode;
	renderDrawingDock?: (ctx: DrawingDockProps) => ReactNode;

	historyMinResidentBars?: number;
	maxVisibleBars?: number;
	localCacheRoot?: string;
	backfillWorkerFlags?: BackfillWorkerFlags;
	canaryLevel?: 10 | 30 | 100;
	onCanaryGateDecision?: (decision: {
		previousLevel: 10 | 30 | 100;
		currentLevel: 10 | 30 | 100;
		metrics: {
			visibleBarsTotal: number;
			visibleBarsAfterFilter: number;
			workersActive: { externalBarsWorker: boolean; lodWorker: boolean };
			p95FrameTimeMs?: number;
			requestCount?: number;
		};
		recommendation: "GO" | "NO-GO";
		reason: string;
	}) => void;
	onCanaryRollbackEvent?: (event: RollbackEvent) => void;
}

export interface VNInvestChartsContentProps extends VNInvestChartsProps {
	adapter: StockDataAdapter;
	onRuntimeDegraded?: (reason: "fork-no-render-output") => void;
}

export function isWidgetTestEnvironment() {
	const globalScope = globalThis as typeof globalThis & {
		vi?: unknown;
		describe?: unknown;
		process?: { env?: { NODE_ENV?: string } };
	};

	return typeof globalScope.vi !== "undefined"
		|| typeof globalScope.describe !== "undefined"
		|| globalScope.process?.env?.NODE_ENV === "test";
}

export function isPrimaryPriceSeries(type: SeriesTypeId) {
	return type === "Candlestick"
		|| type === "HollowCandle"
		|| type === "OHLC"
		|| type === "HeikinAshi"
		|| type === "Line"
		|| type === "Area";
}

export function resolveTooltipSeriesColor(
	series: PaneDescriptor["series"][number],
	fallback: string,
) {
	if (typeof series.color === "string" && series.color.length > 0) {
		return series.color;
	}

	const paramColor = series.params?.["color"];
	if (typeof paramColor === "string" && paramColor.length > 0) {
		return paramColor;
	}

	switch (series.type) {
		case "EMA":
		case "MA":
			return "#2d9cdb";
		case "BollingerBand":
		case "BollingerBands":
			return "#38bdf8";
		case "MACD":
			return "#2962ff";
		case "RSI":
			return "#ff7f0e";
		case "CVDApprox":
		case "CVDRealtime":
			return "#4f46e5";
		case "SMFI":
			return "#06b6d4";
		case "WyckoffWave":
			return "#f59e0b";
		case "KDJ":
			return "#7c3aed";
		case "CCI":
			return "#e11d48";
		default:
			return fallback;
	}
}

export function formatTooltipValue(
	value: number | undefined,
	formatter: ((value: number) => string) | undefined,
) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return "n/a";
	}

	return formatter ? formatter(value) : priceFormat(value);
}

export function buildForkTooltipTokens(
	pane: PaneDescriptor,
	datum: EnrichedDatum,
	textColor: string,
): ForkTooltipToken[] {
	const tokens: ForkTooltipToken[] = [];

	if (pane.tooltip === "ohlc") {
		tokens.push(
			{ key: `${pane.id}-open`, label: "O", value: formatPrice(datum.open), color: textColor },
			{ key: `${pane.id}-high`, label: "H", value: formatPrice(datum.high), color: textColor },
			{ key: `${pane.id}-low`, label: "L", value: formatPrice(datum.low), color: textColor },
			{ key: `${pane.id}-close`, label: "C", value: formatPrice(datum.close), color: textColor },
			{ key: `${pane.id}-volume`, label: "Vol", value: formatVolume(datum.volume), color: textColor },
		);
	}

	for (let seriesIndex = 0; seriesIndex < pane.series.length; seriesIndex += 1) {
		const series = pane.series[seriesIndex];
		if (series.visible === false) {
			continue;
		}
		if (pane.tooltip === "ohlc" && isPrimaryPriceSeries(series.type)) {
			continue;
		}

		const tooltipEntry = getSeries(series.type).tooltipEntry(series);
		const label = series.overlaySymbolId ?? tooltipEntry.label;
		tokens.push({
			key: `${pane.id}-${series.id ?? `${series.type}-${seriesIndex}`}`,
			label,
			value: formatTooltipValue(resolveSeriesValue(datum, series), tooltipEntry.format),
			color: resolveTooltipSeriesColor(series, tooltipEntry.color ?? textColor),
		});
	}

	return tokens;
}

export function resolveDiscontinuousXExtents(
	extents: readonly [Date | number, Date | number] | undefined,
	data: readonly EnrichedDatum[],
	xAccessor: (datum: EnrichedDatum) => number,
) {
	if (data.length === 0) {
		return undefined;
	}

	const lastIndex = data.length - 1;
	const defaultStart = xAccessor(data[0]);
	const defaultEnd = xAccessor(data[lastIndex]);
	if (!extents) {
		return [defaultStart, defaultEnd] as [number, number];
	}

	const startIndex = findNearestDateIndex(data, asTimeValue(extents[0]));
	const endTime = asTimeValue(extents[1]);
	const lastBarTime = data[lastIndex].date.getTime();

	if (endTime <= lastBarTime) {
		const endIndex = findNearestDateIndex(data, endTime);
		return [xAccessor(data[startIndex]), xAccessor(data[endIndex])] as [number, number];
	}

	// End extent is in the future → compute virtual index past data edge
	// so the xScale domain extends to wall-clock time, showing blank space
	// between last bar and "now".
	const gapMs = endTime - lastBarTime;
	const avgTimeframeMs = data.length > 1
		? lastBarTime - data[lastIndex - 1].date.getTime()
		: 86_400_000;
	const gapBars = Math.ceil(gapMs / avgTimeframeMs);
	const maxBars = 100;
	const virtualGap = Math.min(gapBars, maxBars);
	const lastX = xAccessor(data[lastIndex]);
	return [xAccessor(data[startIndex]), lastX + virtualGap] as [number, number];
}

export function resolveDateDomainFromDiscontinuous(
	domain: [Date | number, Date | number],
	data: readonly EnrichedDatum[],
	xAccessor: (datum: EnrichedDatum) => number,
): [Date, Date] {
	if (data.length === 0) {
		const epoch = new Date(0);
		return [epoch, epoch];
	}

	const firstIndexValue = xAccessor(data[0]);
	const lastDataIndex = data.length - 1;
	const resolveDate = (value: Date | number, fallbackIndex: number) => {
		if (typeof value !== "number" || !Number.isFinite(value)) {
			return data[fallbackIndex].date;
		}

		const dataIndex = clampIndex(Math.round(value - firstIndexValue), data.length);
		return data[dataIndex]?.date ?? data[fallbackIndex].date;
	};

	return [resolveDate(domain[0], 0), resolveDate(domain[1], lastDataIndex)];
}

export function resolveEngineSeriesValueForRuntime(datum: EnrichedDatum, series: PaneDescriptor["series"][number]) {
	switch (series.type) {
		case "MACD": {
			const value = resolveSeriesStructuredValue(datum, series) as IndicatorMacdValue | undefined;
			return value?.divergence;
		}
		case "Whale": {
			const value = resolveSeriesStructuredValue(datum, series) as IndicatorWhaleValue | undefined;
			const buy = value?.whaleBuyVol ?? 0;
			const sell = value?.whaleSellVol ?? 0;
			return buy - sell;
		}
		default:
			return resolveSeriesValue(datum, series);
	}
}

export function buildLegacyPaneSnapshots(
	panes: readonly PaneDescriptor[],
	heights: readonly number[],
	canvasSize: { width: number; height: number },
	scaleSlotDomains: Record<string, [number, number]>,
): readonly WidgetPaneRuntimeSnapshot[] {
	const plotWidth = Math.max(0, canvasSize.width - CHART_MARGIN.left - CHART_MARGIN.right);
	let top = CHART_MARGIN.top;

	return panes.map((pane, index) => {
		const height = heights[index] ?? 0;
		const hasLeftAxis = pane.series.some((series) => series.visible !== false && series.yAxis === "left");
		const hasRightAxis = pane.series.some((series) => series.visible !== false && (series.yAxis === "right" || series.yAxis == null));
		const snapshotTop = top;
		top += height;
		const leftBounds = hasLeftAxis
			? {
				top: snapshotTop,
				left: 0,
				width: CHART_MARGIN.left,
				height,
			}
			: undefined;
		const rightBounds = hasRightAxis
			? {
				top: snapshotTop,
				left: canvasSize.width - CHART_MARGIN.right,
				width: CHART_MARGIN.right,
				height,
			}
			: undefined;
		const scaleSlotBounds = {
			...(leftBounds ? { [`${pane.id}-left`]: leftBounds } : {}),
			...(rightBounds ? { [`${pane.id}-right`]: rightBounds } : {}),
		};
		const scaleSlotStates = {
			...(leftBounds ? { [`${pane.id}-left`]: { side: "left" as const, mode: "auto" as const, visible: true, domain: scaleSlotDomains[`${pane.id}-left`] } } : {}),
			...(rightBounds ? { [`${pane.id}-right`]: { side: "right" as const, mode: "auto" as const, visible: true, domain: scaleSlotDomains[`${pane.id}-right`] } } : {}),
		};

		return {
			paneId: pane.id,
			bounds: {
				top: snapshotTop,
				left: 0,
				width: canvasSize.width,
				height,
			},
			plotBounds: {
				top: snapshotTop,
				left: CHART_MARGIN.left,
				width: plotWidth,
				height,
			},
			axisBounds: {
				...(leftBounds
					? {
						left: leftBounds,
					}
					: {}),
				...(rightBounds
					? {
						right: rightBounds,
					}
					: {}),
			},
			scaleSlotBounds,
			scaleSlotStates,
			headerAnchor: {
				top: snapshotTop,
				left: CHART_MARGIN.left,
				width: plotWidth,
			},
			labelAnchor: {
				top: snapshotTop,
				left: 0,
				height,
			},
		};
	});
}

export function normalizePaneDescriptorsForExplicitScaleSlots(panes: readonly PaneDescriptor[]): PaneDescriptor[] {
	return panes.map((pane) => {
		const normalizedSeries = pane.series.map((series) => ({
			...series,
			params: series.params ? { ...series.params } : undefined,
			scaleSlotId: `${pane.id}-${series.yAxis}`,
			lineWidth: typeof series.lineWidth === "number" && Number.isFinite(series.lineWidth) ? series.lineWidth : undefined,
			subColors: series.subColors ? { ...series.subColors } : undefined,
		}));
		const activeSeries = normalizedSeries.filter((series) => series.visible !== false);
		const hasLeftAxis = activeSeries.some((series) => series.yAxis === "left");
		const hasRightAxis = activeSeries.some((series) => series.yAxis === "right");

		return {
			...pane,
			series: normalizedSeries,
			splitScale: hasLeftAxis && hasRightAxis,
		};
	});
}

export const FALLBACK_ADAPTER: StockDataAdapter = {
	fetchBarsInRange: () => Promise.resolve([]),
	fetchBarsBefore: () => Promise.resolve([]),
	subscribeToBar: () => () => {},
	subscribeToTrades: () => () => {},
	subscribeToOrderbook: () => () => {},
	searchSymbols: () => Promise.resolve([]),
	getSourceSemantics: () => ({
		sourceId: "fallback",
		sourceContractVersion: "1.0.0",
		instrumentClass: "custom",
		coverageMode: "finite-snapshot",
		sessionModel: "continuous",
		timezone: "UTC",
		supportsExactRangeFetch: false,
		supportsBackwardAnchor: false,
		supportsForwardAnchor: false,
		supportsLiveBars: false,
		finalityMode: "immutable",
		expectedGapReasons: [],
	}),
};

/**
 * Wrap a StockDataAdapter to ensure correct source semantics for backfill.
 *
 * Problem: adapters that declare `coverageMode: "finite-snapshot"` cause
 * `classifyGapReason` to tag ALL gaps as `boundary-exhausted`, which the
 * backfill filter excludes — so no fetch ever happens even when the adapter
 * supports `fetchBarsBefore`.
 *
 * This wrapper preserves the original adapter's semantics but corrects
 * `coverageMode` to `anchor-before` and sets `supportsBackwardAnchor: true`
 * when the adapter provides `fetchBarsBefore`.
 */
export function wrapAdapterForBackfill(adapter: StockDataAdapter): StockDataAdapter {
	const originalSemantics = typeof adapter.getSourceSemantics === "function"
		? adapter.getSourceSemantics()
		: null;

	const hasFetchBarsBefore = typeof adapter.fetchBarsBefore === "function";

	const wrapped = {
		fetchBarsInRange: adapter.fetchBarsInRange.bind(adapter),
		fetchBarsBefore: adapter.fetchBarsBefore?.bind(adapter),
		subscribeToBar: adapter.subscribeToBar.bind(adapter),
		subscribeToTrades: adapter.subscribeToTrades?.bind(adapter) ?? (() => () => {}),
		subscribeToOrderbook: adapter.subscribeToOrderbook?.bind(adapter) ?? (() => () => {}),
		searchSymbols: adapter.searchSymbols.bind(adapter),
		getSourceSemantics: () => {
			if (!originalSemantics) {
				return {
					sourceId: "wrapped",
					sourceContractVersion: "1.0.0",
					instrumentClass: "custom",
					coverageMode: "anchor-before" as const,
					sessionModel: "continuous" as const,
					timezone: "UTC",
					supportsExactRangeFetch: false,
					supportsBackwardAnchor: hasFetchBarsBefore,
					supportsForwardAnchor: false,
					supportsLiveBars: false,
					finalityMode: "immutable" as const,
					maxBarsPerRequest: 1000,
					expectedGapReasons: ["not-fetched"],
				};
			}

			const coverageMode = originalSemantics.coverageMode === "finite-snapshot"
				? "anchor-before"
				: originalSemantics.coverageMode;

			return {
				...originalSemantics,
				coverageMode,
				supportsBackwardAnchor: hasFetchBarsBefore || originalSemantics.supportsBackwardAnchor,
			};
		},
		getLastBackfillCoverage: adapter.getLastBackfillCoverage?.bind(adapter),
		getLastRangeCoverage: adapter.getLastRangeCoverage?.bind(adapter),
	} as StockDataAdapter & { setAuthHandler?: (handler: unknown) => void };
	const sourceAuthHandler = (adapter as unknown as { setAuthHandler?: (handler: unknown) => void }).setAuthHandler;
	if (typeof sourceAuthHandler === "function") {
		wrapped.setAuthHandler = sourceAuthHandler.bind(adapter);
	}
	return wrapped;
}

export const NORMALIZED_DEFAULT_PANES = normalizePaneDescriptorsForExplicitScaleSlots(DEFAULT_PANES);

export function resolveVisiblePanes(panes: readonly PaneDescriptor[] | undefined): readonly PaneDescriptor[] {
	const candidatePanes = panes?.length ? normalizePaneDescriptorsForExplicitScaleSlots(panes) : NORMALIZED_DEFAULT_PANES;
	const nextPanes = candidatePanes.filter((pane) => pane.visible);
	return nextPanes.length > 0 ? nextPanes : NORMALIZED_DEFAULT_PANES.filter((pane) => pane.visible);
}

export function inferAxisSideFromScaleSlotId(scaleSlotId: string) {
	if (scaleSlotId.endsWith("-left")) {
		return "left" as const;
	}
	if (scaleSlotId.endsWith("-right")) {
		return "right" as const;
	}
	return "right" as const;
}

export function mergePaneSnapshotDomains(
	snapshots: readonly WidgetPaneRuntimeSnapshot[],
	scaleSlotDomains: Record<string, [number, number]>,
	options?: {
		preferSnapshotPriceDomains?: boolean;
	},
) {
	const preferSnapshotPriceDomains = options?.preferSnapshotPriceDomains ?? false;
	return snapshots.map((snapshot) => {
		const scaleSlotIds = new Set([
			...Object.keys(snapshot.scaleSlotBounds),
			...Object.keys(snapshot.scaleSlotStates ?? {}),
		]);

		const scaleSlotStates = Object.fromEntries(
			[...scaleSlotIds].map((scaleSlotId) => {
				const currentState = snapshot.scaleSlotStates[scaleSlotId];
				const shouldPreferComputedDomain = scaleSlotId.startsWith("price-") && !preferSnapshotPriceDomains;
				return [scaleSlotId, {
					side: currentState?.side ?? inferAxisSideFromScaleSlotId(scaleSlotId),
					mode: currentState?.mode ?? "auto",
					visible: currentState?.visible ?? true,
					domain: shouldPreferComputedDomain
						? (scaleSlotDomains[scaleSlotId] ?? currentState?.domain)
						: (currentState?.domain ?? scaleSlotDomains[scaleSlotId]),
				}];
			}),
		);

		return {
			...snapshot,
			scaleSlotStates,
		};
	});
}

export function resolvePreferredScaleSlotId(snapshot: WidgetPaneRuntimeSnapshot, requestedScaleSlotId?: string) {
	if (requestedScaleSlotId && snapshot.scaleSlotStates[requestedScaleSlotId]?.visible) {
		return requestedScaleSlotId;
	}

	const visibleScaleSlotIds = Object.entries(snapshot.scaleSlotStates)
		.filter(([, state]) => state.visible)
		.map(([scaleSlotId]) => scaleSlotId);
	if (visibleScaleSlotIds.length === 0) {
		return requestedScaleSlotId && snapshot.scaleSlotStates[requestedScaleSlotId]
			? requestedScaleSlotId
			: undefined;
	}

	return visibleScaleSlotIds.find((scaleSlotId) => snapshot.scaleSlotStates[scaleSlotId]?.side === "right")
		?? (requestedScaleSlotId && snapshot.scaleSlotStates[requestedScaleSlotId] ? requestedScaleSlotId : undefined)
		?? visibleScaleSlotIds[0];
}

export function findPlotDataIndex(point: MeasurementPoint, data: readonly EnrichedDatum[]) {
	if (point.index >= 0 && point.index < data.length) {
		return point.index;
	}

	return data.findIndex((datum) => datum.date.getTime() === point.date.getTime());
}

export function findPlotDataIndexByTime(timestamp: number, data: readonly EnrichedDatum[]) {
	if (data.length === 0) {
		return -1;
	}

	return findNearestDateIndex(data, timestamp);
}

export function resolveForkChartConfigScaleSlotId(snapshot: WidgetPaneRuntimeSnapshot) {
	const visibleRightScaleSlotId = Object.entries(snapshot.scaleSlotStates).find(([, state]) => state.visible && state.side === "right")?.[0];
	if (visibleRightScaleSlotId) return visibleRightScaleSlotId;
	const visibleScaleSlotId = Object.entries(snapshot.scaleSlotStates).find(([, state]) => state.visible)?.[0];
	if (visibleScaleSlotId) return visibleScaleSlotId;
	return Object.keys(snapshot.scaleSlotStates)[0] ?? null;
}

export {
	areBoundsEqual,
	areHeaderAnchorEqual,
	areLabelAnchorEqual,
	areAxisBoundsEqual,
	areBoundsMapEqual,
	areDomainTupleEqual,
	areScaleSlotStatesEqual,
	arePaneSnapshotsEqual,
	areRuntimeCapabilitiesEqual,
} from "./widgetEquality";
