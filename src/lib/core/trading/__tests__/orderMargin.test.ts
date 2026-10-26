import { describe, it, expect } from "vitest";
import { workingOrdersMargin } from "../orderMargin";
import { VN_SPOT_RULES, VN_DERIVATIVES_RULES } from "../MarketRules";
import type { TradingOrder, TradingPosition } from "../types";

// Task TVP-A4: margin phong tỏa — mở mới full, đóng covered 0, đảo tính phần dôi.
function order(over: Partial<TradingOrder>): TradingOrder {
	return {
		id: "ord_x",
		clientOrderId: "c-x",
		symbol: "FPT",
		side: "buy",
		type: "limit",
		status: "working",
		quantity: 100,
		filledQuantity: 0,
		price: 128500,
		timeInForce: "GTC",
		createdAt: 0,
		updatedAt: 0,
		...over,
	};
}

function position(over: Partial<TradingPosition>): TradingPosition {
	return {
		id: "pos_1",
		symbol: "FPT",
		side: "long",
		quantity: 100,
		availableQuantity: 100,
		entryPrice: 128500,
		currentPrice: 128500,
		unrealizedPnl: 0,
		realizedPnl: 0,
		createdAt: 0,
		updatedAt: 0,
		...over,
	};
}

describe("workingOrdersMargin", () => {
	it("lệnh mở mới tính full cost (spot)", () => {
		expect(workingOrdersMargin([order({})], [], VN_SPOT_RULES, {})).toBe(12_850_000);
	});

	it("lệnh đóng covered đủ -> 0 (không thổi phồng như TP/SL bracket)", () => {
		const close = order({ side: "sell", type: "stop", price: undefined, stopPrice: 122000 });
		expect(workingOrdersMargin([close], [position({})], VN_SPOT_RULES, {})).toBe(0);
	});

	it("đảo chiều chỉ tính phần dôi (phái sinh)", () => {
		const reverse = order({ symbol: "VN30F1M", side: "sell", type: "market", quantity: 3, price: undefined });
		const current = position({ symbol: "VN30F1M", side: "long", quantity: 1, entryPrice: 1300 });
		// dôi 2 HĐ @1300: 2*1300*100000*0.175*1.25 = 56,875,000
		expect(workingOrdersMargin([reverse], [current], VN_DERIVATIVES_RULES, { VN30F1M: 1300 })).toBe(56_875_000);
	});

	it("bỏ qua lệnh filled/cancelled và lệnh thiếu giá", () => {
		const filled = order({ status: "filled" });
		const noPrice = order({ type: "market", price: undefined });
		expect(workingOrdersMargin([filled, noPrice], [], VN_SPOT_RULES, {})).toBe(0);
	});
});
