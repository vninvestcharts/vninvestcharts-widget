import type { CSSProperties, ReactNode } from "react";
import type { PatTier } from "@vninvestcharts/engine-core";
import type { ChartLayout, SymbolLinkGroupId, VisibleRangePayload } from "@vninvestcharts/engine-react";
import type { VNInvestChartsProps } from "./VNInvestCharts";
import type { ThemeConfig } from "./theme/ThemeConfig";
import type { CorporateEvent } from "./components/events/CorporateEventsOverlay";
import type { WatchlistAdapter } from "./types/watchlist";
import type { DockAdvisoryData, DockTapeData } from "./components/dock/RightSidebarDockHost";
import type { WidgetChartHandle } from "./utils/widgetHelpers";
import type { SeriesConfig } from "../lib/core";

export interface MultiChartConfig {
  id: string;
  symbol: string;
  timeframe: string;
  visibleRange?: VisibleRangePayload;
  symbolLinkGroup?: SymbolLinkGroupId | null;
  engineState?: Record<string, unknown>;
}

export interface VNInvestMultiChartsProps {
  // Layout configuration
  layout?: ChartLayout;
  charts?: MultiChartConfig[];
  defaultLayout?: ChartLayout;

  // Sync configuration
  syncVisibleRange?: boolean;
  syncCrosshair?: boolean;
  syncDrawings?: boolean;
  syncSymbolLinks?: boolean;
  syncTimeframe?: boolean;
  syncChartType?: boolean;
  syncReplay?: boolean;
  syncTime?: boolean;

  // Workspace
  workspaceId?: string;
  onWorkspaceSave?: (workspaceId: string) => void;
  onWorkspaceLoad?: (workspaceId: string) => void;

  // Adapters (injected for testing/SSR)
  resizeAdapter?: VNInvestChartsProps["resizeAdapter"];
  keyboardAdapter?: VNInvestChartsProps["keyboardAdapter"];
  clockAdapter?: VNInvestChartsProps["clockAdapter"];
  storageAdapter?: VNInvestChartsProps["storageAdapter"];
  portalAdapter?: VNInvestChartsProps["portalAdapter"];
  registryAdapter?: VNInvestChartsProps["registryAdapter"];
  broadcastChannelAdapter?: VNInvestChartsProps["broadcastChannelAdapter"];

  // Auth / entitlement (AUTH-02). Top-level so every cell in the workspace
  // resolves the SAME tier; `defaultChartProps` is for chart presentation only.
  // Precedence: tenantPat > localStorage override > env (dev only) — see
  // RELEASE_DECISION_RECORD_2026-09-25 §D-06.
  tenantPat?: string;
  /** CS-3: host-pinned offline license, workspace level like tenantPat. */
  licenseKey?: string;
  /** CS-6: host licensing observer, workspace level like tenantPat. */
  onLicenseDiagnostic?: VNInvestChartsProps["onLicenseDiagnostic"];
  client?: VNInvestChartsProps["client"];
  authHandler?: VNInvestChartsProps["authHandler"];
  onTelemetry?: VNInvestChartsProps["onTelemetry"];
  onError?: VNInvestChartsProps["onError"];

  // Portal SSOT (Pre-P2) — embed isolation for Shadow DOM modals/tooltips
  portalRoot?: HTMLElement | null;
  shadowRoot?: ShadowRoot | null;

  // Cross-tab sync control (Pre-P2 F04) — page-scope isolation by default
  crossTabSync?: boolean;

