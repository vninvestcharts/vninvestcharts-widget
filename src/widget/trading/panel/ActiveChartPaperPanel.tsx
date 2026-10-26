/**
 * ActiveChartPaperPanel (P1-S2) — panel đáy multi đọc broker của ô ACTIVE qua
 * PaperPanelRegistry (không qua singleton mồ côi). Subscribe bus để tự refresh.
 * Nhánh replay (D4) đọc sổ replay workspace như renderer singleton cũ.
 */
import { useEffect, useState } from "react";
import { TradingBottomPanel } from "./TradingBottomPanel";
import {
	getPaperPanelBinding,
	usePaperPanelBinding,
	type PaperPanelSnapshot,
} from "../context/PaperPanelRegistry";
import { workingOrdersMargin } from "../../../lib/core/trading/orderMargin";
import { REPLAY_SPOT_RULES } from "../../../lib/core/replay/replayBrokerAdapters";
import { resolveMarketProfile } from "../../../lib/core/trading/MarketRules";
import {
	mergeMarketRules,
	splitEnginePatch,
	usePaperRuntimeConfig,
} from "../hooks/usePaperRuntimeConfig";
import type { PaperRuntimeConfig } from "../config/paperRuntimeConfig";
import type { BrokerAccount } from "../../../lib/core/trading/types";
import type { TradingAnalytics } from "../../../lib/core/trading/AnalyticsEngine";
import badgeStyles from "./TradingBottomPanel.module.css";

export const EMPTY_PAPER_ACCOUNT: BrokerAccount = {
	accountId: "paper-empty",
	balance: 0,
	equity: 0,
	marginUsed: 0,
	freeMargin: 0,
	buyingPower: 0,
	currency: "USD",
	pnl: 0,
	pnlPercent: 0,
};

const EMPTY_ANALYTICS: TradingAnalytics = {
	totalTrades: 0,
	winningTrades: 0,
	losingTrades: 0,
	winRate: 0,
	grossProfit: 0,
	grossLoss: 0,
	netProfit: 0,
	profitFactor: 0,
	maxDrawdown: 0,
	maxDrawdownPercent: 0,
	equityCurve: [],
	closedTrades: [],
	sharpeRatio: 0,
};

const EMPTY_SNAPSHOT: PaperPanelSnapshot = {
	account: EMPTY_PAPER_ACCOUNT,
	positions: [],
	orders: [],
	orderHistory: [],
	ordersMargin: 0,
	analytics: EMPTY_ANALYTICS,
	log: [],
	// Không binding (chartId null/late-register): giữ panel rỗng bật sẵn,
	// không CTA vì chưa biết bật cho ô nào.
	tradingEnabled: true,
	onEnableTrading: () => {},
};

export interface ActiveChartReplaySource {
	broker: {
		getAccount(): BrokerAccount;
		getPositions(): PaperPanelSnapshot["positions"];
		getOrders(): PaperPanelSnapshot["orders"];
		getAnalytics(): TradingAnalytics;
	};
	log: { timestamp: number; message: string }[];
	closePosition(positionId: string): boolean | void;
	reversePosition(positionId: string): void;
	cancelOrder(orderId: string): boolean | void;
	reset(): void;
}

export interface ActiveChartPaperPanelProps {
	chartId: string | null;
	replay?: ActiveChartReplaySource | null;
	onClose?: () => void;
}

