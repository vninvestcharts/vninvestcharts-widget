// Task 08: handle kéo thả SL/TP + tooltip 4 thông số + snap theo tick.
// Guard setPointerCapture cho jsdom (không có PointerCapture API).
import { useRef, useState } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { roundToTick } from "./priceTicks";
import type { OverlayBounds } from "./InteractivePositionOverlay";
import styles from "./TradingOverlays.module.css";

export interface DraggableOrderHandlesProps {
	kind: "SL" | "TP";
	price: number;
	baseQuantity: number;
	contractMultiplier?: number;
	accountEquity: number;
	toY: (price: number) => number | null;
	toPrice: (pixelY: number) => number | null;
	bounds: OverlayBounds;
	tickSize: number;
	disabled?: boolean;
	onCommit?: (nextPrice: number) => void;
}

export function DraggableOrderHandles({
	kind,
	price,
	baseQuantity,
	contractMultiplier = 1,
	accountEquity,
	toY,
	toPrice,
	bounds,
	tickSize,
	disabled = false,
	onCommit,
}: DraggableOrderHandlesProps) {
	const { t } = useWidgetI18n();
	const [dragPrice, setDragPrice] = useState<number | null>(null);
	const draggingRef = useRef(false);
	const shown = dragPrice ?? price;
	const shownY = toY(shown);
	if (shownY == null) return null;
	const clampedY = Math.min(bounds.bottom - 12, Math.max(bounds.top, shownY));
	const delta = shown - price;
	const ticks = tickSize > 0 ? Math.round(delta / tickSize) : 0;
	const money = delta * baseQuantity * contractMultiplier;
	const riskPercent = accountEquity > 0 ? (Math.abs(money) / accountEquity) * 100 : 0;

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (disabled) return;
		e.stopPropagation();
		e.preventDefault();
		e.currentTarget.setPointerCapture?.(e.pointerId);
		draggingRef.current = true;
		setDragPrice(price);
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!draggingRef.current || disabled) return;
		const raw = toPrice(e.clientY);
		if (raw == null) return;
		setDragPrice(roundToTick(raw, tickSize));
	};

	const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!draggingRef.current) return;
		draggingRef.current = false;
		try {
			if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
				e.currentTarget.releasePointerCapture(e.pointerId);
			}
		} catch {
			// jsdom / trình duyệt cũ: bỏ qua capture release.
		}
		const committed = dragPrice;
		setDragPrice(null);
		if (committed != null && committed !== price) onCommit?.(committed);
	};

	return (
		<div className={styles.layer} data-testid={`handle-${kind}`}>
			<div className={styles.dashedLine} style={{ top: clampedY }} />
			<div
				className={disabled ? `${styles.handle} ${styles.disabled}` : styles.handle}
				style={{ top: clampedY }}
				data-testid={`handle-grip-${kind}`}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
			>
				● {kind}
			</div>
			{dragPrice != null && (
				<div className={styles.tooltip} style={{ top: clampedY }} data-testid={`handle-tooltip-${kind}`}>
					<div>
						{t("widget.trading.newPrice", { defaultValue: "New price" })}: {shown.toLocaleString("en-US")}
					</div>
					<div>
						{ticks >= 0 ? "+" : ""}
						{ticks} ticks
					</div>
					<div>
						{money >= 0 ? "+" : ""}
						{Math.round(money).toLocaleString("en-US")}
					</div>
					<div>{riskPercent.toFixed(2)}%</div>
				</div>
			)}
		</div>
	);
}
