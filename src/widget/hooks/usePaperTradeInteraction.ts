import { useCallback } from "react";
import type { ReplayOrder, ReplayPosition } from "../../lib/core/replay/replayTradingTypes";

export interface UseReplayTradingLike {
	placeOrder: (order: Omit<ReplayOrder, "id" | "timestamp">) => void;
	closePosition: (positionId: string) => void;
	positions: ReplayPosition[];
}

export interface UsePaperTradeInteractionParams {
	replayTrading: UseReplayTradingLike;
	replayActive: boolean;
	/** Khi true, Alt+click luôn chọn start bar (ngay cả sau Stop khi replayActive=false). = replay toolbar đang mở. */
	replaySelectionEnabled?: boolean;
	/** R2.1 CutMode: click thường chọn start bar, paper-trade bị vô hiệu hóa. */
	isCutMode?: boolean;
	baseOnClick?: (payload: any, nativeEvent: any) => void;
	handleReplayStartBarSelect?: (date: Date | number) => void;
	resolveActiveTool?: () => string | null | undefined;
	defaultQty?: number;
	symbol?: string;
	feeRate?: number;
	sizingMode?: "fixed" | "percent";
	riskPercent?: number;
	initialEquity?: number;
}

export interface UsePaperTradeInteractionResult {
	wrappedOnClick: (payload: any, nativeEvent: any) => void;
}

function isCursorTool(activeTool: string | null | undefined): boolean {
	return (
		activeTool === undefined ||
		activeTool === null ||
		activeTool === "cursor" ||
		activeTool === "crosshair"
	);
}

function computeQuantity(
	currentPrice: number | undefined,
	params: { sizingMode?: "fixed" | "percent"; defaultQty: number; riskPercent: number; initialEquity: number },
): number {
	if (!currentPrice || currentPrice <= 0) return params.defaultQty;
	if (params.sizingMode === "percent") {
		const riskAmount = params.initialEquity * (params.riskPercent / 100);
		const qty = Math.floor(riskAmount / currentPrice);
		return qty >= 1 ? qty : params.defaultQty;
	}
	return params.defaultQty;
}

// H1 = Option A (Alt/Shift+click, không UI):
// - Alt+click  = chọn start bar (seek replay), giữ nguyên behavior gốc.
// - Shift+click = mở short; click thường = mở long.
// - click lại khi đã có vị thế = đóng vị thế (manual).
export function usePaperTradeInteraction(
	params: UsePaperTradeInteractionParams,
): UsePaperTradeInteractionResult {
	const {
		replayTrading,
		replayActive,
		replaySelectionEnabled,
		isCutMode,
		baseOnClick,
		handleReplayStartBarSelect,
		resolveActiveTool,
		defaultQty = 1,
		symbol,
		feeRate,
		sizingMode = "fixed",
		riskPercent = 1,
		initialEquity = 10000,
	} = params;

	const wrappedOnClick = useCallback(
		(payload: any, nativeEvent: any) => {
			const currentItem = payload?.currentItem;
			const altKey = Boolean(nativeEvent?.altKey) || Boolean(payload?.altKey);
			const shiftKey = Boolean(nativeEvent?.shiftKey) || Boolean(payload?.shiftKey);
			const activeTool = resolveActiveTool?.();
			const cursor = isCursorTool(activeTool);

			// R2.1 CutMode: click thường chọn start bar (không cần Alt).
			// Paper trading bị vô hiệu hóa hoàn toàn trong lúc chọn điểm cắt.
			if (isCutMode && cursor && currentItem?.date !== undefined) {
				handleReplayStartBarSelect?.(currentItem.date);
				return;
			}

			// Alt+click = chọn start bar (seek replay), giữ behavior gốc.
			// Cho phép chọn ngay cả sau Stop (replayActive=false) miễn là replay toolbar đang mở.
			if ((replayActive || replaySelectionEnabled) && altKey && cursor && currentItem?.date !== undefined) {
				handleReplayStartBarSelect?.(currentItem.date);
				return;
			}

			// Chỉ xử lý paper-trade khi replay đang active + cursor tool + có candle hợp lệ.
			if (replayActive && cursor && currentItem?.date !== undefined && !altKey) {
				const openPos = replayTrading.positions.find((p) => p.quantity > 0);
				if (openPos) {
					replayTrading.closePosition(openPos.id);
				} else {
					const side: "buy" | "sell" = shiftKey ? "sell" : "buy";
					// H4: tính quantity từ equity nếu sizingMode = percent
					const currentPrice = currentItem.close;
					const quantity = computeQuantity(currentPrice, {
						sizingMode,
						defaultQty,
						riskPercent,
						initialEquity,
					});
					replayTrading.placeOrder({
						type: "market",
						side,
						quantity,
						symbol,
						feeRate,
					});
				}
				return;
			}

			baseOnClick?.(payload, nativeEvent);
		},
		[
			replayTrading,
			replayActive,
			replaySelectionEnabled,
			isCutMode,
			baseOnClick,
			handleReplayStartBarSelect,
			resolveActiveTool,
			defaultQty,
			symbol,
			feeRate,
			sizingMode,
			riskPercent,
			initialEquity,
		],
	);

	return { wrappedOnClick };
}
