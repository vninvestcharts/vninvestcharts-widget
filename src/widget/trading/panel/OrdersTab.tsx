// Task 09: tab lệnh chờ (working) + hủy.
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { TradingOrder } from "../../../lib/core/trading/types";
import styles from "./TradingBottomPanel.module.css";

export interface OrdersTabProps {
	orders: TradingOrder[];
	onCancelOrder: (orderId: string) => void;
	/** P1.3: hủy tất cả lệnh chờ (optional — ẩn khi không truyền). */
	onCancelAllOrders?: () => void;
}

export function OrdersTab({ orders, onCancelOrder, onCancelAllOrders }: OrdersTabProps) {
	const { t } = useWidgetI18n();
	if (orders.length === 0) {
		return <div data-testid="orders-empty">{t("widget.trading.noOrders", { defaultValue: "No working orders" })}</div>;
	}

	return (
		<div>
			{onCancelAllOrders && (
				<div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
					<button
						type="button"
						data-testid="orders-cancel-all"
						title={t("widget.trading.cancelAllOrders", { defaultValue: "Cancel all pending orders" })}
						onClick={onCancelAllOrders}
					>
						{t("widget.trading.cancelAllOrders", { defaultValue: "Cancel all pending orders" })}
					</button>
				</div>
			)}
			<table className={styles.table} data-testid="orders-table">
				<thead>
					<tr>
						<th>{t("widget.trading.symbol", { defaultValue: "Symbol" })}</th>
						<th>{t("widget.trading.side", { defaultValue: "Side" })}</th>
						<th>{t("widget.trading.orderType", { defaultValue: "Type" })}</th>
						<th>{t("widget.trading.orderPrice", { defaultValue: "Price" })}</th>
						<th>{t("widget.trading.triggerPrice", { defaultValue: "Trigger" })}</th>
						<th>{t("widget.trading.quantity", { defaultValue: "Quantity" })}</th>
						<th>{t("widget.trading.orderTime", { defaultValue: "Placed" })}</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{orders.map((order) => (
						<tr key={order.id} data-testid={`order-row-${order.id}`}>
							<td>{order.symbol}</td>
							<td>{order.side === "buy" ? t("widget.trading.buy", { defaultValue: "Buy" }) : t("widget.trading.sell", { defaultValue: "Sell" })}</td>
							<td>{order.type}</td>
							<td>{order.price?.toLocaleString("en-US") ?? "—"}</td>
							<td>{order.stopPrice?.toLocaleString("en-US") ?? "—"}</td>
							<td>{order.quantity}</td>
							<td>{new Date(order.createdAt).toLocaleString()}</td>
							<td>
								<button type="button" data-testid={`order-cancel-${order.id}`} onClick={() => onCancelOrder(order.id)}>
								✕
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
