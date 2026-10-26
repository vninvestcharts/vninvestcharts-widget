// Task 05: ExecutionSimulator — executeFill thuần túy, CV11133 tax, tick slippage,
// intrabar ambiguity predicate, estimateOrderCost. 0% trigger logic (OMS giữ quyền).
import type {
	ExecutionTicket,
	ExitReason,
	OrderSide,
	PositionSide,
	TradingOrder,
} from "./types";
import type { MarketRules } from "./MarketRules";

export interface ExecutionSimulatorOptions {
	slippageTicks?: number;
	brokerFeeRate?: number; // Mặc định 0.001 (0.1% cho spot)
	commissionPerContract?: number; // Mặc định 3000 (VND cho phái sinh, đúng plan)
	taxRate?: number; // Mặc định 0.001 (thuế bán CK 0.1%)
}

export interface PositionBasis {
	entryPrice: number;
	side: PositionSide;
}

export interface ExecuteFillRequest {
	order: TradingOrder;
	basePrice: number;
	quantity: number;
	timestamp: number;
	positionBasis?: PositionBasis;
	exitReason?: ExitReason;
	ambiguousIntrabarFill?: boolean;
	tieBreakReason?: string;
}

export interface OrderCostEstimate {
	estimatedCost: number;
	commission: number;
	estimatedTax: number;
	totalOutflow: number;
}

function dirOf(side: PositionSide): number {
	return side === "long" ? 1 : -1;
}

function roundMoney(value: number, currency: string): number {
	return currency === "VND" ? Math.round(value) : value;
}

export class ExecutionSimulator {
	private slippageTicks: number;
	private brokerFeeRate: number;
	private commissionPerContract: number;
	private taxRate: number;

	constructor(options: ExecutionSimulatorOptions = {}) {
		this.slippageTicks = options.slippageTicks ?? 0;
		this.brokerFeeRate = options.brokerFeeRate ?? 0.001;
		this.commissionPerContract = options.commissionPerContract ?? 3000;
		this.taxRate = options.taxRate ?? 0.001;
	}

	/**
	 * S2: live-update pricing knobs without recreating the broker (positions,
	 * orders and WS subscriptions survive). Prospective-only: booked fills keep
	 * old values. Returns the effective options for UI logging.
	 */
	updateOptions(patch: ExecutionSimulatorOptions): Required<ExecutionSimulatorOptions> {
		if (patch.slippageTicks !== undefined) this.slippageTicks = patch.slippageTicks;
		if (patch.brokerFeeRate !== undefined) this.brokerFeeRate = patch.brokerFeeRate;
		if (patch.commissionPerContract !== undefined) this.commissionPerContract = patch.commissionPerContract;
		if (patch.taxRate !== undefined) this.taxRate = patch.taxRate;
		return {
			slippageTicks: this.slippageTicks,
			brokerFeeRate: this.brokerFeeRate,
			commissionPerContract: this.commissionPerContract,
			taxRate: this.taxRate,
		};
	}

	executeFill(request: ExecuteFillRequest, rules: MarketRules): ExecutionTicket {
		const { order, basePrice, quantity, timestamp, positionBasis, exitReason, ambiguousIntrabarFill, tieBreakReason } =
			request;
		const fillPrice = this.applySlippage(basePrice, order.side, rules);
		const commission = this.calculateCommission(fillPrice, quantity, rules);
		const tax = this.calculateTax(fillPrice, quantity, rules, order.side);

		let netPnl = 0;
		if (positionBasis) {
			const multiplier = rules.contractMultiplier ?? 1;
			const grossPnl =
				(fillPrice - positionBasis.entryPrice) * dirOf(positionBasis.side) * quantity * multiplier;
			netPnl = grossPnl - commission - tax;
		}

		return {
			orderId: order.id,
			symbol: order.symbol,
			side: order.side,
			fillPrice,
			fillQuantity: quantity,
			commission,
			tax,
			pnl: netPnl,
			exitReason,
			timestamp,
			ambiguousIntrabarFill,
			tieBreakReason,
		};
	}

	applySlippage(basePrice: number, side: OrderSide, rules: MarketRules): number {
		if (this.slippageTicks === 0) return basePrice;
		const tick = rules.getTickSize(basePrice);
		const slip = this.slippageTicks * tick;
		const price = side === "buy" ? basePrice + slip : basePrice - slip;
		return Number(price.toFixed(4));
	}

	calculateCommission(price: number, quantity: number, rules: MarketRules): number {
		if (rules.profile === "VN_DERIVATIVES") {
			return roundMoney(quantity * this.commissionPerContract, rules.baseCurrency);
		}
		return roundMoney(price * quantity * this.brokerFeeRate, rules.baseCurrency);
	}

	calculateTax(price: number, quantity: number, rules: MarketRules, side: OrderSide): number {
		if (rules.profile === "VN_SPOT") {
			if (side !== "sell") return 0;
			return roundMoney(price * quantity * this.taxRate, rules.baseCurrency);
		}
		if (rules.profile === "VN_DERIVATIVES") {
			const multiplier = rules.contractMultiplier ?? 100000;
			const im = rules.initialMarginRate ?? 0.175;
			const taxValue = price * multiplier * quantity * (im / 2) * this.taxRate;
			return roundMoney(taxValue, rules.baseCurrency);
		}
		return 0;
	}

	checkIntrabarAmbiguity(
		tpPrice: number,
		slPrice: number,
		bar: { high: number; low: number },
		side: PositionSide,
	): boolean {
		if (side === "long") {
			return bar.low <= slPrice && bar.high >= tpPrice;
		}
		return bar.high >= slPrice && bar.low <= tpPrice;
	}

	estimateOrderCost(
		order: { side: OrderSide; quantity: number },
		price: number,
		rules: MarketRules,
	): OrderCostEstimate {
		const multiplier = rules.contractMultiplier ?? 1;
		const estimatedCost = roundMoney(price * order.quantity * multiplier, rules.baseCurrency);
		const commission = this.calculateCommission(price, order.quantity, rules);
		const estimatedTax = this.calculateTax(price, order.quantity, rules, order.side);
		const totalOutflow =
			order.side === "buy"
				? estimatedCost + commission + estimatedTax
				: estimatedCost - commission - estimatedTax;

		return {
			estimatedCost,
			commission,
			estimatedTax,
			totalOutflow,
		};
	}
}
