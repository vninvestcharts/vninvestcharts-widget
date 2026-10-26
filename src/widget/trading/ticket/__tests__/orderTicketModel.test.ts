import { describe, it, expect } from "vitest";
import {
	buildCandidate,
	buildOrderReview,
	formatSubmitSummary,
	offsetTicksToPrice,
	parseNumber,
	riskPercentToDistance,
} from "../orderTicketModel";

// Task TVP-B1: logic ticket thuần dùng chung Modal + Dock.
describe("orderTicketModel", () => {
	it("parseNumber lọc ký tự + rỗng/NaN -> undefined", () => {
		expect(parseNumber("12,850.5đ")).toBe(12850.5);
		expect(parseNumber("")).toBeUndefined();
		expect(parseNumber("   ")).toBeUndefined();
		expect(parseNumber("abc")).toBeUndefined();
	});

	it("buildCandidate ráp bracket + entryPrice, default GTC khi không truyền TIF", () => {
		const { candidate, entryPrice } = buildCandidate({
			symbol: "FPT",
			side: "buy",
			type: "limit",
			quantity: 100,
			limitPrice: 127000,
			takeProfitPrice: 135000,
			stopLossPrice: 122000,
		});
		expect(candidate).toMatchObject({ type: "limit", price: 127000, timeInForce: "GTC" });
		expect(candidate.bracket).toMatchObject({ takeProfitPrice: 135000, stopLossPrice: 122000 });
		expect(entryPrice).toBe(127000);
	});

	it("P1.2b: buildCandidate truyền TIF user chọn (DAY/IOC/FOK)", () => {
		for (const tif of ["DAY", "IOC", "FOK"] as const) {
			const { candidate } = buildCandidate({ symbol: "FPT", side: "buy", type: "market", quantity: 100, timeInForce: tif });
			expect(candidate.timeInForce).toBe(tif);
		}
	});

	it("buildCandidate không bracket khi trống", () => {
		const { candidate } = buildCandidate({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		expect(candidate.bracket).toBeUndefined();
		expect(candidate.price).toBeUndefined();
	});

	it("offsetTicksToPrice theo hướng + snap tick, guard invalid", () => {
		expect(offsetTicksToPrice(128500, "buy", 1, 100)).toBe(128600);
		expect(offsetTicksToPrice(128500, "sell", 2, 100)).toBe(128300);
		expect(offsetTicksToPrice(Number.NaN, "buy", 1, 100)).toBeNaN();
		expect(offsetTicksToPrice(128500, "buy", 1, 0)).toBe(128500);
	});

	it("riskPercentToDistance đổi % vốn ra khoảng giá, guard invalid", () => {
		// 1% * 100M / (100 * 1) = 10000đ
		expect(riskPercentToDistance(1, 100_000_000, 100, 1)).toBe(10000);
		expect(riskPercentToDistance(0, 100_000_000, 100, 1)).toBeUndefined();
		expect(riskPercentToDistance(1, 0, 100, 1)).toBeUndefined();
		expect(riskPercentToDistance(1, 100_000_000, 0, 1)).toBeUndefined();
	});

	it("formatSubmitSummary kiểu TV, 2 locale", () => {
		expect(
			formatSubmitSummary({ side: "buy", quantity: 100, symbol: "FPT", price: 128500, type: "limit" }),
		).toBe("MUA 100 FPT @ 128,500 LIMIT");
		expect(
			formatSubmitSummary({ side: "sell", quantity: 1, symbol: "VN30F1M", type: "market", locale: "en" }),
		).toBe("SELL 1 VN30F1M MARKET");
	});

	// AC4 — giá trị lệnh (notional) là con số user kiểm nhẩm trước khi bấm.
	it("buildOrderReview: notional = KL × giá × multiplier (giá ưu tiên price → stopPrice → mark)", () => {
		const { candidate } = buildCandidate({
			symbol: "FPT",
			side: "buy",
			type: "limit",
			quantity: 100,
			limitPrice: 127000,
		});
		const review = buildOrderReview({
			candidate,
			markPrice: 128500,
			contractMultiplier: 1,
			requiredMargin: 12_700_000,
			buyingPower: 100_000_000,
		});
		expect(review.notional).toBe(12_700_000);
		expect(review.price).toBe(127000);
		expect(review.symbol).toBe("FPT");
		expect(review.side).toBe("buy");
		expect(review.quantity).toBe(100);
		expect(review.requiredMargin).toBe(12_700_000);
		expect(review.buyingPower).toBe(100_000_000);
	});

	it("buildOrderReview: market dùng markPrice, stop dùng stopPrice, có multiplier", () => {
		const market = buildCandidate({ symbol: "BTCUSDT", side: "buy", type: "market", quantity: 2 });
		const marketReview = buildOrderReview({
			candidate: market.candidate,
			markPrice: 80_602.03,
			contractMultiplier: 1,
			requiredMargin: undefined,
			buyingPower: 50_000,
		});
		expect(marketReview.price).toBe(80_602.03);
		expect(marketReview.notional).toBeCloseTo(161_204.06, 5);

		const stop = buildCandidate({ symbol: "FPT", side: "sell", type: "stop", quantity: 10, stopPrice: 120000 });
		const stopReview = buildOrderReview({
			candidate: stop.candidate,
			markPrice: 128500,
			contractMultiplier: 2,
			requiredMargin: undefined,
			buyingPower: 50_000,
		});
		expect(stopReview.price).toBe(120000);
		expect(stopReview.notional).toBe(2_400_000);
	});

	it("buildOrderReview: TP/SL lấy từ bracket, không có thì undefined", () => {
		const withBracket = buildCandidate({
			symbol: "FPT",
			side: "buy",
			type: "limit",
			quantity: 1,
			limitPrice: 100,
			takeProfitPrice: 110,
			stopLossPrice: 90,
		});
		const review = buildOrderReview({
			candidate: withBracket.candidate,
			markPrice: 100,
			contractMultiplier: 1,
			requiredMargin: undefined,
			buyingPower: 1,
		});
		expect(review.takeProfitPrice).toBe(110);
		expect(review.stopLossPrice).toBe(90);

		const plain = buildCandidate({ symbol: "FPT", side: "buy", type: "limit", quantity: 1, limitPrice: 100 });
		const plainReview = buildOrderReview({
			candidate: plain.candidate,
			markPrice: 100,
			contractMultiplier: 1,
			requiredMargin: undefined,
			buyingPower: 1,
		});
		expect(plainReview.takeProfitPrice).toBeUndefined();
		expect(plainReview.stopLossPrice).toBeUndefined();
	});
});
