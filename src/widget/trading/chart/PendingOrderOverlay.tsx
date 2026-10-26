// Task 08: đường lệnh chờ (limit/stop working) + nút hủy.
// Task TVP-A1: pill strip + axis tag xám.
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { TradingOrder } from "../../../lib/core/trading/types";
import type { AxisTagPlacement, OverlayBounds } from "./InteractivePositionOverlay";
import styles from "./TradingOverlays.module.css";

export interface PendingOrderOverlayProps {
	order: TradingOrder;
	toY: (price: number) => number | null;
	bounds: OverlayBounds;
	axis?: AxisTagPlacement | null;
	disabled?: boolean;
	onCancel?: () => void;
}

export function PendingOrderOverlay({ order, toY, bounds, axis = null, disabled = false, onCancel }: PendingOrderOverlayProps) {
	const { t } = useWidgetI18n();
	const price = order.type === "limit" ? order.price : order.stopPrice;
	if (price == null) return null;
	const y = toY(price);
	if (y == null || y < bounds.top || y > bounds.bottom) return null;

	return (
		<div className={styles.layer} data-testid={`pending-line-${order.id}`}>
			<div className={styles.pendingLine} style={{ top: y }} />
			<div className={styles.pillStrip} style={{ right: 8, top: y }} data-testid={`pending-pill-${order.id}`}>
				<span className={styles.pillChip}>
					{order.side === "buy" ? t("widget.trading.buy", { defaultValue: "Buy" }) : t("widget.trading.sell", { defaultValue: "Sell" })}{" "}
					{order.quantity}
				</span>
				<span className={styles.pillChip}>{price.toLocaleString("en-US")}</span>
				{onCancel && (
					<button
						type="button"
						className={styles.pillBtn}
						data-testid={`pending-cancel-${order.id}`}
						disabled={disabled}
						title={t("widget.trading.cancelOrder", { defaultValue: "Cancel order" })}
						onClick={(e) => {
							e.stopPropagation();
							onCancel();
						}}
					>
						✕
					</button>
				)}
			</div>
			{axis != null && (
				<div
					className={`${styles.axisTag} ${styles.axisTagOrder}`}
					style={{ left: axis.left, top: y, maxWidth: axis.width }}
					data-testid={`pending-axis-${order.id}`}
				>
					{price.toLocaleString("en-US")}
				</div>
			)}
		</div>
	);
}
