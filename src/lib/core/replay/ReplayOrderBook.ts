import type { FillResult, ReplayOHLCBar, ReplayOrder } from "./replayTradingTypes";
import { ReplayFillSimulator } from "./ReplayFillSimulator";
import { ReplayPositionManager } from "./ReplayPositionManager";

export class ReplayOrderBook {
	private orders = new Map<string, ReplayOrder>();
	private filledOrders: ReplayOrder[] = [];
	private cancelledOrders: ReplayOrder[] = [];
	private pendingTriggers = new Map<string, { order: ReplayOrder; triggerBarIndex: number }>();
	private fillSimulator: ReplayFillSimulator;
	private positionManager: ReplayPositionManager;
	private realisticSlTpFill: boolean;
	private nextOrderId = 1;

	constructor(
		fillSimulator?: ReplayFillSimulator,
		positionManager?: ReplayPositionManager,
		realisticSlTpFill = false,
	) {
		this.fillSimulator = fillSimulator ?? new ReplayFillSimulator();
		this.positionManager = positionManager ?? new ReplayPositionManager();
		this.realisticSlTpFill = realisticSlTpFill;
	}

	addOrder(order: Omit<ReplayOrder, "id">): ReplayOrder {
		const id = `order-${this.nextOrderId++}`;
		const full: ReplayOrder = { ...order, id };
		this.orders.set(id, full);
		return full;
	}

	cancelOrder(orderId: string): boolean {
		const order = this.orders.get(orderId);
		if (!order) return false;
		this.orders.delete(orderId);
		this.cancelledOrders.push(order);
		return true;
	}

	processBar(bar: ReplayOHLCBar, barIndex: number, now: number): FillResult[] {
		this.positionManager.updateCurrentPrice(bar);

		const results: FillResult[] = [];

		// F-03: resolve pending triggers from previous bar (fillOnNextBar mode)
		if (this.pendingTriggers.size > 0) {
			const pending = Array.from(this.pendingTriggers.entries());
			this.pendingTriggers.clear();
			for (const [id, { order, triggerBarIndex }] of pending) {
				const result = this.fillSimulator.resolveFillFromNextBar(order, bar, now);
				results.push(result);
				this.filledOrders.push(order);

				if (order.reduceOnly) {
					this.handleReduceOnlyOrder(order, result, triggerBarIndex, now);
				} else {
					this.handleNewPositionOrder(order, result, triggerBarIndex, now);
				}
			}
		}

		for (const [id, order] of this.orders) {
			// F-03: fillOnNextBar mode — check trigger, defer fill to next bar
			if (this.fillSimulator.fillOnNextBar && this.fillSimulator.checkTrigger(order, bar)) {
				this.orders.delete(id);
				this.pendingTriggers.set(id, { order, triggerBarIndex: barIndex });
				continue;
			}

			const result = this.fillSimulator.simulateFill(order, bar, now);
			if (result.filled) {
				results.push(result);
				this.orders.delete(id);
				this.filledOrders.push(order);

				if (order.reduceOnly) {
					this.handleReduceOnlyOrder(order, result, barIndex, now);
				} else {
					this.handleNewPositionOrder(order, result, barIndex, now);
				}
			}
		}

		const triggeredSLTP = this.positionManager.checkStopLossTakeProfit(bar);
		for (const t of triggeredSLTP) {
			const fillPrice = this.realisticSlTpFill
				? this.resolveRealisticSlTpFill(t, bar)
				: t.fillPrice;
			this.positionManager.closePosition(t.positionId, fillPrice, barIndex, t.reason, now);
		}

		return results;
	}

	// F-01: worst-case gap-fill for SL/TP. Long SL fills at min(bar.low, sl); short SL at max(bar.high, sl).
	// TP fills at the trigger level (favourable side, no worse than target). Slippage applied via simulator.
	private resolveRealisticSlTpFill(
		t: { positionId: string; reason: "tp" | "sl"; fillPrice: number },
		bar: ReplayOHLCBar,
	): number {
		const pos = this.positionManager.getPosition(t.positionId);
		if (!pos) return t.fillPrice;
		let base = t.fillPrice;
		if (t.reason === "sl") {
			base = pos.side === "long" ? Math.min(bar.low, t.fillPrice) : Math.max(bar.high, t.fillPrice);
		} else {
			base = pos.side === "long" ? Math.max(bar.high, t.fillPrice) : Math.min(bar.low, t.fillPrice);
		}
		// Apply slippage adverse to the closing side (long close = sell → worse = lower; short close = buy → worse = higher).
		const exitSide = pos.side === "long" ? "sell" : "buy";
		return this.fillSimulator.applySlippage(exitSide, base);
	}

	private handleNewPositionOrder(
		order: ReplayOrder,
		result: FillResult,
		barIndex: number,
		now: number,
	): void {
		const side = order.side === "buy" ? "long" : "short";
		this.positionManager.openPosition(
			side,
			result.fillQuantity,
			result.fillPrice,
			barIndex,
			now,
			undefined,
			undefined,
			order.symbol,
			order.feeRate,
		);
	}

	private handleReduceOnlyOrder(
		order: ReplayOrder,
		result: FillResult,
		barIndex: number,
		now: number,
	): void {
		const exitSide = order.side === "buy" ? "sell" : "buy";
		const positions = this.positionManager.getPositions();
		const matching = positions.find((p) => {
			const posSide = p.side === "long" ? "buy" : "sell";
			return posSide === exitSide;
		});
		if (matching) {
			this.positionManager.closePosition(matching.id, result.fillPrice, barIndex, "manual", now);
		}
	}

	getOpenOrders(): ReplayOrder[] {
		return Array.from(this.orders.values());
	}

	getFilledOrders(): ReplayOrder[] {
		return [...this.filledOrders];
	}

	getPositionManager(): ReplayPositionManager {
		return this.positionManager;
	}

	reset(): void {
		this.orders.clear();
		this.filledOrders = [];
		this.cancelledOrders = [];
		this.pendingTriggers.clear();
		this.positionManager.reset();
		this.nextOrderId = 1;
	}
}
