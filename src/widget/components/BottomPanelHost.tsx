import { lazy, Suspense, useState } from "react";
import { AdvisoryPanel } from "./overlays/AdvisoryPanel";
import { TapePanel } from "./overlays/TapePanel";
import { useWidgetI18n } from "../context/WidgetI18nContext";
import { LockedFeature } from "./CapabilityGate";
import type { SeriesConfig } from "../../lib/core";
import { BottomPanelSplitter } from "./BottomPanelSplitter";
import type { BottomPanelHeightApi } from "../hooks/useBottomPanelHeight";

// BL-15 (lazy heavy panels) — this used to be a static `from "./panels"` barrel import, which
// kept the entire PineScript compiler inside the ESM entry's static graph for EVERY consumer,
// Free users included: `PineEditorPanel.tsx:3` statically imports `compile`. The `lazy()` calls
// in `VNInvestCharts.tsx:151-156` never took effect for this path because the barrel
// re-imported the same modules eagerly. See docs/PLAN_PRO_EXTRACTION_2026-10-15.md §1.1.
//
// Two details are load-bearing:
//   * DIRECT-FILE specifiers, not the barrel. `./panels` also re-exports two duplicate panel
//     copies (`panels/AdvisoryPanel.tsx`, `panels/TapePanel.tsx`) that nothing uses; a
//     namespace import of a barrel cannot be tree-shaken, so it would drag ~196 lines of dead
//     code into the lazy chunk. Those two files are deleted alongside this change.
//   * `.then(...)` is REQUIRED: both panels are NAMED exports, so `lazy()` receives a module
//     namespace object rather than a component. Without it React throws "Element type is invalid".
const LazyStrategyTesterPanel = lazy(() =>
	import("./panels/StrategyTesterPanel").then((m) => ({ default: m.StrategyTesterPanel })),
);
const LazyPineEditorPanel = lazy(() =>
	import("./panels/PineEditorPanel").then((m) => ({ default: m.PineEditorPanel })),
);

/**
 * Placeholder shown while a lazy panel chunk is still in flight. Keeps the panel's flex footprint
 * so the bottom dock does not collapse and re-flow.
 *
 * Inline styles on purpose: this host uses the `style` prop throughout and imports no CSS module,
 * so a `styles.*` reference here would add a new stylesheet dependency for one placeholder.
 *
 * `aria-busy` is the honest signal here and nothing more — it marks the region as loading without
 * inventing user-facing text. It is deliberately NOT given `role="status"` or a text label: that
 * would require i18n keys (Rule 1) and would announce on every tab switch, which is worse than the
 * brief flash it replaces. The panels land in well under a frame on a warm cache.
 */
const PANEL_LOADING_FALLBACK = <div style={{ flex: 1, minHeight: 0 }} aria-busy="true" />;

export type BottomTab = "strategy_tester" | "pine_editor" | "paper_trade" | null;

export interface BottomPanelHostProps {
  /** Currently active tab */
  activeTab: BottomTab;
  /** Callback when tab changes */
  onTabChange: (tab: BottomTab) => void;
  /** Plot data for strategy tester */
  plotData: any[];
  /** Active symbol */
  symbol: string;
  /** Active timeframe */
  timeframe: string;
  /** Active indicator configs */
  activeIndicators: any[];
  /** Dark mode */
  isDark: boolean;
  /** Callback to add indicator from Pine Editor to active chart */
  onAddIndicator?: (config: SeriesConfig) => void;
  /**
   * Tier grants for the two paid tabs. FAIL-CLOSED: absent means NOT granted.
   *
   * This host is rendered by `VNInvestMultiCharts`, which sits ABOVE the per-chart
   * `CapabilityProvider`, so reading capability state from context here would resolve
   * `tier=null` and lock the tabs for paying customers too. The host therefore
   * resolves `hasCapability(patTier, …)` from its own tier (same idiom as its
   * `export_png` gate) and passes the booleans in.
   *
   * The default is deliberately locked: a future call site that forgets to pass a
   * grant gets the upsell badge instead of the feature.
   */
  canUsePineEditor?: boolean;
  canUseStrategyTester?: boolean;
  /** OHLCV bars for PineScript compilation */
  bars?: { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] };
  /** Custom render for paper trade panel */
  renderPaperTradePanel?: (props: { positions: any[]; journal: any[]; onReset: () => void; onClose: () => void }) => React.ReactNode;
  /** Dữ liệu thật từ workspace singleton (H3) — truyền xuống renderPaperTradePanel thay vì hardcode rỗng. */
  paperTradeData?: { positions: any[]; journal: any[]; onReset: () => void; onClose: () => void };
  /** Show advisory panel */
  showAdvisoryPanel?: boolean;
  /** Advisory result */
  advisoryResult?: any;
  /** Native advisory session (V2) — renders instead of advisoryResult when provided */
  advisorySession?: import("../../lib/types/vninvest").AdvisorySessionV2 | null;
  /** Advisory loading */
  isAdvisoryLoading?: boolean;
  /** On advisory refresh */
  onAdvisoryRefresh?: () => void;
  /** Show tape panel */
  showTapePanel?: boolean;
  /** Tape entries */
  tapeEntries?: any[];
  /** Tape loading */
  isTapeLoading?: boolean;
  /** Tape filter billions */
  tapeFilterBillions?: number;
  /** On tape filter change */
  onTapeFilterChange?: (value: number) => void;
  /** Resizable height API (useBottomPanelHeight); omit for fixed var height */
  panelHeight?: BottomPanelHeightApi;
}

