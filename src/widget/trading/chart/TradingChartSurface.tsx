// Task 10: TradingChartSurface — compound container: header + overlays + ticket +
// hotkeys + confirm. Mount 1 dòng trong chart (fragment, không tạo stacking mới).
import type { PaneRuntimeSnapshot, VisibleRange as EngineVisibleRange } from "@vninvestcharts/engine-react";
import { resolveForkChartConfigScaleSlotId } from "../../utils/widgetHelpers";
import { useTradingContext } from "../context/TradingContext";
import { QuickTradingHeader } from "./QuickTradingHeader";
import { TradingOverlaysHost, bracketChildFor, isBracketChild, type PositionLineModel } from "./TradingOverlaysHost";
import { OrderTicketModal } from "../ticket/OrderTicketModal";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useRef, type CSSProperties } from "react";
import { useTradingHotkeys } from "./useTradingHotkeys";
import { useFloatingDrag, useHoldDrag } from "./useFloatingDrag";
import { useWidgetI18n } from "../../context/WidgetI18nContext";

export interface TradingChartSurfaceProps {
	snapshot?: PaneRuntimeSnapshot | null;
	visibleRange?: EngineVisibleRange | null;
	scaleSlotId?: string;
	drawingActive?: boolean;
	/** B5: hide the pending order lines (and the stop loss / take profit handles). */
	showPaperOrders?: boolean;
	/** B5: hide the position lines. */
	showPaperPositions?: boolean;
}

function SurfaceHotkeys() {
	const trading = useTradingContext();
	useTradingHotkeys({
		onBuy: () => trading.openTicket("buy"),
		onSell: () => trading.openTicket("sell"),
		onCloseRequest: () => trading.requestClose(),
		enabled: trading.tradingEnabled && trading.isActiveChart,
	});
	return null;
}

/**
 * UI-AUDIT: right-anchor support. A negative x docks from the right edge
 * (clears legend/OHLC top-left and the price axis top-right).
 * QUICKTRADE_PILLS A6: negative y docks from the BOTTOM edge (corner mode).
 */
function headerPosStyle(pos: { x: number; y: number }): CSSProperties {
	const base: CSSProperties = {
		position: "absolute",
		zIndex: 45,
		pointerEvents: "auto",
		display: "flex",
		alignItems: "center",
		// Bấm-giữ ở bất kỳ đâu trên thanh để kéo (bỏ grip ⠿).
		cursor: "grab",
		touchAction: "none",
		userSelect: "none",
	};
	if (pos.x < 0) {
		base.right = -pos.x;
	} else {
		base.left = pos.x;
	}
	if (pos.y < 0) {
		base.bottom = -pos.y;
	} else {
		base.top = pos.y;
	}
	return base;
}

const HEADER_STORAGE_KEY = "vnsc.paperHeader.pos";
// QUICKTRADE_PILLS A6: default docks bottom-right corner (was top-right) — strip TV-style
// nhỏ nằm dưới, tránh che legend/OHLC và vùng giá gần nhất. Negative x = right-anchored,
// negative y = bottom-anchored. Stored user positions are respected; double-click resets.
const HEADER_DEFAULT_POS = { x: -72, y: -40 };

