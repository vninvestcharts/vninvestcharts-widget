// BL-03B: canonical prop types moved verbatim from VNInvestCharts.tsx (type-only move, zero runtime change).
// VNInvestCharts.tsx re-exports them so all existing import paths keep working.
import type { CSSProperties, ReactNode, RefObject } from "react";
import type {
	CrosshairPayload,
	DrawingData,
	DrawingOperation,
	VisibleRangePayload,
	SymbolLinkGroupId,
	ResizeAdapter as EngineResizeAdapter,
	KeyboardAdapter,
	ClockAdapter,
	StorageAdapter,
	PortalAdapter,
	ChartRegistryAdapter,
	BroadcastChannelAdapter,
	WindowEventAdapter,
	NotificationAdapter,
	AudioAdapter,
	ResizeAdapter,
} from "@vninvestcharts/engine-react";
import type { VisibleRange as EngineVisibleRange } from "@vninvestcharts/engine-core";
import type { ChartTheme, PaneDescriptor, SeriesTypeId, VisibleRange } from "../lib/core";
import type { DrawingDockTab, DrawingWorkspaceController } from "@vninvestcharts/engine-react";
import type { DrawingStorageAdapter, DrawingAlertCondition } from "@vninvestcharts/engine-drawing";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import type { StockDataAdapter, Timeframe } from "../lib/types/adapter";
import type { OHLCVBar } from "../lib/types/ohlcv";
import type {
	WidgetPaneRuntimeSnapshot,
	WidgetRuntimeCapabilities,
	WidgetRuntimeResolutionReason,
	WidgetCoordinateBridge,
} from "./utils/widgetHelpers";
import type { SaaSFeatureFlags } from "./types/saas";
import type { WatchlistAdapter } from "./types/watchlist";
import type { VNInvestClient } from "./adapters/VNInvestClient";
import type { WidgetLocale, WidgetMessages } from "./i18n/types";
import type { EnrichedDatum } from "../lib/core/calculators/types";
import type { WidgetTimezone } from "../lib/utils/timezoneFormatter";
import type {
	WhaleOrder,
	CVDPoint,
	DarkFlowSignalType,
	AdvisoryResult,
	TapeEntry,
} from "../lib/types/vninvest";
import type { CorporateEvent } from "./components/events/CorporateEventsOverlay";
import type { RequestedWidgetRuntime, ResolvedWidgetRuntime } from "./runtimePolicy";

export interface WidgetAuthHandler {
	getToken: () => string | Promise<string>;
	getRefreshToken?: () => string | Promise<string>;
	onTokensUpdated?: (tokens: { patToken: string; refreshToken?: string }) => void | Promise<void>;
	onAuthError?: (error: Error) => void;
}

export interface VNInvestChartsProps {
	id?: string;
	adapter?: StockDataAdapter;
	data?: readonly OHLCVBar[];
	symbol?: string;
	onSymbolChange?: (symbol: string) => void;
	timeframe?: Timeframe;
	range?: string;
	onRangeChange?: (range: string) => void;
	defaultPeriod?: string;
	authHandler?: WidgetAuthHandler;
	onTimeframeChange?: (tf: Timeframe) => void;
	drawingUiEnabled?: boolean;
	drawingActiveTool?: string;
	drawings?: readonly DrawingObject[];
	defaultDrawings?: readonly DrawingObject[];
	drawingStorageKey?: string;
	drawingStorageAdapter?: DrawingStorageAdapter;
	defaultDrawingDockTab?: DrawingDockTab;
	engineRuntime?: RequestedWidgetRuntime;
	useWebGL?: boolean;
	locale?: WidgetLocale;
	messages?: Partial<WidgetMessages>;
	theme?: ChartTheme;
	// F-07: khi host pin `theme` prop, preset chọn trong Settings modal bị che khỏi
	// `resolvedTheme` — host nhận callback này để tự áp lại (vd workspace multi-chart).
	onThemePresetChange?: (theme: ChartTheme) => void;
	timezone?: WidgetTimezone;
	defaultTimezone?: WidgetTimezone;

