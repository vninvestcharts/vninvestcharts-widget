import { describe, it, expect } from "vitest";
import { ExecutionSimulator } from "../ExecutionSimulator";
import { VN_SPOT_RULES, VN_DERIVATIVES_RULES, GLOBAL_MARGIN_RULES } from "../MarketRules";
import type { TradingOrder } from "../types";

// Task 05: ExecutionSimulator — executeFill thuần túy, CV11133 tax, tick slippage,
// intrabar ambiguity predicate, estimateOrderCost. 0% trigger logic (OMS giữ quyền).
function sampleOrder(over: Partial<TradingOrder>): TradingOrder {
	return {
		id: "ord_1",
		clientOrderId: "client_1",
		symbol: "FPT",
		side: "buy",
		type: "market",
		status: "working",
		quantity: 100,
		filledQuantity: 0,
		timeInForce: "GTC",
		createdAt: 1000,
		updatedAt: 1000,
		...over,
	};
}

describe("ExecutionSimulator spot fees & tax", () => {
	it("spot buy: phí môi giới 0.1%, thuế = 0", () => {
		const sim = new ExecutionSimulator();
		const ticket = sim.executeFill(
			{
				order: sampleOrder({ symbol: "FPT", side: "buy", quantity: 100 }),
				basePrice: 128500,
				quantity: 100,
				timestamp: 2000,
			},
			VN_SPOT_RULES,
		);
		// 100 * 128500 = 12,850,000. Phí 0.1% = 12,850.
		expect(ticket.fillPrice).toBe(128500);
		expect(ticket.fillQuantity).toBe(100);
		expect(ticket.commission).toBe(12850);
		expect(ticket.tax).toBe(0);
		expect(ticket.pnl).toBe(0);
	});

	it("spot sell (đóng vị thế): phí 0.1%, thuế bán 0.1%, tính net PnL nếu có positionBasis", () => {
		const sim = new ExecutionSimulator();
		const ticket = sim.executeFill(
			{
				order: sampleOrder({ symbol: "FPT", side: "sell", quantity: 100 }),
				basePrice: 130000,
				quantity: 100,
				timestamp: 2000,
				positionBasis: { entryPrice: 128500, side: "long" },
				exitReason: "tp",
			},
			VN_SPOT_RULES,
		);
		// Giá trị bán: 13,000,000. Phí = 13,000. Thuế = 13,000.
		expect(ticket.commission).toBe(13000);
		expect(ticket.tax).toBe(13000);
		expect(ticket.exitReason).toBe("tp");
		// Gross PnL = (130,000 - 128,500) * 100 = 150,000.
		// Net PnL = 150,000 - 13,000 (phí bán) - 13,000 (thuế) = 124,000.
		expect(ticket.pnl).toBe(124000);
	});
});

describe("ExecutionSimulator derivatives fees & CV11133 tax", () => {
	it("1 HĐ VN30F1M @1300: phí 3000 (default plan), thuế CV11133 = 11375", () => {
		const sim = new ExecutionSimulator();
		const ticket = sim.executeFill(
			{
				order: sampleOrder({ symbol: "VN30F1M", side: "buy", quantity: 1 }),
				basePrice: 1300,
				quantity: 1,
				timestamp: 2000,
			},
			VN_DERIVATIVES_RULES,
		);
		// Phí = 1 * 3000.
		expect(ticket.commission).toBe(3000);
		// Thuế: 1300 * 100000 * 1 * (0.175 / 2) * 0.001 = 11375.
		expect(ticket.tax).toBe(11375);
	});

	it("phái sinh cả 2 chiều Mua & Bán đều chịu thuế CV11133", () => {
		const sim = new ExecutionSimulator();
		const buyTicket = sim.executeFill(
			{
				order: sampleOrder({ symbol: "VN30F1M", side: "buy", quantity: 2 }),
				basePrice: 1300,
				quantity: 2,
				timestamp: 2000,
			},
			VN_DERIVATIVES_RULES,
		);
		const sellTicket = sim.executeFill(
			{
				order: sampleOrder({ symbol: "VN30F1M", side: "sell", quantity: 2 }),
				basePrice: 1300,
				quantity: 2,
				timestamp: 2000,
			},
			VN_DERIVATIVES_RULES,
		);
		expect(buyTicket.tax).toBe(22750);
		expect(sellTicket.tax).toBe(22750);
	});

	it("phái sinh đóng vị thế short có lãi -> net PnL trừ phí và thuế", () => {
		const sim = new ExecutionSimulator();
		const ticket = sim.executeFill(
			{
				order: sampleOrder({ symbol: "VN30F1M", side: "buy", quantity: 1 }),
				basePrice: 1290,
				quantity: 1,
				timestamp: 2000,
				positionBasis: { entryPrice: 1300, side: "short" },
				exitReason: "tp",
			},
			VN_DERIVATIVES_RULES,
		);
		// Gross PnL = (1300 - 1290) * 1 * 100000 = 1,000,000.
		// Phí = 3000.
		// Thuế = 1290 * 100000 * 1 * (0.175 / 2) * 0.001 = 11287.5 -> round 11288.
		expect(ticket.commission).toBe(3000);
		expect(ticket.tax).toBe(11288);
		expect(ticket.pnl).toBe(1000000 - 3000 - 11288);
	});
});

