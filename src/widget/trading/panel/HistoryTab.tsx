// Task TVP-A3: tab sổ lệnh quá khứ (filled/cancelled/rejected) — map TV "Order history".
// Lệnh working nằm ở OrdersTab. Rejected được OMS lưu sổ từ TVP-A3.
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { OrderRejectCode, TradingOrder } from "../../../lib/core/trading/types";
import styles from "./TradingBottomPanel.module.css";

export interface HistoryTabProps {
	orders: TradingOrder[];
}

/**
 * `Record<OrderRejectCode, ...>` rather than `Partial<...>`: adding a member to
 * the union then breaks type-check HERE, instead of shipping a new reject code
 * that silently renders the raw enum again.
 */
const REJECT_CODE_KEYS: Record<OrderRejectCode, string> = {
	UNSUPPORTED_TIF: "widget.trading.rejectCode.UNSUPPORTED_TIF",
	UNSUPPORTED_ORDER_TYPE: "widget.trading.rejectCode.UNSUPPORTED_ORDER_TYPE",
	INSUFFICIENT_BUYING_POWER: "widget.trading.rejectCode.INSUFFICIENT_BUYING_POWER",
	INVALID_QUANTITY: "widget.trading.rejectCode.INVALID_QUANTITY",
	INVALID_PRICE: "widget.trading.rejectCode.INVALID_PRICE",
	SHORT_NOT_ALLOWED: "widget.trading.rejectCode.SHORT_NOT_ALLOWED",
	PRICE_OUT_OF_BAND: "widget.trading.rejectCode.PRICE_OUT_OF_BAND",
};

function StatusCell({ status, rejectCode }: { status: TradingOrder["status"]; rejectCode?: string }) {
	const { t } = useWidgetI18n();
	const label =
		status === "filled"
			? t("widget.trading.statusFilled", { defaultValue: "Filled" })
			: status === "cancelled"
				? t("widget.trading.statusCancelled", { defaultValue: "Cancelled" })
				: status === "rejected"
					? t("widget.trading.statusRejected", { defaultValue: "Rejected" })
					: status;
	// An unmapped code (persisted from an older build, or from a host that
	// stamps its own) falls back to the raw value rather than rendering nothing —
	// but every code this build can PRODUCE has a translation above.
	const codeKey = rejectCode ? REJECT_CODE_KEYS[rejectCode as OrderRejectCode] : undefined;
	const codeLabel = codeKey ? t(codeKey) : rejectCode;
	return (
		<>
			{label}
			{status === "rejected" && codeLabel ? ` (${codeLabel})` : ""}
		</>
	);
}

export function HistoryTab({ orders }: HistoryTabProps) {
	const { t } = useWidgetI18n();
	const past = orders.filter((o) => o.status !== "working" && o.status !== "pending");
	if (past.length === 0) {
		return <div data-testid="history-empty">{t("widget.trading.noHistory", { defaultValue: "No order history" })}</div>;
	}

	return (
		<table className={styles.table} data-testid="history-table">
			<thead>
				<tr>
					<th>{t("widget.trading.symbol", { defaultValue: "Symbol" })}</th>
					<th>{t("widget.trading.side", { defaultValue: "Side" })}</th>
					<th>{t("widget.trading.orderType", { defaultValue: "Type" })}</th>
					<th>{t("widget.trading.orderPrice", { defaultValue: "Price" })}</th>
					<th>{t("widget.trading.quantity", { defaultValue: "Quantity" })}</th>
					<th>{t("widget.trading.orderStatus", { defaultValue: "Status" })}</th>
					<th>{t("widget.trading.time", { defaultValue: "Time" })}</th>
				</tr>
			</thead>
			<tbody>
				{past.map((order) => (
					<tr key={order.id} data-testid={`history-row-${order.id}`}>
						<td>{order.symbol}</td>
						<td>{order.side === "buy" ? t("widget.trading.buy", { defaultValue: "Buy" }) : t("widget.trading.sell", { defaultValue: "Sell" })}</td>
						<td>{order.type}</td>
						<td>{(order.price ?? order.stopPrice)?.toLocaleString("en-US") ?? "—"}</td>
						<td>{order.quantity}</td>
						<td>
							<StatusCell status={order.status} rejectCode={order.rejectCode} />
						</td>
						<td>{new Date(order.updatedAt).toLocaleString()}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
