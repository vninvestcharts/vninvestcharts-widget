// Task 01: MarketRules — quy chuẩn VN_SPOT / VN_DERIVATIVES / GLOBAL_MARGIN.
// IM là param cấu hình (VSD đổi hàng tháng), KHÔNG hardcode vào logic.
import type { OrderRejectCode, OrderValidationInput } from "./types";

export type MarketProfileType = "VN_SPOT" | "VN_DERIVATIVES" | "GLOBAL_MARGIN";

/**
 * P1.2c: true cho HOSE/HNX/UPCOM + phái sinh VN (có phiên đấu giá, lô chẵn,
 * biên độ trần/sàn). Crypto/global không có khái niệm này.
 */
export function isVnProfile(profile: MarketProfileType): boolean {
	return profile === "VN_SPOT" || profile === "VN_DERIVATIVES";
}
export type ExchangeType = "HOSE" | "HNX" | "UPCOM" | "GLOBAL";

/** Vốn paper mặc định — đủ mua thoải mái, khỏi nạp liên tục (BTC ~81k mua được 1 + dư). */
export const DEFAULT_PAPER_BALANCE_USD = 100_000;
export const DEFAULT_PAPER_BALANCE_VND = 1_000_000_000;

/** Vốn tối đa cho phép nhập ở dialog nạp vốn (chống typo thừa số 0). */
export const MAX_PAPER_BALANCE = 1_000_000_000_000;

export interface MarketRules {
	profile: MarketProfileType;
	baseCurrency: string;
	lotSize: number;
	contractMultiplier?: number;
	allowShortSelling: boolean;
	settlementDays: number;
	maxLeverage: number;
	initialMarginRate?: number;
	brokerBufferMultiplier?: number;
	maxOrderQuantity?: number;
	maxPositionQuantity?: number;
	getTickSize(price: number, exchange?: ExchangeType): number;
	getPriceBand(referencePrice: number, exchange?: ExchangeType): { ceilingPrice: number; floorPrice: number };
	validateOrder(order: OrderValidationInput): { valid: boolean; reason?: string; code?: OrderRejectCode };
}

export const VN_SPOT_RULES: MarketRules = {
	profile: "VN_SPOT",
	baseCurrency: "VND",
	lotSize: 100,
	allowShortSelling: false,
	settlementDays: 2,
	maxLeverage: 1,
	getTickSize(price: number, exchange: ExchangeType = "HOSE"): number {
		if (exchange === "HNX" || exchange === "UPCOM") return 100;
		if (price < 10000) return 10;
		if (price < 50000) return 50;
		return 100;
	},
	getPriceBand(ref: number, exchange: ExchangeType = "HOSE") {
		const bandRate = exchange === "UPCOM" ? 0.15 : exchange === "HNX" ? 0.1 : 0.07;
		const step = 100;
		// toPrecision(12) triệt sai số float (VD: 100000*1.15 = 114999.99999999999).
		const ceiling = Math.floor(Number((ref * (1 + bandRate)).toPrecision(12)) / step) * step;
		const floor = Math.ceil(Number((ref * (1 - bandRate)).toPrecision(12)) / step) * step;
		return { ceilingPrice: ceiling, floorPrice: floor };
	},
	validateOrder(order): { valid: boolean; reason?: string; code?: OrderRejectCode } {
		if (!Number.isInteger(order.quantity) || order.quantity <= 0 || order.quantity % 100 !== 0) {
			return { valid: false, reason: "Khối lượng phải là bội số dương của lô 100", code: "INVALID_QUANTITY" };
		}
		if (order.side === "sell" && !order.isClosingPosition && !this.allowShortSelling) {
			return { valid: false, reason: "Tài khoản cơ sở không được phép bán khống", code: "SHORT_NOT_ALLOWED" };
		}
		return { valid: true };
	},
};

export const CRYPTO_SPOT_RULES: MarketRules = {
	// Paper crypto mô phỏng theo mô hình margin của TV (không phải cash-settled
	// như spot VN): equity/PnL đúng, balance thể hiện qua marginUsed. Đòn bẩy 1
	// mặc định bảo thủ (TV cho 10:1 — chờ settings TVP-C).
	profile: "GLOBAL_MARGIN",
	baseCurrency: "USD",
	lotSize: 1,
	allowShortSelling: false,
	settlementDays: 0,
	maxLeverage: 1,
	getTickSize(price: number): number {
		if (price >= 1000) return 0.1;
		if (price >= 100) return 0.01;
		return 0.001;
	},
	getPriceBand(ref: number) {
		return { ceilingPrice: Number.POSITIVE_INFINITY, floorPrice: 0 };
	},
	validateOrder(order): { valid: boolean; reason?: string; code?: OrderRejectCode } {
		if (!Number.isFinite(order.quantity) || order.quantity <= 0) {
			return { valid: false, reason: "Khối lượng phải dương", code: "INVALID_QUANTITY" };
		}
		if (order.side === "sell" && !order.isClosingPosition && !this.allowShortSelling) {
			return { valid: false, reason: "Spot crypto không được bán khống", code: "SHORT_NOT_ALLOWED" };
		}
		return { valid: true };
	},
};

