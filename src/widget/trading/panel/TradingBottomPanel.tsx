// Task 09: TradingBottomPanel — shell 5 tabs đáy màn hình (presentational).
import { useState, type ReactNode } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { BrokerAccount, TradingOrder, TradingPosition } from "../../../lib/core/trading/types";
import type { TradingAnalytics } from "../../../lib/core/trading/AnalyticsEngine";
import type { PanelLogEntry } from "./TradingLogTab";
import { TradingPanelHeader } from "./TradingPanelHeader";
import { PositionsTab } from "./PositionsTab";
import { OrdersTab } from "./OrdersTab";
import { HistoryTab } from "./HistoryTab";
import { AccountSummaryTab } from "./AccountSummaryTab";
import { TradingLogTab } from "./TradingLogTab";
import { TradeHistoryTab } from "./TradeHistoryTab";
import { buildCsv, downloadCsv, ordersToRows, positionsToRows, tradesToRows } from "./csvExport";
import type { PaperRuntimeConfig } from "../config/paperRuntimeConfig";
import styles from "./TradingBottomPanel.module.css";

export type TradingPanelTab = "positions" | "orders" | "history" | "trades" | "summary" | "log";

export interface TradingBottomPanelProps {
	account: BrokerAccount;
	positions: TradingPosition[];
	orders: TradingOrder[];
	orderHistory: TradingOrder[];
	ordersMargin: number;
	analytics: TradingAnalytics;
	log: PanelLogEntry[];
	onClosePosition: (positionId: string) => void;
	onReversePosition: (positionId: string) => void;
	onCancelOrder: (orderId: string) => void;
	/** P1.3: bulk actions (optional — ẩn khi không truyền, backward-compat). */
	onCloseAllPositions?: () => void;
	onCancelAllOrders?: () => void;
	onResetAccount: (initialBalance?: number) => void;
	onClose?: () => void;
	tradingEnabled?: boolean;
	onEnableTrading?: () => void;
	/** Badge ô chart (multi follow-active) — render trong header, không đụng layout flex. */
	titleBadge?: ReactNode;
	/** S4: active symbol for the market-fallback banner. */
	symbol?: string | null;
	paperConfig?: PaperRuntimeConfig;
	onSavePaperConfig?: (config: Partial<PaperRuntimeConfig>) => void;
	pnlDisplayMode?: "gross" | "net";
	exitFeeRate?: number;
	exitTaxRate?: number;
	onTogglePnlDisplay?: () => void;
}

const TABS: TradingPanelTab[] = ["positions", "orders", "history", "trades", "summary", "log"];

const TAB_KEYS: Record<TradingPanelTab, string> = {
	positions: "widget.trading.positions",
	orders: "widget.trading.orders",
	history: "widget.trading.orderHistory",
	trades: "widget.trading.tradeHistory",
	summary: "widget.trading.summary",
	log: "widget.trading.log",
};

export function TradingBottomPanel({
	account,
	positions,
	orders,
	orderHistory,
	ordersMargin,
	analytics,
	log,
	onClosePosition,
	onReversePosition,
	onCancelOrder,
	onCloseAllPositions,
	onCancelAllOrders,
	onResetAccount,
	onClose,
	tradingEnabled = true,
	onEnableTrading,
	titleBadge,
	symbol,
	paperConfig,
	onSavePaperConfig,
	pnlDisplayMode,
	exitFeeRate,
	exitTaxRate,
	onTogglePnlDisplay,
}: TradingBottomPanelProps) {
	const { t } = useWidgetI18n();
	const [tab, setTab] = useState<TradingPanelTab>("positions");

	const tabCounts: Record<TradingPanelTab, number> = {
		positions: positions.length,
		orders: orders.length,
		history: 0,
		trades: 0,
		summary: 0,
		log: 0,
	};

	if (!tradingEnabled) {
		return (
			<div className={styles.panel} data-testid="trading-bottom-panel">
				{titleBadge && <div className={styles.titleBadgeRow}>{titleBadge}</div>}
				<div className={styles.ctaContainer} data-testid="trading-disabled-cta">
					<div className={styles.ctaTitle}>{t("widget.trading.paperTradingOff", { defaultValue: "Paper trading is off" })}</div>
					<div className={styles.ctaHint}>{t("widget.trading.paperTradingOffHint", { defaultValue: "Enable to see quotes, place orders and drag SL/TP on the chart" })}</div>
					<button type="button" className={styles.ctaButton} data-testid="trading-enable-btn" onClick={() => onEnableTrading?.()}>
						{t("widget.trading.enablePaperTrading", { defaultValue: "Enable paper trading" })}
					</button>
				</div>
			</div>
		);
	}

	const handleExportCsv = () => {
		const dataset =
			tab === "positions"
				? { name: "positions", ...positionsToRows(positions) }
				: tab === "orders" || tab === "history"
					? { name: "orders", ...ordersToRows(tab === "orders" ? orders : orderHistory) }
					: tab === "trades"
						? { name: "trades", ...tradesToRows(analytics.closedTrades) }
						: null;
		if (!dataset) return;
		downloadCsv(`paper-${dataset.name}.csv`, buildCsv(dataset.headers, dataset.rows));
	};

	return (
		<div className={styles.panel} data-testid="trading-bottom-panel">
			{titleBadge && <div className={styles.titleBadgeRow}>{titleBadge}</div>}
			<TradingPanelHeader
				account={account}
				positions={positions}
				realizedPnl={analytics.netProfit}
				ordersMargin={ordersMargin}
				onResetAccount={onResetAccount}
				onExportCsv={handleExportCsv}
				symbol={symbol}
				paperConfig={paperConfig}
				onSavePaperConfig={onSavePaperConfig}
			/>
			<div className={styles.tabBar} role="tablist">
				{TABS.map((id) => (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={tab === id}
						className={tab === id ? styles.activeTab : styles.tab}
						data-testid={`panel-tab-${id}`}
						onClick={() => setTab(id)}
					>
						<span>{t(TAB_KEYS[id], { defaultValue: id })}</span>
						{tabCounts[id] > 0 && <span className={styles.tabBadge}>{tabCounts[id]}</span>}
					</button>
				))}
				{onClose && (
					<button
						type="button"
						className={styles.btnClosePinned}
						data-testid="panel-close"
						title={t("widget.trading.closePanel", { defaultValue: "Close panel" })}
						onClick={onClose}
					>
						✕
					</button>
				)}
			</div>
			<div className={styles.tabBody} data-testid={`panel-body-${tab}`}>
				{tab === "positions" && (
					<PositionsTab
						positions={positions}
						orders={orders}
						onClosePosition={onClosePosition}
						onReversePosition={onReversePosition}
						onCloseAllPositions={onCloseAllPositions}
						pnlDisplayMode={pnlDisplayMode}
						exitFeeRate={exitFeeRate}
						exitTaxRate={exitTaxRate}
						onTogglePnlDisplay={onTogglePnlDisplay}
					/>
				)}
				{tab === "orders" && <OrdersTab orders={orders} onCancelOrder={onCancelOrder} onCancelAllOrders={onCancelAllOrders} />}
				{tab === "history" && <HistoryTab orders={orderHistory} />}
				{tab === "trades" && <TradeHistoryTab trades={analytics.closedTrades} />}
				{tab === "summary" && <AccountSummaryTab account={account} analytics={analytics} />}
				{tab === "log" && <TradingLogTab log={log} />}
			</div>
		</div>
	);
}
