// Task 09: tab vị thế — SL/TP join theo symbol (giới hạn netting Phase A).
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { TradingOrder, TradingPosition } from "../../../lib/core/trading/types";
import styles from "./TradingBottomPanel.module.css";

export interface PositionsTabProps {
	positions: TradingPosition[];
	orders: TradingOrder[];
	onClosePosition: (positionId: string) => void;
	onReversePosition: (positionId: string) => void;
	/** P1.3: đóng tất cả vị thế (optional — ẩn khi không truyền). */
	onCloseAllPositions?: () => void;
	/** S6: PnL display mode + exit-cost rates for the net estimate. */
	pnlDisplayMode?: "gross" | "net";
	exitFeeRate?: number;
	exitTaxRate?: number;
	onTogglePnlDisplay?: () => void;
}

export function PositionsTab({
	positions,
	orders,
	onClosePosition,
	onReversePosition,
	onCloseAllPositions,
	pnlDisplayMode = "gross",
	exitFeeRate = 0.001,
	exitTaxRate = 0.001,
	onTogglePnlDisplay,
}: PositionsTabProps) {
	const { t } = useWidgetI18n();
	if (positions.length === 0) {
		return (
			<div className={styles.emptyContainer} data-testid="positions-empty">
				<div className={styles.emptyIcon} aria-hidden="true">
					📊
				</div>
				<div className={styles.emptyTitle}>{t("widget.trading.noPositions", { defaultValue: "No open positions" })}</div>
				<div className={styles.emptyHint}>
					{t("widget.trading.emptyPositionsHint", {
						defaultValue: "Place orders directly on chart or press Shift + B to open ticket",
					})}
				</div>
			</div>
		);
	}
	const workingBySymbol = new Map<string, TradingOrder[]>();
	for (const order of orders) {
		if (order.status !== "working") continue;
		const list = workingBySymbol.get(order.symbol) ?? [];
		list.push(order);
		workingBySymbol.set(order.symbol, list);
	}

	return (
		<table className={styles.table} data-testid="positions-table">
			<thead>
				<tr>
					<th>{t("widget.trading.symbol", { defaultValue: "Symbol" })}</th>
					<th>{t("widget.trading.side", { defaultValue: "Side" })}</th>
					<th>{t("widget.trading.quantity", { defaultValue: "Quantity" })}</th>
					<th>{t("widget.trading.entryPrice", { defaultValue: "Entry" })}</th>
					<th>{t("widget.trading.markPrice", { defaultValue: "Mark" })}</th>
					<th>{t("widget.trading.availability", { defaultValue: "Status" })}</th>
					<th>{t("widget.trading.stopLoss", { defaultValue: "Stop loss" })}</th>
					<th>{t("widget.trading.takeProfit", { defaultValue: "Take profit" })}</th>
					<th>
						{onTogglePnlDisplay ? (
							<button
								type="button"
								data-testid="positions-pnl-toggle"
								aria-pressed={pnlDisplayMode === "net"}
								title={pnlDisplayMode === "net"
									? t("widget.trading.pnlNet")
									: t("widget.trading.pnlGross")}
								onClick={onTogglePnlDisplay}
							>
								PnL ({pnlDisplayMode === "net"
									? t("widget.trading.pnlNet")
									: t("widget.trading.pnlGross")})
							</button>
						) : (
							"PnL"
						)}
					</th>
					<th>
						{onCloseAllPositions && (
							<button
								type="button"
								data-testid="positions-close-all"
								title={t("widget.trading.closeAllPositions", { defaultValue: "Close all positions" })}
								onClick={onCloseAllPositions}
							>
								{t("widget.trading.closeAllPositions", { defaultValue: "Close all positions" })}
							</button>
						)}
					</th>
				</tr>
			</thead>
			<tbody>
				{positions.map((position) => {
					const siblings = workingBySymbol.get(position.symbol) ?? [];
					const sl = siblings.find((o) => o.type === "stop" || o.type === "trailing_stop");
					const tp = siblings.find((o) => o.type === "limit");
					const settled = position.availableQuantity >= position.quantity;
					// S6: net estimate = gross − exit commission − exit tax.
					const exitCost = Math.abs(position.currentPrice) * position.quantity * (exitFeeRate + exitTaxRate);
					const shownPnl = pnlDisplayMode === "net" ? position.unrealizedPnl - exitCost : position.unrealizedPnl;
					const pnlPercent =
						position.entryPrice !== 0 && position.quantity !== 0
							? (shownPnl / (Math.abs(position.entryPrice) * position.quantity)) * 100
							: 0;
					return (
						<tr key={position.id} data-testid={`position-row-${position.id}`}>
							<td>{position.symbol}</td>
							<td>{position.side === "long" ? t("widget.trading.long", { defaultValue: "Long" }) : t("widget.trading.short", { defaultValue: "Short" })}</td>
							<td>{position.quantity}</td>
							<td>{position.entryPrice.toLocaleString("en-US")}</td>
							<td>{position.currentPrice.toLocaleString("en-US")}</td>
							<td>
								{settled
									? t("widget.trading.available", { defaultValue: "Available" })
									: t("widget.trading.awaitingSettlement", { defaultValue: "Settling (T+2)" })}
							</td>
							<td>{sl?.stopPrice?.toLocaleString("en-US") ?? "—"}</td>
							<td>{tp?.price?.toLocaleString("en-US") ?? "—"}</td>
							<td data-testid={`position-pnl-${position.id}`}>
								{shownPnl >= 0 ? "+" : ""}
								{Math.round(shownPnl).toLocaleString("en-US")} ({pnlPercent.toFixed(2)}%)
							</td>
							<td>
								<button type="button" data-testid={`position-close-${position.id}`} onClick={() => onClosePosition(position.id)}>
									✕
								</button>
								<button
									type="button"
									data-testid={`position-reverse-${position.id}`}
									title={t("widget.trading.reverse", { defaultValue: "Reverse" })}
									onClick={() => onReversePosition(position.id)}
								>
									⇄
								</button>
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}