/**
 * Phân loại thị trường theo mã: VN30F* -> phái sinh; mã crypto (kết thúc bằng
 * USDT, USDC, USD, BTC, ETH, hoặc chứa "/" hay ":") -> crypto spot; còn lại VN cơ sở.
 */
export function resolveMarketProfile(symbol: string): MarketRules {
	const s = symbol.trim().toUpperCase();
	if (/^VN30F/i.test(s)) return VN_DERIVATIVES_RULES;
	if (
		/(USDT|USDC|USD|BTC|ETH)$/.test(s) ||
		s.includes("/") ||
		s.includes(":")
	) {
		return CRYPTO_SPOT_RULES;
	}
	// S4 (Q3): international tickers reuse GLOBAL_MARGIN_RULES instead of
	// falling into VN_SPOT (VND, T+2, lot 100 would misprice e.g. AAPL).
	if (/^[A-Z]{4,}$/.test(s)) return GLOBAL_MARGIN_RULES;
	return VN_SPOT_RULES;
}

/**
 * S4: true when a symbol falls back to VN_SPOT without looking like a VN
 * ticker (exactly 3 A-Z letters). UI shows a fallback banner (override via
 * settings) instead of silently applying lot-100/T+2.
 */
export function isUnclassifiedMarketSymbol(symbol: string): boolean {
	const s = symbol.trim().toUpperCase();
	if (/^VN30F/i.test(s)) return false;
	if (/(USDT|USDC|USD|BTC|ETH)$/.test(s) || s.includes("/") || s.includes(":")) return false;
	if (/^[A-Z]{4,}$/.test(s)) return false;
	if (/^[A-Z]{3}$/.test(s)) return false;
	return true;
}

export const VN_DERIVATIVES_RULES: MarketRules = {
	profile: "VN_DERIVATIVES",
	baseCurrency: "VND",
	lotSize: 1,
	contractMultiplier: 100000,
	allowShortSelling: true,
	settlementDays: 0,
	maxLeverage: 5.71,
	initialMarginRate: 0.175,
	brokerBufferMultiplier: 1.25,
	maxOrderQuantity: 500,
	maxPositionQuantity: 5000,
	getTickSize(): number {
		return 0.1;
	},
	getPriceBand(ref: number) {
		const ceiling = Number((ref * 1.07).toFixed(1));
		const floor = Number((ref * 0.93).toFixed(1));
		return { ceilingPrice: ceiling, floorPrice: floor };
	},
	validateOrder(order): { valid: boolean; reason?: string; code?: OrderRejectCode } {
		if (!Number.isInteger(order.quantity) || order.quantity < 1) {
			return { valid: false, reason: "Số lượng hợp đồng phải là số nguyên dương", code: "INVALID_QUANTITY" };
		}
		const max = this.maxOrderQuantity;
		if (max != null && order.quantity > max) {
			return { valid: false, reason: `Vượt giới hạn ${max} HĐ/lệnh`, code: "INVALID_QUANTITY" };
		}
		return { valid: true };
	},
};

/**
 * Task 11: replay-scoped VN rules — VN_SPOT nhưng settlementDays = 0.
 * Lý do: replay mô phỏng chiến thuật, không mô phỏng thanh toán T+2;
 * nếu giữ T+2, TP khớp nến kế tiếp bị throw (available 0), regression nặng
 * so với legacy (đóng ngay). Derivatives T+0 sẵn nên không cần override.
 */
export const REPLAY_SPOT_RULES: MarketRules = {
	...VN_SPOT_RULES,
	profile: "VN_SPOT",
	settlementDays: 0,
};

export const GLOBAL_MARGIN_RULES: MarketRules = {
	profile: "GLOBAL_MARGIN",
	baseCurrency: "USD",
	lotSize: 1,
	allowShortSelling: true,
	settlementDays: 0,
	maxLeverage: 100,
	getTickSize(): number {
		return 0.01;
	},
	getPriceBand(ref: number) {
		return { ceilingPrice: Number.POSITIVE_INFINITY, floorPrice: 0 };
	},
	validateOrder(order): { valid: boolean; reason?: string; code?: OrderRejectCode } {
		if (!Number.isFinite(order.quantity) || order.quantity <= 0) {
			return { valid: false, reason: "Khối lượng phải dương", code: "INVALID_QUANTITY" };
		}
		return { valid: true };
	},
};
