// Task 04: RiskEngine — sức mua, ký quỹ tách 2 cấp, miễn trừ lệnh đóng,
// thang margin call, giá thanh lý. Mọi tỷ lệ đọc từ MarketRules (Q1-v4),
// tiền VND làm tròn nguyên đồng để triệt bẫy float (Trap 3).
import type {
	BrokerAccount,
	OrderRejectCode,
	OrderValidationInput,
	TradingPosition,
} from "./types";
import type { MarketRules } from "./MarketRules";

export interface MarginRequirement {
	vsdMargin: number;
	totalRequiredMargin: number;
}

export interface RiskValidationResult {
	valid: boolean;
	rejectCode?: OrderRejectCode;
	reason?: string;
	requiredMargin?: number;
	availableBuyingPower?: number;
}

export type AccountRiskStatus = "safe" | "warning" | "call_margin" | "liquidation";

export interface AccountRiskAssessment {
	status: AccountRiskStatus;
	marginLevelPercent: number;
}

/** So sánh tiền tệ: VND làm tròn nguyên đồng, ngoại tệ dùng epsilon 1e-6. */
function exceeds(cost: number, available: number, currency: string): boolean {
	if (currency === "VND") return Math.round(cost) - Math.round(available) > 0;
	return cost - available > 1e-6;
}

function roundMoney(value: number, currency: string): number {
	return currency === "VND" ? Math.round(value) : value;
}

export class RiskEngine {
	/**
	 * Ký quỹ cho một lệnh/vị thế. Spot = tiền mặt đủ giá trị (vsd = 0);
	 * derivatives/margin tách vsdMargin và totalRequiredMargin (F-01).
	 */
	calculateOrderMargin(order: { quantity: number }, rules: MarketRules, price: number): MarginRequirement {
		if (!Number.isFinite(price) || price <= 0) throw new Error("Margin price must be positive");
		if (rules.profile === "VN_SPOT") {
			return { vsdMargin: 0, totalRequiredMargin: roundMoney(order.quantity * price, rules.baseCurrency) };
		}
		const multiplier = rules.contractMultiplier ?? 1;
		const im = rules.initialMarginRate ?? 1 / rules.maxLeverage;
		const buffer = rules.brokerBufferMultiplier ?? 1;
		const vsdMargin = order.quantity * price * multiplier * im;
		return {
			vsdMargin: roundMoney(vsdMargin, rules.baseCurrency),
			totalRequiredMargin: roundMoney(vsdMargin * buffer, rules.baseCurrency),
		};
	}

	validateOrderRisk(
		order: OrderValidationInput,
		account: BrokerAccount,
		rules: MarketRules,
		markPrice?: number,
		currentPosition?: TradingPosition,
	): RiskValidationResult {
		if (order.type === "stop_limit") {
			return { valid: false, rejectCode: "UNSUPPORTED_ORDER_TYPE", reason: "Phase B", availableBuyingPower: account.freeMargin };
		}
		// P1.2b: DAY/IOC/FOK có hiệu lực (OMS + VBE xử lý semantics; margin tính như GTC).
		if (!["GTC", "DAY", "IOC", "FOK"].includes(order.timeInForce ?? "GTC")) {
			return { valid: false, rejectCode: "UNSUPPORTED_TIF", reason: "TIF không hỗ trợ", availableBuyingPower: account.freeMargin };
		}
		// P1.2c VN: ATO/ATC/MP/MTL/PLO chỉ cho VN profiles (crypto/global không có phiên).
		if (
			(order.type === "ato" ||
				order.type === "atc" ||
				order.type === "mp" ||
				order.type === "mtl" ||
				order.type === "plo") &&
			rules.profile !== "VN_SPOT" &&
			rules.profile !== "VN_DERIVATIVES"
		) {
			return { valid: false, rejectCode: "UNSUPPORTED_ORDER_TYPE", reason: "Lệnh VN chỉ cho HOSE/HNX/UPCOM/phái sinh", availableBuyingPower: account.freeMargin };
		}
		if (order.side === "sell" && !order.isClosingPosition && !rules.allowShortSelling) {
			return { valid: false, rejectCode: "SHORT_NOT_ALLOWED", reason: "Spot không bán khống", availableBuyingPower: account.freeMargin };
		}
		const price = order.price ?? order.stopPrice ?? markPrice;
		if (price == null || !Number.isFinite(price) || price <= 0) {
			return { valid: false, rejectCode: "INVALID_PRICE", reason: "Thiếu giá định giá", availableBuyingPower: account.freeMargin };
		}
		const additional = this.additionalMargin(order, price, rules, currentPosition, account);
		if (exceeds(additional, account.freeMargin, account.currency)) {
			return {
				valid: false,
				rejectCode: "INSUFFICIENT_BUYING_POWER",
				reason: "Sức mua không đủ",
				requiredMargin: additional,
				availableBuyingPower: account.freeMargin,
			};
		}
		return { valid: true, requiredMargin: additional, availableBuyingPower: account.freeMargin };
	}

