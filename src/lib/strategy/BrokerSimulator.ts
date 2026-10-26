import { Order, Position, TradeRecord, PerformanceReport } from "./types";
import { computePnl } from "../core/replay/pnlUtils";

export class BrokerSimulator {
	private balance: number;
	private initialBalance: number;
	private position: Position | null = null;
	private trades: TradeRecord[] = [];

	constructor(initialBalance: number = 100000) {
		this.initialBalance = initialBalance;
		this.balance = initialBalance;
	}

	runBacktest(
		data: any[],
		strategyFn: (curr: any, prev: any) => "buy" | "sell" | null
	): PerformanceReport {
		this.reset();
		if (data.length < 2) return this.getPerformanceReport();

		for (let i = 1; i < data.length; i++) {
			const curr = data[i];
			const prev = data[i - 1];
			const signal = strategyFn(curr, prev);

			const price = curr.close;
			const timestamp = curr.date ? new Date(curr.date).getTime() : Date.now();

			if (signal === "buy") {
				// Buy (Long entry or Short exit)
				if (!this.position) {
					// Open Long: use all balance (or fixed fraction)
					const qty = Math.floor(this.balance / price);
					if (qty > 0) {
						this.position = { symbol: "SYMBOL", qty, avgPrice: price, direction: "long" };
						this.balance -= qty * price;
					}
				} else if (this.position.direction === "short") {
				// Close Short
					const pnl = computePnl("short", this.position.avgPrice, price, this.position.qty);
					this.trades.push({
						id: `t_${timestamp}`,
						direction: "short",
						qty: this.position.qty,
						entryPrice: this.position.avgPrice,
						entryTime: timestamp - 86400000, // approximation
						exitPrice: price,
						exitTime: timestamp,
						pnl,
						pnlPercent: (pnl / (this.position.avgPrice * this.position.qty)) * 100,
					});
					this.balance -= (this.position.qty * this.position.avgPrice) - pnl;
					this.position = null;

					// Reopen Long
					const qty = Math.floor(this.balance / price);
					if (qty > 0) {
						this.position = { symbol: "SYMBOL", qty, avgPrice: price, direction: "long" };
						this.balance -= qty * price;
					}
				}
			} else if (signal === "sell") {
				// Sell (Short entry or Long exit)
				if (!this.position) {
					// Open Short: shorting balance value
					const qty = Math.floor(this.balance / price);
					if (qty > 0) {
						this.position = { symbol: "SYMBOL", qty, avgPrice: price, direction: "short" };
						this.balance += qty * price;
					}
				} else if (this.position.direction === "long") {
				// Close Long
					const pnl = computePnl("long", this.position.avgPrice, price, this.position.qty);
					this.trades.push({
						id: `t_${timestamp}`,
						direction: "long",
						qty: this.position.qty,
						entryPrice: this.position.avgPrice,
						entryTime: timestamp - 86400000, // approximation
						exitPrice: price,
						exitTime: timestamp,
						pnl,
						pnlPercent: (pnl / (this.position.avgPrice * this.position.qty)) * 100,
					});
					this.balance += (this.position.qty * this.position.avgPrice) + pnl;
					this.position = null;

					// Reopen Short
					const qty = Math.floor(this.balance / price);
					if (qty > 0) {
						this.position = { symbol: "SYMBOL", qty, avgPrice: price, direction: "short" };
						this.balance += qty * price;
					}
				}
			}
		}

		// Force close any open position at the end to reconcile final balance
		if (this.position && data.length > 0) {
			const finalBar = data[data.length - 1];
			const finalPrice = finalBar.close;
			const finalTime = finalBar.date ? new Date(finalBar.date).getTime() : Date.now();

			if (this.position.direction === "long") {
				const pnl = computePnl("long", this.position.avgPrice, finalPrice, this.position.qty);
				this.trades.push({
					id: `t_${finalTime}_close`,
					direction: "long",
					qty: this.position.qty,
					entryPrice: this.position.avgPrice,
					entryTime: finalTime - 86400000,
					exitPrice: finalPrice,
					exitTime: finalTime,
					pnl,
					pnlPercent: (pnl / (this.position.avgPrice * this.position.qty)) * 100,
				});
				this.balance += (this.position.qty * this.position.avgPrice) + pnl;
			} else {
				const pnl = computePnl("short", this.position.avgPrice, finalPrice, this.position.qty);
				this.trades.push({
					id: `t_${finalTime}_close`,
					direction: "short",
					qty: this.position.qty,
					entryPrice: this.position.avgPrice,
					entryTime: finalTime - 86400000,
					exitPrice: finalPrice,
					exitTime: finalTime,
					pnl,
					pnlPercent: (pnl / (this.position.avgPrice * this.position.qty)) * 100,
				});
				this.balance -= (this.position.qty * this.position.avgPrice) - pnl;
			}
			this.position = null;
		}

		return this.getPerformanceReport();
	}

	private reset() {
		this.balance = this.initialBalance;
		this.position = null;
		this.trades = [];
	}

	getPerformanceReport(): PerformanceReport {
		const totalTrades = this.trades.length;
		const winningTrades = this.trades.filter(t => t.pnl > 0).length;
		const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

		const grossProfit = this.trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
		const grossLoss = Math.abs(this.trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
		const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit || 1;

		return {
			initialBalance: this.initialBalance,
			finalBalance: this.balance,
			netProfit: this.balance - this.initialBalance,
			winRate,
			profitFactor,
			totalTrades,
			trades: this.trades,
		};
	}
}