	// Adapter injection for decoupling from globals
	resizeAdapter?: ResizeAdapter;
	keyboardAdapter?: KeyboardAdapter;
	clockAdapter?: ClockAdapter;
	storageAdapter?: StorageAdapter;
	portalAdapter?: PortalAdapter;
	registryAdapter?: ChartRegistryAdapter;
	broadcastChannelAdapter?: BroadcastChannelAdapter;
	// Portal SSOT (Pre-P2)
	portalRoot?: HTMLElement | null;
	shadowRoot?: ShadowRoot | null;
	windowEventAdapter?: WindowEventAdapter;
	notificationAdapter?: NotificationAdapter;
	audioAdapter?: AudioAdapter;
	pixelRatio?: number;
	searchParams?: URLSearchParams;
	onTimezoneChange?: (timezone: WidgetTimezone) => void;
	panes?: readonly PaneDescriptor[];
	xExtents?: readonly [Date | number, Date | number];
	children?: ReactNode;
	className?: string;
	style?: CSSProperties;
	measurementEnabled?: boolean;
	// RD-04b (DOCK_SSOT_B1): object-form, thống nhất với multi + WorkspaceRightDockSlot.
	// BREAKING vs chữ ký cũ `(chartId: string) => ReactNode` (đã publish 0.2.1) —
	// sang mục Unreleased của CHANGELOG.md; publish kế tiếp = 0.3.0.
	// Lưu ý (audit code F2): `activeChartHandle` đọc từ ref tại render — lần render đầu
	// có thể null; host không nên bind cứng giá trị này vào node (chờ handle qua callback khác).
	renderRightPanel?: (context: { chartId: string; activeChartHandle: unknown }) => ReactNode;
	isMobile?: boolean;
	selectedDrawing?: DrawingObject | null;
	isActiveChart?: boolean;
	showCorporateEvents?: boolean;
	corporateEvents?: readonly CorporateEvent[];
	/**
	 * Corporate-events data mode. `live` (default) returns empty when the
	 * adapter is missing/fails. `demo` allows the local mock fixture.
	 */
	corporateEventsMode?: "live" | "demo";
	tenantPat?: string;
	/**
	 * CS-3 — offline signed license key (`vni1.*`) injected by the host.
	 * Goes to the LICENSE channel only; `tenantPat` stays on the PAT channel and
	 * can never shadow this. Hosts that pin a license (enterprise self-host) use
	 * this; everyone else leaves it unset and the local slot is read instead.
	 */
	licenseKey?: string;
	/**
	 * CS-6 — observed licensing state for hosts. Called after each completed
	 * validation with attribution and degradation info; never on every render.
	 * Silent by default (unset = no calls). Cannot cross the iframe postMessage
	 * boundary by design — functions are not serializable — so the iframe entry
	 * deliberately does not forward it.
	 */
	onLicenseDiagnostic?: (info: import("./types/saas").LicenseDiagnosticInfo) => void;
	client?: VNInvestClient;
	debugFeatures?: Partial<SaaSFeatureFlags>;
	/**
	 * **H0.9 — chỉ có tác dụng ngoài production build.**
	 *
	 * Ghi đè tier khi kiểm thử hành vi của tính năng Pro (replay, pine, strategy tester)
	 * mà không cần license thật. Ở production build prop này bị **bỏ qua hoàn toàn**:
	 * `VNInvestCharts.tsx` chỉ nhận nó qua nhánh `process.env.NODE_ENV !== "production"`,
	 * nên tier thật và capability narrowing của license ký số luôn được áp dụng.
	 *
	 * KHÔNG phải đường vòng license: engine vẫn re-validate fail-closed qua
	 * `onTierValidated` (`KernelEngine.ts:72`) và chỉ nhận `enginePat` khi credential đã
	 * xác minh (`usePatTierAuthentication.ts:212-218`), nên feature do engine chặn vẫn bị
	 * chặn. Trước H0.9 nhánh này **không** có guard production, và mặt khác nó còn đặt
	 * `narrowing: undefined` ⇒ xoá luôn allowlist capability của license — tức prop vừa
	 * nâng tier vừa gỡ thanh chắn an toàn.
	 *
	 * Giá trị mặc định `undefined` = không ghi đè, dùng tier thật.
	 *
	 * Khoá bằng `src/widget/__tests__/debugTier.production.test.ts`: test đọc **byte**
	 * bundle production và fail nếu nhánh ghi đè còn tồn tại.
	 */
	debugTier?: import("@vninvestcharts/engine-core").PatTier;
	showDrawingPriceMarkers?: boolean;
	showNonTradingDays?: boolean;
	axisLabelColor?: string;
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
	// Sync callbacks for MultiCharts synchronization
	onSyncDrawing?: (operation: DrawingOperation) => void;
	onTimeAnchor?: (timestamp: number) => void;
	onSyncViewport?: (payload: VisibleRangePayload | CrosshairPayload) => void;
	onCrosshairChange?: (crosshair: CrosshairPayload) => void;
	onDrawingChange?: (drawings: DrawingData[]) => void;
	renderPaneToolbar?: (context: { pane: PaneDescriptor; snapshot: WidgetPaneRuntimeSnapshot; hovered: boolean; actions: { toggleVisibility: () => void; removePane: () => void; addSeries: () => void; toggleSeries: (seriesType: SeriesTypeId, seriesIndex?: number) => void; removeSeries: (seriesType: SeriesTypeId, seriesIndex?: number) => void } }) => ReactNode;
	renderPaneSplitter?: (context: { pane: PaneDescriptor; snapshot: WidgetPaneRuntimeSnapshot; splitterIndex: number; top: number; left: number; right: number }) => ReactNode;
	renderDrawingChrome?: (context: { activeTool?: string; drawingWorkspace?: DrawingWorkspaceController; isDark?: boolean; magnetSensitivity?: any; paneSnapshots?: readonly WidgetPaneRuntimeSnapshot[]; selectedDrawing?: DrawingObject | null; visibleRange?: any; size?: { width: number; height: number } }) => ReactNode;
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
	watchlistAdapter?: WatchlistAdapter;
	adsEnabled?: boolean; showTimeScrollbar?: boolean;
	showToolbar?: boolean;
	showHeader?: boolean;
	showFooter?: boolean;
	showFloatingBar?: boolean;
	/**
	 * D2: explicit right-dock switch (forwarded to useWidgetOverlays).
	 * `true` forces open, `false` forces closed, `undefined` = legacy auto.
	 */
	showDock?: boolean;
	/**
	 * D6: right-dock tier gate (default true). `false` restores the legacy
	 * full dock for every tier (host opt-out, e.g. internal tools).
	 */
	dockTierGate?: boolean;
	onToggleLayout?: () => void;
	isSoloMode?: boolean;
	renderToolbar?: (ctx: { activeTool?: string; onToolSelect: (tool: string) => void }) => ReactNode;
	renderHeader?: (ctx: { symbol?: string; timeframe?: string }) => ReactNode;
	renderFooter?: (ctx: { timeframe?: string; range?: string }) => ReactNode;
	showDrawingDock?: boolean;
	settingsOpen?: boolean;
	onSettingsClose?: () => void;
	onPaperTradePanelClose?: () => void;
	renderReplayBar?: (ctx: any) => ReactNode;
	renderPaperTradePanel?: (ctx: any) => ReactNode;
	renderSettings?: (ctx: any) => ReactNode;
	renderDrawingDock?: (ctx: any) => ReactNode;
	historyMinResidentBars?: number;
	maxVisibleBars?: number;
	/** Phase 2 (ZOOM_SPEED_REDUCTION_PLAN): per-step zoom multiplier (1.05-1.3, default 1.15). */
	zoomSpeed?: number;
	maxVisiblePanes?: number;
	localCacheRoot?: string;
	backfillWorkerFlags?: any;
	canaryLevel?: 10 | 30 | 100;
	onCanaryGateDecision?: (decision: any) => void;
	onCanaryRollbackEvent?: (event: any) => void;
	dataAdapterName?: string;
	onDataAdapterChange?: (name: string) => void;

