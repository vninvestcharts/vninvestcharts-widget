// Task 08: đường vị thế + badge PnL + nút đóng/đảo chiều.
// Task TVP-A1: dải pill liên hoàn + axis tag ghim trục phải.
// Sticky clamp khi giá ra ngoài viewport; projector null -> ẩn (không vẽ stale).
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { TradingPosition } from "../../../lib/core/trading/types";
import styles from "./TradingOverlays.module.css";

export interface OverlayBounds {
	top: number;
	bottom: number;
}

export interface AxisTagPlacement {
	left: number;
	width: number;
}

export interface InteractivePositionOverlayProps {
	position: TradingPosition;
	toY: (price: number) => number | null;
	bounds: OverlayBounds;
	axis?: AxisTagPlacement | null;
	disabled?: boolean;
	onClose?: () => void;
	onReverse?: () => void;
}

export function InteractivePositionOverlay({
	position,
	toY,
	bounds,
	axis = null,
	disabled = false,
	onClose,
	onReverse,
}: InteractivePositionOverlayProps) {
	const { t } = useWidgetI18n();
	const rawY = toY(position.entryPrice);
	if (rawY == null) return null;
	const clamped: "top" | "bottom" | null =
		rawY < bounds.top ? "top" : rawY > bounds.bottom ? "bottom" : null;
	const y = clamped === "top" ? bounds.top + 2 : clamped === "bottom" ? bounds.bottom - 22 : rawY;
	const longSide = position.side === "long";
	const pnl = position.unrealizedPnl;
	const pnlPercent = position.entryPrice !== 0 && position.quantity !== 0
		? (pnl / (Math.abs(position.entryPrice) * position.quantity)) * 100
		: 0;
	const sideLabel = longSide
		? t("widget.trading.long", { defaultValue: "Long" })
		: t("widget.trading.short", { defaultValue: "Short" });

	return (
		<div className={styles.layer} data-testid={`position-line-${position.id}`}>
			<div
				className={longSide ? styles.positionLineLong : styles.positionLineShort}
				style={{ top: y }}
			/>
			<div
				className={styles.pillStrip}
				style={{ left: 28, top: y }}
				data-testid={`position-badge-${position.id}`}
			>
				<span className={styles.pillChip}>
					{clamped === "top" ? "▲ " : clamped === "bottom" ? "▼ " : ""}
					{sideLabel} {position.quantity}
				</span>
				<span className={styles.pillChip}>{position.entryPrice.toLocaleString("en-US")}</span>
				<span className={styles.pillChip}>
					{pnl >= 0 ? "+" : ""}
					{Math.round(pnl).toLocaleString("en-US")} ({pnlPercent.toFixed(2)}%)
				</span>
				{onReverse && (
					<button
						type="button"
						className={styles.pillBtn}
						data-testid={`position-reverse-${position.id}`}
						disabled={disabled}
						title={t("widget.trading.reversePosition", { defaultValue: "Reverse position" })}
						onClick={(e) => {
							e.stopPropagation();
							onReverse();
						}}
					>
						⇄
					</button>
				)}
				{onClose && (
					<button
						type="button"
						className={styles.pillBtn}
						data-testid={`position-close-${position.id}`}
						disabled={disabled}
						title={t("widget.trading.closePosition", { defaultValue: "Close position" })}
						onClick={(e) => {
							e.stopPropagation();
							onClose();
						}}
					>
						✕
					</button>
				)}
			</div>
			{axis != null && (
				<div
					className={`${styles.axisTag} ${longSide ? styles.axisTagBuy : styles.axisTagSell}`}
					style={{ left: axis.left, top: y, maxWidth: axis.width }}
					data-testid={`position-axis-${position.id}`}
				>
					{position.entryPrice.toLocaleString("en-US")}
				</div>
			)}
		</div>
	);
}
