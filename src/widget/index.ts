export { VNInvestCharts } from "./VNInvestCharts";
export { VNInvestMultiCharts } from "./VNInvestMultiCharts";
export { default as MeasurementOverlay } from "./MeasurementOverlay";
export { WidgetErrorBoundary } from "./WidgetErrorBoundary";
export { WidgetEmptyState } from "./WidgetEmptyState";
export { WidgetI18nContext, WidgetI18nProvider, useWidgetI18n } from "./context/WidgetI18nContext";
export {
	VNInvestChartsProvider,
	useHoverEmitterRef,
	VNInvestChartsConfigContext,
	VNInvestChartsConfigProvider,
	VNInvestChartsStateContext,
	VNInvestChartsStateProvider,
	useVNInvestChartsState,
	createHoverEmitter,
	emitHover,
	clearHover,
	useHoverSubscription,
	useHoverState,
	type HoverEventPayload,
	type HoverEmitter,
} from "./context/VNInvestChartsContext";
export type { VNInvestChartsProviderProps } from "./context/VNInvestChartsContext";
export type { VNInvestChartsConfigContextValue } from "./context/VNInvestChartsConfigContext";
export type { VNInvestChartsStateContextValue, PaneState, DrawingInteraction, ActiveToolState } from "./context/VNInvestChartsStateContext";
export { resolveRequestedRuntime, shouldForceLegacyRuntime } from "./runtimePolicy";
export type { WidgetI18nContextValue, WidgetI18nProviderProps } from "./context/WidgetI18nContext";
export { widgetMessagesEn } from "./i18n/messages.en";
export { widgetMessagesVi } from "./i18n/messages.vi";
export type { WidgetLocale, WidgetMessages } from "./i18n/types";
export type { RequestedWidgetRuntime, ResolvedWidgetRuntime, WidgetRuntimeReasonCode } from "./runtimePolicy";
export type {
	VNInvestChartsProps,
} from "./VNInvestCharts";
export type {
	VNInvestMultiChartsProps,
	VNInvestMultiChartsRef,
	MultiChartConfig,
	ChartLayout,
} from "./VNInvestMultiCharts";

export type { VNInvestChartsRef } from "./utils/widgetHelpers";
export type {
	WidgetCoordinateBridge,
	WidgetPaneRuntimeSnapshot,
	WidgetPaneSplitterRenderContext,
	WidgetPaneToolbarActions,
	WidgetPaneToolbarRenderContext,
	WidgetRuntimeCapabilities,
	WidgetRuntimeResolutionReason,
} from "./utils/widgetHelpers";
export type { DrawingWorkspaceController } from "@vninvestcharts/engine-react";
export { createLocalStorageAdapter, createRESTStorageAdapter } from "@vninvestcharts/engine-drawing";
export type { StockDataAdapter, Timeframe } from "../lib/types/adapter";
export { toCacheKey, LocalCacheMatrixFactoryImpl } from "./history/cache";
export type {
	CacheCoverageIndex,
	CacheEvictPolicy,
	CacheEvictResult,
	CacheInvalidateReason,
	CacheKey,
	CacheKeyParts,
	CacheReadResult,
	CacheSemanticScope,
	CacheSegmentMeta,
	CacheWriteMeta,
	CacheWriteResult,
	LocalCacheMatrix,
	LocalCacheMatrixFactory,
	TimeRange,
} from "./history/cache";

export { default as DrawingDock } from "./components/drawing/DrawingDock";
export { default as DrawingInspector } from "./components/drawing/DrawingInspector";
export { default as DrawingListPanel, generateDrawingLabel, filterDrawings, reorderDrawings } from "./components/drawing/DrawingListPanel";
export { default as DrawingSemanticPointLegend } from "./components/drawing/DrawingSemanticPointLegend";

export type { DrawingDockLabels, DrawingDockProps } from "./components/drawing/DrawingDock";
export type { DrawingListPanelLabels, DrawingListPanelProps } from "./components/drawing/DrawingListPanel";
export type { DrawingSemanticPointLegendLabels, DrawingSemanticPointLegendProps } from "./components/drawing/DrawingSemanticPointLegend";
export type { DrawingInspectorLabels, DrawingInspectorProps, DrawingInspectorTextEditorLabels, DrawingInspectorTextEditorProps } from "./components/drawing/DrawingInspector";

export { PaperTradePanel } from "./components/trading/PaperTradePanel";
export type { PaperTradePanelProps, PaperTradePosition, PaperTradeJournalEntry } from "./components/trading/PaperTradePanel";
export { SettingsModal } from "./components/settings/SettingsModal";
export type { SettingsModalProps } from "./components/settings/SettingsModal";
export { SnapshotPreviewModal } from "./components/settings/SnapshotPreviewModal";
export type { SnapshotPreviewModalProps } from "./components/settings/SnapshotPreviewModal";

export { MultiSourceDataAdapter } from "./adapters/MultiSourceDataAdapter";
export type { MultiSourceDataAdapterConfig, SourceRoute } from "./adapters/MultiSourceDataAdapter";

export { BottomPanelHost } from "./components/BottomPanelHost";
export type { BottomPanelHostProps, BottomTab } from "./components/BottomPanelHost";

export { VNSymbolSearch, SymbolSearch } from "./components/search/VNSymbolSearch";
export type { VNSymbolSearchProps } from "./components/search/VNSymbolSearch";
export type { SymbolSearchItem } from "./types/symbolSearch";
export { WhalePanel } from "./components/overlays/WhalePanel";
export type { WhalePanelProps } from "./components/overlays/WhalePanel";

export { SaaSFeatureProvider, SaaSFeatureContext } from "./contexts/SaaSFeatureContext";
export { useFeatureGate } from "./hooks/useFeatureGate";
export { PremiumFeatureGate } from "./components/PremiumFeatureGate";
export type { SaaSFeatureFlags, TenantMetadata, SaaSFeatureContextValue } from "./types/saas";
export type { PremiumFeatureGateProps } from "./components/PremiumFeatureGate";

export { WorkspaceSerializer } from "./runtime/WorkspaceSerializer";
export type { WorkspaceSchema, WorkspaceSettings } from "./runtime/WorkspaceSerializer";

export { injectVNInvestChartsCSS } from "./styles/injectStyles";