export function BottomPanelHost({
	activeTab,
	onTabChange,
	plotData,
	symbol,
	timeframe,
	activeIndicators,
	isDark,
	onAddIndicator,
	renderPaperTradePanel,
	showAdvisoryPanel,
	advisoryResult,
	advisorySession,
	isAdvisoryLoading,
	onAdvisoryRefresh,
	showTapePanel,
	tapeEntries,
	isTapeLoading,
	tapeFilterBillions,
	onTapeFilterChange,
	bars,
	paperTradeData,
	panelHeight,
	canUsePineEditor = false,
	canUseStrategyTester = false,
}: BottomPanelHostProps) {
	const { t } = useWidgetI18n();

	// Fail-closed tier gate for the two paid tabs (see the props docblock).
	const lockedCapability: "pine_editor" | "strategy_tester" | null =
		activeTab === "pine_editor" ? "pine_editor"
			: activeTab === "strategy_tester" ? "strategy_tester"
				: null;
	const lockedTab = lockedCapability === "pine_editor"
		? !canUsePineEditor
		: lockedCapability === "strategy_tester" && !canUseStrategyTester;

	// Never render an empty strip: paper_trade without a render fn has no content.
	const canRenderActiveTab = !activeTab || activeTab !== "paper_trade" || !!renderPaperTradePanel;
	if (!canRenderActiveTab && !showAdvisoryPanel && !showTapePanel) {
		return null;
	}

	if (!activeTab && !showAdvisoryPanel && !showTapePanel) {
		return null;
	}

	return (
		<div
			style={{
				minHeight: 200,
				height: panelHeight ? panelHeight.heightPx : "var(--vnsc-bottom-panel-height, 260px)",
				// max-height theo viewport (definite) — % resolve vào wrapper theo
				// content gây clamp ma (200 thay vì 260, 302 thay vì 500, đã đo runtime).
				maxHeight: "60dvh",
				borderTop: "1px solid var(--vnsc-border, #2a2a2a)",
				background: "var(--vnsc-bg-secondary, #111820)",
				position: "relative",
				zIndex: 40,
				display: "flex",
				flexDirection: "column",
			}}
			data-vnsc-bottom-panel="host"
		>
			{panelHeight ? <BottomPanelSplitter api={panelHeight} /> : null}
			<div
				style={{
					flex: 1,
					minHeight: 0,
					display: "flex",
					flexDirection: "column",
					// UI-AUDIT: panel có `height` cố định + `maxHeight: 60dvh`. Khi nội dung
					// dài hơn (ví dụ bảng vị thế), không có overflow ⇒ nội dung TRÀN ra
					// dưới panel, footer có z-index cao phủ lên ⇒ chữ bị footer "chền", người
					// dùng tưởng chồng lấn. Sửa đúng chỗ: cho phép CUỘN thay vì tràn.
					overflowY: "auto",
					overflowX: "hidden",
				}}
			>
				{lockedTab && lockedCapability ? (
					<LockedFeature capability={lockedCapability} requiredTier="pro" />
				) : activeTab === "strategy_tester" ? (
					// `<Suspense>` is the documented contract for `lazy()` and is what renders
					// PANEL_LOADING_FALLBACK, so the dock keeps its height instead of collapsing
					// for a frame.
					//
					// NOTE, because plan audit round 2 claimed otherwise here: that audit rated a
					// MISSING Suspense a BLOCKER, arguing the suspension error would reach the
					// `WidgetErrorBoundary` at `VNInvestMultiCharts.tsx:1106` (which wraps the whole
					// role="grid") and take down the workspace. Measured on React 19 + createRoot,
					// that does NOT happen — a boundary-less suspension simply commits once the
					// promise settles. See `__tests__/bottomPanelLazySuspense.test.tsx`, whose
					// docblock records the four-shape probe. Kept for correctness + layout, not
					// because a crash depends on it.
					<Suspense fallback={PANEL_LOADING_FALLBACK}>
						<LazyStrategyTesterPanel
							plotData={plotData}
							symbol={symbol}
							timeframe={timeframe}
							activeIndicators={activeIndicators}
						/>
					</Suspense>
				) : activeTab === "pine_editor" ? (
					<Suspense fallback={PANEL_LOADING_FALLBACK}>
						<LazyPineEditorPanel
							bars={bars}
							onAddIndicator={(config: SeriesConfig) => {
								onAddIndicator?.(config);
							}}
						/>
					</Suspense>
				) : activeTab === "paper_trade" && renderPaperTradePanel ? (
					renderPaperTradePanel(paperTradeData ?? { positions: [], journal: [], onReset: () => {}, onClose: () => onTabChange(null) })
				) : showAdvisoryPanel ? (
					<AdvisoryPanel
						show
						result={advisoryResult ?? null}
						session={advisorySession ?? undefined}
						isLoading={isAdvisoryLoading ?? false}
						symbol={symbol}
						onRefresh={onAdvisoryRefresh}
					/>
				) : showTapePanel ? (
					<TapePanel
						show
						entries={tapeEntries ?? []}
						isLoading={isTapeLoading ?? false}
						symbol={symbol}
						filterBillions={tapeFilterBillions ?? 0}
						onFilterChange={onTapeFilterChange}
					/>
				) : null}
			</div>
		</div>
	);
}