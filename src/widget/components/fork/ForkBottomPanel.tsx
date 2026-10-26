/**
 * BL-03B extraction from VNInvestCharts.tsx (behavior-identical move).
 * Slice S5: the collapsible bottom-panel block (VNC :2459-2540, 82 lines) moved
 * verbatim — ZERO tokens changed inside the block (there was no runtime guard
 * to strip, unlike S4); only indentation was normalised. The three `lazy()`
 * panel defs only the block used moved along; `LazyAlertsModal` (still used
 * by VNC) stayed behind.
 * Plan: docs/PLAN_BL03B_S5_BOTTOM_PANEL_2026-10-17.md
 */
import { lazy, Suspense } from "react";
import { PANE_MAX_VISIBLE } from "../../../lib/core";
import { BottomPanelSplitter } from "../BottomPanelSplitter";
import { CapabilityGate } from "../CapabilityGate";
import styles from "../../styles/fork-overlays.module.css";
import type { BottomPanelHeightApi } from "../../hooks/useBottomPanelHeight";
import type { PaneState } from "../../context/VNInvestChartsStateContext";
import type { useWidgetData } from "../../hooks/useWidgetData";
import type { selectAlertableSeries } from "../../../lib/alerts/AlertManager";
import type { toPineCompileBars } from "../../utils/pineSeriesData";
import type { useTierGatedFeatures } from "../../capabilities/useTierGatedFeatures";
import type { useToasts } from "../Toast";
import type { useWidgetI18n } from "../../context/WidgetI18nContext";

// BL-15: rarely-opened heavy panels load as separate chunks (moved here with
// the S5 slice — only the bottom panel can reach these three).
const LazyStrategyTesterPanel = lazy(() =>
	import("../panels/StrategyTesterPanel").then((m) => ({ default: m.StrategyTesterPanel })),
);
const LazyPineEditorPanel = lazy(() =>
	import("../panels/PineEditorPanel").then((m) => ({ default: m.PineEditorPanel })),
);
const LazyConnectedTradingPanel = lazy(() =>
	import("../../trading/panel/ConnectedTradingPanel").then((m) => ({ default: m.ConnectedTradingPanel })),
);

export type BottomTab = "strategy_tester" | "pine_editor" | "paper_trade" | null;

export interface ForkBottomPanelProps {
	activeBottomTab: BottomTab;
	setActiveBottomTab: (tab: BottomTab) => void;
	bottomPanelHeight: BottomPanelHeightApi;
	tierGated: ReturnType<typeof useTierGatedFeatures>;
	dataResult: ReturnType<typeof useWidgetData>;
	activeIndicatorConfigs: ReturnType<typeof selectAlertableSeries>;
	pineCompileBars: ReturnType<typeof toPineCompileBars>;
	restorableSeriesTypes: string[];
	paneState: PaneState;
	pushToast: ReturnType<typeof useToasts>["pushToast"];
	t: ReturnType<typeof useWidgetI18n>["t"];
}

export function ForkBottomPanel({
	activeBottomTab,
	setActiveBottomTab,
	bottomPanelHeight,
	tierGated,
	dataResult,
	activeIndicatorConfigs,
	pineCompileBars,
	restorableSeriesTypes,
	paneState,
	pushToast,
	t,
}: ForkBottomPanelProps) {
	return (
		<>
			{/* Collapsible Bottom Panel */}
			{activeBottomTab && (
				<div className={styles.forkBottomPanel} style={{ height: bottomPanelHeight.heightPx }}>
					<BottomPanelSplitter api={bottomPanelHeight} />
					<div style={{ flex: 1, minHeight: 0 }}>
						{activeBottomTab === "strategy_tester" ? (
							tierGated.canUseStrategyTester ? (
								<Suspense fallback={<div className={styles.forkLoadingOverlay} aria-hidden="true" />}>
									<LazyStrategyTesterPanel
										plotData={dataResult.plotData}
										symbol={dataResult.activeSymbol}
										timeframe={dataResult.activeTimeframe}
										activeIndicators={activeIndicatorConfigs}
									/>
								</Suspense>
							) : (
								<CapabilityGate capability="strategy_tester"><div /></CapabilityGate>
							)
						) : activeBottomTab === "paper_trade" ? (
							<Suspense fallback={<div className={styles.forkLoadingOverlay} aria-hidden="true" />}>
								<LazyConnectedTradingPanel onClose={() => setActiveBottomTab(null)} />
							</Suspense>
						) : (
							tierGated.canUsePineEditor ? (
								<Suspense fallback={<div className={styles.forkLoadingOverlay} aria-hidden="true" />}>
									<LazyPineEditorPanel
										bars={pineCompileBars}
										restorableSeriesTypes={restorableSeriesTypes}
										onAddIndicator={(config) => {
											// 1.6b/dedupe: pressing "Save and Add to Chart" twice used to append the
											// SAME series id twice — `addSeries` pushes without dedup
											// (`useDynamicPanes.ts:442-447`), so the engine drew the line twice,
											// the legend rendered a React duplicate-key warning, and
											// `removeSeries(paneId, seriesType, seriesIndex?)` became
											// index-ambiguous. Caught by G-PINE-E2E, not by any unit test.
											// Re-compiling a script should refresh its series, not clone it.
											const existing = paneState.panes.some((p) =>
												(p.series ?? []).some((s) => s.type === config?.type),
											);
											if (existing) {
												pushToast(t("ui.pinescript.alreadyOnChart"), "info");
												return;
											}
											// 1.5: `overlay=false` scripts get their own pane instead of being
											// forced onto "price". `addPane` is a no-op once PANE_MAX_VISIBLE is
											// reached (`useDynamicPanes.ts:366-368`), and a follow-up
											// `addSeries` would then target a pane that does not exist
											// (`:432-435`) — two silent no-ops behind a success toast. So we ask
											// `canAddPane` first and surface a real message instead.
											// The series travels INSIDE the addPane action because the reducer
											// assigns its own pane id (`useDynamicPanes.ts:371`), so a caller
											// cannot know the id to address afterwards.
											if (config?.overlay === false) {
												// `PaneState` exposes no `canAddPane`, so the cap is checked here with the
												// same rule the reducer uses (`useDynamicPanes.ts:366`).
												const visibleCount = paneState.panes.filter((p) => p.visible).length;
												if (visibleCount >= PANE_MAX_VISIBLE) {
													pushToast(t("ui.pinescript.paneLimitReached"), "error");
													return;
												}
												paneState.dispatch({
													type: "addPane",
													pane: { label: "Pine", series: [config], visible: true } as any,
												});
												return;
											}
											paneState.dispatch({
												type: "addSeries",
												paneId: "price",
												series: config,
											});
										}}
									/>
								</Suspense>
							) : (
								<CapabilityGate capability="pine_editor"><div /></CapabilityGate>
							)
						)}
					</div>

				</div>
			)}
		</>
	);
}
