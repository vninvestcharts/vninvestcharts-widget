// Task 12: parity lock engine mới <-> cũ + divergence-by-design đã document.
// Quy ước: so sánh ở cùng nhịp gọi (place -> processBar cùng nến). fill-on-next-bar
// là kỷ luật của CALLER (feed nến sau khi đặt), không phải của engine.
import { describe, it, expect } from "vitest";
import { ReplayOrderBook } from "../../replay/ReplayOrderBook";
import { ReplayFillSimulator } from "../../replay/ReplayFillSimulator";
import { ReplayPositionManager } from "../../replay/ReplayPositionManager";
import { OrderManagementSystem } from "../OrderManagementSystem";
import { PositionManager } from "../PositionManager";
import { ExecutionSimulator } from "../ExecutionSimulator";
import { VN_SPOT_RULES } from "../MarketRules";
import type { ReplayOHLCBar } from "../../replay/replayTradingTypes";

function bar(o: number, h: number, l: number, c: number): ReplayOHLCBar {
	return { open: o, high: h, low: l, close: c, date: 0 };
}

function legacyBook() {
	return new ReplayOrderBook(new ReplayFillSimulator({ useOHLC: true }));
}

describe("TradingParity", () => {
	it("limit fill price EQUALITY: cả hai khớp đúng giá limit", () => {
		const legacy = legacyBook();
		legacy.addOrder({ type: "limit", side: "buy", quantity: 2, price: 95, timestamp: 0 });
		expect(legacy.processBar(bar(100, 102, 96, 98), 0, 0).filter((r) => r.filled)).toHaveLength(0);
		const legacyFills = legacy.processBar(bar(100, 102, 94, 98), 1, 1);
		expect(legacyFills).toHaveLength(1);
		expect(legacyFills[0].fillPrice).toBe(95);

		const oms = new OrderManagementSystem();
		oms.placeOrder({ symbol: "T", side: "buy", type: "limit", quantity: 2, price: 95 });
		expect(oms.processBar("T", bar(100, 102, 96, 98))).toHaveLength(0);
		const fills = oms.processBar("T", bar(100, 102, 94, 98));
		expect(fills).toHaveLength(1);
		expect(fills[0].fillPrice).toBe(95);
	});

	it("market base-price DIVERGENCE lock: legacy spread-high vs mới open", () => {
		const legacy = legacyBook();
		legacy.addOrder({ type: "market", side: "buy", quantity: 1, timestamp: 0 });
		const legacyFills = legacy.processBar(bar(100, 102, 98, 101), 0, 0);
		expect(legacyFills[0].fillPrice).toBe(102);

		const oms = new OrderManagementSystem();
		oms.placeOrder({ symbol: "T", side: "buy", type: "market", quantity: 1 });
		const fills = oms.processBar("T", bar(100, 102, 98, 101));
		expect(fills[0].fillPrice).toBe(100);
	});

	it("stop TRIGGER parity + fill-price divergence lock (sell stop 90)", () => {
		const touchBar = bar(92, 95, 88, 89);
		const legacy = legacyBook();
		legacy.addOrder({ type: "stop", side: "sell", quantity: 1, stopPrice: 90, timestamp: 0 });
		const legacyFills = legacy.processBar(touchBar, 0, 0);
		expect(legacyFills).toHaveLength(1);
		expect(legacyFills[0].fillPrice).toBe(88);

		const oms = new OrderManagementSystem();
		oms.placeOrder({ symbol: "T", side: "sell", type: "stop", quantity: 1, stopPrice: 90 });
		const fills = oms.processBar("T", touchBar);
		expect(fills).toHaveLength(1);
		expect(fills[0].fillPrice).toBe(90);
	});

	it("gross PnL formula EQUALITY long/short (feeRate 0 cả hai)", () => {
		const legacyPm = new ReplayPositionManager();
		const legacyPos = legacyPm.openPosition("long", 10, 100, 0, 0);
		const legacyTrade = legacyPm.closePosition(legacyPos.id, 110, 1, "manual", 1)!;
		expect(legacyTrade.pnl).toBe(100);
		const legacyShort = legacyPm.openPosition("short", 10, 100, 2, 2);
		expect(legacyPm.closePosition(legacyShort.id, 110, 3, "manual", 3)!.pnl).toBe(-100);

		const pms = new PositionManager();
		const pos = pms.openPosition({ symbol: "T", side: "long", quantity: 10, price: 100, timestamp: 0 });
		expect(pms.closePosition(pos.id, 10, 110, 1, "manual").realizedPnl).toBe(100);
		const short = pms.openPosition({ symbol: "T", side: "short", quantity: 10, price: 100, timestamp: 2 });
		expect(pms.closePosition(short.id, 10, 110, 3, "manual").realizedPnl).toBe(-100);
	});

	it("multiplier CAPABILITY GAP (documented, không phải parity): mới scale, cũ không có khái niệm", () => {
		const pms = new PositionManager({ contractMultiplier: 100000 });
		const pos = pms.openPosition({ symbol: "VN30F1M", side: "long", quantity: 2, price: 1200, timestamp: 0 });
		expect(pms.closePosition(pos.id, 2, 1210, 1, "manual").realizedPnl).toBe(2_000_000);
	});

	it("net-vs-gross doc: mới trừ phí/thuế, legacy FillResult không có trường phí", () => {
		const legacy = legacyBook();
		legacy.addOrder({ type: "market", side: "sell", quantity: 1000, timestamp: 0 });
		const legacyFills = legacy.processBar(bar(128000, 129000, 127000, 128500), 0, 0);
		expect("commission" in legacyFills[0]).toBe(false);
		expect("tax" in legacyFills[0]).toBe(false);

		const sim = new ExecutionSimulator();
		const ticket = sim.executeFill(
			{
				order: {
					id: "ord_1",
					clientOrderId: "c1",
					symbol: "FPT",
					side: "sell",
					type: "market",
					status: "filled",
					quantity: 1000,
					filledQuantity: 1000,
					timeInForce: "GTC",
					createdAt: 0,
					updatedAt: 0,
				},
				basePrice: 128500,
				quantity: 1000,
				timestamp: 0,
			},
			VN_SPOT_RULES,
		);
		expect(ticket.commission).toBe(128_500);
		expect(ticket.tax).toBe(128_500);
	});
});
