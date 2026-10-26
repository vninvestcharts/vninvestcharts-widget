// Task 08: TradingOverlaysHost — container HTML phủ Price Pane cho trading.
// Dùng pixelYToValue CÓ SẴN của engine (không sửa engine). Container tách lớp
// DOM khỏi canvas (pointer-events none) + stacking context riêng (isolation).
import { useMemo, useRef } from "react";
import {
	createPaneProjector,
	type PaneRuntimeSnapshot,
	type VisibleRange as EngineVisibleRange,
} from "@vninvestcharts/engine-core";
import type { TradingOrder, TradingPosition } from "../../../lib/core/trading/types";
import { InteractivePositionOverlay } from "./InteractivePositionOverlay";
import { DraggableOrderHandles } from "./DraggableOrderHandles";
import { PendingOrderOverlay } from "./PendingOrderOverlay";
import styles from "./TradingOverlays.module.css";

export interface PositionLineModel {
	position: TradingPosition;
	stopLossPrice?: number;
	stopOrderId?: string;
	takeProfitPrice?: number;
	takeProfitOrderId?: string;
}

export function isBracketChild(order: TradingOrder): boolean {
	return order.parentOrderId != null;
}

export function bracketChildFor(
	position: TradingPosition,
	orders: TradingOrder[],
	matches: (order: TradingOrder) => boolean,
): TradingOrder | undefined {
	const exitSide = position.side === "long" ? "sell" : "buy";
	return orders.find((order) => isBracketChild(order) && order.side === exitSide && matches(order));
}

export interface TradingOverlaysHostProps {
	snapshot: PaneRuntimeSnapshot;
	visibleRange: EngineVisibleRange;
	scaleSlotId: string;
	scale?: Parameters<typeof createPaneProjector>[3];
	positions: PositionLineModel[];
	pendingOrders: TradingOrder[];
	accountEquity: number;
	contractMultiplier?: number;
	tickSize: number;
	drawingActive?: boolean;
	onClosePosition?: (positionId: string) => void;
	onReversePosition?: (positionId: string) => void;
	onModifyOrder?: (orderId: string, patch: { price?: number; stopPrice?: number }) => void;
	onCancelOrder?: (orderId: string) => void;
}

export function TradingOverlaysHost({
	snapshot,
	visibleRange,
	scaleSlotId,
	scale,
	positions,
	pendingOrders,
	accountEquity,
	contractMultiplier = 1,
	tickSize,
	drawingActive = false,
	onClosePosition,
	onReversePosition,
	onModifyOrder,
	onCancelOrder,
}: TradingOverlaysHostProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const projector = useMemo(
		() => createPaneProjector(snapshot, visibleRange, scaleSlotId, scale),
		[snapshot, visibleRange, scaleSlotId, scale],
	);
	const bounds = useMemo(() => {
		const { top, height } = snapshot.plotBounds;
		return { top, bottom: top + height };
	}, [snapshot]);
	const toY = useMemo(() => {
		return (price: number): number | null => projector.valueToPixelY(price);
	}, [projector]);
	const toPrice = useMemo(() => {
		return (pixelY: number): number | null => {
			const top = hostRef.current?.getBoundingClientRect().top ?? 0;
			return projector.pixelYToValue(pixelY - top);
		};
	}, [projector]);
	// TVP-A1: vị trí axis tag — đọc snapshot.axisBounds.right, fallback mép pane.
	const axis = useMemo(() => {
		const right = snapshot.axisBounds?.right;
		if (right) return { left: right.left, width: right.width };
		return { left: snapshot.plotBounds.width, width: 48 };
	}, [snapshot]);

	return (
		<div ref={hostRef} className={styles.host} data-testid="trading-overlays-host">
			{positions.map(({ position, stopLossPrice, stopOrderId, takeProfitPrice, takeProfitOrderId }) => (
				<div key={position.id}>
					<InteractivePositionOverlay
						position={position}
						toY={toY}
						bounds={bounds}
						axis={axis}
						disabled={drawingActive}
						onClose={onClosePosition ? () => onClosePosition(position.id) : undefined}
						onReverse={onReversePosition ? () => onReversePosition(position.id) : undefined}
					/>
					<BracketConnector
						entryPrice={position.entryPrice}
						targetPrice={stopLossPrice}
						toY={toY}
						bounds={bounds}
						color="#f87171"
						testId={`bracket-sl-${position.id}`}
					/>
					<BracketConnector
						entryPrice={position.entryPrice}
						targetPrice={takeProfitPrice}
						toY={toY}
						bounds={bounds}
						color="#34d399"
						testId={`bracket-tp-${position.id}`}
					/>
					{stopLossPrice != null && stopOrderId != null && (
						<DraggableOrderHandles
							kind="SL"
							price={stopLossPrice}
							baseQuantity={position.quantity}
							contractMultiplier={contractMultiplier}
							accountEquity={accountEquity}
							toY={toY}
							toPrice={toPrice}
							bounds={bounds}
							tickSize={tickSize}
							disabled={drawingActive}
							onCommit={onModifyOrder ? (next) => onModifyOrder(stopOrderId, { stopPrice: next }) : undefined}
						/>
					)}
					{takeProfitPrice != null && takeProfitOrderId != null && (
						<DraggableOrderHandles
							kind="TP"
							price={takeProfitPrice}
							baseQuantity={position.quantity}
							contractMultiplier={contractMultiplier}
							accountEquity={accountEquity}
							toY={toY}
							toPrice={toPrice}
							bounds={bounds}
							tickSize={tickSize}
							disabled={drawingActive}
							onCommit={onModifyOrder ? (next) => onModifyOrder(takeProfitOrderId, { price: next }) : undefined}
						/>
					)}
				</div>
			))}
			{pendingOrders.map((order) => (
				<PendingOrderOverlay
					key={order.id}
					order={order}
					toY={toY}
					bounds={bounds}
					axis={axis}
					disabled={drawingActive}
					onCancel={onCancelOrder ? () => onCancelOrder(order.id) : undefined}
				/>
			))}
		</div>
	);
}

function BracketConnector({
	entryPrice,
	targetPrice,
	toY,
	bounds,
	color,
	testId,
}: {
	entryPrice: number;
	targetPrice?: number;
	toY: (price: number) => number | null;
	bounds: { top: number; bottom: number };
	color: string;
	testId: string;
}) {
	if (targetPrice == null) return null;
	const yEntry = toY(entryPrice);
	const yTarget = toY(targetPrice);
	if (yEntry == null || yTarget == null) return null;
	const top = Math.max(bounds.top, Math.min(yEntry, yTarget));
	const bottom = Math.min(bounds.bottom, Math.max(yEntry, yTarget));
	if (bottom <= top) return null;
	return (
		<div
			className={styles.bracketConnector}
			style={{ right: 32, top, height: bottom - top, borderColor: color }}
			data-testid={testId}
		/>
	);
}
