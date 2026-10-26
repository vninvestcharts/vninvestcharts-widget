import React, {
	forwardRef,
	useContext,
	useImperativeHandle,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ForwardedRef,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { SyncProvider, useSyncContext, defaultAdapters, createBroadcastChannelAdapter } from "@vninvestcharts/engine-react";
import { VNInvestChartsProvider, useHoverEmitterRef } from "./context/VNInvestChartsContext";
import { hasMinTier, hasCapability, planToTier, resolvePatTier, type PatTier } from "@vninvestcharts/engine-core";
import type {
	VisibleRangePayload,
	CrosshairPayload,
	SymbolLinkGroupId,
	DrawingType,
	ChartLayout,
	ChartWorkspaceState,
	Timeframe,
	DrawingWorkspaceTool } from "@vninvestcharts/engine-react";
import { GridLayout, LayoutPreset, SlotConfig } from "./grid/types";
import { ALL_PRESETS, findMatchingPreset } from "./grid/presets";
import { addCustomPreset, readCustomPresets, removeCustomPreset, type StorageLike } from "./grid/customPresets";
import { VNInvestCharts, type VNInvestChartsProps } from "./VNInvestCharts";
import { SaaSFeatureProvider, SaaSFeatureContext } from "./contexts/SaaSFeatureContext";
import { type CorporateEvent } from "./components/events/CorporateEventsOverlay";
import type { ThemeConfig } from "./theme/ThemeConfig";
import { applyTheme } from "./theme/applyTheme";
import { GridContainer } from "./components/layout/GridContainer";
import { applyHeaderTimeframe } from "./utils/headerSync";
import { emitReplayEvent } from "../lib/core/replay/ReplayEventBus";
import { useLayoutHistory } from "./hooks/useLayoutHistory";
import { WorkspaceToolbar, type WorkspaceInfo } from "./components/workspace/WorkspaceToolbar";

import { OHLCHeader } from "./components/header/OHLCHeader";
import { SnapshotPreviewModal } from "./components/settings/SnapshotPreviewModal";
import { VNSymbolSearch } from "./components/search/VNSymbolSearch";
import { SymbolSearchModal } from "./components/search/SymbolSearchModal";
import { SymbolCompareModal } from "./components/search/SymbolCompareModal";

import { DrawingToolbar } from "./components/toolbar/DrawingToolbar";
import { VNInvestChartsStateContext } from "./context/VNInvestChartsStateContext";
import { WorkspaceReplayTradingContext } from "./context/WorkspaceReplayTradingContext";
import { useWorkspaceReplayTrading } from "./hooks/useWorkspaceReplayTrading";
import { useWorkspacePaperVisibility, WorkspacePaperVisibilityProvider } from
	"./context/WorkspacePaperVisibilityContext";
import { useWidgetI18n } from "./context/WidgetI18nContext";
import { SystemMenu } from "./components/SystemMenu";
import { ActiveChartPaperPanel } from "./trading/panel/ActiveChartPaperPanel";

import { FALLBACK_ADAPTER, wrapAdapterForBackfill, type WidgetChartHandle } from "./utils/widgetHelpers";
import type { FullChartHandle } from "./types/fullChartHandle";
import { type ChartTheme, type SeriesConfig, useChartTheme } from "../lib/core";
import { LayoutDesigner } from "./components/LayoutDesigner";
import { MultiChartsFooter } from "./components/footer/MultiChartsFooter";

import { useGlobalShortcutHandler, useShortcuts, HeaderShortcuts } from "./hooks/ShortcutManager";
import { useViewportBreakpoint } from "./hooks/useViewportBreakpoint";
import { MobileToolbar } from "./components/mobile/MobileToolbar";
import layoutStyles from "./styles/multicharts-layout.module.css";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";
import { RequestCoordinatorProvider } from "./history/RequestCoordinator";
import { BackfillDedupProvider, SharedBarStoreProvider } from "./history/BackfillDedupContext";

import { useDrawingToolShortcuts } from "./hooks/useDrawingToolShortcuts";
import { useMultiChartReplaySync } from "./hooks/useMultiChartReplaySync";
import { useWorkspaceReplayOwnerLatch } from "./hooks/useWorkspaceReplayOwnerLatch";
import { useMultiWorkspacePersistence } from "./hooks/useMultiWorkspacePersistence";
import { useMultiChartPanelFocus } from "./hooks/useBottomPanelBehavior";
import { defaultBottomPanelHeightForTab, useBottomPanelHeight } from "./hooks/useBottomPanelHeight";
import { SyncContextShareProvider } from "./context/SyncContextShare";
import SaveChartAsImage from "../lib/helper/SaveChartAsImage";
import { MultiChartTopbar } from "./components/toolbar/MultiChartTopbar";
import { BottomPanelHost } from "./components/BottomPanelHost";
import { CapabilityProvider } from "./components/CapabilityGate";
import { FloatingReplayToolbar } from "./components/replay/FloatingReplayToolbar";
import { WorkspaceRightDockSlot } from "./components/dock/WorkspaceRightDockSlot";
import type { WatchlistAdapter } from "./types/watchlist";
import type { DockAdvisoryData, DockTapeData } from "./components/dock/RightSidebarDockHost";
// ============================================
// Types
// ============================================
// ARCH-03A: MultiChartConfig / VNInvestMultiChartsProps / VNInvestMultiChartsRef
// đã tách sang ./VNInvestMultiCharts.types (type-only) để giải phóng budget fat-file.
// Re-export tại đây để mọi import path cũ (`../VNInvestMultiCharts`) không đổi.
export type { MultiChartConfig, VNInvestMultiChartsProps, VNInvestMultiChartsRef } from "./VNInvestMultiCharts.types";
export {
	DEFAULT_LAYOUTS,
	resolveMaxChartsForTier,
	countLayoutCharts,
	clampChartLayoutToMax,
	chartLayoutToGridLayout,
	gridLayoutToChartLayout,
} from "./multiChartDefaults";

import type { MultiChartConfig, VNInvestMultiChartsProps, VNInvestMultiChartsRef } from "./VNInvestMultiCharts.types";
import {
	DEFAULT_LAYOUTS,
	resolveMaxChartsForTier,
	countLayoutCharts,
	clampChartLayoutToMax,
	chartLayoutToGridLayout,
	gridLayoutToChartLayout,
} from "./multiChartDefaults";

// ============================================
// SyncContextConsumer - Uses useSyncContext inside SyncProvider
// ============================================

interface SyncContextConsumerProps {
  chartHandles: React.MutableRefObject<Map<string, WidgetChartHandle>>;
  syncContextRef: React.MutableRefObject<ReturnType<typeof useSyncContext> | null>;
  onRegisterCharts: () => void;
  onActiveChartChange: (chartId: string | null) => void;
  children: React.ReactNode;
}

const SyncContextConsumer: React.FC<SyncContextConsumerProps> = ({
	chartHandles,
	syncContextRef,
	onRegisterCharts,
	onActiveChartChange,
	children,
}) => {
	const syncContext = useSyncContext();

	// Store syncContext in ref for access by parent callbacks
	useEffect(() => {
		syncContextRef.current = syncContext;
	}, [syncContext, syncContextRef]);

	// Subscribe to active chart changes from SyncContext
	useEffect(() => {
		const unsubscribe = syncContext.onActiveChartChange(onActiveChartChange);
		return unsubscribe;
	}, [syncContext, onActiveChartChange]);

	// Call onRegisterCharts to notify parent that syncContext is ready
	useEffect(() => {
		onRegisterCharts();
	}, [onRegisterCharts]);

	// Provide syncContext to children via context
	return (
		<SyncContextShareProvider syncContext={syncContext}>
			{children}
		</SyncContextShareProvider>
	);
};

type VNInvestMultiChartsInnerProps = VNInvestMultiChartsProps & {
	forwardedRef: ForwardedRef<VNInvestMultiChartsRef>;
	hostTenantPlan?: string;
};

const VNInvestMultiChartsInner = (props: VNInvestMultiChartsInnerProps) => {
	const forwardedRef = props.forwardedRef;
	const {
		layout: initialLayout = DEFAULT_LAYOUTS["2x2"],
		charts: initialCharts = [],
		defaultLayout = DEFAULT_LAYOUTS["2x2"],
		syncVisibleRange = true,
		syncCrosshair = true,
		syncDrawings = true,
		syncSymbolLinks = true,
		syncTimeframe = true,
		syncChartType = true,
		syncReplay = false,
		syncTime = true,
		showWorkspaceToolbar = false,
		showDrawingToolbar = true, // Default to true so toolbar is visible by default
		showBottomPanel = true,
		showPaperTradePanel = true,
		showTapePanel = false,
		workspaceId,
		onWorkspaceSave,
		onWorkspaceLoad,
		resizeAdapter,
		keyboardAdapter,
		clockAdapter,
		storageAdapter,
		portalAdapter,
		registryAdapter,
		broadcastChannelAdapter,
		className = "",
		style,
		children,
		defaultChartProps = {},
		onLayoutChange,
		onChartAdd,
		onChartRemove,
		onActiveChartChange,
		onSyncChange,
		renderBottomPanel,
		renderRightPanel,
		showSymbolBadges = true,
		quickTimeframes = ["1m", "5m", "15m", "1h", "1D"],
		syncOverrideMap: propSyncOverrideMap,
		onSyncOverrideChange,
		showCorporateEvents,
		corporateEvents,
		showRightDock,
		watchlistAdapter,
		dockTierGate,
		maxCharts: maxChartsProp,
		upgradeUrl,
		tape,
		advisory,
	} = props;
	// Pre-P2: portal SSOT — accept both canon and legacy prop names (IIFE)
	const portalRoot = (props as any).portalRoot ?? (props as any).__portalRoot ?? (props as any).__vnscPortalRoot ?? null;
	const shadowRoot = (props as any).shadowRoot ?? (props as any).__vnscShadowRoot ?? null;
	const crossTabSync = (props as any).crossTabSync ?? (workspaceId ? true : false);

	const [sizingMode, setSizingMode] = useState<"fixed" | "percent">(props.sizingMode ?? "fixed");
	const [riskPercent, setRiskPercent] = useState(props.riskPercent ?? 1);
	const [initialEquity, setInitialEquity] = useState(props.initialEquity ?? 10000);

	const onSizingChange = useCallback((cfg: { mode: "fixed" | "percent"; riskPercent: number; initialEquity: number }) => {
		setSizingMode(cfg.mode);
		setRiskPercent(cfg.riskPercent);
		setInitialEquity(cfg.initialEquity);
		props.onSizingChange?.(cfg);
	}, []);

	const [syncOverrideMap, setSyncOverrideMap] = useState<Record<string, Record<string, boolean>>>(propSyncOverrideMap || {});
	useEffect(() => {
		if (propSyncOverrideMap) setSyncOverrideMap(propSyncOverrideMap);
	}, [propSyncOverrideMap]);

	const handleToggleSyncOverride = useCallback((chartId: string, type: string) => {
		setSyncOverrideMap(prev => {
			const chartOverrides = prev[chartId] || {};
			const updated = {
				...prev,
				[chartId]: {
					...chartOverrides,
					[type]: chartOverrides[type] === false ? true : false,
				}
			};
			onSyncOverrideChange?.(updated);
			return updated;
		});
	}, [onSyncOverrideChange]);

	// --- PAT tier for workspace-level DrawingToolbar ---
	const saasCtx = useContext(SaaSFeatureContext);
	// LIC-FIX: workspace tier theo plan ĐÃ VERIFY (server hoặc license ký số),
	// không tin prefix tự xưng (trước đây gõ `vni_enterprise_xxx` là hiện badge Pro
	// + mở 6 chart). Không có provider ngoài → giữ legacy prefix (tests/embed cũ).
	// Đang loading (metadata null) → free, tự nâng khi validate xong.
	const patTier: PatTier | undefined = !saasCtx
		? resolvePatTier("")
		: saasCtx.tenantMetadata
			? planToTier(saasCtx.tenantMetadata.plan)
			: props.hostTenantPlan
				? planToTier(props.hostTenantPlan)
				: "free";
	// S5a: trần chart (host ép thắng tier). kẹp layout/charts khởi tạo, chặn preset/addChart vượt trần.
	const tierMaxCharts = maxChartsProp ?? resolveMaxChartsForTier(patTier);

	const themeState = useChartTheme((defaultChartProps.theme as ChartTheme) ?? "classic-dark");
	const { t } = useWidgetI18n();
	const currentTheme: ChartTheme = themeState.theme as ChartTheme;
	const isDark = currentTheme !== "modern-light" && currentTheme !== "neutral-pro";
	const rawAdapter = defaultChartProps.adapter ?? FALLBACK_ADAPTER;
	const stableWrappedAdapter = useMemo(() => wrapAdapterForBackfill(rawAdapter), [rawAdapter]);
	// Pre-P2 F04: instance-scoped session id — isolate khi crossTabSync=false, shared khi true.
	const instanceSessionId = useRef<string | null>(null);
	if (instanceSessionId.current === null) instanceSessionId.current = typeof crypto !== "undefined" && (crypto as any).randomUUID ? (crypto as any).randomUUID() : `i-${Math.random().toString(36).slice(2, 9)}`;
	const replayInstanceId = useMemo(() => {
		if (crossTabSync) return workspaceId ?? "mc-1";
		// Isolate per-instance when crossTabSync disabled
		return workspaceId ? `${workspaceId}__${instanceSessionId.current}` : `mc-${instanceSessionId.current}`;
	}, [workspaceId, crossTabSync]);

	const mergedChartProps = useMemo<Partial<VNInvestChartsProps>>(() => ({
		...defaultChartProps,
		adapter: stableWrappedAdapter,
		theme: currentTheme,
		// F-07: preset trong modal của chart active phải áp workspace-wide (theme prop ở
		// trên pin children) — route qua themeState của multi thay vì instance cục bộ.
		onThemePresetChange: themeState.setTheme,
		adsEnabled: false,
		showHeader: false,
		showFooter: false,
		sizingMode,
		riskPercent,
		initialEquity,
		onSizingChange,
		replayInstanceId: replayInstanceId,
		// Portal SSOT forwarding
		portalRoot: portalRoot as any,
		shadowRoot: shadowRoot as any,
		// AUTH-02: workspace-level auth/entitlement wins over per-chart defaults
		// so every cell in the grid resolves the SAME tier (AC-AUTH-02-1).
		tenantPat: props.tenantPat ?? defaultChartProps?.tenantPat,
		// CS-3: workspace-level license, same precedence shape as tenantPat.
		licenseKey: props.licenseKey ?? defaultChartProps?.licenseKey,
		upgradeUrl: props.upgradeUrl ?? defaultChartProps?.upgradeUrl,
		// CS-6: workspace-level diagnostic observer, same shape.
		onLicenseDiagnostic: props.onLicenseDiagnostic ?? defaultChartProps?.onLicenseDiagnostic,
		client: props.client ?? defaultChartProps?.client,
		authHandler: props.authHandler ?? defaultChartProps?.authHandler,
		onTelemetry: props.onTelemetry ?? defaultChartProps?.onTelemetry,
		onError: props.onError ?? defaultChartProps?.onError,
	}), [defaultChartProps, stableWrappedAdapter, currentTheme, themeState.setTheme, sizingMode, riskPercent, initialEquity, onSizingChange, replayInstanceId, portalRoot, shadowRoot, props.tenantPat, props.licenseKey, props.upgradeUrl, props.onLicenseDiagnostic, props.client, props.authHandler, props.onTelemetry, props.onError]);

	// Create default adapters if not provided — memoized to prevent infinite re-render loops
	const resolvedClockAdapter = useMemo(() => clockAdapter ?? defaultAdapters.clockAdapter, [clockAdapter]);
	const resolvedBroadcastChannelAdapter = useMemo(() => {
		if (broadcastChannelAdapter) return broadcastChannelAdapter;
		// Isolate: per-instance channel (no cross-talk) khi crossTabSync=false
		const channelId = crossTabSync ? (workspaceId ?? 'default') : (workspaceId ? `${workspaceId}__${instanceSessionId.current}` : `isolated-${instanceSessionId.current}`);
		return createBroadcastChannelAdapter(channelId, resolvedClockAdapter);
	}, [broadcastChannelAdapter, workspaceId, resolvedClockAdapter, crossTabSync]);

	// --- Workspace-level replay-trading singleton (H3 = workspace-level, chốt 2026-07-17) ---
	// 1 session chung cho toàn bộ workspace; chỉ chart ACTIVE feed bars (qua feedBar).
	const workspaceReplayTrading = useWorkspaceReplayTrading({ slippageBps: 0 });

	// --- State ---

	// --- State ---
	const [layout, setLayoutState] = useState<ChartLayout>(() => clampChartLayoutToMax(initialLayout, tierMaxCharts));
	const [charts, setChartsState] = useState<MultiChartConfig[]>(() => initialCharts.slice(0, tierMaxCharts));
	// Task M4: visibility paper per-chart (tab Settings + nút Mắt đọc/ghi qua context này).
	const visibilityCharts = useMemo(() => charts.map((c) => ({ id: c.id, symbol: c.symbol })), [charts]);
	const paperVisibility = useWorkspacePaperVisibility({ workspaceId, charts: visibilityCharts });
	const [activeChartId, setActiveChartId] = useState<string | null>(() => charts[0]?.id ?? null);
	// S5a: cổng duy nhất đổi layout — chặn preset/designer vượt trần chart.
	// 2026-09-24: KHÔNG tự mở tab upgrade nữa — hiện banner tại chỗ + callback
	// host (user decision). Nút Upgrade trong banner mới mở URL (click chủ động).
	const [tierGateNotice, setTierGateNotice] = useState<{ required: number; max: number } | null>(null);
	const notifyTierGate = useCallback((required: number) => {
		props.onTierLimitExceeded?.({ required, max: tierMaxCharts, tier: patTier });
		setTierGateNotice({ required, max: tierMaxCharts });
	}, [props.onTierLimitExceeded, tierMaxCharts, patTier]);
	const requestChartLayout = useCallback((next: ChartLayout): boolean => {
		if (countLayoutCharts(next) > tierMaxCharts) {
			notifyTierGate(countLayoutCharts(next));
			return false;
		}
		setTierGateNotice(null);
		setLayoutState(next);
		return true;
	}, [tierMaxCharts, notifyTierGate]);
	const [activeComparisonOverlays, setActiveComparisonOverlays] = useState<any[]>([]);
	const [activeBottomTab, setActiveBottomTab] = useState<"strategy_tester" | "pine_editor" | "paper_trade" | null>(null);
	// UI-D2: focus-first — auto-maximize active chart for Pine/Strategy tabs.
	const panelFocus = useMultiChartPanelFocus({ activeTab: activeBottomTab, activeChartId });
	// Chiều cao theo tab khi chưa kéo tay (paper 240 / strategy 340 / pine 320);
	// đã kéo thì giữ manual (persist) — xem useBottomPanelHeight.
	const bottomPanelHeight = useBottomPanelHeight(defaultBottomPanelHeightForTab(activeBottomTab));

	// P1-S3: paper panel bám active chart qua registry (Q1a); replay giữ singleton (D4).
	const renderPaperTradePanel = useCallback(() => {
		return (
			<ActiveChartPaperPanel
				chartId={activeChartId}
				replay={workspaceReplayTrading.isReplayActive ? workspaceReplayTrading : undefined}
				onClose={() => setActiveBottomTab(null)}
			/>
		);
	}, [activeChartId, workspaceReplayTrading]);
	// UX-04: derive the responsive mode from the workspace root, not the page,
	// so an embedded/narrow container picks the compact layout.
	const workspaceLayoutRef = useRef<HTMLDivElement>(null);
	const viewportMode = useViewportBreakpoint(workspaceLayoutRef);
	const [isMobileToolbarOpen, setIsMobileToolbarOpen] = useState(false);

	const handleThemeToggle = useCallback(() => {
		themeState.toggleTheme();
	}, [themeState]);

	// UX-04: single source for the upgrade/CTA target. It was a duplicated
	// literal before (the desktop rail hardcoded localhost while the header used
	// the `upgradeUrl` prop), so reverting the local-backend swap meant hunting
	// down every copy.
	const handlePremiumToolClick = useCallback(() => {
		if (upgradeUrl) window.open(upgradeUrl, "_blank", "noopener,noreferrer");
	}, [upgradeUrl]);

	useEffect(() => {
		if (activeChartId) {
			const handle = chartHandles.current.get(activeChartId);
			const overlays = handle?.getCompareOverlayEntries?.() ?? [];
			setActiveComparisonOverlays(overlays);
		} else {
			setActiveComparisonOverlays([]);
		}
	}, [activeChartId]);

	const activeTarget: "workspace" | "chart" = activeChartId ? "chart" : "workspace";
	const [syncSettings, setSyncSettings] = useState({
		visibleRange: syncVisibleRange,
		crosshair: syncCrosshair,
		drawings: syncDrawings,
		symbolLinks: syncSymbolLinks,
		timeframe: syncTimeframe,
		chartType: syncChartType,
		replay: syncReplay,
		time: syncTime,
	});

	// Sync internal state when individual prop changes (single effect — the
	// previous duplicate ran the same sync twice per prop change).
	useEffect(() => {
		setSyncSettings({
			visibleRange: syncVisibleRange,
			crosshair: syncCrosshair,
			drawings: syncDrawings,
			symbolLinks: syncSymbolLinks,
			timeframe: syncTimeframe,
			chartType: syncChartType,
			replay: syncReplay,
			time: syncTime,
		});
	}, [syncVisibleRange, syncCrosshair, syncDrawings, syncSymbolLinks, syncTimeframe, syncChartType, syncReplay, syncTime]);

	// Drawing states for toolbar & SystemMenu
	const [activeTool, setActiveTool] = useState<string>("cursor");
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);

	// OHLCHeader & Sidebar states
	const [searchOpen, setSearchOpen] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [magnetSensitivity, setMagnetSensitivity] = useState(0);
	const [compareDialogOpen, setCompareDialogOpen] = useState(false);
	const [showReplayBar, setShowReplayBar] = useState(false);
	const [replayMode, setReplayMode] = useState<"single" | "all">("all"); // R1-a: replay follow scope (slaves follow iff "all").

	// Snapshot preview state
	const [previewImageDataUrl, setPreviewImageDataUrl] = useState<string | null>(null);

	useEffect(() => {
  		if (initialCharts && initialCharts.length > 0) setChartsState(initialCharts.slice(0, tierMaxCharts));
		if (initialLayout) setLayoutState(clampChartLayoutToMax(initialLayout, tierMaxCharts));
  	}, [initialCharts, initialLayout, tierMaxCharts]);

	// Workspace state
	const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
	// P0: một chỗ duy nhất để upsert index, dùng cho cả SystemMenu lẫn WorkspaceToolbar —
	// trước đó mỗi nơi tự viết nên dễ lệch.
	const upsertWorkspaceIndex = useCallback((id: string, name: string) => {
		setWorkspaces(prev =>
			prev.some(w => w.id === id)
				? prev.map(w => (w.id === id ? { ...w, name, updatedAt: Date.now() } : w))
				: [...prev, { id, name, updatedAt: Date.now() }],
		);
	}, []);
	const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(workspaceId ?? null);
	const [currentWorkspaceName, setCurrentWorkspaceName] = useState<string>("Untitled Workspace");
	const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
	const [lastAutoSave, setLastAutoSave] = useState<number>(0);

	// --- Refs ---
	const chartRefs: React.MutableRefObject<Map<string, React.RefObject<FullChartHandle | null>>> = useRef<Map<string, React.RefObject<FullChartHandle | null>>>(new Map());
	const chartHandles = useRef<Map<string, FullChartHandle>>(new Map());
	const syncContextRef = useRef<ReturnType<typeof useSyncContext> | null>(null);

	// Multi-chart replay sync (Task 2.1 + 2.2): replaces polling with event-driven master/slave
	const { masterChartId, heartbeat: _replayHb } = useMultiChartReplaySync({
		chartHandles: chartHandles.current,
		charts,
		instanceId: replayInstanceId,
		enabled: syncSettings.replay,
		mode: replayMode,
		// F-11: master đổi → reset shared paper-trade session (positions per-master).
		onMasterChange: workspaceReplayTrading.resetForNewMaster,
	});

	// Derived header replay state from active chart handle (heartbeat-driven re-render)
	void _replayHb;
	const activeReplayState = activeChartId ? chartHandles.current.get(activeChartId)?.getReplayState?.() : undefined;
	const headerReplayPlaying = activeReplayState?.playing ?? false;
	const headerReplaySpeed = activeReplayState?.speed ?? 1;
	const headerReplayCurrentBar = activeReplayState?.currentBar ?? 0;
	const headerReplayTotalBars = activeReplayState?.totalBars ?? 0;
	const headerReplayTotalPnl = activeChartId ? chartHandles.current.get(activeChartId)?.getReplayTotalPnl?.() : undefined;
	const headerReplayAnalytics = activeChartId ? chartHandles.current.get(activeChartId)?.getReplayAnalytics?.() : undefined;
	const headerReplayAwaitingStartBar = activeChartId ? chartHandles.current.get(activeChartId)?.getReplayAwaitingStartBar?.() : false;

	// Initialize global keyboard shortcut handler
	useGlobalShortcutHandler();

	// --- SyncContext Integration ---
	// SyncContext will be accessed via SyncContextConsumer child component
	// which renders inside SyncProvider

	// --- Chart Management ---
	const addChart = useCallback((config: MultiChartConfig, targetRow?: number, targetCol?: number) => {
		// S5a: chặn thêm chart vượt trần tier (banner tại chỗ + callback, không tự mở tab).
		if (charts.length >= tierMaxCharts) {
			notifyTierGate(charts.length + 1);
			return;
		}
		setChartsState((prev) => {
			if (prev.some((c) => c.id === config.id)) return prev;
			const newCharts = [...prev, config];
			onChartAdd?.(config.id);
			// Add a slot to layout so the chart renders in the grid
			setLayoutState((prevLayout) => {
				const gl = chartLayoutToGridLayout(prevLayout, newCharts);
				// Find first empty cell when no target specified
				let resolvedRow: number = targetRow ?? 0;
				let resolvedCol: number = targetCol ?? 0;
				if (targetRow === undefined || targetCol === undefined) {
					let found = false;
					for (let r = 0; r < gl.rows && !found; r++) {
						for (let c = 0; c < gl.cols && !found; c++) {
							const occupied = gl.slots.some(s => s.rowStart <= r + 1 && s.rowEnd >= r + 1 && s.colStart <= c + 1 && s.colEnd >= c + 1);
							if (!occupied) { resolvedRow = r; resolvedCol = c; found = true; }
						}
					}
					if (!found) { resolvedRow = gl.rows; resolvedCol = 0; }
				}
				const areaName = `chart-${resolvedRow * gl.cols + resolvedCol + 1}`;
				const newSlot: SlotConfig = {
					id: config.id, rowStart: resolvedRow + 1, rowEnd: resolvedRow + 1,
					colStart: resolvedCol + 1, colEnd: resolvedCol + 1,
					symbol: config.symbol, timeframe: config.timeframe, areaName,
				};
				const newSlots = [...gl.slots, newSlot];
				const newTemplateAreas = Array(gl.rows).fill(null).map((_: any, r: number) =>
					Array(gl.cols).fill(null).map((_: any, c: number) => {
						const match = newSlots.find(s => s.rowStart <= r + 1 && s.rowEnd >= r + 1 && s.colStart <= c + 1 && s.colEnd >= c + 1);
						return match?.areaName ?? '.';
					}).join(' ')
				);
				const result = gridLayoutToChartLayout({ ...gl, slots: newSlots, templateAreas: newTemplateAreas });
				onLayoutChange?.(result);
				return result;
			});
			return newCharts;
		});
	}, [onChartAdd, onLayoutChange, charts.length, tierMaxCharts, notifyTierGate]);

	const removeChart = useCallback((chartId: string) => {
		setChartsState((prev) => {
			const newCharts = prev.filter((c) => c.id !== chartId);
			onChartRemove?.(chartId);
			if (activeChartId === chartId) {
				setActiveChartId(newCharts[0]?.id ?? null);
			}
			return newCharts;
		});
		chartHandles.current.delete(chartId);
		chartRefs.current.delete(chartId);
		paperVisibility.clearChart(chartId);
	}, [activeChartId, onChartRemove, paperVisibility]);
	const getChartHandle = useCallback((chartId: string): WidgetChartHandle | undefined => chartHandles.current.get(chartId), []);
	const getAllChartHandles = useCallback((): WidgetChartHandle[] => Array.from(chartHandles.current.values()), []);
	// --- Layout Management ---
	const layoutHistory = useLayoutHistory(initialLayout);
	const setLayout = useCallback((newLayout: ChartLayout) => { if (!requestChartLayout(newLayout)) return; layoutHistory.pushLayout(newLayout); onLayoutChange?.(newLayout); }, [onLayoutChange, layoutHistory, requestChartLayout]);
	useEffect(() => {
		const h = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { const p = layoutHistory.undo(); if (p) { setLayoutState(p); onLayoutChange?.(p); } } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { const n = layoutHistory.redo(); if (n) { setLayoutState(n); onLayoutChange?.(n); } }
		};
		window.addEventListener('keydown', h);
		return () => window.removeEventListener('keydown', h);
	}, [layoutHistory, onLayoutChange]);
	const getLayout = useCallback((): ChartLayout => layout, [layout]);
	// --- Workspace Persistence ---
	// Workspace persistence lives in useMultiWorkspacePersistence (D0 split).
	const { saveWorkspace, loadWorkspace, listWorkspaces } = useMultiWorkspacePersistence({
		layout,
		charts,
		currentWorkspaceId,
		currentWorkspaceName,
		activeChartId,
		storageAdapter,
		onWorkspaceSave,
		onWorkspaceLoad,
		chartHandles,
		setLayoutState,
		setChartsState,
		setCurrentWorkspaceId,
		setCurrentWorkspaceName,
		setActiveChartId,
	});

	// Hydrate danh sách workspace từ store khi mount.
	//
	// Trước đây `workspaces` là `useState([])` và **không bao giờ** được nạp lại ⇒ sau khi
	// reload, hộp Load liệt kê rỗng trong khi storage còn tới 50 entry
	// (`WorkspaceManager.ts:105`). Người dùng tưởng mất dữ liệu. Đây là lỗ do CHÍNH tôi
	// gây ra khi thêm `upsertWorkspaceIndex` mà không nạp lại phần đã lưu.
	useEffect(() => {
		let cancelled = false;
		void listWorkspaces().then(list => {
			if (cancelled || list.length === 0) return;
			setWorkspaces(prev => {
				// Giữ phần state đã có (mới hơn) và bổ sung phần chỉ có trong storage.
				const byId = new Map(prev.map(w => [w.id, w]));
				for (const entry of list) if (!byId.has(entry.id)) byId.set(entry.id, { ...entry });
				return [...byId.values()];
			});
		});
		return () => {
			cancelled = true;
		};
	}, [listWorkspaces]);

	// --- Sync Control ---
	const setSyncVisibleRange = useCallback((visibleRange: boolean) => setSyncSettings(p => ({ ...p, visibleRange })), []);
	const setSyncCrosshair = useCallback((crosshair: boolean) => setSyncSettings(p => ({ ...p, crosshair })), []);
	const setSyncDrawings = useCallback((drawings: boolean) => setSyncSettings(p => ({ ...p, drawings })), []);
	const setSyncSymbolLinks = useCallback((symbolLinks: boolean) => setSyncSettings(p => ({ ...p, symbolLinks })), []);
	const setSyncTimeframe = useCallback((timeframe: boolean) => setSyncSettings(p => ({ ...p, timeframe })), []);
	const setSyncChartType = useCallback((chartType: boolean) => setSyncSettings(p => ({ ...p, chartType })), []);

	// --- Active Chart ---
	const setActiveChart = useCallback((chartId: string | null) => { setActiveChartId(chartId); onActiveChartChange?.(chartId); }, [onActiveChartChange]);

	const getActiveChart = useCallback((): string | null => activeChartId, [activeChartId]);

	// --- System Menu State ---
	const [showSystemMenu, setShowSystemMenu] = useState(false);
	const [showLayoutDesigner, setShowLayoutDesigner] = useState(false);
	// P0: preset do người dùng định nghĩa thực sự được lưu. Trước đây `onSaveAsPreset` là
	// no-op nên dữ liệu bị nuốt trong im lặng (Rule 15). Gate theo `layout_user` (pro):
	// trước P0 capability này có **0** enforcement site — nối mà không gate thì free sẽ
	// nhận tính năng Pro, đúng loại lỗi mà khảo sát Track A vừa chỉ ra.
	const canSaveCustomPreset = hasCapability(patTier, "layout_user");
	const presetStorage = useMemo<StorageLike | null>(
		() => storageAdapter ?? defaultAdapters.storageAdapter ?? null,
		[storageAdapter],
	);
	const [customPresets, setCustomPresets] = useState<LayoutPreset[]>(() =>
		readCustomPresets(presetStorage),
	);
	const handleSaveAsPreset = useCallback(
		(preset: LayoutPreset) => {
			if (!addCustomPreset(presetStorage, preset)) {
				// KHÔNG được báo thành công khi chưa lưu — đó chính là lỗi P0 sửa. `false` khiến
				// modal báo lỗi và **giữ nguyên** tên người dùng đã gõ.
				return false;
			}
			setCustomPresets(readCustomPresets(presetStorage));
			return true;
		},
		[presetStorage],
	);

	// P0: đọc lại preset đã lưu — trước đây lưu được nhưng không render ở đâu cả, nên dữ liệu
	// "biến mất" sau khi modal đóng. Khép kín vòng đời: lưu → thấy → áp dụng → xoá.
	const handleApplyPreset = useCallback(
		(preset: LayoutPreset) => {
			setLayoutState(gridLayoutToChartLayout(preset.layout));
		},
		[],
	);
	const handleDeletePreset = useCallback(
		(preset: LayoutPreset) => {
			if (removeCustomPreset(presetStorage, preset.id)) {
				setCustomPresets(readCustomPresets(presetStorage));
			}
		},
		[presetStorage],
	);
	const systemMenuRef = useRef<HTMLDivElement>(null);

	// --- Drawing Toolbar State (NEW) ---
	const [toolbarLocked, setToolbarLocked] = useState(() => typeof localStorage !== "undefined" && localStorage.getItem("vnsc_toolbar_docked") === "true");
	const handleToggleToolbarLock = useCallback(() => setToolbarLocked(p => { const n = !p; try { localStorage.setItem("vnsc_toolbar_docked", String(n)); } catch {} return n; }), []);

	// --- Bottom Panel Reactive State (MC-2) ---
	const [activePlotData, setActivePlotData] = useState<any[]>([]);
	const [activeIndicators, setActiveIndicators] = useState<any[]>([]);
	const activeChartHandle = activeChartId ? chartHandles.current.get(activeChartId) ?? null : null;

	// Subscribe to active chart handle data/indicator changes
	useEffect(() => {
		// W1-fix: guarded proxy trong GridContainer thiếu data APIs
		// (getPlotData/onDataChange — chỉ có sync/replay/compare/freeze) →
		// đọc FullChartHandle thô qua chartRefs (precedent: handleAddIndicator,
		// handleToolSelect). Fallback guarded giữ getters symbol/timeframe.
		const refHandle = activeChartId ? chartRefs.current.get(activeChartId)?.current ?? undefined : undefined;
		const handle = refHandle ?? (activeChartId ? chartHandles.current.get(activeChartId) : undefined);
		// W1-loop-guard: chart notify khi plotData đổi identity (single:1939-1941),
		// mà identity có thể churn theo mỗi parent render (object mới, nội dung igual).
		// So sánh theo GIÁ TRỊ (length + tail OHLCV/time) để notify lặp không
		// kéo re-render vô hạn. Indicators list nhỏ → JSON compare.
		const samePlotContent = (prev: any[], next: any[]) => {
			if (prev.length !== next.length) return false;
			if (prev.length === 0) return true;
			const a = prev[prev.length - 1];
			const b = next[next.length - 1];
			const t = (d: any) => (d?.date instanceof Date ? d.date.getTime() : String(d?.date ?? ""));
			return a?.open === b?.open && a?.high === b?.high && a?.low === b?.low && a?.close === b?.close && t(a) === t(b);
		};
		const sameIndicators = (prev: any[], next: any[]) => {
			if (prev.length !== next.length) return false;
			try {
				return JSON.stringify(prev) === JSON.stringify(next);
			} catch {
				return false;
			}
		};
		if (!handle) {
			setActivePlotData([]);
			setActiveIndicators([]);
			setActiveBottomTab(null);
			return;
		}

		// Sync immediate — prevent UI flicker from stale data
		setActivePlotData(handle.getPlotData?.() ?? []);
		setActiveIndicators(handle.getActiveIndicators?.() ?? []);

		// Subscribe for reactive updates (guarded theo giá trị — xem ở trên).
		const unsubData = handle.onDataChange?.((data: any[]) => setActivePlotData((prev) => (samePlotContent(prev, data) ? prev : data)));
		const unsubIndicators = handle.onIndicatorsChange?.((indicators: any[]) => setActiveIndicators((prev) => (sameIndicators(prev, indicators) ? prev : indicators)));
		return () => {
			unsubData?.();
			unsubIndicators?.();
		};
	}, [activeChartId]);

	const handleAddIndicator = useCallback((config: SeriesConfig) => {
		if (!activeChartId) return;
		const ref = chartRefs.current.get(activeChartId)?.current;
		if (ref && typeof ref.addIndicator === "function") {
			ref.addIndicator(config);
		}
	}, [activeChartId]);

	// Hover emitter refs for each chart (for OHLC hover tooltip)
	// Use a plain object with a differently named property to completely break type inference
	const ohlcHoverEmitterRefs = useRef<{
		emitterMap: Map<string, React.RefObject<any>>
	}>({
		emitterMap: new Map<string, React.RefObject<any>>()
	});

	// Initialize hover emitter refs for each chart
	useEffect(() => {
		charts.forEach(chart => {
			if (!ohlcHoverEmitterRefs.current.emitterMap.has(chart.id)) {
				ohlcHoverEmitterRefs.current.emitterMap.set(chart.id, { current: null });
			}
		});
		// Clean up refs for removed charts
		const currentChartIds = new Set(charts.map(c => c.id));
		ohlcHoverEmitterRefs.current.emitterMap.forEach((_, chartId) => {
			if (!currentChartIds.has(chartId)) {
				ohlcHoverEmitterRefs.current.emitterMap.delete(chartId);
			}
		});
	}, [charts]);

	// Close system menu on outside click
	useEffect(() => {
		const handler = (e: MouseEvent) => systemMenuRef.current?.contains(e.target as Node) || setShowSystemMenu(false);
		document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler);
	}, []);

	// Get active chart config for header
	const activeChartConfig = charts.find(c => c.id === activeChartId);
	const activeChartSymbol = activeChartConfig?.symbol ?? (activeTarget === "workspace" ? "Workspace" : "—");
	const activeChartTimeframe = activeChartConfig?.timeframe ?? "";
	const activeChartType = activeChartConfig?.engineState?.chartType as string ?? "candlestick";

	// Sync active chart drawing workspace state to local state
	const updateActiveMagnetSensitivity = useCallback(() => {
		const activeRef = activeChartId ? chartRefs.current.get(activeChartId)?.current : null;
		if (typeof activeRef?.getMagnetSensitivity === "function") setMagnetSensitivity(activeRef.getMagnetSensitivity());
	}, [activeChartId]);

	useEffect(() => {
		if (activeChartId) {
			const activeChartRef = chartRefs.current.get(activeChartId)?.current;
			const workspace = activeChartRef?.getDrawingWorkspace?.() ?? null;
			setActiveTool(workspace?.state?.activeTool ?? "cursor");
			setCanUndo(workspace?.interaction?.canUndo ?? false);
			setCanRedo(workspace?.interaction?.canRedo ?? false);
			updateActiveMagnetSensitivity();
		} else {
			setActiveTool("cursor");
			setCanUndo(false);
			setCanRedo(false);
		}
	}, [activeChartId, updateActiveMagnetSensitivity]);

	// W2: revision bump mỗi khi workspace chart active notify (cell phát mỗi khi
	// workspace.state đổi identity) → objects bridge đọc lại drawings mới.
	const [drawingWorkspaceRevision, setDrawingWorkspaceRevision] = useState(0);
	const handleDrawingWorkspaceChange = useCallback((chartId: string, workspace: any) => {
		if (chartId === activeChartId) {
			setActiveTool(workspace?.state?.activeTool ?? "cursor");
			setCanUndo(workspace?.interaction?.canUndo ?? false);
			setCanRedo(workspace?.interaction?.canRedo ?? false);
			updateActiveMagnetSensitivity();
			setDrawingWorkspaceRevision((r) => r + 1);
		}
	}, [activeChartId, updateActiveMagnetSensitivity]);

	const handleComparisonChange = useCallback((chartId: string, overlays: any[]) => {
		if (chartId === activeChartId) {
			setActiveComparisonOverlays(overlays);
		}
	}, [activeChartId]);

	const handleToolSelect = useCallback((toolId: string) => {
		const activeChartRef = activeChartId ? chartRefs.current.get(activeChartId)?.current : null;
		const workspace = activeChartRef?.getDrawingWorkspace?.() ?? null;
		if (workspace) {
			workspace.setActiveTool(toolId as DrawingWorkspaceTool);
			setActiveTool(toolId);
		}
	}, [activeChartId]);

	const handleMagnetCycle = useCallback(() => {
		const activeChartRef = activeChartId ? chartRefs.current.get(activeChartId)?.current : null;
		if (!activeChartRef || typeof activeChartRef?.cycleMagnet !== "function") return;
		activeChartRef.cycleMagnet();
		// Read-back after commit — sync getMagnetSensitivity() sees the old value.
		(typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn: () => void) => setTimeout(fn, 0))(() => updateActiveMagnetSensitivity());
	}, [activeChartId, updateActiveMagnetSensitivity]);

	useDrawingToolShortcuts({ onToolSelect: handleToolSelect, onMagnetCycle: handleMagnetCycle });

	// Register Ctrl+Shift+L dock toggle shortcut for multi-charts
	const handleToggleDock = useCallback(() => {
		const activeChartRef = activeChartId ? chartRefs.current.get(activeChartId)?.current : null;
		const workspace = activeChartRef?.getDrawingWorkspace?.() ?? null;
		if (!workspace) return;
		if (workspace.state?.dock?.isOpen) {
			workspace.closeDock();
		} else {
			workspace.openDock?.("properties");
		}
	}, [activeChartId]);
	useShortcuts([
		HeaderShortcuts.dockToggle(handleToggleDock),
		HeaderShortcuts.symbolSearchModal(() => setSearchOpen(true)),
	]);

	// Header click → switch to workspace context
	const handleHeaderClick = useCallback(() => {
		setActiveChart(null);
	}, []);

	const handleUndo = useCallback(() => {
		const activeChartRef = activeChartId ? chartRefs.current.get(activeChartId)?.current : null;
		const workspace = activeChartRef?.getDrawingWorkspace?.() ?? null;
		if (workspace?.interaction) {
			workspace.interaction.undo();
			setCanUndo(workspace.interaction.canUndo);
			setCanRedo(workspace.interaction.canRedo);
		}
	}, [activeChartId]);

	const handleRedo = useCallback(() => {
		const activeChartRef = activeChartId ? chartRefs.current.get(activeChartId)?.current : null;
		const workspace = activeChartRef?.getDrawingWorkspace?.() ?? null;
		if (workspace?.interaction) {
			workspace.interaction.redo();
			setCanUndo(workspace.interaction.canUndo);
			setCanRedo(workspace.interaction.canRedo);
		}
	}, [activeChartId]);

	const handleClearAll = useCallback(() => {
		const activeChartRef = activeChartId ? chartRefs.current.get(activeChartId)?.current : null;
		const workspace = activeChartRef?.getDrawingWorkspace?.() ?? null;
		if (workspace?.interaction) {
			workspace.interaction.dispatch({ type: "CLEAR" });
			setCanUndo(false);
			setCanRedo(false);
		}
	}, [activeChartId]);

	const handleFullscreenToggle = useCallback(() => {
		const element = activeChartId
			? (document.querySelector(`[data-chart-id="${activeChartId}"]`) || workspaceLayoutRef.current || document.documentElement)
			: (workspaceLayoutRef.current || document.documentElement);
		if (!document.fullscreenElement) {
			element.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(err => {
				console.error("Error attempting to enable full-screen mode:", err);
			});
		} else {
			document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(err => {
				console.error("Error attempting to exit full-screen mode:", err);
			});
		}
	}, [activeChartId]);

	const handleChartConfigChange = useCallback((chartId: string, updates: Partial<MultiChartConfig>) => {
		setChartsState(prev => {
			const idx = prev.findIndex(c => c.id === chartId);
			if (idx >= 0) {
				return prev.map(c => c.id === chartId ? { ...c, ...updates } : c);
			}
			return [...prev, { id: chartId, symbol: '', ...updates } as MultiChartConfig];
		});
	}, []);

	const setChartTimeframe = useCallback((chartId: string, tf: string) => {
		// D3/SY-09: header intent propagates via engine fan-out (source applied locally; engine excludes it, D1 group-gate scopes the rest).
		applyHeaderTimeframe(chartId, tf, {
			getHandle: (id) => chartHandles.current.get(id),
			broadcastTimeframe: (id, t) => syncContextRef.current?.setTimeframe(id, t as Timeframe),
			onConfigChange: (id, t) => handleChartConfigChange(id, { timeframe: t }),
			syncEnabled: syncSettings.timeframe,
			sourceOptedOut: syncOverrideMap?.[chartId]?.timeframe === false,
		});
	}, [handleChartConfigChange, syncSettings.timeframe, syncOverrideMap]);

	const handleTimeframeChange = useCallback((tf: string) => {
		const targetId = activeChartId ?? charts[0]?.id;
		if (targetId) setChartTimeframe(targetId, tf);
	}, [activeChartId, setChartTimeframe, charts]);

	const handleSearchTimeframe = handleTimeframeChange;
	const handleChartTypeChange = useCallback((ct: string) => {
		if (!activeChartId) return;
		const handle = chartHandles.current.get(activeChartId);
		if (handle) handle.setChartType(ct);
		handleChartConfigChange(activeChartId, { engineState: { ...(activeChartConfig?.engineState || {}), chartType: ct } });
	}, [activeChartId, chartHandles, handleChartConfigChange, activeChartConfig]);
	const claimReplayTarget = useCallback((targetId?: string | null): string | null => {
		const id = targetId ?? charts[0]?.id ?? null;
		if (!id) return null;
		workspaceReplayTrading.claimSessionOwner(id);
		return id;
	}, [charts, workspaceReplayTrading]);
	const handleReplayPlay = useCallback(() => {
		if (!activeChartId) return;
		claimReplayTarget(activeChartId);
		const handle = chartHandles.current.get(activeChartId); handle?.replayPlay?.();
		// R1-c: announce start so followers catch up at once (cursor + camera).
		const startTs = handle?.getReplayState?.()?.currentBarTimestamp;
		if (typeof startTs === "number") emitReplayEvent({ type: "REPLAY_START", chartId: activeChartId, timestamp: Date.now(), startTimestamp: startTs }, replayInstanceId);
	}, [activeChartId, chartHandles, claimReplayTarget, replayInstanceId]);
	const handleReplayPause = useCallback(() => {
		if (!activeChartId) return;
		const handle = chartHandles.current.get(activeChartId); handle?.replayPause?.();
	}, [activeChartId, chartHandles]);
	const handleReplayStepForward = useCallback(() => {
		const id = claimReplayTarget(activeChartId);
		if (!id) return;
		chartHandles.current.get(id)?.replayStepForward?.();
	}, [activeChartId, chartHandles, claimReplayTarget]);
	const handleReplayStepBack = useCallback(() => {
		const id = claimReplayTarget(activeChartId);
		if (!id) return;
		chartHandles.current.get(id)?.replayStepBack?.();
	}, [activeChartId, chartHandles, claimReplayTarget]);
	const handleReplayRewind = useCallback(() => {
		const id = claimReplayTarget(activeChartId);
		if (!id) return;
		chartHandles.current.get(id)?.replayRewind?.();
	}, [activeChartId, chartHandles, claimReplayTarget]);
	const handleReplaySeek = useCallback((barIndex: number) => {
		const id = claimReplayTarget(activeChartId);
		if (!id) return;
		chartHandles.current.get(id)?.replaySeek?.(barIndex);
	}, [activeChartId, chartHandles, claimReplayTarget]);
	const handleReplayStopAll = useCallback(() => {
		for (const handle of chartHandles.current.values()) handle.replayStop?.();
		workspaceReplayTrading.clearSessionOwner();
	}, [chartHandles, workspaceReplayTrading]);

	useWorkspaceReplayOwnerLatch({
		chartHandles: chartHandles.current,
		activeChartId,
		sessionOwnerId: workspaceReplayTrading.sessionOwnerId,
		claimSessionOwner: workspaceReplayTrading.claimSessionOwner,
		stopAll: handleReplayStopAll,
	});
	useEffect(() => {
		const handler = () => {
			setIsFullscreen(!!document.fullscreenElement);
		};
		document.addEventListener("fullscreenchange", handler);
		return () => document.removeEventListener("fullscreenchange", handler);
	}, []);

	const handleSettingsClick = useCallback(() => {
		if (activeChartId) {
			const activeChartRef = chartRefs.current.get(activeChartId)?.current;
			if (activeChartRef && typeof activeChartRef?.openSettings === "function") {
				activeChartRef.openSettings();
			}
		} else {
			setShowSystemMenu(true);
		}
	}, [activeChartId]);

	const handleSnapshotClick = useCallback(() => {
		// W1.4: export ảnh chưa từng bị gate ở multi-chart. Dùng `hasCapability`
		// thay vì `hasMinTier(tier, "pro")` để theo SSOT của engine (W0.1).
		if (!hasCapability(patTier, "export_png")) {
			handlePremiumToolClick();
			return;
		}
		if (activeChartId) {
			const activeChartRef = chartRefs.current.get(activeChartId)?.current;
			if (activeChartRef && typeof activeChartRef?.saveAsImage === "function") {
				activeChartRef.saveAsImage();
			}
		} else if (workspaceLayoutRef.current) {
			const bg = isDark ? "#0a0e14" : "#ffffff";
			SaveChartAsImage.save(document, workspaceLayoutRef.current, bg, isDark, (dataUrl) => {
				setPreviewImageDataUrl(dataUrl);
			}, { tier: patTier });
		}
	}, [activeChartId, isDark, patTier, handlePremiumToolClick]);

	const handleThemeChange = useCallback((theme: ChartTheme) => {
		themeState.setTheme(theme);
		const mode = theme === "modern-light" || theme === "neutral-pro" ? "light" : "dark";
		if (workspaceLayoutRef.current) {
			workspaceLayoutRef.current.setAttribute("data-chart-theme", theme);
			workspaceLayoutRef.current.setAttribute("data-chart-mode", mode);
		}
	}, [themeState]);

	const handleSaveTemplate = useCallback(() => {
		if (activeChartId) {
			const activeChartRef = chartRefs.current.get(activeChartId)?.current;
			if (activeChartRef && typeof activeChartRef?.saveTemplate === "function") {
				activeChartRef.saveTemplate();
			}
		} else {
			setShowSystemMenu(true);
		}
	}, [activeChartId]);

	const handleLoadTemplate = useCallback(() => {
		if (activeChartId) {
			const activeChartRef = chartRefs.current.get(activeChartId)?.current;
			if (activeChartRef && typeof activeChartRef?.loadTemplate === "function") {
				activeChartRef.loadTemplate();
			}
		} else {
			setShowSystemMenu(true);
		}
	}, [activeChartId]);

	const handleAlertsClick = useCallback(() => {
		if (activeChartId) {
			const activeChartRef = chartRefs.current.get(activeChartId)?.current;
			if (activeChartRef && typeof activeChartRef?.openAlerts === "function") {
				activeChartRef.openAlerts();
			}
		} else {

		}
	}, [activeChartId]);

	// Available symbols, timeframes, chart types from all charts
	const allSymbols = useMemo(() => {
		const symbols = new Set<string>(charts.map(c => c.symbol));
		// Add default symbols
		["VNM", "VIC", "VHM", "VCB", "BID", "CTG", "TCB", "VPB", "MBB", "ACB"].forEach(s => symbols.add(s));
		return Array.from(symbols).sort();
	}, [charts]);

	const allTimeframes = useMemo(() => {
		const timeframes = new Set<string>(charts.map(c => c.timeframe));
		["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W", "1M"].forEach(tf => timeframes.add(tf));
		return Array.from(timeframes).sort();
	}, [charts]);

	const allChartTypes = useMemo(() => {
		const types = new Set<string>();
		charts.forEach(c => {
			if (c.engineState?.chartType) types.add(c.engineState.chartType as string);
		});
		["candlestick", "line", "area", "heikinAshi", "renko", "kagi"].forEach(t => types.add(t));
		return Array.from(types).map(value => ({ value, label: value }));
	}, [charts]);

	// --- Theme ---
	const setTheme = useCallback((config: ThemeConfig) => {
		const el = workspaceLayoutRef.current;
		if (!el) return;
		applyTheme(el, config);
		// Propagate to all child charts
		charts.forEach((chart) => {
			const handle = chartRefs.current.get(chart.id)?.current;
			if (handle?.setTheme) handle.setTheme(config);
		});
	}, [charts]);

	// --- Imperative Handle ---
	useImperativeHandle(forwardedRef, () => ({
		addChart,
		removeChart,
		getChartHandle,
		getAllChartHandles,
		setLayout,
		getLayout,
		saveWorkspace,
		loadWorkspace,
		setSyncVisibleRange,
		setSyncCrosshair,
		setSyncDrawings,
		setSyncSymbolLinks,
		setSyncTimeframe,
		setSyncChartType,
		setActiveChart,
		getActiveChart,
		setTheme,
	}), [
		addChart,
		removeChart,
		getChartHandle,
		getAllChartHandles,
		setLayout,
		getLayout,
		saveWorkspace,
		loadWorkspace,
		setSyncVisibleRange,
		setSyncCrosshair,
		setSyncDrawings,
		setSyncSymbolLinks,
		setSyncTimeframe,
		setSyncChartType,
		setActiveChart,
		getActiveChart,
		setTheme,
	]);

	// Close symbol search on outside click
	useEffect(() => {
		if (!searchOpen) return;
		const handler = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (!target.closest(".vnsc-symbol-search-dropdown-container") && !target.closest("[data-testid='menu-search-btn']")) {
				setSearchOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [searchOpen]);

	// --- Callback to notify when SyncContext is ready ---
	const onSyncContextReady = useCallback(() => {
		// SyncContext is now available via syncContextRef
	}, []);

	return (
		<SyncProvider
			workspaceId={workspaceId}
			clockAdapter={resolvedClockAdapter}
			broadcastChannelAdapter={resolvedBroadcastChannelAdapter}
		>
			<WidgetErrorBoundary onError={(error) => console.error("[VNInvestMultiCharts] render error:", error)}>
				<>
					<div
						ref={workspaceLayoutRef}
						className={`${layoutStyles.multichartsLayout} ${toolbarLocked ? layoutStyles.toolbarLocked : ""} vnsc-root vnsc-multicharts-root ${className}`}
						style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative" }}
						role="grid"
						aria-label="Multi-chart grid"
						data-chart-theme={currentTheme}
						data-chart-mode={isDark ? "dark" : "light"}
					>
						{tierGateNotice && (
							<div
								role="alert"
								data-testid="tier-gate-notice"
								style={{
									position: "absolute",
									top: 8,
									left: "50%",
									transform: "translateX(-50%)",
									// Toast layer (SSOT token) — floats above workspace
									// header/toolbar/dock stacking contexts.
									zIndex: "var(--vnsc-z-toast, 130)",
									display: "flex",
									alignItems: "center",
									gap: 8,
									padding: "8px 12px",
									borderRadius: 8,
									background: "var(--vnsc-surface, #1a2332)",
									border: "1px solid var(--vnsc-accent, #2962ff)",
									color: "var(--vnsc-text, #fff)",
									fontSize: 13,
									boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
								}}
							>
								<span>{t("tierGate.message", { required: tierGateNotice.required, max: tierGateNotice.max })}</span>
								<button
									type="button"
									onClick={() => upgradeUrl && window.open(upgradeUrl, "_blank", "noopener,noreferrer")}
									style={{ color: "var(--vnsc-accent, #2962ff)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}
								>
									{t("tierGate.upgrade")}
								</button>
								<button
									type="button"
									aria-label={t("common.close")}
									onClick={() => setTierGateNotice(null)}
									style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.7 }}
								>
									✕
								</button>
							</div>
						)}
						{(showWorkspaceToolbar || viewportMode === "mobile") && (
							<MultiChartTopbar
								layout={layout}
								onLayoutChange={(newLayout) => {
									if (!requestChartLayout(newLayout)) return;
									onLayoutChange?.(newLayout);
									const totalSlots = newLayout.rows * newLayout.cols;
									setChartsState((prev) => {
										const existingIds = new Set(prev.map(c => c.id));
										const missing: string[] = [];
										for (let i = 1; i <= totalSlots; i++) {
											const id = `chart-${i}`;
											if (!existingIds.has(id)) missing.push(id);
										}
										if (missing.length === 0) return prev;
										return [...prev, ...missing.map((id) => ({
											id,
											symbol: activeChartConfig?.symbol || prev[0]?.symbol || "VIC",
											timeframe: "1D" as const,
										}))];
									});
								}}
								activeChartId={activeChartId}
								activeSymbol={activeChartSymbol}
								activeTimeframe={activeChartTimeframe}
								onSymbolChange={(sym) => {
									const targetId = activeChartId ?? charts[0]?.id;
									if (targetId) {
										handleChartConfigChange(targetId, { symbol: sym });
										const targetChart = charts.find(c => c.id === targetId);
										if (syncSettings.symbolLinks && targetChart?.symbolLinkGroup && syncContextRef.current) {
											syncContextRef.current.setGroupSymbol(targetChart.symbolLinkGroup, sym);
										}
									}
								}}
								onTimeframeChange={handleTimeframeChange}
								syncSettings={syncSettings}
								onSyncChange={(key, val) => {
									setSyncSettings((prev) => {
										const next = { ...prev, [key]: val };
										onSyncChange?.(next);
										return next;
									});
								}}
								onSaveWorkspace={onWorkspaceSave ? () => onWorkspaceSave(workspaceId || "default") : undefined}
								onAddChart={addChart ? () => {
									const nextId = `chart-${Date.now()}`;
									addChart({ id: nextId, symbol: "VIC", timeframe: "1D" });
								} : undefined}
								onThemeToggle={handleThemeToggle}
								isDark={isDark}
								isMobile={viewportMode === "mobile"}
								onSearchToggle={() => setSearchOpen(prev => !prev)}
								onFullscreenClick={handleFullscreenToggle} isFullscreen={isFullscreen}
								onSnapshotClick={handleSnapshotClick}
								chartType={activeChartType}
								onChartTypeChange={handleChartTypeChange}
								patTier={patTier}
								compareOpen={compareDialogOpen} onCompareToggle={() => setCompareDialogOpen((prev) => !prev)}
								replayPlaying={headerReplayPlaying}
								onReplayPlay={handleReplayPlay} onReplayPause={handleReplayPause}
								onSystemMenuOpen={() => setShowSystemMenu(true)}
							/>
						)}
						{/* Header — click to activate workspace context (hidden on mobile) */}
						{viewportMode !== "mobile" && (
							<header
								className={`${layoutStyles.header} ${activeTarget === "workspace" ? layoutStyles.headerWorkspaceMode : ""}`}
								onClick={(e) => {
									const target = e.target as HTMLElement;
									if (!target.closest('button, a, input, select, [role="button"]')) {
										handleHeaderClick();
									}
								}}
								aria-label={activeTarget === "workspace" ? "Workspace context — click chart to focus" : "Chart context — click header to switch to workspace"}
							>
								<OHLCHeader
									symbol={activeChartSymbol}
									timeframe={activeChartTimeframe}
									chartType={activeChartType}
									quickTimeframes={quickTimeframes}
									onChartTypeChange={handleChartTypeChange}
									patTier={patTier}
									showMenu={true}
									isFullscreen={isFullscreen} searchOpen={searchOpen}
									showLogo={true}
									onSearchToggle={() => setSearchOpen(prev => !prev)} onSettingsClick={handleSettingsClick} onFullscreenClick={handleFullscreenToggle}
									onSnapshotClick={handleSnapshotClick}
									onSaveTemplate={handleSaveTemplate} onLoadTemplate={handleLoadTemplate}
									onAlertsClick={handleAlertsClick}
									onSystemMenuOpen={() => setShowSystemMenu(true)}
									onTimeframeChange={handleTimeframeChange}
									replayPlaying={headerReplayPlaying}
									replaySpeed={headerReplaySpeed} replayCurrentBar={headerReplayCurrentBar} replayTotalBars={headerReplayTotalBars}
									replayTotalPnl={headerReplayTotalPnl}
									replayAnalytics={headerReplayAnalytics}
									replayAwaitingStartBar={headerReplayAwaitingStartBar}
									showReplayBar={showReplayBar}
									onShowReplayBarChange={setShowReplayBar}
									onReplayPlay={handleReplayPlay} onReplayPause={handleReplayPause}
									onReplayStepForward={handleReplayStepForward}
									onReplayStepBack={handleReplayStepBack}
									onReplayStop={handleReplayStopAll}
									onReplayRewind={handleReplayRewind}
									onReplaySpeedChange={(speed) => {
										if (!activeChartId) return;
										const handle = chartHandles.current.get(activeChartId);
										handle?.replaySetSpeed?.(speed);
									}}
									onReplaySeek={handleReplaySeek}
									onReplayStartBarSelect={() => {
										const targetId = activeChartId ?? charts[0]?.id;
										if (!targetId) return;
										// When no chart is focused, replay must fall back to chart 0
										// AND activate it, otherwise the header reads replay state from a
										// null active chart and the replay UI never reflects the session.
										if (!activeChartId) setActiveChartId(targetId);
										claimReplayTarget(targetId);
										const handle = chartHandles.current.get(targetId);
										handle?.replaySelectStartBar?.();
									}}
									onReplayCancelSelection={() => {
										const targetId = activeChartId ?? charts[0]?.id;
										if (!targetId) return;
										if (!activeChartId) setActiveChartId(targetId);
										const handle = chartHandles.current.get(targetId);
										handle?.replayCancelSelection?.();
									}}
									replayInterval="source"
									compareOpen={compareDialogOpen}
									onCompareToggle={() => setCompareDialogOpen((prev) => !prev)}
								/>
							</header>
						)}

						{compareDialogOpen && activeChartId && (
							<SymbolCompareModal
								adapter={props.defaultChartProps?.adapter ?? FALLBACK_ADAPTER}
								mainSymbol={charts.find(c => c.id === activeChartId)?.symbol}
								onSwitch={(sym) => {
									const targetId = activeChartId ?? charts[0]?.id;
									if (targetId) {
										handleChartConfigChange(targetId, { symbol: sym });
										const targetChart = charts.find(c => c.id === targetId);
										if (syncSettings.symbolLinks && targetChart?.symbolLinkGroup && syncContextRef.current) {
											syncContextRef.current.setGroupSymbol(targetChart.symbolLinkGroup, sym);
										}
									}
									setCompareDialogOpen(false);
								}}
								onTimeframeChange={handleTimeframeChange}
								existing={activeComparisonOverlays.map((o) => o.symbolId)}
								entries={activeComparisonOverlays}
								onAdd={(symbolId) => {
									const handle = chartHandles.current.get(activeChartId ?? '');
									handle?.addCompareSymbol?.(symbolId);
								}}
								onRemove={(symbolId) => {
									const handle = chartHandles.current.get(activeChartId);
									handle?.removeCompareSymbol?.(symbolId);
								}}
								onUpdate={(symbolId, partial) => {
									const handle = chartHandles.current.get(activeChartId);
									handle?.updateCompareOverlay?.(symbolId, partial);
								}}
								onClose={() => setCompareDialogOpen(false)}
							/>
						)}

						{searchOpen && (
							<SymbolSearchModal
								open
								onClose={() => setSearchOpen(false)}
							>
								<VNSymbolSearch
									adapter={props.defaultChartProps?.adapter ?? FALLBACK_ADAPTER}
									value={activeChartSymbol}
									flat
									onChange={(sym) => {
										const targetId = activeChartId ?? charts[0]?.id;
										if (targetId) {
											handleChartConfigChange(targetId, { symbol: sym });
											const targetChart = charts.find(c => c.id === targetId);
											if (syncSettings.symbolLinks && targetChart?.symbolLinkGroup && syncContextRef.current) {
												syncContextRef.current.setGroupSymbol(targetChart.symbolLinkGroup, sym);
											}
										}
										setSearchOpen(false);
									}}
									onTimeframeChange={handleTimeframeChange}
								/>
							</SymbolSearchModal>
						)}

						{showSystemMenu && (
							<div ref={systemMenuRef} style={{
								position: 'absolute',
								top: viewportMode === 'mobile' ? 0 : '42px',
								right: viewportMode === 'mobile' ? 0 : '8px',
								zIndex: 1000
							}}>
								<SystemMenu
									variant={viewportMode === "mobile" ? "bottomsheet" : undefined}
									onClose={() => setShowSystemMenu(false)}
									portalRoot={portalRoot ?? (props.portalAdapter as { portalRoot?: HTMLElement | null })?.portalRoot ?? null}
									activeTarget={activeTarget}
									currentWorkspaceId={currentWorkspaceId}
									currentWorkspaceName={currentWorkspaceName}
									workspaces={workspaces}
									onSaveWorkspace={async (wsId, name) => {
										await saveWorkspace(wsId);
										setCurrentWorkspaceName(name);
										const storage = storageAdapter ?? defaultAdapters.storageAdapter;
										const raw = storage.getItem(`workspace:${wsId}`);
										if (raw) {
											try {
												const ws = JSON.parse(raw);
												upsertWorkspaceIndex(wsId, name);
												void ws;
											} catch (e) {
												console.error("Failed to parse workspace for list:", e);
											}
										}
									}}
									onLoadWorkspace={async (wsId) => {
										await loadWorkspace(wsId);
										const storage = storageAdapter ?? defaultAdapters.storageAdapter;
										const raw = storage.getItem(`workspace:${wsId}`);
										if (raw) {
											try {
												const ws = JSON.parse(raw);
												setCurrentWorkspaceId(wsId);
												setCurrentWorkspaceName(ws.name);
											} catch (e) {
												console.error("Failed to parse workspace:", e);
											}
										}
									}}
									onDeleteWorkspace={async (wsId) => {
										const storage = storageAdapter ?? defaultAdapters.storageAdapter;
										storage.removeItem(`workspace:${wsId}`);
										setWorkspaces(prev => prev.filter(w => w.id !== wsId));
										if (currentWorkspaceId === wsId) {
											setCurrentWorkspaceId(null);
											setCurrentWorkspaceName("Untitled Workspace");
										}
									}}
									onImportWorkspace={async (file) => {
										const text = await file.text();
										try {
											const ws = JSON.parse(text);
											const wsId = ws.id || `workspace-${Date.now()}`;
											const storage = storageAdapter ?? defaultAdapters.storageAdapter;
											storage.setItem(`workspace:${wsId}`, JSON.stringify(ws));
											setWorkspaces(prev => [...prev, { id: wsId, name: ws.name, updatedAt: Date.now() }]);
											await loadWorkspace(wsId);
										} catch (e) {
											console.error("Failed to import workspace:", e);
										}
									}}
									onExportWorkspace={async (wsId) => {
										const storage = storageAdapter ?? defaultAdapters.storageAdapter;
										const raw = storage.getItem(`workspace:${wsId}`);
										if (raw) {
											const blob = new Blob([raw], { type: "application/json" });
											const url = URL.createObjectURL(blob);
											const a = document.createElement("a");
											a.href = url;
											a.download = `${currentWorkspaceName}.json`;
											a.click();
											URL.revokeObjectURL(url);
										}
									}}
									onNewWorkspace={() => {
										setCurrentWorkspaceId(null);
										setCurrentWorkspaceName("Untitled Workspace");
									}}
									layoutPresets={ALL_PRESETS}
									layout={layout}
									onLayoutChange={(newLayout) => { requestChartLayout(newLayout); }}
									currentLayoutId={null}
									onLayoutPresetSelect={(presetId) => {
										const preset = ALL_PRESETS.find(p => p.id === presetId);
										if (preset) {
											if (!requestChartLayout(gridLayoutToChartLayout(preset.layout))) return;
											const slotIds = preset.layout.slots.map(s => s.id);
											setChartsState((prev) => {
												const existingIds = new Set(prev.map(c => c.id));
												const missing = slotIds.filter(id => !existingIds.has(id));
												if (missing.length === 0) return prev;
												return [...prev, ...missing.map((id) => ({
													id,
													symbol: activeChartConfig?.symbol || prev[0]?.symbol || "VIC",
													timeframe: "1D" as const,
												}))];
											});
										}
									}}
									onOpenLayoutDesigner={() => {
										setShowSystemMenu(false);
										setShowLayoutDesigner(true);
									}}
									syncSettings={syncSettings}
									onSyncToggle={(type) => {
										setSyncSettings(prev => ({ ...prev, [type]: !prev[type] }));
									}}
									onExportSnapshot={() => {

									}}
									onExportData={() => {

									}}
									onOpenSettings={() => {
										if (activeChartId) {
											const activeChartRef = chartRefs.current.get(activeChartId)?.current;
											if (activeChartRef && typeof activeChartRef?.openSettings === "function") {
												activeChartRef.openSettings();
											}
										} else {

										}
									}}
									onUpgradeClick={() => upgradeUrl && window.open(upgradeUrl, "_blank", "noopener,noreferrer")}
									currentTheme={currentTheme}
									onThemeChange={handleThemeChange}
									activeTool={activeTool}
									onToolSelect={handleToolSelect}
									canUndo={canUndo}
									canRedo={canRedo}
									onUndo={handleUndo}
									onRedo={handleRedo}
									onClearAll={handleClearAll}
								/></div>
						)}

						{/* Workspace toolbar (P0): truoc day 340L component nay duoc IMPORT
						    nhung KHONG bao gio render — chi co SystemMenu lo save/load/export/delete,
						    thieu autosave va luu theo ten. `showWorkspaceToolbar` mac dinh `false`
						    nen HANH VI HIEN TAI KHONG DOI; host bat co moi thay. KHONG gate tier:
						    save/load workspace la bang A14 Community theo Rule 15; chi `layout_user`
						    (luu *preset* goi y) moi la Pro va da gate o LayoutDesigner. */}
						{showWorkspaceToolbar && (
							<WorkspaceToolbar
								currentWorkspaceId={currentWorkspaceId ?? undefined}
								currentWorkspaceName={currentWorkspaceName}
								workspaces={workspaces}
								storageAdapter={storageAdapter}
								autoSaveEnabled={autoSaveEnabled}
								onAutoSaveToggle={setAutoSaveEnabled}
								onSave={async (wsId, name) => {
									await saveWorkspace(wsId);
									setCurrentWorkspaceName(name);
									setCurrentWorkspaceId(wsId);
									upsertWorkspaceIndex(wsId, name);
								}}
								onLoad={async (wsId) => {
									await loadWorkspace(wsId);
									setCurrentWorkspaceName(wsId);
									setCurrentWorkspaceId(wsId);
								}}
							/>
						)}

						{/* Layout Designer */}
						{showLayoutDesigner && (
							<LayoutDesigner
								layout={chartLayoutToGridLayout(layout, charts)}
								onLayoutChange={(newLayout) => setLayoutState(gridLayoutToChartLayout(newLayout))}
								onSaveAsPreset={canSaveCustomPreset ? handleSaveAsPreset : undefined}
								availablePresets={canSaveCustomPreset ? customPresets : []}
								onApplyPreset={canSaveCustomPreset ? handleApplyPreset : undefined}
								onDeletePreset={canSaveCustomPreset ? handleDeletePreset : undefined}
								isOpen={showLayoutDesigner}
								onClose={() => setShowLayoutDesigner(false)}
							/>
						)}

						{/* Toolbar Sidebar — only visible when a chart is active and not on mobile */}
						{viewportMode !== "mobile" && (
							<div className={`${layoutStyles.toolbar} ${layoutStyles.expanded}`}>
								{showDrawingToolbar && (
									<div className={`vnsc-drawing-toolbar-shell${toolbarLocked ? " vnsc-drawing-toolbar-shell--docked" : ""}`}>
										<span className="vnsc-drawing-toolbar-handle" aria-hidden="true" />
										<VNInvestChartsStateContext.Provider
											value={{
												activeTool: {
													activeTool: activeTool,
													setActiveTool: (tool) => {
														handleToolSelect(tool || "");
													},
												},
												paneState: null as any, // ARC-1-keep: legacy bridge
												drawingInteraction: null as any, // ARC-1-keep: legacy bridge
											}}
										>
											<DrawingToolbar
												activeTool={activeTool}
												onToolSelect={handleToolSelect}
												magnetSensitivity={magnetSensitivity}
												onMagnetCycle={handleMagnetCycle}
												isLocked={toolbarLocked} onToggleLock={handleToggleToolbarLock}
												patTier={patTier}
												onPremiumToolClick={handlePremiumToolClick}
											/>
										</VNInvestChartsStateContext.Provider>
									</div>
								)}
							</div>
						)}

						{/* S1 (F8 full-height, mirror single): body-row chứa mainCol
							(charts + panel) và dock. Overlay neo theo body (full content
							height như toolbar top:40/bottom:32); pinned in-flow đẩy cả col. */}
						<div className={layoutStyles.workspaceBody}>
							<div className={layoutStyles.workspaceMainCol}>
								{/* Charts Grid with SyncContext */}
								<div className={layoutStyles.charts}>
									<SyncContextConsumer
										chartHandles={chartHandles}
										syncContextRef={syncContextRef}
										onRegisterCharts={onSyncContextReady}
										onActiveChartChange={setActiveChartId}
									>
										<RequestCoordinatorProvider>
											<BackfillDedupProvider>
												<SharedBarStoreProvider>
													{/* Q1a: WorkspaceLiveTradingContext.Provider REMOVED — mọi ô (kể cả VN-Spot)
										rớt về broker cục bộ per-chart (M1 namespace). Không còn book chung. */}
													<WorkspaceReplayTradingContext.Provider value={workspaceReplayTrading}><WorkspacePaperVisibilityProvider value={paperVisibility}>
														{/* UIUX_MULTI_CELL_HEADER: provider `CellStatusLineProvider` đã bị bỏ —
														    dải header thừa trùng với dòng status line trong pane. */}
														<GridContainer
															charts={charts}
															layout={chartLayoutToGridLayout(layout, charts)}
															activeChartId={activeChartId}
															syncSettings={syncSettings}
															defaultChartProps={mergedChartProps}
															resizeAdapter={resizeAdapter}
															keyboardAdapter={keyboardAdapter}
															clockAdapter={clockAdapter}
															storageAdapter={storageAdapter}
															portalAdapter={portalAdapter}
															registryAdapter={registryAdapter}
															portalRoot={portalRoot}
															shadowRoot={shadowRoot}
															chartRefs={chartRefs}
															chartHandles={chartHandles}
															setActiveChart={setActiveChart}
															addChart={addChart}
															hoverEmitterRefs={ohlcHoverEmitterRefs}
															onDrawingWorkspaceChange={handleDrawingWorkspaceChange}
															onLayoutChange={(newGridLayout) => {
																requestChartLayout(gridLayoutToChartLayout(newGridLayout));
															}}
															onChartConfigChange={handleChartConfigChange}
															onSymbolSearchClick={(chartId) => {
																setActiveChart(chartId);
																setSearchOpen(true);
															}}
															onComparisonChange={handleComparisonChange}
															showSymbolBadges={showSymbolBadges}
															syncOverrideMap={syncOverrideMap}
															onToggleSyncOverride={handleToggleSyncOverride}
															showCorporateEvents={showCorporateEvents}
															corporateEvents={corporateEvents}
															activeTool={activeTool}
															replaySelectionEnabled={showReplayBar}
															maximizedChartId={panelFocus.maximizedChartId}
															onMaximizedChange={panelFocus.setMaximizedChartId}
														/>
													</WorkspacePaperVisibilityProvider></WorkspaceReplayTradingContext.Provider>
												</SharedBarStoreProvider>
											</BackfillDedupProvider>
										</RequestCoordinatorProvider>
									</SyncContextConsumer>
									{showReplayBar && activeChartId && (
										<FloatingReplayToolbar
											replayPlaying={headerReplayPlaying}
											replaySpeed={headerReplaySpeed}
											replayCurrentBar={headerReplayCurrentBar}
											replayTotalBars={headerReplayTotalBars}
											onReplayPlay={handleReplayPlay}
											onReplayPause={handleReplayPause}
											onReplayStop={handleReplayStopAll}
											onReplayStepForward={handleReplayStepForward}
											onReplayStepBack={handleReplayStepBack}
											onReplayRewind={handleReplayRewind}
											onReplaySpeedChange={(speed) => {
												const handle = chartHandles.current.get(activeChartId);
												handle?.replaySetSpeed?.(speed);
											}}
											onReplaySeek={handleReplaySeek}
											replayInterval="source"
											onReplayIntervalChange={() => {}}
											replayMode={replayMode}
											onReplayModeChange={setReplayMode}
											replayTotalPnl={headerReplayTotalPnl}
											replayAnalytics={headerReplayAnalytics}
											onClose={() => {
												handleReplayStopAll();
												setShowReplayBar(false);
											}}
										/>
									)}
								</div>

								{/* Bottom Panel Slot (MC-2) — rendered inside widget, fed by active chart handle.
							Fly = overlay thuần (panel full width, không reflow — mirror toolbar
							flyout); chỉ docked/pinned mới đẩy layout qua flex. */}
								{renderBottomPanel ? (
									renderBottomPanel({
										activeChartId,
										activeChartHandle,
										plotData: activePlotData,
										activeIndicators,
										onAddIndicator: handleAddIndicator,
									})
								) : showBottomPanel ? (
									<BottomPanelHost
										activeTab={activeBottomTab}
										onTabChange={setActiveBottomTab}
										plotData={activePlotData}
										symbol={activeChartHandle?.symbol ?? ""}
										timeframe={activeChartHandle?.timeframe ?? ""}
										activeIndicators={activeIndicators}
										isDark={isDark}
										onAddIndicator={handleAddIndicator}
										renderPaperTradePanel={showPaperTradePanel ? renderPaperTradePanel : undefined}
										panelHeight={bottomPanelHeight}
										canUsePineEditor={hasCapability(patTier, "pine_editor")}
										canUseStrategyTester={hasCapability(patTier, "strategy_tester")}
									/>
								) : null}
							</div>
							{/* S1: slot ở body-level (sau mainCol) — overlay phủ full content
							height mirror toolbar; pinned in-flow đẩy cả col (grid+panel).
							RD-01: provider bọc slot — slot đọc useHasCapability, thiếu provider
							→ tier=null → locked ở MỌI tier (trailing_stop khoá cả Pro).
							Chưa truyền `narrowing` (license caps) — residual có chủ đích, B4/RD-09. */}
							<CapabilityProvider tier={patTier}>
								<WorkspaceRightDockSlot
									showRightDock={showRightDock}
									dockTierGate={dockTierGate}
									tier={patTier}
									watchlistAdapter={watchlistAdapter}
									renderRightPanel={renderRightPanel}
									activeChartId={activeChartId}
									symbol={activeChartHandle?.symbol ?? activeChartConfig?.symbol ?? ""}
									timeframe={activeChartHandle?.timeframe ?? activeChartConfig?.timeframe ?? ""}
									datum={activePlotData[activePlotData.length - 1] ?? null}
									drawingRevision={drawingWorkspaceRevision}
									chartRefs={chartRefs}
									charts={charts}
									symbolLinks={syncSettings.symbolLinks}
									syncContextRef={syncContextRef}
									onChartConfigChange={handleChartConfigChange}
									activeChartHandle={activeChartHandle}
									replaySource={workspaceReplayTrading.isReplayActive ? workspaceReplayTrading : undefined}
									tape={tape}
									advisory={advisory}
									onAlertsOpen={handleAlertsClick}
									isMobile={viewportMode === "mobile"}
								/>
							</CapabilityProvider>
						</div>

						{/* Footer */}
						<footer className={layoutStyles.footer}>
							<MultiChartsFooter
								currentLayout={findMatchingPreset(layout)}
								onLayoutChange={(preset) => {
									if (!requestChartLayout(gridLayoutToChartLayout(preset.layout))) return;
									const slotIds = preset.layout.slots.map(s => s.id);
									setChartsState((prev) => {
										const existingIds = new Set(prev.map(c => c.id));
										const missing = slotIds.filter(id => !existingIds.has(id));
										if (missing.length === 0) return prev;
										return [...prev, ...missing.map((id) => ({
											id,
											symbol: activeChartConfig?.symbol || prev[0]?.symbol || "VIC",
											timeframe: "1D" as const,
										}))];
									});
								}}
								chartCount={charts.length}
								chartsData={charts.map(c => ({ id: c.id, symbol: c.symbol, timeframe: c.timeframe }))}
								syncSettings={syncSettings}
								onSyncChange={(settings) => {
									setSyncSettings(prev => ({ ...prev, ...settings }));
									onSyncChange?.(settings);
								}}
								autoHide={false}
								isChartFocused={activeTarget === "chart"}
								onSystemMenuOpen={() => setShowSystemMenu(true)}
								activeTab={activeBottomTab}
								onTabChange={setActiveBottomTab}
								isMaximized={panelFocus.maximizedChartId !== null}
								onToggleMaximize={panelFocus.toggleSolo}
								activeIndex={charts.findIndex(c => c.id === activeChartId)}
								onActiveIndexChange={(index) => {
									const id = charts[index]?.id;
									if (id) {
										setActiveChart(id);
									}
								}}
								isMobile={viewportMode === "mobile"}
							/>
						</footer>

						{children}

						{/* Snapshot Preview Modal */}
						{previewImageDataUrl && (
							<SnapshotPreviewModal
								isOpen={!!previewImageDataUrl}
								imageDataUrl={previewImageDataUrl}
								isDark={isDark}
								onClose={() => setPreviewImageDataUrl(null)}
								onSave={() => {
									if (previewImageDataUrl) {
										const a = document.createElement("a");
										a.setAttribute("href", previewImageDataUrl);
										a.setAttribute("download", "Chart-Viewport.png");
										document.body.appendChild(a);
										a.click();
										document.body.removeChild(a);
										setPreviewImageDataUrl(null);
									}
								}}
							/>
						)}

						{viewportMode === 'mobile' && (
							<button
								type="button"
								className="vnsc-mobile-fab"
								onClick={() => setIsMobileToolbarOpen(true)}
								aria-label="Open chart tools"
								style={{
									position: "fixed",
									bottom: "12px",
									left: "12px",
									width: "48px",
									height: "48px",
									borderRadius: "24px",
									backgroundColor: "var(--vnsc-accent, #22d3ee)",
									color: "#0a0e17",
									border: "none",
									boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
									zIndex: 9999,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									fontSize: "20px",
									cursor: "pointer",
								}}
							>
						🛠️
							</button>
						)}

						<MobileToolbar
							isOpen={isMobileToolbarOpen}
							onClose={() => setIsMobileToolbarOpen(false)}
							activeTool={activeTool}
							onToolSelect={handleToolSelect}
							patTier={patTier}
							onPremiumToolClick={handlePremiumToolClick}
							portalRoot={portalRoot ?? (props.portalAdapter as { portalRoot?: HTMLElement | null })?.portalRoot ?? null}
							charts={charts}
							activeChartId={activeChartId}
							onChartSelect={(id: string) => setActiveChart(id)}
							onSaveWorkspace={onWorkspaceSave ? () => onWorkspaceSave(workspaceId || "default") : undefined}
							onThemeToggle={handleThemeToggle}
							isDark={isDark}
							// UX-04: these were never forwarded, so on a phone the
							// workspace lost the timeframe switcher and the
							// Pine/Strategy tabs that the desktop rail has. The tab
							// union is wider here (`paper_trade` exists), and the mobile
							// toolbar has no paper tab, so that state reads as "none".
							timeframes={allTimeframes}
							activeTimeframe={activeChartTimeframe}
							onTimeframeChange={handleTimeframeChange}
							activeTab={activeBottomTab === "paper_trade" ? null : activeBottomTab}
							onTabChange={setActiveBottomTab}
							isChartFocused={activeTarget === "chart"}
						/>
					</div>
				</>
			</WidgetErrorBoundary>
		</SyncProvider>
	);
};

const VNInvestMultiCharts = forwardRef<VNInvestMultiChartsRef, VNInvestMultiChartsProps>((props, forwardedRef) => {
	const hostSaaSCtx = useContext(SaaSFeatureContext);
	return (
		<SaaSFeatureProvider
			tenantPat={props.tenantPat}
			licenseKey={props.licenseKey}
			onLicenseDiagnostic={props.onLicenseDiagnostic}
			client={props.client}
		>
			<VNInvestMultiChartsInner
				{...props}
				forwardedRef={forwardedRef}
				hostTenantPlan={hostSaaSCtx?.tenantMetadata?.plan}
			/>
		</SaaSFeatureProvider>
	);
});
const getGroupColor = (groupId: SymbolLinkGroupId): string => ({ A: "#e74c3c", B: "#3498db", C: "#2ecc71", D: "#f39c12" }[groupId] ?? "#95a5a6");
VNInvestMultiCharts.displayName = "VNInvestMultiCharts";
export { VNInvestMultiCharts };
export type { ChartLayout };
