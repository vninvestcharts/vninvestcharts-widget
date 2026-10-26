// Task TVP-B1: pure ticket logic dùng chung cho Modal + Dock Panel.
// Không React, không DOM — test đơn vị trực tiếp, tránh drift logic đặt lệnh.
import type { MarketRules } from "../../../lib/core/trading/MarketRules";
import { RiskEngine } from "../../../lib/core/trading/RiskEngine";
import type {
	OrderSide,
	OrderType,
	OrderValidationInput,
	TimeInForce,
	TradingPosition,
} from "../../../lib/core/trading/types";

export interface TicketAccountPreview {
	equity: number;
	freeMargin: number;
	buyingPower: number;
	baseCurrency: string;
}

const previewRiskEngine = new RiskEngine();

export interface TicketValidation {
	ruleOk: boolean;
	ruleReason?: string;
	riskOk: boolean;
	riskReason?: string;
	requiredMargin?: number;
}

/** Validate dùng chung Modal + Dock (Dock tự render text lỗi theo ngôn ngữ của nó). */
export function validateCandidate(
	candidate: OrderValidationInput,
	rules: MarketRules,
	account: TicketAccountPreview,
	markPrice: number,
	currentPosition?: TradingPosition | null,
): TicketValidation {
	const ruleCheck = rules.validateOrder(candidate);
	if (!ruleCheck.valid) {
		return { ruleOk: false, ruleReason: ruleCheck.reason, riskOk: true };
	}
	const riskCheck = previewRiskEngine.validateOrderRisk(
		candidate,
		{
			accountId: "preview",
			balance: account.equity,
			equity: account.equity,
			marginUsed: Math.max(0, account.equity - account.freeMargin),
			freeMargin: account.freeMargin,
			buyingPower: account.buyingPower,
			currency: account.baseCurrency,
			pnl: 0,
			pnlPercent: 0,
		},
		rules,
		markPrice,
		currentPosition ?? undefined,
	);
	if (!riskCheck.valid) {
		return { ruleOk: true, riskOk: false, riskReason: riskCheck.reason, requiredMargin: riskCheck.requiredMargin };
	}
	return { ruleOk: true, riskOk: true, requiredMargin: riskCheck.requiredMargin };
}

export function parseNumber(text: string): number | undefined {
	const stripped = text.replace(/[^0-9.]/g, "");
	if (stripped === "") return undefined;
	const value = Number(stripped);
	return !Number.isFinite(value) ? undefined : value;
}

export interface TicketDraft {
	symbol: string;
	side: OrderSide;
	type: OrderType;
	quantity: number;
	limitPrice?: number;
	stopPrice?: number;
	takeProfitPrice?: number;
	stopLossPrice?: number;
	trailingStopDeltaTicks?: number;
	/** P1.2b: TIF do user chọn (default GTC giữ nguyên mọi callsite cũ). */
	timeInForce?: TimeInForce;
}

export interface BuiltCandidate {
	candidate: OrderValidationInput;
	entryPrice?: number;
}

export function buildCandidate(draft: TicketDraft): BuiltCandidate {
	const candidate: OrderValidationInput = {
		symbol: draft.symbol,
		side: draft.side,
		type: draft.type,
		quantity: draft.quantity,
		price: draft.type === "limit" || draft.type === "plo" ? draft.limitPrice : undefined,
		stopPrice: draft.type === "stop" || draft.type === "trailing_stop" ? draft.stopPrice : undefined,
		bracket:
			draft.takeProfitPrice != null || draft.stopLossPrice != null || draft.trailingStopDeltaTicks != null
				? {
					takeProfitPrice: draft.takeProfitPrice,
					stopLossPrice: draft.stopLossPrice,
					trailingStopDeltaTicks: draft.trailingStopDeltaTicks,
				}
				: undefined,
		timeInForce: draft.timeInForce ?? "GTC",
	};
	return {
		candidate,
		entryPrice: draft.limitPrice ?? draft.stopPrice,
	};
}

