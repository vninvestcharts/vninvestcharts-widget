import type { FillResult, ReplayOHLCBar, ReplayOrder } from "./replayTradingTypes";

export interface ReplayFillSimulatorOptions {
	useOHLC?: boolean;
	/** H2 v2: use spread-aware fills (buy at high/ask, sell at low/bid) instead of single price + bps.
	 * Default true for realistic fills. When false, uses legacy behavior (close price + slippageBps). */
	useSpreadFill?: boolean;
	/** H2: simple slippage (bps). buy = +, sell = -. Applied as buffer on top of spread fill.
	 * Default 0 (no extra slippage). When useSpreadFill=true, this is added to high/low. */
	slippageBps?: number;
	/** F-03: when true, triggered limit/stop orders fill at next bar's open instead of trigger bar.
	 * Default false (retail convention: fill at trigger price/high/low). */
	fillOnNextBar?: boolean;
}

export class ReplayFillSimulator {
	private useOHLC: boolean;
	private slippageBps: number;
	readonly fillOnNextBar: boolean;

	constructor(options?: ReplayFillSimulatorOptions) {
		this.useOHLC = options?.useOHLC ?? true;
		this.slippageBps = options?.slippageBps ?? 0;
		this.fillOnNextBar = options?.fillOnNextBar ?? false;
	}

	simulateFill(order: ReplayOrder, bar: ReplayOHLCBar, now: number): FillResult {
		switch (order.type) {
			case "market":
				return this.fillMarket(order, bar, now);
			case "limit":
				return this.fillLimit(order, bar, now);
			case "stop":
				return this.fillStop(order, bar, now);
			default:
				return this.reject("Unknown order type");
		}
	}

	private fillMarket(order: ReplayOrder, bar: ReplayOHLCBar, now: number): FillResult {
		const fillPrice = this.resolveMarketPrice(order.side, bar, order.price);
		return this.filled(fillPrice, order.quantity, now);
	}

	private fillLimit(order: ReplayOrder, bar: ReplayOHLCBar, now: number): FillResult {
		if (order.price == null) return this.reject("Limit order requires price");

		let triggered = false;
		if (this.useOHLC) {
			if (order.side === "buy" && bar.low <= order.price) triggered = true;
			if (order.side === "sell" && bar.high >= order.price) triggered = true;
		} else {
			if (order.side === "buy" && bar.close <= order.price) triggered = true;
			if (order.side === "sell" && bar.close >= order.price) triggered = true;
		}

		if (!triggered) return this.pending();

		const fillPrice = order.price;
		return this.filled(fillPrice, order.quantity, now);
	}

	private fillStop(order: ReplayOrder, bar: ReplayOHLCBar, now: number): FillResult {
		if (order.stopPrice == null) return this.reject("Stop order requires stopPrice");

		let triggered = false;
		if (this.useOHLC) {
			if (order.side === "buy" && bar.high >= order.stopPrice) triggered = true;
			if (order.side === "sell" && bar.low <= order.stopPrice) triggered = true;
		} else {
			if (order.side === "buy" && bar.close >= order.stopPrice) triggered = true;
			if (order.side === "sell" && bar.close <= order.stopPrice) triggered = true;
		}

		if (!triggered) return this.pending();

		const fillPrice = this.resolveMarketPrice(order.side, bar, order.price);
		return this.filled(fillPrice, order.quantity, now);
	}

	private resolveMarketPrice(side: "buy" | "sell", bar: ReplayOHLCBar, preferPrice?: number): number {
		// H2 v2: buy fills at ask (high), sell fills at bid (low)
		const base = preferPrice != null ? preferPrice : side === "buy" ? bar.high : bar.low;
		return this.applySlippage(side, base);
	}

	/** F-03: check if order would trigger on this bar (without filling). Used by fillOnNextBar mode. */
	checkTrigger(order: ReplayOrder, bar: ReplayOHLCBar): boolean {
		if (order.type === "market") return true;
		if (order.type === "limit") {
			if (order.price == null) return false;
			if (this.useOHLC) {
				return order.side === "buy" ? bar.low <= order.price : bar.high >= order.price;
			}
			return order.side === "buy" ? bar.close <= order.price : bar.close >= order.price;
		}
		if (order.type === "stop") {
			if (order.stopPrice == null) return false;
			if (this.useOHLC) {
				return order.side === "buy" ? bar.high >= order.stopPrice : bar.low <= order.stopPrice;
			}
			return order.side === "buy" ? bar.close >= order.stopPrice : bar.close <= order.stopPrice;
		}
		return false;
	}

	/** F-03: fill triggered order at next bar's open (± slippage). Fallback to close if open unavailable. */
	resolveFillFromNextBar(order: ReplayOrder, nextBar: ReplayOHLCBar, now: number): FillResult {
		const preferPrice = nextBar.open || nextBar.close;
		const fillPrice = this.resolveMarketPrice(order.side, nextBar, preferPrice);
		return this.filled(fillPrice, order.quantity, now);
	}

	/** F-01: apply configured slippage to a base price adverse to the given side. buy = +, sell = -. */
	applySlippage(side: "buy" | "sell", base: number): number {
		if (this.slippageBps === 0) return base;
		const slip = base * (this.slippageBps / 10000);
		return side === "buy" ? base + slip : base - slip;
	}

	private filled(price: number, qty: number, now: number): FillResult {
		return {
			filled: true,
			fillPrice: price,
			fillQuantity: qty,
			fillTimestamp: now,
			partial: false,
			remainingQuantity: 0,
		};
	}

	private pending(): FillResult {
		return {
			filled: false,
			fillPrice: 0,
			fillQuantity: 0,
			fillTimestamp: 0,
			partial: false,
			remainingQuantity: 0,
		};
	}

	private reject(error: string): FillResult {
		return {
			filled: false,
			fillPrice: 0,
			fillQuantity: 0,
			fillTimestamp: 0,
			partial: false,
			remainingQuantity: 0,
			error,
		};
	}
}
