import type { ReplayExecutedTrade } from "./replayTradingTypes";

export interface EquityPoint {
  barIndex: number;
  equity: number;
}

export interface ReplayAnalyticsStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  netProfit: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
}

export class ReplaySessionAnalytics {
	private equityCurve: EquityPoint[] = [];
	private initialEquity = 0;
	private periodsPerYear: number;

	constructor(periodsPerYear = 252) {
		this.periodsPerYear = periodsPerYear;
	}

	reset(initialEquity = 0): void {
		this.equityCurve = [];
		this.initialEquity = initialEquity;
	}

	recordEquity(barIndex: number, totalPnl: number): void {
		this.equityCurve.push({ barIndex, equity: this.initialEquity + totalPnl });
	}

	private computeDrawdown(): { maxDrawdown: number; maxDrawdownPercent: number } {
		if (this.equityCurve.length < 2) return { maxDrawdown: 0, maxDrawdownPercent: 0 };

		let peak = this.equityCurve[0].equity;
		let maxDd = 0;
		let maxDdPct = 0;

		for (const point of this.equityCurve) {
			if (point.equity > peak) {
				peak = point.equity;
			}
			const dd = peak - point.equity;
			if (dd > maxDd) {
				maxDd = dd;
				maxDdPct = peak !== 0 ? (dd / peak) * 100 : 0;
			}
		}

		return { maxDrawdown: maxDd, maxDrawdownPercent: maxDdPct };
	}

	getStats(externalTrades?: readonly ReplayExecutedTrade[]): ReplayAnalyticsStats {
		const trades = externalTrades ?? [];
		const totalTrades = trades.length;

		let winningTrades = 0;
		let losingTrades = 0;
		let grossProfit = 0;
		let grossLoss = 0;

		for (const trade of trades) {
			if (trade.pnl > 0) {
				winningTrades++;
				grossProfit += trade.pnl;
			} else if (trade.pnl < 0) {
				losingTrades++;
				grossLoss += Math.abs(trade.pnl);
			}
		}

		const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
		const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
		const netProfit = grossProfit - grossLoss;
		const maxDd = this.computeDrawdown();
		const avgWin = winningTrades > 0 ? grossProfit / winningTrades : 0;
		const avgLoss = losingTrades > 0 ? grossLoss / losingTrades : 0;
		const expectancy = totalTrades > 0 ? netProfit / totalTrades : 0;

		let sharpeRatio = 0;
		if (this.equityCurve.length >= 3) {
			const returns: number[] = [];
			for (let i = 1; i < this.equityCurve.length; i++) {
				const prev = this.equityCurve[i - 1].equity;
				const cur = this.equityCurve[i].equity;
				if (prev !== 0) {
					returns.push((cur - prev) / prev);
				}
			}
			if (returns.length >= 2) {
				const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
				const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
				const stdDev = Math.sqrt(variance);
				sharpeRatio = stdDev > 0 ? (mean / stdDev) * Math.sqrt(this.periodsPerYear) : 0;
			}
		}

		return {
			totalTrades,
			winningTrades,
			losingTrades,
			winRate,
			grossProfit,
			grossLoss,
			profitFactor,
			netProfit,
			maxDrawdown: maxDd.maxDrawdown,
			maxDrawdownPercent: maxDd.maxDrawdownPercent,
			sharpeRatio,
			avgWin,
			avgLoss,
			expectancy,
		};
	}
}
