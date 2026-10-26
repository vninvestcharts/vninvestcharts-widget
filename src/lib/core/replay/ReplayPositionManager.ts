import type { ReplayExecutedTrade, ReplayPosition } from "./replayTradingTypes";
import { computeNetPnl, computePnl } from "./pnlUtils";

export interface TriggeredSLTP {
  positionId: string;
  reason: "tp" | "sl";
  fillPrice: number;
}

export class ReplayPositionManager {
	private positions = new Map<string, ReplayPosition>();
	private closedTrades: ReplayExecutedTrade[] = [];
	private nextId = 1;

	openPosition(
		side: "long" | "short",
		quantity: number,
		price: number,
		barIndex: number,
		timestamp: number,
		stopLoss?: number,
		takeProfit?: number,
		symbol?: string,
		feeRate?: number,
	): ReplayPosition {
		const id = `pos-${this.nextId++}`;
		if (!symbol) {
			// ISSUE-B: caller quên truyền symbol → fallback "" (silent). Warn để dev bắt.
			// Trong runtime thực symbol luôn được truyền từ usePaperTradeInteraction.placeOrder.
			if (typeof console !== "undefined" && console.warn) {
				console.warn("[ReplayPositionManager] openPosition missing symbol — falling back to empty string.");
			}
		}
		const pos: ReplayPosition = {
			id,
			side,
			entryPrice: price,
			quantity,
			currentPrice: price,
			unrealizedPnl: 0,
			realizedPnl: 0,
			stopLoss,
			takeProfit,
			entryTimestamp: timestamp,
			entryBarIndex: barIndex,
			symbol,
			feeRate,
		};
		this.positions.set(id, pos);
		return pos;
	}

	closePosition(
		positionId: string,
		exitPrice: number,
		barIndex: number,
		exitReason: "tp" | "sl" | "manual" | "session-end",
		timestamp?: number,
	): ReplayExecutedTrade | null {
		const pos = this.positions.get(positionId);
		if (!pos) return null;

		const feeRate = pos.feeRate ?? 0;
		const netPnl = computeNetPnl(pos.side, pos.entryPrice, exitPrice, pos.quantity, feeRate);
		const pnlPercent = pos.entryPrice !== 0 ? (netPnl / (pos.entryPrice * pos.quantity)) * 100 : 0;

		const trade: ReplayExecutedTrade = {
			id: `trade-${this.nextId++}`,
			orderId: positionId,
			symbol: pos.symbol ?? "",
			side: pos.side === "long" ? "buy" : "sell",
			type: "market",
			entryPrice: pos.entryPrice,
			exitPrice,
			quantity: pos.quantity,
			pnl: netPnl,
			pnlPercent,
			entryTimestamp: pos.entryTimestamp,
			exitTimestamp: timestamp ?? Date.now(),
			entryBarIndex: pos.entryBarIndex,
			exitBarIndex: barIndex,
			barsHeld: barIndex - pos.entryBarIndex,
			exitReason,
		};

		this.closedTrades.push(trade);
		this.positions.delete(positionId);
		return trade;
	}

	updateCurrentPrice(bar: { high: number; low: number; close: number }): void {
		for (const pos of this.positions.values()) {
			pos.currentPrice = bar.close;
			const feeRate = pos.feeRate ?? 0;
			const entryFee = pos.entryPrice * pos.quantity * feeRate;
			pos.unrealizedPnl = computePnl(pos.side, pos.entryPrice, bar.close, pos.quantity) - entryFee;
		}
	}

	checkStopLossTakeProfit(bar: { high: number; low: number }): TriggeredSLTP[] {
		const triggered: TriggeredSLTP[] = [];

		for (const pos of this.positions.values()) {
			if (pos.stopLoss != null) {
				if (pos.side === "long" && bar.low <= pos.stopLoss) {
					triggered.push({ positionId: pos.id, reason: "sl", fillPrice: pos.stopLoss });
				}
				if (pos.side === "short" && bar.high >= pos.stopLoss) {
					triggered.push({ positionId: pos.id, reason: "sl", fillPrice: pos.stopLoss });
				}
			}

			if (pos.takeProfit != null) {
				if (pos.side === "long" && bar.high >= pos.takeProfit) {
					triggered.push({ positionId: pos.id, reason: "tp", fillPrice: pos.takeProfit });
				}
				if (pos.side === "short" && bar.low <= pos.takeProfit) {
					triggered.push({ positionId: pos.id, reason: "tp", fillPrice: pos.takeProfit });
				}
			}
		}

		return triggered;
	}

	closeAllPositions(
		barIndex: number,
		reason: "tp" | "sl" | "manual" | "session-end",
		timestamp?: number,
	): ReplayExecutedTrade[] {
		const trades: ReplayExecutedTrade[] = [];
		for (const [id, pos] of this.positions) {
			const trade = this.closePosition(id, pos.currentPrice, barIndex, reason, timestamp);
			if (trade) trades.push(trade);
		}
		return trades;
	}

	getPositions(): ReplayPosition[] {
		return Array.from(this.positions.values());
	}

	getPosition(id: string): ReplayPosition | undefined {
		return this.positions.get(id);
	}

	getClosedTrades(): ReplayExecutedTrade[] {
		return [...this.closedTrades];
	}

	getTotalPnl(): number {
		let total = 0;
		for (const pos of this.positions.values()) {
			total += pos.unrealizedPnl;
		}
		for (const trade of this.closedTrades) {
			total += trade.pnl;
		}
		return total;
	}

	setStopLoss(positionId: string, price: number): boolean {
		const pos = this.positions.get(positionId);
		if (!pos) return false;
		pos.stopLoss = price;
		return true;
	}

	setTakeProfit(positionId: string, price: number): boolean {
		const pos = this.positions.get(positionId);
		if (!pos) return false;
		pos.takeProfit = price;
		return true;
	}

	reset(): void {
		this.positions.clear();
		this.closedTrades = [];
		this.nextId = 1;
	}
}
