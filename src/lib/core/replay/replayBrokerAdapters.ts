// Task 11: mappers broker mới <-> shapes legacy (positions/trades/orders).
// Strangler: legacy shapes giữ nguyên cho consumers (markers, panel, interaction);
// ruột tính toán chạy bằng VirtualBrokerEngine. Test trực tiếp tại __tests__.
import { VN_SPOT_RULES, type MarketRules } from "../trading/MarketRules";
import type {
	ExecutionTicket,
	OrderValidationInput,
	PositionSide,
	TradingPosition,
} from "../trading/types";
import type {
	ReplayExecutedTrade,
	ReplayOHLCBar,
	ReplayOrder,
	ReplayPosition,
} from "./replayTradingTypes";

/**
 * Replay mô phỏng chiến thuật, không mô phỏng thanh toán T+2: nếu giữ
 * settlementDays = 2, TP khớp nến kế tiếp bị throw (available 0) — regression
 * nặng so với legacy (đóng ngay). Override có chủ đích, khóa bằng test.
 */
export const REPLAY_SPOT_RULES: MarketRules = {
	...VN_SPOT_RULES,
	profile: "VN_SPOT",
	settlementDays: 0,
	// Replay sandbox mô phỏng chiến thuật cả 2 chiều (legacy cho short tự do).
	// Live vẫn cấm short qua VN_SPOT gốc.
	allowShortSelling: true,
};

export interface ReplayEntryInfo {
	entryPrice: number;
	entryTimestamp: number;
	entryBarIndex: number;
}

export function mapPositionToReplay(
	position: TradingPosition,
	opts: {
		mark: number;
		contractMultiplier?: number;
		stopLoss?: number;
		takeProfit?: number;
		entryBarIndex?: number;
	},
): ReplayPosition {
	const mult = opts.contractMultiplier ?? 1;
	const dir = position.side === "long" ? 1 : -1;
	return {
		id: position.id,
		side: position.side,
		entryPrice: position.entryPrice,
		quantity: position.quantity,
		currentPrice: opts.mark,
		unrealizedPnl: (opts.mark - position.entryPrice) * dir * position.quantity * mult,
		realizedPnl: position.realizedPnl,
		stopLoss: opts.stopLoss,
		takeProfit: opts.takeProfit,
		entryTimestamp: position.createdAt,
		entryBarIndex: opts.entryBarIndex ?? 0,
		symbol: position.symbol,
	};
}

function mapExitReason(reason: ExecutionTicket["exitReason"]): ReplayExecutedTrade["exitReason"] {
	switch (reason) {
		case "tp":
			return "tp";
		case "sl":
		case "trailing_stop":
			return "sl";
		case "session_end":
			return "session-end";
		default:
			return "manual";
	}
}

export function mapTicketToReplayTrade(
	ticket: ExecutionTicket,
	entry: ReplayEntryInfo & { positionSide: PositionSide },
	exitBarIndex: number,
): ReplayExecutedTrade {
	const dir = entry.positionSide === "long" ? 1 : -1;
	return {
		id: `${ticket.orderId}:x${exitBarIndex}`,
		orderId: ticket.orderId,
		symbol: ticket.symbol,
		side: entry.positionSide === "long" ? "buy" : "sell",
		type: "market",
		entryPrice: entry.entryPrice,
		exitPrice: ticket.fillPrice,
		quantity: ticket.fillQuantity,
		pnl: ticket.pnl,
		pnlPercent: entry.entryPrice !== 0 ? ((ticket.fillPrice - entry.entryPrice) / entry.entryPrice) * dir * 100 : 0,
		entryTimestamp: entry.entryTimestamp,
		exitTimestamp: ticket.timestamp,
		entryBarIndex: entry.entryBarIndex,
		exitBarIndex,
		barsHeld: Math.max(0, exitBarIndex - entry.entryBarIndex),
		exitReason: mapExitReason(ticket.exitReason),
	};
}

export interface PreBatchPosition {
	id: string;
	symbol: string;
	side: "long" | "short";
	quantity: number;
}

export interface CloseLegMatch {
	closeQuantity: number;
	entry: ReplayEntryInfo & { positionSide: "long" | "short" };
}

/**
 * Một fill chỉ sinh journal khi nó ĐÓNG (toàn phần/bộ phận) vị thế đối ứng
 * tồn tại trước batch. Fill mở vị thế -> null (legacy journal chỉ ghi closes).
 * Reversal: close leg tách theo min(fillQty, preQty), phần dôi mở mới không ghi journal.
 */
export function matchCloseLeg(
	ticket: { symbol: string; side: "buy" | "sell"; fillQuantity: number; fillPrice: number; timestamp: number },
	preBatch: PreBatchPosition[] | null,
	ledger: Map<string, ReplayEntryInfo>,
	fallbackBarIndex: number,
): CloseLegMatch | null {
	const opp = preBatch?.find((p) => p.symbol === ticket.symbol && ((p.side === "long") === (ticket.side === "sell")));
	if (!opp) return null;
	const stored = ledger.get(opp.id);
	return {
		closeQuantity: Math.min(ticket.fillQuantity, opp.quantity),
		entry: {
			...(stored ?? { entryPrice: ticket.fillPrice, entryTimestamp: ticket.timestamp, entryBarIndex: fallbackBarIndex }),
			positionSide: opp.side,
		},
	};
}

/** ReplayOrder legacy -> broker input. reduceOnly/clamp do hook xử lý (cần net position). */
export function mapReplayOrderToBrokerInput(order: Omit<ReplayOrder, "id" | "timestamp">): OrderValidationInput {
	return {
		symbol: order.symbol ?? "",
		side: order.side,
		type: order.type,
		quantity: order.quantity,
		price: order.price,
		stopPrice: order.stopPrice,
		timeInForce: "GTC",
	};
}

export function replayBarTimestamp(bar: ReplayOHLCBar, fallback: number): number {
	return typeof bar.date === "number" ? bar.date : fallback;
}
