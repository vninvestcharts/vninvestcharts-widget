/**
 * VNInvestCharts Public API
 *
 * Curated exports for external consumers.
 * Internal symbols are marked @deprecated and will be removed in v2.0.
 *
 * Import from:
 * - 'vninvestcharts-widget' (main entry)
 * - 'vninvestcharts-widget/adapters' (data adapters)
 * - 'vninvestcharts-widget/drawing' (drawing utilities - limited)
 * - 'vninvestcharts-widget/types' (shared types)
 */

// ============================================================================
// MAIN WIDGET - Primary entry point
// ============================================================================
export {
	VNInvestCharts,
	type VNInvestChartsProps,
} from './widget/VNInvestCharts';

export {
	VNInvestMultiCharts,
	type VNInvestMultiChartsProps,
	type VNInvestMultiChartsRef,
	type MultiChartConfig,
	type ChartLayout,
} from './widget/VNInvestMultiCharts';

export type { VNInvestChartsRef } from './widget/utils/widgetHelpers';

// ============================================================================
// DATA ADAPTERS - For data integration
// ============================================================================
export {
	BaseAdapter,
	UDFDataAdapter,
	MockAdapter,
	DjangoVnstockAdapter,
	createRestAdapter,
	createMockBars,
	type UDFDataAdapterConfig,
	type StockDataAdapter,
} from './lib/adapters';

// ============================================================================
// WATCHLIST - Watchlist adapter contract (Phase 4b, F1)
// ============================================================================
export type {
	WatchlistAdapter,
	WatchlistItem,
	WatchlistQuoteUpdate,
} from './widget/types/watchlist';

// ============================================================================
// CORE TYPES - Shared type definitions
// ============================================================================
export type {
	ChartTheme,
	PaneDescriptor,
	SeriesTypeId,
	SeriesConfig,
	VisibleRange,
	YAxisSide,
	TooltipMode,
	SeriesStyleOverride,
	IndicatorSet,
	IndicatorSetsStorage,
	IndicatorSetStorageLike,
	BarReplayState,
	ReplayBarLike,
	ReplaySpeed,
	ChartHandle,
	ChartSplitterProps,
	UsePaneSizesOptions,
	UsePaneSizesResult,
	UseChartThemeResult,
} from './lib/core';

export type {
	OHLCVBar,
	OHLCVBar as BarData,
} from './lib/types/ohlcv';
export type { Timeframe, Unsubscribe, SymbolInfo, Trade, OrderbookSnapshot, SourceSemanticsDescriptor } from './lib/types/adapter';

// ============================================================================
// WIDGET TYPES - Public widget interfaces
// ============================================================================
export type {
	WidgetCoordinateBridge,
	WidgetPaneRuntimeSnapshot,
	WidgetLocale,
	WidgetMessages,
	WidgetRuntimeCapabilities,
	RequestedWidgetRuntime,
	ResolvedWidgetRuntime,
	WidgetI18nContextValue,
	WidgetI18nProviderProps,
	PaperTradePanelProps,
	PaperTradePosition,
	PaperTradeJournalEntry,
	SettingsModalProps,
	WorkspaceSchema,
	WorkspaceSettings,
} from './widget';

// ============================================================================
// WIDGET COMPONENTS - Public widget sub-components
// ============================================================================
export {
	PaperTradePanel,
	SettingsModal,
	WidgetErrorBoundary,
	WidgetEmptyState,
	MeasurementOverlay,
	WorkspaceSerializer,
} from './widget';

// ============================================================================
// I18N - Internationalization
// ============================================================================
export {
	widgetMessagesEn,
	widgetMessagesVi,
	WidgetI18nContext,
	WidgetI18nProvider,
	useWidgetI18n,
} from './widget';

// ============================================================================
// RUNTIME POLICY - Runtime selection utilities
// ============================================================================
export {
	evaluateRuntimePolicy,
	resolveRequestedRuntime,
	shouldForceLegacyRuntime,
	type RequestedWidgetRuntime as RuntimePolicyRequested,
	type WidgetRuntimeReasonCode as WidgetRuntimeResolutionReason,
} from './widget/runtimePolicy';

// ============================================================================
// DRAWING - Limited public drawing utilities
// ============================================================================
export { type DrawingObject, isDrawingToolName, listDrawingTools, createLocalStorageAdapter, type DrawingStorageAdapter } from "@vninvestcharts/engine-drawing";
export type { DrawingDockTab, DrawingWorkspaceController, DrawingWorkspaceState, UseDrawingWorkspaceControllerOptions } from "@vninvestcharts/engine-react";

// ============================================================================
// DRAWING UI COMPONENTS - building your own dock
// ============================================================================
// These four components are real, tested, and already reachable from the IIFE
// entry. They were missing HERE - and this file is what produces dist/index.js
// (build-esm-cjs.js:130 and :174, entryPoints: ['src/public-api.ts']). So the README
// advertised three components that no ESM consumer could import: measured on a
// fresh build, dist/index.js exported 29 symbols and none of these.
// (`src/index.ts` also re-exported them, but it was never a build entry and `src/`
// is never published; it was removed on 2026-10-16.)
//
// They are re-exported, not deleted. An integrator embedding the widget into a
// product they ship themselves needs to compose these into their own chrome -
// that is the whole B2B case, and these were already built and paid for.
export {
	DrawingDock,
	DrawingInspector,
	DrawingListPanel,
	DrawingSemanticPointLegend,
	generateDrawingLabel,
	filterDrawings,
	reorderDrawings,
} from './widget';
export type {
	DrawingDockLabels,
	DrawingDockProps,
	DrawingInspectorLabels,
	DrawingInspectorProps,
	DrawingInspectorTextEditorLabels,
	DrawingInspectorTextEditorProps,
	DrawingListPanelLabels,
	DrawingListPanelProps,
	DrawingSemanticPointLegendLabels,
	DrawingSemanticPointLegendProps,
} from './widget';

// ============================================================================
// INDICATORS - Indicator registration (advanced)
// ============================================================================
export {
	getIndicator,
	registerIndicator,
} from './lib/indicators';

// ============================================================================
// PRO PLUGIN REGISTRY - host-supplied Pro extensions (Rule 15 IoC gate)
// ============================================================================
// SAD F-06 (reverified 2026-10-18): WIDGET_INTEGRATION_GUIDE.md:35 documents
// `import { registerProExtension } from "vninvestcharts-widget"`, but no barrel
// ever re-exported it - measured: 0 hits in this file, in src/widget/index.ts,
// in the package exports map and in a fresh dist (tree-shaken away). Same class
// of bug as the DrawingDock quartet above (documented, but ESM-unreachable).
// The registry is the sanctioned, license-gated (ECDSA, fail-closed) injection
// point mandated by AGENTS Rule 15 and carries no Pro math itself;
// resetProExtensionForTests stays internal.
export {
	registerProExtension,
	isProExtensionActive,
	type ProExtensionModule,
	type ProSeriesDefinition,
} from './widget/plugin/ProPluginRegistry';

// ============================================================================
// CSS INJECTION - Programmatic style injection for ESM consumers
// ============================================================================
export { injectVNInvestChartsCSS } from './widget/styles/injectStyles';

// ============================================================================
// VERSION
// ============================================================================
export const version = '0.4.0';