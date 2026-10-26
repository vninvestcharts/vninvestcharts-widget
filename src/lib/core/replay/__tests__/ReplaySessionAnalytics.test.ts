import { describe, it, expect } from "vitest";
import { ReplaySessionAnalytics } from "../ReplaySessionAnalytics";
import type { ReplayExecutedTrade } from "../replayTradingTypes";

function makeTrade(pnl: number, overrides?: Partial<ReplayExecutedTrade>): ReplayExecutedTrade {
	return {
		id: "t1", orderId: "o1", symbol: "", side: "buy", type: "market",
		entryPrice: 100, exitPrice: 100 + pnl, quantity: 1, pnl, pnlPercent: pnl,
		entryTimestamp: 1000, exitTimestamp: 2000, entryBarIndex: 0, exitBarIndex: 1,
		barsHeld: 1, exitReason: "manual", ...overrides,
	};
}

describe("ReplaySessionAnalytics", () => {
	it("returns zeros when no trades recorded", () => {
		const a = new ReplaySessionAnalytics();
		const s = a.getStats([]);
		expect(s.totalTrades).toBe(0);
		expect(s.winRate).toBe(0);
		expect(s.profitFactor).toBe(0);
		expect(s.netProfit).toBe(0);
		expect(s.maxDrawdown).toBe(0);
		expect(s.sharpeRatio).toBe(0);
	});

	it("100% win rate with all winning trades", () => {
		const a = new ReplaySessionAnalytics();
		a.recordEquity(0, 0);
		a.recordEquity(1, 50);
		a.recordEquity(2, 150);
		const trades = [makeTrade(10), makeTrade(20), makeTrade(30)];
		const s = a.getStats(trades);
		expect(s.totalTrades).toBe(3);
		expect(s.winningTrades).toBe(3);
		expect(s.winRate).toBe(1);
		expect(s.profitFactor).toBe(Infinity);
		expect(s.netProfit).toBe(60);
		expect(s.grossLoss).toBe(0);
	});

	it("0% win rate with all losing trades", () => {
		const a = new ReplaySessionAnalytics();
		a.recordEquity(0, 0);
		a.recordEquity(1, -10);
		a.recordEquity(2, -30);
		const trades = [makeTrade(-5), makeTrade(-15)];
		const s = a.getStats(trades);
		expect(s.totalTrades).toBe(2);
		expect(s.winningTrades).toBe(0);
		expect(s.winRate).toBe(0);
		expect(s.profitFactor).toBe(0);
		expect(s.netProfit).toBe(-20);
		expect(s.grossProfit).toBe(0);
	});

	it("profit factor below 1 on net losing session", () => {
		const a = new ReplaySessionAnalytics();
		a.recordEquity(0, 0);
		a.recordEquity(1, 20);
		a.recordEquity(2, -10);
		const trades = [makeTrade(100), makeTrade(-200)];
		const s = a.getStats(trades);
		expect(s.profitFactor).toBe(0.5);
		expect(s.netProfit).toBe(-100);
		expect(s.winRate).toBe(0.5);
	});

	it("max drawdown computed from equity curve", () => {
		const a = new ReplaySessionAnalytics();
		a.recordEquity(0, 0);
		a.recordEquity(1, 100);
		a.recordEquity(2, 200);
		a.recordEquity(3, 50);
		a.recordEquity(4, 150);
		const s = a.getStats([makeTrade(10)]);
		expect(s.maxDrawdown).toBe(150);
		expect(s.maxDrawdownPercent).toBe(75);
	});

	it("Sharpe ratio zero with insufficient equity points", () => {
		const a = new ReplaySessionAnalytics();
		a.recordEquity(0, 0);
		const s = a.getStats([makeTrade(10)]);
		expect(s.sharpeRatio).toBe(0);
	});

	it("Sharpe ratio computed with at least 3 equity points", () => {
		const a = new ReplaySessionAnalytics();
		a.recordEquity(0, 100);
		a.recordEquity(1, 110);
		a.recordEquity(2, 105);
		a.recordEquity(3, 120);
		const s = a.getStats([makeTrade(10)]);
		expect(s.sharpeRatio).toBeGreaterThan(0);
	});

	it("reset clears equity curve", () => {
		const a = new ReplaySessionAnalytics();
		a.recordEquity(0, 100);
		a.recordEquity(1, 200);
		a.reset(0);
		const s = a.getStats([]);
		expect(s.maxDrawdown).toBe(0);
		expect(s.sharpeRatio).toBe(0);
	});

	it("avgWin and avgLoss computed correctly", () => {
		const a = new ReplaySessionAnalytics();
		a.recordEquity(0, 0);
		a.recordEquity(1, 30);
		const trades = [makeTrade(10), makeTrade(20), makeTrade(-5), makeTrade(-15)];
		const s = a.getStats(trades);
		expect(s.avgWin).toBe(15);
		expect(s.avgLoss).toBe(10);
		expect(s.expectancy).toBe(2.5);
	});

	it("single trade does not crash", () => {
		const a = new ReplaySessionAnalytics();
		a.recordEquity(0, 0);
		a.recordEquity(1, 5);
		const s = a.getStats([makeTrade(5)]);
		expect(s.totalTrades).toBe(1);
		expect(s.winRate).toBe(1);
		expect(s.sharpeRatio).toBe(0);
	});

	it("constructor accepts custom periodsPerYear", () => {
		const a = new ReplaySessionAnalytics(4);
		a.recordEquity(0, 100);
		a.recordEquity(1, 110);
		a.recordEquity(2, 105);
		a.recordEquity(3, 120);
		const s = a.getStats([makeTrade(10)]);
		expect(s.sharpeRatio).toBeGreaterThan(0);
	});

	it("net profit negative on losing session", () => {
		const a = new ReplaySessionAnalytics();
		a.recordEquity(0, 0);
		a.recordEquity(1, -50);
		const trades = [makeTrade(-10), makeTrade(-20)];
		const s = a.getStats(trades);
		expect(s.netProfit).toBe(-30);
		expect(s.expectancy).toBe(-15);
	});
});
