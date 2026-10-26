import { describe, it, expect } from "vitest";
import { BrokerSimulator } from "../BrokerSimulator";

describe("BrokerSimulator", () => {
	it("should simulate simple trading strategy and calculate metrics correctly", () => {
		const data = [
			{ close: 100, date: new Date("2024-01-01") },
			{ close: 110, date: new Date("2024-01-02") }, // Buy signal
			{ close: 105, date: new Date("2024-01-03") }, // Sell signal
			{ close: 120, date: new Date("2024-01-04") }, // Buy signal
			{ close: 115, date: new Date("2024-01-05") },
		];

		const simulator = new BrokerSimulator(10000);

		const strategyFn = (curr: any, prev: any) => {
			const priceDiff = curr.close - prev.close;
			if (priceDiff > 0) return "buy";
			if (priceDiff < 0) return "sell";
			return null;
		};

		const report = simulator.runBacktest(data, strategyFn);

		expect(report.totalTrades).toBeGreaterThan(0);
		expect(report.initialBalance).toBe(10000);
		expect(report.finalBalance).toBeTypeOf("number");
		expect(report.netProfit).toBe(report.finalBalance - 10000);
		expect(report.winRate).toBeGreaterThanOrEqual(0);
		expect(report.profitFactor).toBeGreaterThanOrEqual(0);
	});

	it("should calculate LONG trade profit/loss correctly", () => {
		const simulator = new BrokerSimulator(100000);
		// 1. Long Entry at 100
		// 2. Long Exit at 110 (PnL should be +10,000)
		const data = [
			{ close: 100, date: new Date("2024-01-01") },
			{ close: 100, date: new Date("2024-01-02") }, // Buy signal (Open Long)
			{ close: 110, date: new Date("2024-01-03") }, // Sell signal (Close Long)
			{ close: 110, date: new Date("2024-01-04") },
		];

		const strategyFn = (curr: any, prev: any) => {
			if (curr.date.getTime() === new Date("2024-01-02").getTime()) return "buy";
			if (curr.date.getTime() === new Date("2024-01-03").getTime()) return "sell";
			return null;
		};

		const report = simulator.runBacktest(data, strategyFn);
		// Since we open long at 100 with 100,000, qty = 1000.
		// Close at 110. PnL = (110 - 100) * 1000 = 10,000.
		// Final balance should be 110,000.
		expect(report.netProfit).toBe(10000);
		expect(report.finalBalance).toBe(110000);
	});

	it("should calculate SHORT trade profit/loss correctly", () => {
		const simulator = new BrokerSimulator(100000);
		// 1. Short Entry at 100
		// 2. Short Exit (Close Short) at 110 (PnL should be -10,000)
		const data = [
			{ close: 100, date: new Date("2024-01-01") },
			{ close: 100, date: new Date("2024-01-02") }, // Sell signal (Open Short)
			{ close: 110, date: new Date("2024-01-03") }, // Buy signal (Close Short)
			{ close: 110, date: new Date("2024-01-04") },
		];

		const strategyFn = (curr: any, prev: any) => {
			if (curr.date.getTime() === new Date("2024-01-02").getTime()) return "sell";
			if (curr.date.getTime() === new Date("2024-01-03").getTime()) return "buy";
			return null;
		};

		const report = simulator.runBacktest(data, strategyFn);
		// Since we open short at 100 with 100,000, qty = 1000.
		// Close at 110. PnL = (100 - 110) * 1000 = -10,000.
		// Final balance should be 90,000.
		expect(report.netProfit).toBe(-10000);
		expect(report.finalBalance).toBe(90000);
	});
});
