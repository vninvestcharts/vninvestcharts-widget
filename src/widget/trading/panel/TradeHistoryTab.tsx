// Task TVP-A3: tab lịch sử vị thế đã đóng (map 1:1 TV "Trade history").
// Nguồn: analytics.closedTrades (ClosedTradeRecord mở rộng entry/exit).
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { ClosedTradeRecord } from "../../../lib/core/trading/AnalyticsEngine";
import styles from "./TradingBottomPanel.module.css";

export interface TradeHistoryTabProps {
	trades: ClosedTradeRecord[];
}

export function TradeHistoryTab({ trades }: TradeHistoryTabProps) {
	const { t } = useWidgetI18n();
	if (trades.length === 0) {
		return <div data-testid="trades-empty">{t("widget.trading.noTrades", { defaultValue: "No closed positions" })}</div>;
	}

	return (
		<table className={styles.table} data-testid="trades-table">
			<thead>
				<tr>
					<th>{t("widget.trading.symbol", { defaultValue: "Symbol" })}</th>
					<th>{t("widget.trading.side", { defaultValue: "Side" })}</th>
					<th>{t("widget.trading.quantity", { defaultValue: "Quantity" })}</th>
					<th>{t("widget.trading.entryPrice", { defaultValue: "Entry" })}</th>
					<th>{t("widget.trading.fillPrice", { defaultValue: "Fill" })}</th>
					<th>PnL</th>
					<th>{t("widget.trading.exitReason", { defaultValue: "Exit" })}</th>
					<th>{t("widget.trading.time", { defaultValue: "Time" })}</th>
				</tr>
			</thead>
			<tbody>
				{trades.map((trade, index) => (
					<tr key={`${trade.timestamp}-${index}`} data-testid={`trade-row-${index}`}>
						<td>{trade.symbol ?? "—"}</td>
						<td>{trade.side === "short" ? t("widget.trading.short", { defaultValue: "Short" }) : t("widget.trading.long", { defaultValue: "Long" })}</td>
						<td>{trade.quantity ?? "—"}</td>
						<td>{trade.entryPrice?.toLocaleString("en-US") ?? "—"}</td>
						<td>{trade.exitPrice?.toLocaleString("en-US") ?? "—"}</td>
						<td>
							{trade.realizedPnl >= 0 ? "+" : ""}
							{Math.round(trade.realizedPnl).toLocaleString("en-US")}
						</td>
						<td>{trade.exitReason ?? "—"}</td>
						<td>{new Date(trade.timestamp).toLocaleString()}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
