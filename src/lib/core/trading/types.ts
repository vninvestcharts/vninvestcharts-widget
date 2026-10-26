// Task 01: Core domain types — SSOT cho OMS/PMS/Risk/Execution/UI.
// Phase A: TIF GTC + market/limit/stop (+trailing). P1.2b: DAY/IOC/FOK có
// hiệu lực (DAY hết hạn qua ngày UTC, IOC/FOK đánh ngay-hủy-phần-còn-lại;
// engine khớp full-or-nothing nên IOC≡FOK hành vi — đã khóa bằng test).
// stop_limit, partial-fill vẫn Phase B (giữ contract, OMS reject kèm mã lỗi).
export type OrderSide = "buy" | "sell";
export type OrderType =
	| "market"
	| "limit"
	| "stop"
	| "stop_limit"
	| "trailing_stop"
	/** P1.2c VN: ATO/ATC (khớp giá mở/đóng phiên), MP/MTL (market khớp ngay). */
	| "ato"
	| "atc"
	| "mp"
	| "mtl"
	/** PLO (Post Limit Order) — khớp lệnh dư chuyển LO phiên sau (đơn giản hóa: LO). */
	| "plo";
export type OrderStatus =
	| "pending"
	| "working"
	| "filled"
	| "partially_filled"
	| "cancelled"
	| "rejected"
	| "expired";
export type TimeInForce = "GTC" | "DAY" | "IOC" | "FOK";
export type PositionSide = "long" | "short";
export type ExitReason = "tp" | "sl" | "trailing_stop" | "manual" | "liquidation" | "session_end";

export type OrderRejectCode =
	| "UNSUPPORTED_TIF"
	| "UNSUPPORTED_ORDER_TYPE"
	| "INSUFFICIENT_BUYING_POWER"
	| "INVALID_QUANTITY"
	| "INVALID_PRICE"
	| "SHORT_NOT_ALLOWED"
	| "PRICE_OUT_OF_BAND";

export interface BracketOrderSpec {
	takeProfitPrice?: number;
	stopLossPrice?: number;
	trailingStopDeltaTicks?: number;
}

export interface TradingOrder {
	id: string;
	clientOrderId: string;
	symbol: string;
	side: OrderSide;
	type: OrderType;
	status: OrderStatus;
	quantity: number;
	filledQuantity: number;
	price?: number;
	stopPrice?: number;
	bracket?: BracketOrderSpec;
	timeInForce: TimeInForce;
	/**
	 * P1.2b: ngày UTC (yyyy-mm-dd) của nến đầu tiên xử lý lệnh DAY — lười gán
	 * tại processBar đầu tiên để deterministic trong test và đúng phiên
	 * VN (phiên không bao giờ cắt nửa đêm UTC). null = chưa gặp nến nào.
	 */
	dayKey?: string | null;
	parentOrderId?: string;
	rejectCode?: OrderRejectCode;
	createdAt: number;
	updatedAt: number;
}

export interface TradingPosition {
	id: string;
	symbol: string;
	side: PositionSide;
	quantity: number;
	availableQuantity: number;
	entryPrice: number;
	currentPrice: number;
	unrealizedPnl: number;
	realizedPnl: number;
	/**
	 * S5: commission + tax charged when this position was opened.
	 *
	 * Those fees left cash at entry time, so they belong to the round trip that closes
	 * here. Without them a "net P&L" per trade is short by the entry fee while the cash
	 * total has already paid it - the two never reconcile. Pro-rated on a partial close.
	 */
	entryFees?: number;
	settlementDate?: number;
	liquidationPrice?: number;
	createdAt: number;
	updatedAt: number;
}

export interface ExecutionTicket {
	orderId: string;
	symbol: string;
	side: OrderSide;
	fillPrice: number;
	fillQuantity: number;
	commission: number;
	tax: number;
	pnl: number;
	exitReason?: ExitReason;
	timestamp: number;
	ambiguousIntrabarFill?: boolean;
	tieBreakReason?: string;
}

export interface BrokerAccount {
	accountId: string;
	balance: number;
	equity: number;
	marginUsed: number;
	freeMargin: number;
	buyingPower: number;
	currency: string;
	pnl: number;
	pnlPercent: number;
}

export interface OrderValidationInput {
	symbol: string;
	side: OrderSide;
	type: OrderType;
	quantity: number;
	price?: number;
	stopPrice?: number;
	bracket?: BracketOrderSpec;
	timeInForce?: TimeInForce;
	isClosingPosition?: boolean;
}
