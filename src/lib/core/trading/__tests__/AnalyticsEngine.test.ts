import { describe, it, expect } from "vitest";
import { AnalyticsEngine, computeSharpeRatio } from "../AnalyticsEngine";
import { ReplaySessionAnalytics } from "../../replay/ReplaySessionAnalytics";

// Task TVP-A4: Sharpe port exact từ legacy + edges chống NaN/Infinity.
describe("computeSharpeRatio", () => {
	it("< 3 điểm -> 0", () => {
		expect(computeSharpeRatio([])).toBe(0);
		expect(computeSharpeRatio([{ timestamp: 1, equity: 100 }])).toBe(0);
		expect(
			computeSharpeRatio([
				{ timestamp: 1, equity: 100 },
				{ timestamp: 2, equity: 101 },
			]),
		).toBe(0);
	});

	it("equity phẳng (stdDev 0) -> 0, không NaN/Infinity", () => {
		const flat = [1, 2, 3, 4].map((timestamp) => ({ timestamp, equity: 100_000 }));
		const sharpe = computeSharpeRatio(flat);
		expect(sharpe).toBe(0);
		expect(Number.isFinite(sharpe)).toBe(true);
	});

	it("bằng legacy trên cùng curve (parity công thức)", () => {
		const curve = [
			{ timestamp: 1, equity: 100_000 },
			{ timestamp: 2, equity: 101_000 },
			{ timestamp: 3, equity: 99_500 },
			{ timestamp: 4, equity: 102_000 },
			{ timestamp: 5, equity: 101_200 },
		];
		const legacy = new ReplaySessionAnalytics();
		legacy.reset(100_000);
		for (const point of curve) legacy.recordEquity(point.timestamp, point.equity - 100_000);
		expect(computeSharpeRatio(curve)).toBe(legacy.getStats().sharpeRatio);
	});
});

describe("AnalyticsEngine.getAnalytics", () => {
	it("trả sharpeRatio + closedTrades trong output", () => {
		const engine = new AnalyticsEngine();
		engine.recordClosedTrade({ timestamp: 2, realizedPnl: 650000, commission: 13500, tax: 13500 });
		engine.recordEquityPoint(1, 100_000_000);
		engine.recordEquityPoint(2, 100_610_150);
		engine.recordEquityPoint(3, 100_700_000);
		const analytics = engine.getAnalytics();
		expect(analytics.totalTrades).toBe(1);
		expect(analytics.closedTrades).toHaveLength(1);
		expect(Number.isFinite(analytics.sharpeRatio)).toBe(true);
	});
});