  // Show/hide the integrated workspace toolbar
  showWorkspaceToolbar?: boolean;
  // Show/hide the drawing toolbar (NEW)
  showDrawingToolbar?: boolean;
  // Show/hide bottom tab panel
  showBottomPanel?: boolean;
  // Show/hide ticker badge on each chart
  showSymbolBadges?: boolean;
  // Quick timeframes for mobile quick selector
  quickTimeframes?: string[];
  // Local sync overrides map per chart slot
  syncOverrideMap?: Record<string, Record<string, boolean>>;
  onSyncOverrideChange?: (syncOverrideMap: Record<string, Record<string, boolean>>) => void;
  showCorporateEvents?: boolean;
  corporateEvents?: readonly CorporateEvent[];
  // Show/hide paper trade panel tab (H3 workspace-level, chốt 2026-07-17)
  showPaperTradePanel?: boolean;
  // Show/hide tape panel tab
  showTapePanel?: boolean;
  // W1: Workspace Shared Right Dock (Option A) — 1 dock duy nhất toàn workspace.
  // undefined = auto theo tier (giống single); false = không mount.
  showRightDock?: boolean;
  // Watchlist adapter toàn workspace. undefined = VN30 fallback trong panel.
  watchlistAdapter?: WatchlistAdapter;
  // Tier gate (default true). false = full dock mọi tier (mirror single D6).
  dockTierGate?: boolean;
  // S5a: số chart tối đa do host ép (undefined = theo tier: Free 2, Pro 4, Enterprise+ full).
  maxCharts?: number;
  // S5a: URL mở khi chạm trần tier (mặc định trang SaaS, mirror single handlePremiumToolClick).
  upgradeUrl?: string;
  // Tier-gate UX (2026-09-24): host nhận callback thay vì widget tự mở tab.
  // Widget luôn hiện banner tại chỗ; host có thể hiện toast riêng thêm.
  onTierLimitExceeded?: (info: { required: number; max: number; tier: PatTier | undefined }) => void;
  // W4: dữ liệu tape/advisory do host cấp (optional). undefined = tabs disabled.
  tape?: DockTapeData;
  advisory?: DockAdvisoryData;
  // H4: Paper trading sizing config (passed to all charts)
  sizingMode?: "fixed" | "percent";
  riskPercent?: number;
  initialEquity?: number;
  onSizingChange?: (cfg: { mode: "fixed" | "percent"; riskPercent: number; initialEquity: number }) => void;

  // Styling
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;

  // Chart defaults (NOTE W1: showDock trong defaultChartProps bị bỏ qua ở multi —
  // dock điều khiển bằng showRightDock workspace-level, cells không mount dock riêng).
  defaultChartProps?: Partial<VNInvestChartsProps>;

  // Callbacks
  onLayoutChange?: (layout: ChartLayout) => void;
  onChartAdd?: (chartId: string) => void;
  onChartRemove?: (chartId: string) => void;
  onActiveChartChange?: (chartId: string | null) => void;
  onSyncChange?: (settings: { visibleRange?: boolean; crosshair?: boolean; drawings?: boolean; symbolLinks?: boolean; timeframe?: boolean; chartType?: boolean }) => void;

  // Bottom panel slot (MC-2)
  renderBottomPanel?: (context: {
    activeChartId: string | null;
    activeChartHandle: WidgetChartHandle | null;
    plotData: any[];
    activeIndicators: any[];
    onAddIndicator?: (config: SeriesConfig) => void;
  }) => ReactNode;

  // Right panel slot (MC-1). RD-04b (DOCK_SSOT_B1): `unknown` đồng bộ với single +
  // WorkspaceRightDockSlot (trước là `any` — hình dạng khác chữ ký).
  renderRightPanel?: (context: {
    chartId: string;
    activeChartHandle: unknown;
  }) => ReactNode;
}

export interface VNInvestMultiChartsRef {
  // Chart management
  addChart: (config: MultiChartConfig) => void;
  removeChart: (chartId: string) => void;
  getChartHandle: (chartId: string) => WidgetChartHandle | undefined;
  getAllChartHandles: () => WidgetChartHandle[];

  // Layout
  setLayout: (layout: ChartLayout) => void;
  getLayout: () => ChartLayout;

  // Workspace
  saveWorkspace: (workspaceId: string) => Promise<void>;
  loadWorkspace: (workspaceId: string) => Promise<void>;

  // Sync control
  setSyncVisibleRange: (enabled: boolean) => void;
  // Theme
  setTheme: (config: ThemeConfig) => void;
  setSyncCrosshair: (enabled: boolean) => void;
  setSyncDrawings: (enabled: boolean) => void;
  setSyncSymbolLinks: (enabled: boolean) => void;
  setSyncTimeframe: (enabled: boolean) => void;
  setSyncChartType: (enabled: boolean) => void;

  // Active chart
  setActiveChart: (chartId: string | null) => void;
  getActiveChart: () => string | null;
}