	// Snapshot-based freeze/thaw (ADR-0011)
	frozenSnapshot?: ImageBitmap | HTMLCanvasElement | null;

	// Paper trading sizing config (H4)
	sizingMode?: "fixed" | "percent";
	riskPercent?: number;
	initialEquity?: number;
	onSizingChange?: (cfg: { mode: "fixed" | "percent"; riskPercent: number; initialEquity: number }) => void;

	// MultiCharts integration props
	symbolLinkGroup?: SymbolLinkGroupId | null;
	initialEngineState?: Record<string, unknown>;
	onChartReady?: (ref: any) => void;
	onChartTypeChange?: (chartType: string) => void;

	// OHLC hover tooltip integration
	hoverEmitterRef?: React.RefObject<any>;

	// Active chart tracking (multi-chart context) — only show x-axis hover label for active chart
	active?: boolean;
	onComparisonChange?: (overlays: any[]) => void;
	syncOverrides?: Record<string, boolean>;
	/** URL for upgrade CTA when user clicks a premium-gated feature */
	upgradeUrl?: string;
	/**
	 * BL-18: opt-in observability sink (host plugs Sentry/Datadog here).
	 * Library-safe: no SDK bundled; no-op when absent.
	 */
	onTelemetry?: (event: import("./utils/telemetry").WidgetTelemetryEvent) => void;
	/** URL for trademark badge click-through (default: https://vninvest.edusuccess.vn) */
	trademarkUrl?: string;
	/** Override ad activation date (ms since epoch). Default: 2027-01-01T00:00:00Z. */
	advActivationDate?: number;
	/** Khi true, Alt+click luôn chọn replay start bar (ngay cả sau Stop). Dùng cho multi-chart truyền từ state cha. */
	replaySelectionEnabled?: boolean;
	/** F-12: namespace cho ReplayEventBus khi nhiều instance multi-chart cùng mount. Cha (VNInvestMultiCharts) truyền workspaceId để cô lập event cross-instance. */
	replayInstanceId?: string;
}

interface VNInvestChartsContentProps extends VNInvestChartsProps {
	adapter: StockDataAdapter;
	onRuntimeDegraded?: (reason: "fork-no-render-output") => void;
}

export type { VNInvestChartsContentProps };