export function TradingChartSurface({
	snapshot,
	visibleRange,
	scaleSlotId,
	drawingActive = false,
	showPaperOrders = true,
	showPaperPositions = true,
}: TradingChartSurfaceProps) {
	const trading = useTradingContext();
	const { t } = useWidgetI18n();
	const wrapRef = useRef<HTMLDivElement>(null);
	const headerDrag = useHoldDrag({
		storageKey: HEADER_STORAGE_KEY,
		defaultPos: HEADER_DEFAULT_POS,
		getBounds: () => {
			const host = wrapRef.current?.offsetParent as HTMLElement | null;
			return { width: host?.clientWidth ?? 0, height: host?.clientHeight ?? 0 };
		},
		// Clamp vị trí đã lưu ngay khi mount — nếu không, một vị trí lưu từ màn rộng hơn
		// đẩy panel ra ngoài màn hình, grip biến mất và người dùng không kéo lại được.
		getElement: () => wrapRef.current,
	});

	/**
	 * Bấm-giữ ở BẤT KỲ đâu trên thanh để kéo. Không cần grip ⠿.
	 * `useHoldDrag` chỉ chiếm pointer sau khi chuột đi quá ngưỡng, nên bấm vào nút bên
	 * trong vẫn là click bình thường (xem bug nút expand chết ở commit trước).
	 */
	const surfaceDragProps = {
		onPointerDown: headerDrag.onSurfacePointerDown,
		onDoubleClick: headerDrag.onSurfaceDoubleClick,
	};
	// Paper trading off: keep a slim re-enable chip instead of unmounting
	// everything (otherwise the user can never toggle back on from the chart).
	if (!trading.tradingEnabled) {
		return (
			<div
				ref={wrapRef}
				data-testid="paper-header-surface"
				style={headerPosStyle(headerDrag.pos)}
				{...surfaceDragProps}
			>
				<button
					type="button"
					data-testid="paper-visibility-toggle"
					aria-pressed={false}
					onClick={() => trading.setTradingEnabled(true)}
					title={t("widget.trading.showPaperTrading", { defaultValue: "Show paper trading" })}
					style={{ cursor: "pointer", opacity: 0.6, padding: "0 4px", background: "transparent", border: "none", color: "inherit", fontSize: 14 }}
				>
					🚫
				</button>
			</div>
		);
	}
	const quote = trading.port.getLatestQuote(trading.symbol) ?? null;
	const slotId = scaleSlotId ?? (snapshot ? resolveForkChartConfigScaleSlotId(snapshot) : null);
	const showOverlays = snapshot != null && visibleRange != null && slotId != null;

	// Task M3: lọc theo symbol của chart — shared broker giữ vị thế nhiều mã,
	// chart nào chỉ vẽ mã đó (chống rò overlay chéo mã).
	const working = trading.broker.getOrders().filter((o) => o.status === "working" && o.symbol === trading.symbol);
	// B5: `showPaperPositions` tắt line vị thế; `showPaperOrders` tắt line lệnh
	// chờ **và** handle SL/TP (handle được vẽ từ chính model của vị thế).
	const models: PositionLineModel[] = showPaperPositions
		? trading.broker
			.getPositions()
			.filter((position) => position.symbol === trading.symbol)
			.map((position) => {
				const sl = bracketChildFor(position, working, (o) => o.type === "stop" || o.type === "trailing_stop");
				const tp = bracketChildFor(position, working, (o) => o.type === "limit");
				return {
					position,
					stopLossPrice: showPaperOrders ? sl?.stopPrice : undefined,
					stopOrderId: showPaperOrders ? sl?.id : undefined,
					takeProfitPrice: showPaperOrders ? tp?.price : undefined,
					takeProfitOrderId: showPaperOrders ? tp?.id : undefined,
				};
			})
		: [];
	const bracketIds = new Set(models.flatMap((model) => [model.stopOrderId, model.takeProfitOrderId].filter(Boolean)));
	const pendings = showPaperOrders
		? working.filter(
			(o) =>
				(o.type === "limit" || o.type === "stop" || o.type === "trailing_stop") &&
					!isBracketChild(o) &&
					!bracketIds.has(o.id),
		)
		: [];
	const account = trading.broker.getAccount();
	const mark = quote?.lastPrice;
	const editing = trading.editTarget;
	const ticketAccount = { equity: account.equity, freeMargin: account.freeMargin, buyingPower: account.buyingPower };

	return (
		<>
			<div
				ref={wrapRef}
				data-testid="paper-header-surface"
				style={headerPosStyle(headerDrag.pos)}
				{...surfaceDragProps}
				title={`${t("widget.trading.dragToMove", { defaultValue: "Drag to move" })} • ${t("widget.trading.resetPosition", { defaultValue: "Double-click to reset position" })}`}
			>
				<QuickTradingHeader
					symbol={trading.symbol}
					quote={quote}
					defaultOneClick={trading.oneClickTrading}
					lotSize={trading.rules.lotSize}
					maxQuantity={trading.rules.maxOrderQuantity}
					spreadUnit={trading.rules.baseCurrency === "VND" ? "đ" : "pts"}
					onBuy={(quantity) => trading.placeOrder({ symbol: trading.symbol, side: "buy", type: "market", quantity })}
					onSell={(quantity) => trading.placeOrder({ symbol: trading.symbol, side: "sell", type: "market", quantity })}
					onOpenTicket={(side, qty) => trading.openTicket(side, undefined, qty)}
					tradingEnabled={trading.tradingEnabled}
					onToggleTradingEnabled={(enabled) => trading.setTradingEnabled(enabled)}
				/>
			</div>
			{showOverlays && (
				<TradingOverlaysHost
					snapshot={snapshot}
					visibleRange={visibleRange}
					scaleSlotId={slotId}
					positions={models}
					pendingOrders={pendings}
					accountEquity={account.equity}
					tickSize={trading.rules.getTickSize(mark ?? 0)}
					drawingActive={drawingActive}
					onClosePosition={(id) => trading.panelProps.onClosePosition(id)}
					onReversePosition={(id) => trading.panelProps.onReversePosition(id)}
					onModifyOrder={(id, patch) => trading.broker.modifyOrder(id, patch)}
					onCancelOrder={(id) => trading.broker.cancelOrder(id)}
				/>
			)}
			<OrderTicketModal
				open={trading.ticket.open || editing != null}
				side={trading.ticket.side}
				symbol={trading.symbol}
				lastPrice={mark ?? 0}
				rules={trading.rules}
				account={ticketAccount}
				initialQuantity={trading.ticket.open ? trading.ticket.quantity : undefined}
				initialValues={editing ? { price: editing.price, stopPrice: editing.stopPrice } : undefined}
				editOrderId={editing?.orderId}
				onClose={() => {
					trading.cancelEdit();
					trading.closeTicket();
				}}
				onSubmit={(order) => {
					const placed = trading.placeOrder(order);
					if (placed.status === "rejected") return;
					trading.closeTicket();
				}}
				onModify={(orderId, patch) => {
					trading.broker.modifyOrder(orderId, patch);
					trading.cancelEdit();
				}}
			/>
			<ConfirmDialog
				open={trading.closeRequested && !trading.oneKeyClose}
				title={t("widget.trading.confirmCloseTitle", { defaultValue: "Quick close position" })}
				message={t("widget.trading.confirmCloseMessage", {
					defaultValue: "Close {quantity} {symbol} at market?",
					quantity: trading.broker.getPositions().filter((p) => p.symbol === trading.symbol).length,
					symbol: trading.symbol,
				})}
				confirmLabel={t("widget.trading.confirm", { defaultValue: "Confirm" })}
				cancelLabel={t("widget.trading.cancel", { defaultValue: "Cancel" })}
				variant="danger"
				onConfirm={() => trading.confirmCloseAll()}
				onCancel={() => trading.cancelCloseRequest()}
			/>
			<SurfaceHotkeys />
		</>
	);
}
