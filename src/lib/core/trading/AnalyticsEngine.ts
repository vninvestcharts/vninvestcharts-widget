// Task 06: AnalyticsEngine — thống kê hiệu suất tăng dần (incremental).
// Toán PnL dùng chung họ computePnl (không implement công thức thứ ba);
// divergence vs ReplaySessionAnalytics ghi nhận cho Task 11 dọn dẹp.
import type { ExitReason, PositionSide } from "./types";
export interface ClosedTradeRecord {
	timestamp: number;
	realizedPnl: number;
	commission: number;
	tax: number;
	/** TVP-A3: chi tiết vị thế đóng cho tab Trade History (additive, optional). */
	symbol?: string;
	side?: PositionSide;
	quantity?: number;
	entryPrice?: number;
	exitPrice?: number;
	exitReason?: ExitReason;
}

export interface EquityPoint {
	timestamp: number;
	equity: number;
}

export interface TradingAnalytics {
	totalTrades: number;
	winningTrades: number;
	losingTrades: number;
	winRate: number;
	grossProfit: number;
	grossLoss: number;
	netProfit: number;
	/** 0 khi chưa có trade; = grossProfit khi chưa từng lỗ (tránh Infinity). */
	profitFactor: number;
	maxDrawdown: number;
	maxDrawdownPercent: number;
	equityCurve: EquityPoint[];
	/** TVP-A3: trades đã đóng (có entry/exit khi settleFill điền đủ) cho tab Trade History. */
	closedTrades: ClosedTradeRecord[];
	/** TVP-A4: Sharpe annualized, port exact từ legacy (sample variance, prev !== 0). */
	sharpeRatio: number;
}

export class AnalyticsEngine {
	private trades: ClosedTradeRecord[] = [];
	private curve: EquityPoint[] = [];

	recordClosedTrade(trade: ClosedTradeRecord): void {
		this.trades.push({ ...trade });
	}

	recordEquityPoint(timestamp: number, equity: number): void {
		this.curve.push({ timestamp, equity });
	}

	getClosedTrades(): ClosedTradeRecord[] {
		return this.trades.map((t) => ({ ...t }));
	}

	getEquityCurve(): EquityPoint[] {
		return this.curve.map((p) => ({ ...p }));
	}

	restoreClosedTrades(trades: ClosedTradeRecord[]): void {
		this.trades = trades.map((t) => ({ ...t }));
	}

	restoreEquityCurve(curve: EquityPoint[]): void {
		this.curve = curve.map((p) => ({ ...p }));
	}

	clear(): void {
		this.trades = [];
		this.curve = [];
	}

	getAnalytics(): TradingAnalytics {
		let grossProfit = 0;
		let grossLoss = 0;
		let netProfit = 0;
		let winningTrades = 0;
		for (const trade of this.trades) {
			// S5: `grossProfit`/`grossLoss` stay on the GROSS `realizedPnl` because that
			// is what the names promise. `netProfit` is now genuinely net - it subtracts
			// this trade's own commission and tax, which after S5 include the entry leg.
			// Before S5 it was `grossProfit - grossLoss`, i.e. a gross number wearing the
			// name `netProfit`.
			const net = trade.realizedPnl - trade.commission - trade.tax;
			netProfit += net;
			if (trade.realizedPnl >= 0) {
				grossProfit += trade.realizedPnl;
				winningTrades += 1;
			} else {
				grossLoss += -trade.realizedPnl;
			}
		}
		const totalTrades = this.trades.length;
		const losingTrades = totalTrades - winningTrades;
		let peak = Number.NEGATIVE_INFINITY;
		let maxDrawdown = 0;
		let maxDrawdownPercent = 0;
		for (const point of this.curve) {
			if (point.equity > peak) peak = point.equity;
			if (peak > 0) {
				const dd = peak - point.equity;
				if (dd > maxDrawdown) {
					maxDrawdown = dd;
					maxDrawdownPercent = (dd / peak) * 100;
				}
			}
		}
		return {
			totalTrades,
			winningTrades,
			losingTrades,
			winRate: totalTrades === 0 ? 0 : winningTrades / totalTrades,
			grossProfit,
			grossLoss,
			netProfit,
			profitFactor: totalTrades === 0 ? 0 : grossLoss === 0 ? grossProfit : grossProfit / grossLoss,
			maxDrawdown,
			maxDrawdownPercent,
			equityCurve: this.getEquityCurve(),
			closedTrades: this.getClosedTrades(),
			sharpeRatio: computeSharpeRatio(this.curve),
		};
	}
}

/**
 * TVP-A4: port EXACT công thức legacy (ReplaySessionAnalytics):
 * sample variance (n-1), skip prev === 0, annualized √252.
 * Giữ `!== 0` như legacy (parity) thay vì E ≤ 0 nghiêm ngặt — chia cho số âm
 * hữu hạn không sinh NaN/Infinity nên an toàn; mọi đường NaN/Infinity
 * (length<3, stdDev 0) đều đã khóa về 0.
 */
export function computeSharpeRatio(curve: EquityPoint[], periodsPerYear = 252): number {
	if (curve.length < 3) return 0;
	const returns: number[] = [];
	for (let i = 1; i < curve.length; i++) {
		const prev = curve[i - 1].equity;
		const cur = curve[i].equity;
		if (prev !== 0) {
			returns.push((cur - prev) / prev);
		}
	}
	if (returns.length < 2) return 0;
	const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
	const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
	const stdDev = Math.sqrt(variance);
	return stdDev > 0 ? (mean / stdDev) * Math.sqrt(periodsPerYear) : 0;
}
