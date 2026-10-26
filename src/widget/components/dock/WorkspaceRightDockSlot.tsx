// W3 (P4 Workspace Shared Right Dock, Option A): slot tách khỏi
// VNInvestMultiCharts (plan §6 — multi vượt trigger 1900). Multi chỉ truyền
// dữ liệu + callbacks.
// DOCK_SSOT_B3 (RD-03a): shell (wrapper flyout + grip + pin/persist + tier
// gate + Suspense + lazy host) chuyển vào RightDockRail dùng chung
// single↔multi; slot còn lại phần multi-specific: gate `showRightDock`,
// panels bridge, symbol routing, capability + orderTicket binding.
import React, { useCallback, type ReactNode } from "react";
import type { SymbolLinkGroupId } from "@vninvestcharts/engine-react";
import { RightDockRail } from "./RightDockRail";
import { useHasCapability } from "../CapabilityGate";
import { useWorkspaceDockPanels } from "../../hooks/useWorkspaceDockPanels";
import { RegistryTradingDockPanel } from "../../trading/ticket/RegistryTradingDockPanel";
import { usePaperPanelBinding } from "../../trading/context/PaperPanelRegistry";
import type { ActiveChartReplaySource } from "../../trading/panel/ActiveChartPaperPanel";
import type { WatchlistAdapter } from "../../types/watchlist";
import type { FullChartHandle } from "../../types/fullChartHandle";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";
import type { DockAdvisoryData, DockTapeData } from "./RightSidebarDockHost";

// Structural subset của MultiChartConfig — tránh import cycle về multi.
export interface WorkspaceDockChartRef {
	id: string;
	symbol: string;
	symbolLinkGroup?: SymbolLinkGroupId | null;
}

export interface WorkspaceRightDockSlotProps {
	showRightDock?: boolean;
	dockTierGate?: boolean;
	tier: string | null | undefined;
	watchlistAdapter?: WatchlistAdapter;
	renderRightPanel?: (context: { chartId: string; activeChartHandle: unknown }) => ReactNode;
	activeChartId: string | null;
	symbol: string;
	timeframe: string;
	datum?: EnrichedDatum | null;
	drawingRevision: number;
	chartRefs: React.MutableRefObject<Map<string, React.RefObject<FullChartHandle | null>>>;
	charts: WorkspaceDockChartRef[];
	symbolLinks?: boolean;
	syncContextRef: React.MutableRefObject<{ setGroupSymbol?: (group: SymbolLinkGroupId, symbol: string) => void } | null>;
	onChartConfigChange: (chartId: string, updates: { symbol: string }) => void;
	activeChartHandle: unknown;
	replaySource?: ActiveChartReplaySource | null | undefined;
	/** W4: dữ liệu tape/advisory do host cấp. undefined = tabs disabled. */
	tape?: DockTapeData;
	advisory?: DockAdvisoryData;
	/** W4: mở AlertsModal của chart đang active (delegate qua handle imperative). */
	onAlertsOpen?: () => void;
	/** E2: true khi viewport mobile (hover/pin tắt, tap = click). */
	isMobile?: boolean;
}

export function WorkspaceRightDockSlot(props: WorkspaceRightDockSlotProps): ReactNode {
	const {
		showRightDock,
		dockTierGate,
		tier,
		watchlistAdapter,
		renderRightPanel,
		activeChartId,
		symbol,
		timeframe,
		datum,
		drawingRevision,
		chartRefs,
		charts,
		symbolLinks,
		syncContextRef,
		onChartConfigChange,
		activeChartHandle,
		replaySource,
		tape,
		advisory,
		onAlertsOpen,
		isMobile,
	} = props;

	// Objects bridge theo active chart (re-read khi revision bump).
	const workspaceDockPanels = useWorkspaceDockPanels({ activeChartId, chartRefs, revision: drawingRevision });

	// S1: lệnh nâng cao theo capability, không suy ra từ `toSeriesTier(tier)` — tier suy ra
	// thì bỏ qua allowlist `caps` của license. Đọc từ context: single mount provider ở
	// VNInvestCharts.tsx:2127; multi mount provider quanh slot này (RD-01, DOCK_SSOT_B1) —
	// trước RD-01 multi không có provider nào nên tier=null ⇒ khoá cả Pro.
	const canUseAdvancedOrders = useHasCapability("paper_advanced");
	// RD-07 (DOCK_SSOT_B2): replay-trading là sub-gate riêng của ô đặt lệnh —
	// blanket disable theo replaySource khoá oan cả Pro; quyền quyết định bởi
	// capability, TradingDockPanel tự fail-closed (replay && !grant → lock).
	const canUseReplayTrading = useHasCapability("replay_trading");
	// RD-08 (DOCK_SSOT_B2): host disable orderTicket theo truthy tradingDockNode —
	// không binding thì phải undefined (Registry tự null nhưng element vẫn truthy
	// → tab không bao giờ disable, panel trắng). Reactive theo late-register (D8).
	const activeTradingBinding = usePaperPanelBinding(activeChartId);

	// Watchlist dock → đổi symbol chart đang active (+ fan-out symbol-link
	// group khi synced, pattern MultiChartTopbar onSymbolChange).
	const handleSymbolChange = useCallback((sym: string) => {
		const targetId = activeChartId ?? charts[0]?.id;
		if (!targetId) return;
		onChartConfigChange(targetId, { symbol: sym });
		const targetChart = charts.find((c) => c.id === targetId);
		if (symbolLinks && targetChart?.symbolLinkGroup && syncContextRef.current?.setGroupSymbol) {
			syncContextRef.current.setGroupSymbol(targetChart.symbolLinkGroup, sym);
		}
	}, [activeChartId, charts, onChartConfigChange, symbolLinks, syncContextRef]);

	if (showRightDock === false) return null;
	return (
		<RightDockRail
			dockTierGate={dockTierGate}
			tier={tier}
			symbol={symbol}
			timeframe={timeframe}
			datum={datum}
			onSymbolChange={handleSymbolChange}
			watchlistAdapter={watchlistAdapter}
			drawingDockNode={workspaceDockPanels.drawingDockNode}
			tradingDockNode={
				activeTradingBinding ? (
					<RegistryTradingDockPanel
						chartId={activeChartId}
						lastPrice={typeof datum?.close === "number" ? datum.close : 0}
						isReplayMode={replaySource != null}
						canUseReplayTrading={canUseReplayTrading}
						canUseAdvancedOrders={canUseAdvancedOrders}
					/>
				) : undefined
			}
			tape={tape}
			advisory={advisory}
			onAlertsOpen={onAlertsOpen}
			customPanelNode={renderRightPanel?.({ chartId: activeChartId ?? "", activeChartHandle })}
			isMobile={isMobile}
		/>
	);
}
