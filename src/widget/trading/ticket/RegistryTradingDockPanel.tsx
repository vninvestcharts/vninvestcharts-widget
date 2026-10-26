// S2 (P5 parity F1-A): workspace order FORM — y hệt single dock ticket.
// Resolve binding theo chartId (pattern ActiveChartPaperPanel: get + D8
// subscribe); render TradingDockPanel presentational (SSOT với single).
// Không binding (late-register) → null để host disabled tab.
import { useEffect, useState } from "react";
import { TradingDockPanel } from "./TradingDockPanel";
import { getPaperPanelBinding, usePaperPanelBinding } from "../context/PaperPanelRegistry";
import { resolveMarketProfile } from "../../../lib/core/trading/MarketRules";

export interface RegistryTradingDockPanelProps {
	chartId: string | null;
	lastPrice: number;
	/** Tắt trading của ô (snapshot.tradingEnabled false hoặc host truyền) → disable form. Replay dùng sub-gate `isReplayMode`/`canUseReplayTrading`, không qua đây. */
	disabled?: boolean;
	/** RD-07 (DOCK_SSOT_B2): ô đang replay — chuyển tiếp sub-gate cho TradingDockPanel. */
	isReplayMode?: boolean;
	/** RD-07 (DOCK_SSOT_B2): quyền replay_trading (capability) — fail-closed khi false. */
	canUseReplayTrading?: boolean;
	/** S1: quyền lệnh nâng cao từ capability (tôn trọng license `caps`). */
	canUseAdvancedOrders?: boolean;
}

export function RegistryTradingDockPanel({ chartId, lastPrice, disabled, isReplayMode, canUseReplayTrading, canUseAdvancedOrders }: RegistryTradingDockPanelProps): React.ReactNode {
	// Re-render khi binding đến/mất (late registration) — D8, mirror ActiveChartPaperPanel.
	usePaperPanelBinding(chartId);
	const [, setRev] = useState(0);
	const binding = getPaperPanelBinding(chartId);
	useEffect(() => binding?.subscribe(() => setRev((v) => v + 1)), [binding]);
	if (!binding) return null;

	const snapshot = binding.getSnapshot();
	const account = snapshot.account;
	return (
		<TradingDockPanel
			symbol={binding.symbol}
			lastPrice={lastPrice}
			disabled={disabled ?? !snapshot.tradingEnabled}
			isReplayMode={isReplayMode}
			canUseReplayTrading={canUseReplayTrading}
			canUseAdvancedOrders={canUseAdvancedOrders}
			rules={resolveMarketProfile(binding.symbol)}
			account={{ equity: account.equity, freeMargin: account.freeMargin, buyingPower: account.buyingPower }}
			currentPosition={snapshot.positions.find((p) => p.symbol === binding.symbol) ?? null}
			onSubmit={(order) => {
				binding.placeOrder({ ...order, symbol: binding.symbol });
			}}
		/>
	);
}