	/**
	 * Ký quỹ TĂNG THÊM của lệnh (Trap 2): lệnh đóng/giảm vị thế được miễn
	 * (giải phóng ký quỹ thay vì chiếm thêm); đảo chiều chỉ tính phần dôi.
	 */
	private additionalMargin(
		order: OrderValidationInput,
		price: number,
		rules: MarketRules,
		currentPosition: TradingPosition | undefined,
		account: BrokerAccount,
	): number {
		if (order.isClosingPosition) return 0;
		if (rules.profile === "VN_SPOT") {
			return order.side === "buy" ? roundMoney(order.quantity * price, account.currency) : 0;
		}
		const marginFor = (qty: number): number =>
			this.calculateOrderMargin({ quantity: qty }, rules, price).totalRequiredMargin;
		if (!currentPosition || currentPosition.quantity === 0) return marginFor(order.quantity);
		const sameSide = (currentPosition.side === "long") === (order.side === "buy");
		if (sameSide) return marginFor(order.quantity);
		const overflow = order.quantity - currentPosition.quantity;
		return overflow > 0 ? marginFor(overflow) : 0;
	}

	recalculateAccount(
		account: BrokerAccount,
		positions: TradingPosition[],
		rules: MarketRules,
		markPrices: Record<string, number>,
	): BrokerAccount {
		let unrealized = 0;
		let marginUsed = 0;
		const multiplier = rules.contractMultiplier ?? 1;
		for (const position of positions) {
			const mark = markPrices[position.symbol] ?? position.currentPrice;
			const dir = position.side === "long" ? 1 : -1;
			unrealized += (mark - position.entryPrice) * dir * position.quantity * multiplier;
			if (rules.profile !== "VN_SPOT") {
				marginUsed += this.calculateOrderMargin(position, rules, position.entryPrice).totalRequiredMargin;
			}
		}
		const equity = account.balance + unrealized;
		const freeMargin = equity - marginUsed;
		return {
			...account,
			equity,
			marginUsed,
			freeMargin,
			buyingPower: rules.profile === "GLOBAL_MARGIN" ? freeMargin * rules.maxLeverage : freeMargin,
		};
	}

	evaluateAccountRisk(account: BrokerAccount): AccountRiskAssessment {
		if (!(account.marginUsed > 0)) {
			return { status: "safe", marginLevelPercent: Number.POSITIVE_INFINITY };
		}
		const marginLevelPercent = (account.equity / account.marginUsed) * 100;
		if (marginLevelPercent <= 50) return { status: "liquidation", marginLevelPercent };
		if (marginLevelPercent < 80) return { status: "call_margin", marginLevelPercent };
		if (marginLevelPercent < 100) return { status: "warning", marginLevelPercent };
		return { status: "safe", marginLevelPercent };
	}

	/**
	 * Giá thanh lý ước tính: balance + (liq-entry)*dir*qty*mult = 50% * marginUsed.
	 * Spot (không đòn bẩy) trả +Infinity — không bao giờ thanh lý.
	 */
	calculateLiquidationPrice(position: TradingPosition, account: BrokerAccount, rules: MarketRules): number {
		if (!(account.marginUsed > 0)) return Number.POSITIVE_INFINITY;
		const multiplier = rules.contractMultiplier ?? 1;
		const dir = position.side === "long" ? 1 : -1;
		return position.entryPrice + (0.5 * account.marginUsed - account.balance) / (dir * position.quantity * multiplier);
	}
}