export function ActiveChartPaperPanel({ chartId, replay, onClose }: ActiveChartPaperPanelProps) {
	// Re-render khi binding đến/mất (late registration) — D8.
	usePaperPanelBinding(chartId);
	const [, setRev] = useState(0);
	const binding = getPaperPanelBinding(chartId);
	useEffect(() => binding?.subscribe(() => setRev((v) => v + 1)), [binding]);

	// S6: runtime config wiring (hooks before all early returns below).
	// Falls back to a VN symbol when the binding registers late; the empty
	// panel renders defaults and never touches the hook result.
	const paperSymbol = binding?.symbol ?? "VND";
	const paperBaseRules = resolveMarketProfile(paperSymbol);
	const paperConfig = usePaperRuntimeConfig({
		profile: paperBaseRules.profile,
		chartId: binding?.chartId ?? chartId,
		baseRules: paperBaseRules,
	});
	const handleSavePaperConfig = (partial: Partial<PaperRuntimeConfig>) => {
		const saved = paperConfig.save(partial);
		if (!saved || !binding?.applyRuntimeConfig) return;
		const { rulesPatch, simulatorOptions } = splitEnginePatch(partial);
		binding.applyRuntimeConfig({
			rules: mergeMarketRules(resolveMarketProfile(binding.symbol), rulesPatch),
			simulatorOptions,
		});
	};
	const handleTogglePnlDisplay = () => {
		handleSavePaperConfig({
			pnlDisplayMode: paperConfig.config.pnlDisplayMode === "net" ? "gross" : "net",
		});
	};

	if (replay) {
		const allOrders = replay.broker.getOrders();
		const allPositions = replay.broker.getPositions();
		const marks: Record<string, number> = {};
		for (const position of allPositions) marks[position.symbol] = position.currentPrice;
		return (
			<TradingBottomPanel
				account={replay.broker.getAccount()}
				positions={allPositions}
				orders={allOrders.filter((o) => o.status === "working")}
				orderHistory={allOrders}
				ordersMargin={workingOrdersMargin(allOrders, allPositions, REPLAY_SPOT_RULES, marks)}
				analytics={replay.broker.getAnalytics()}
				log={replay.log}
				onClosePosition={(id) => replay.closePosition(id)}
				onReversePosition={(id) => replay.reversePosition(id)}
				onCancelOrder={(id) => replay.cancelOrder(id)}
				onResetAccount={() => replay.reset()}
				onClose={onClose}
			/>
		);
	}

	if (!binding) {
		return (
			<TradingBottomPanel
				{...EMPTY_SNAPSHOT}
				onClosePosition={() => {}}
				onReversePosition={() => {}}
				onCancelOrder={() => {}}
				onResetAccount={() => {}}
				onClose={onClose}
			/>
		);
	}
	const snap = binding!.getSnapshot();
	// Thống nhất single/multi: ô active bị ẩn trading bar → panel hiện CTA bật lại
	// (TradingBottomPanel nhánh !tradingEnabled). Replay luôn bật nên không CTA.
	const badge = (
		<span className={badgeStyles.titleBadge} data-testid="panel-chart-badge">
			<span className={badgeStyles.titleBadgeDot} aria-hidden="true">
				●
			</span>
			{binding.symbol}
			<span className={badgeStyles.titleBadgeId}>{binding.chartId}</span>
		</span>
	);
	return (
		<TradingBottomPanel
			account={snap.account}
			positions={snap.positions}
			orders={snap.orders}
			orderHistory={snap.orderHistory}
			ordersMargin={snap.ordersMargin}
			analytics={snap.analytics}
			log={snap.log}
			onClosePosition={(id) => binding.closePosition(id)}
			onReversePosition={(id) => binding.reversePosition(id)}
			onCancelOrder={(id) => binding.cancelOrder(id)}
			onCloseAllPositions={() => binding.closeAllPositions("manual")}
			onCancelAllOrders={() => {
				for (const order of binding.getOrders()) {
					if (order.status === "working") {
						binding.cancelOrder(order.id);
					}
				}
			}}
			onResetAccount={(initialBalance?: number) => binding.resetAccount(initialBalance)}
			onClose={onClose}
			tradingEnabled={snap.tradingEnabled}
			onEnableTrading={snap.onEnableTrading}
			titleBadge={badge}
			symbol={binding.symbol}
			paperConfig={paperConfig.config}
			onSavePaperConfig={handleSavePaperConfig}
			pnlDisplayMode={paperConfig.config.pnlDisplayMode}
			exitFeeRate={paperConfig.config.brokerFeeRate}
			exitTaxRate={paperConfig.config.taxRate}
			onTogglePnlDisplay={handleTogglePnlDisplay}
		/>
	);
}