/** Quy offset ticks về giá tuyệt đối theo hướng lệnh (mua: ask + n; bán: bid - n). */
export function offsetTicksToPrice(markPrice: number, side: OrderSide, offsetTicks: number, tickSize: number): number {
	if (!Number.isFinite(markPrice) || !Number.isFinite(offsetTicks) || !(tickSize > 0)) return markPrice;
	const raw = side === "buy" ? markPrice + offsetTicks * tickSize : markPrice - offsetTicks * tickSize;
	return Math.round(raw / tickSize) * tickSize;
}

/** Đổi % equity rủi ro ra khoảng giá SL: pct% * equity / (qty * multiplier). */
export function riskPercentToDistance(equityPercent: number, accountEquity: number, quantity: number, contractMultiplier: number): number | undefined {
	if (!Number.isFinite(equityPercent) || equityPercent <= 0) return undefined;
	if (!(accountEquity > 0) || !(quantity > 0) || !(contractMultiplier > 0)) return undefined;
	return ((equityPercent / 100) * accountEquity) / (quantity * contractMultiplier);
}

const TYPE_LABELS: Record<OrderType, string> = {
	market: "MARKET",
	limit: "LIMIT",
	stop: "STOP",
	stop_limit: "STOP LIMIT",
	trailing_stop: "TRAIL",
	// P1.2c VN: mã lệnh sàn (không dịch, như TIF codes).
	ato: "ATO",
	atc: "ATC",
	mp: "MP",
	mtl: "MTL",
	plo: "PLO",
};

/** Dòng tóm tắt nút submit kiểu TV: "MUA 100 FPT @ 128.500 GIỚI HẠN". */
export function formatSubmitSummary(input: {
	side: OrderSide;
	quantity: number;
	symbol: string;
	price?: number;
	type: OrderType;
	locale?: "vi" | "en";
}): string {
	const vi = input.locale !== "en";
	const sideLabel = input.side === "buy" ? (vi ? "MUA" : "BUY") : (vi ? "BÁN" : "SELL");
	const pricePart = input.price != null ? ` @ ${input.price.toLocaleString("en-US")}` : "";
	return `${sideLabel} ${input.quantity.toLocaleString("en-US")} ${input.symbol}${pricePart} ${TYPE_LABELS[input.type]}`;
}

/** Label loại lệnh dùng chung (review + nút submit). */
export function formatOrderTypeLabel(type: OrderType, locale?: "vi" | "en"): string {
	return TYPE_LABELS[type] ?? type.toUpperCase();
}

/**
 * View-model cho bước XÁC NHẬN lệnh (Pha 1 trust fixes).
 * Nguồn DUY NHẤT cho notional/margin/sức mua — dock và modal cùng đọc, không drift.
 */
export interface OrderReviewView {
	readonly side: OrderSide;
	readonly symbol: string;
	readonly type: OrderType;
	readonly quantity: number;
	/** Giá dùng để tính notional: price → stopPrice → markPrice. */
	readonly price: number;
	/** notional = quantity × price × contractMultiplier. */
	readonly notional: number;
	readonly takeProfitPrice?: number;
	readonly stopLossPrice?: number;
	readonly requiredMargin?: number;
	readonly buyingPower: number;
}

/**
 * Dựng view-model review từ candidate đã validate.
 * `contractMultiplier` mặc định 1 (market VN không nhân).
 */
export function buildOrderReview(input: {
	candidate: OrderValidationInput;
	markPrice: number;
	contractMultiplier?: number;
	requiredMargin?: number;
	buyingPower: number;
}): OrderReviewView {
	const { candidate } = input;
	const price = candidate.price ?? candidate.stopPrice ?? input.markPrice;
	const multiplier = input.contractMultiplier ?? 1;
	const notional = candidate.quantity * price * multiplier;
	return {
		side: candidate.side,
		symbol: candidate.symbol,
		type: candidate.type,
		quantity: candidate.quantity,
		price,
		notional,
		takeProfitPrice: candidate.bracket?.takeProfitPrice,
		stopLossPrice: candidate.bracket?.stopLossPrice,
		requiredMargin: input.requiredMargin,
		buyingPower: input.buyingPower,
	};
}