describe("ExecutionSimulator slippage & intrabar ambiguity", () => {
	it("slippageTicks: buy trượt lên, sell trượt xuống theo tick size", () => {
		const sim = new ExecutionSimulator({ slippageTicks: 2 });
		// FPT tick size = 100. Slippage = 200.
		const buyTicket = sim.executeFill(
			{
				order: sampleOrder({ symbol: "FPT", side: "buy", quantity: 100 }),
				basePrice: 128500,
				quantity: 100,
				timestamp: 2000,
			},
			VN_SPOT_RULES,
		);
		expect(buyTicket.fillPrice).toBe(128700);

		const sellTicket = sim.executeFill(
			{
				order: sampleOrder({ symbol: "FPT", side: "sell", quantity: 100 }),
				basePrice: 128500,
				quantity: 100,
				timestamp: 2000,
			},
			VN_SPOT_RULES,
		);
		expect(sellTicket.fillPrice).toBe(128300);
	});

	it("checkIntrabarAmbiguity: nến nuốt cả SL và TP -> true; bình thường -> false", () => {
		const sim = new ExecutionSimulator();
		// Vị thế Long: entry 1300, TP 1315, SL 1290.
		// Nến nuốt cả 2: low 1288 <= 1290 VÀ high 1316 >= 1315.
		const barSpike = { open: 1302, high: 1316, low: 1288, close: 1305, timestamp: 1000 };
		expect(sim.checkIntrabarAmbiguity(1315, 1290, barSpike, "long")).toBe(true);

		// Nến chỉ chạm TP: high 1316 >= 1315, low 1295 > 1290.
		const barTpOnly = { open: 1302, high: 1316, low: 1295, close: 1310, timestamp: 1000 };
		expect(sim.checkIntrabarAmbiguity(1315, 1290, barTpOnly, "long")).toBe(false);

		// Vị thế Short: entry 1300, TP 1285, SL 1310.
		// Nến nuốt cả 2: high 1312 >= 1310 VÀ low 1284 <= 1285.
		const barShortSpike = { open: 1300, high: 1312, low: 1284, close: 1295, timestamp: 1000 };
		expect(sim.checkIntrabarAmbiguity(1285, 1310, barShortSpike, "short")).toBe(true);
	});

	it("ambiguousIntrabarFill cờ và tieBreakReason gắn đúng vào ticket", () => {
		const sim = new ExecutionSimulator();
		const ticket = sim.executeFill(
			{
				order: sampleOrder({ symbol: "VN30F1M", side: "sell", quantity: 1 }),
				basePrice: 1290,
				quantity: 1,
				timestamp: 2000,
				ambiguousIntrabarFill: true,
				tieBreakReason: "CONSERVATIVE_SL_PRIORITY",
			},
			VN_DERIVATIVES_RULES,
		);
		expect(ticket.ambiguousIntrabarFill).toBe(true);
		expect(ticket.tieBreakReason).toBe("CONSERVATIVE_SL_PRIORITY");
	});
});

describe("ExecutionSimulator estimateOrderCost", () => {
	it("ước tính chi phí mua FPT 1000@128500: cost + commission + 0 tax", () => {
		const sim = new ExecutionSimulator();
		const est = sim.estimateOrderCost({ side: "buy", quantity: 1000 }, 128500, VN_SPOT_RULES);
		expect(est.estimatedCost).toBe(128_500_000);
		expect(est.commission).toBe(128_500);
		expect(est.estimatedTax).toBe(0);
		expect(est.totalOutflow).toBe(128_628_500);
	});

	it("ước tính chi phí bán FPT 1000@128500: tiền thu về sau trừ phí và thuế", () => {
		const sim = new ExecutionSimulator();
		const est = sim.estimateOrderCost({ side: "sell", quantity: 1000 }, 128500, VN_SPOT_RULES);
		expect(est.commission).toBe(128_500);
		expect(est.estimatedTax).toBe(128_500);
	});

	it("options override: đổi brokerFeeRate và commissionPerContract", () => {
		const sim = new ExecutionSimulator({
			brokerFeeRate: 0.0015,
			commissionPerContract: 2500,
		});
		const spot = sim.estimateOrderCost({ side: "buy", quantity: 100 }, 100000, VN_SPOT_RULES);
		expect(spot.commission).toBe(15000);

		const deriv = sim.estimateOrderCost({ side: "buy", quantity: 2 }, 1300, VN_DERIVATIVES_RULES);
		expect(deriv.commission).toBe(5000);
	});
});
