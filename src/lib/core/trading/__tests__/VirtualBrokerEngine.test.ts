import { describe, it, expect } from "vitest";
import { VirtualBrokerEngine } from "../VirtualBrokerEngine";
import { InMemoryStorageAdapter } from "../storage/InMemoryStorageAdapter";
import { TradingStorage } from "../storage/TradingStorage";
import { VN_SPOT_RULES, VN_DERIVATIVES_RULES, CRYPTO_SPOT_RULES } from "../MarketRules";
import type { ReplayOHLCBar } from "../../replay/replayTradingTypes";

// Task 06: VirtualBrokerEngine E2E — OMS fill -> ticket -> PMS -> cashflow -> risk -> persist.
function bar(o: number, h: number, l: number, c: number): ReplayOHLCBar {
	return { open: o, high: h, low: l, close: c, date: 0 };
}

function spotBroker(balance = 100_000_000) {
	const adapter = new InMemoryStorageAdapter();
	const broker = new VirtualBrokerEngine({ rules: VN_SPOT_RULES, storageAdapter: adapter, initialBalance: balance });
	return { adapter, broker };
}

function futBroker(balance = 50_000_000) {
	const adapter = new InMemoryStorageAdapter();
	const broker = new VirtualBrokerEngine({
		rules: VN_DERIVATIVES_RULES,
		storageAdapter: adapter,
		initialBalance: balance,
	});
	return { adapter, broker };
}

describe("broker spot round trip", () => {
	it("mua -> khớp open -> vị thế + trừ tiền + phí, history 1 ticket", () => {
		const { broker } = spotBroker();
		broker.onBar("FPT", bar(128000, 128400, 127800, 128200), 1);
		const order = broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		expect(order.status).toBe("working");
		broker.onBar("FPT", bar(128500, 129000, 128000, 128800), 2);
		expect(broker.getPositions()).toHaveLength(1);
		expect(broker.getPositions()[0].entryPrice).toBe(128500);
		// 100M - 12.85M - phí 12,850
		expect(broker.getAccount().balance).toBe(87_137_150);
		expect(broker.getHistory()).toHaveLength(1);
		expect(broker.getHistory()[0].fillPrice).toBe(128500);
	});

	it("bracket TP khớp -> đóng vị thế, cộng tiền - phí - thuế bán", () => {
		const { broker } = spotBroker();
		broker.onBar("FPT", bar(128000, 128400, 127800, 128200), 1);
		broker.placeOrder({
			symbol: "FPT",
			side: "buy",
			type: "market",
			quantity: 100,
			bracket: { takeProfitPrice: 135000, stopLossPrice: 122000 },
		});
		broker.onBar("FPT", bar(128500, 129000, 128000, 128800), 2);
		broker.onBar("FPT", bar(134000, 136000, 133000, 135500), 3);
		expect(broker.getPositions()).toHaveLength(0);
		// 87,137,150 + 13.5M - phí 13,500 - thuế 13,500
		expect(broker.getAccount().balance).toBe(100_610_150);
		expect(broker.getHistory()).toHaveLength(2);
		const analytics = broker.getAnalytics();
		expect(analytics.totalTrades).toBe(1);
		expect(analytics.winRate).toBe(1);
	});
});

describe("broker T+2 gate: voluntary sell bị chặn, bracket fill vẫn qua", () => {
	const friday = new Date(2026, 8, 18, 10, 0, 0, 0).getTime();
	const monday = new Date(2026, 8, 21, 10, 0, 0, 0).getTime();

	it("bán tay trước T+2 -> rejected INVALID_QUANTITY", () => {
		const { broker } = spotBroker();
		broker.onBar("FPT", bar(128500, 129000, 128000, 128800), friday);
		const buy = broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		expect(buy.status).toBe("working");
		broker.onBar("FPT", bar(128500, 129000, 128000, 128800), friday + 1);
		const sell = broker.placeOrder({ symbol: "FPT", side: "sell", type: "market", quantity: 100 });
		broker.onBar("FPT", bar(129000, 129500, 128500, 129200), monday);
		expect(sell.status).toBe("rejected");
		expect(sell.rejectCode).toBe("INVALID_QUANTITY");
		expect(broker.getPositions()).toHaveLength(1);
	});

	it("TP bracket khớp trước T+2 vẫn đóng (pre-authorized)", () => {
		const { broker } = spotBroker();
		broker.onBar("FPT", bar(128500, 129000, 128000, 128800), friday);
		broker.placeOrder({
			symbol: "FPT",
			side: "buy",
			type: "market",
			quantity: 100,
			bracket: { takeProfitPrice: 135000, stopLossPrice: 122000 },
		});
		broker.onBar("FPT", bar(128500, 129000, 128000, 128800), friday + 1);
		broker.onBar("FPT", bar(134000, 136000, 133000, 135500), monday);
		expect(broker.getPositions()).toHaveLength(0);
	});
});

describe("broker derivatives + reversal + ambiguity", () => {
	it("mở 1 HĐ trong margin, HĐ thứ 2 vượt -> reject; đóng tay đúng balance", () => {
		const { broker } = futBroker();
		broker.onBar("VN30F1M", bar(1300, 1305, 1295, 1300), 1);
		const first = broker.placeOrder({ symbol: "VN30F1M", side: "buy", type: "market", quantity: 1 });
		expect(first.status).toBe("working");
		broker.onBar("VN30F1M", bar(1300, 1310, 1295, 1310), 2);
		const second = broker.placeOrder({ symbol: "VN30F1M", side: "buy", type: "market", quantity: 1 });
		expect(second.status).toBe("rejected");
		expect(second.rejectCode).toBe("INSUFFICIENT_BUYING_POWER");
		// Đóng tay tại mark 1310: +1M realized - phí 3000 - thuế 11463; mở đã trừ 3000 + 11375
		const pos = broker.getPositions()[0];
		expect(broker.closePosition(pos.id)).toBe(true);
		expect(broker.getAccount().balance).toBe(50_971_162);
	});

	it("đảo chiều short->long: realized cộng 1 lần, vị thế mới đúng", () => {
		const { broker } = futBroker(100_000_000);
		broker.onBar("VN30F1M", bar(1300, 1305, 1295, 1300), 1);
		broker.placeOrder({ symbol: "VN30F1M", side: "sell", type: "market", quantity: 1 });
		broker.onBar("VN30F1M", bar(1300, 1305, 1295, 1300), 2);
		broker.placeOrder({ symbol: "VN30F1M", side: "buy", type: "market", quantity: 2 });
		broker.onBar("VN30F1M", bar(1290, 1295, 1285, 1290), 3);
		const positions = broker.getPositions();
		expect(positions).toHaveLength(1);
		expect(positions[0].side).toBe("long");
		expect(positions[0].quantity).toBe(1);
		// 100M -3000 -11375 -6000 -22575 +1,000,000
		expect(broker.getAccount().balance).toBe(100_957_050);
	});

	it("nến nuốt TP+SL -> SL khớp, cờ ambiguity trên ticket", () => {
		const { broker } = spotBroker();
		broker.onBar("FPT", bar(128500, 129000, 128000, 128800), 1);
		broker.placeOrder({
			symbol: "FPT",
			side: "buy",
			type: "market",
			quantity: 100,
			bracket: { takeProfitPrice: 135000, stopLossPrice: 122000 },
		});
		broker.onBar("FPT", bar(128500, 129000, 128000, 128800), 2);
		broker.onBar("FPT", bar(128000, 136000, 121000, 125000), 3);
		expect(broker.getPositions()).toHaveLength(0);
		const sellTicket = broker.getHistory().find((t) => t.side === "sell")!;
		expect(sellTicket.fillPrice).toBe(122000);
		expect(sellTicket.ambiguousIntrabarFill).toBe(true);
		expect(sellTicket.tieBreakReason).toBe("CONSERVATIVE_SL_PRIORITY");
	});
});

describe("broker cancel/modify/closeAll/persist/reset", () => {
	it("modify đổi giá limit -> khớp mức mới; cancel filled -> false", () => {
		const { broker } = spotBroker();
		broker.onBar("FPT", bar(128000, 128500, 127800, 128200), 1);
		const o = broker.placeOrder({ symbol: "FPT", side: "buy", type: "limit", quantity: 100, price: 127000 });
		broker.modifyOrder(o.id, { price: 126000 });
		expect(broker.getHistory()).toHaveLength(0);
		broker.onBar("FPT", bar(128000, 128500, 126500, 127000), 2);
		expect(broker.getHistory()).toHaveLength(0);
		broker.onBar("FPT", bar(126800, 127000, 125900, 126200), 3);
		expect(broker.getHistory()[0].fillPrice).toBe(126000);
		expect(broker.cancelOrder(o.id)).toBe(false);
	});

	it("closeAllPositions đóng mọi symbol, trả về số lượng", () => {
		// Dùng futures (T+0) để voluntary close không vướng T+2 như spot.
		const { broker } = futBroker(120_000_000);
		broker.onBar("VN30F1M", bar(1300, 1305, 1295, 1300), 1);
		broker.onBar("VN30F2M", bar(1310, 1315, 1305, 1310), 1);
		broker.placeOrder({ symbol: "VN30F1M", side: "buy", type: "market", quantity: 1 });
		broker.placeOrder({ symbol: "VN30F2M", side: "sell", type: "market", quantity: 1 });
		broker.onBar("VN30F1M", bar(1300, 1310, 1295, 1305), 2);
		broker.onBar("VN30F2M", bar(1310, 1315, 1305, 1308), 2);
		expect(broker.getPositions()).toHaveLength(2);
		expect(broker.closeAllPositions("manual")).toBe(2);
		expect(broker.getPositions()).toHaveLength(0);
	});

	it("persist round-trip: broker mới hydrate khôi phục đủ state", async () => {
		const { adapter, broker } = spotBroker();
		broker.onBar("FPT", bar(128000, 128500, 127800, 128200), 1);
		broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		broker.onBar("FPT", bar(128500, 129000, 128000, 128800), 2);
		await broker.flush();
		const broker2 = new VirtualBrokerEngine({ rules: VN_SPOT_RULES, storageAdapter: adapter });
		expect(await broker2.hydrate()).toBe(true);
		expect(broker2.getPositions()).toHaveLength(1);
		expect(broker2.getPositions()[0].entryPrice).toBe(128500);
		expect(broker2.getAccount().balance).toBe(broker.getAccount().balance);
		expect(broker2.getHistory()).toHaveLength(1);
	});

	it("resetAccount xóa sạch và về balance mặc định mới (VND 1 tỷ)", async () => {
		const { broker } = spotBroker();
		broker.onBar("FPT", bar(128000, 128500, 127800, 128200), 1);
		broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		broker.onBar("FPT", bar(128500, 129000, 128000, 128800), 2);
		await broker.flush();
		broker.resetAccount();
		expect(broker.getPositions()).toHaveLength(0);
		expect(broker.getHistory()).toHaveLength(0);
		expect(broker.getAccount().balance).toBe(1_000_000_000);
	});

	it("vốn mặc định mới: crypto 100k USD, VND 1 tỷ (mua thoải mái)", () => {
		const adapter = new InMemoryStorageAdapter();
		const crypto = new VirtualBrokerEngine({ rules: CRYPTO_SPOT_RULES, storageAdapter: adapter });
		expect(crypto.getAccount().balance).toBe(100_000);
		const spot = new VirtualBrokerEngine({ rules: VN_SPOT_RULES, storageAdapter: adapter });
		expect(spot.getAccount().balance).toBe(1_000_000_000);
	});

	it("resetAccount kèm số vốn tùy chọn (dialog nạp vốn)", async () => {
		const { broker } = spotBroker();
		broker.resetAccount(250_000_000);
		expect(broker.getAccount().balance).toBe(250_000_000);
		expect(broker.getAccount().equity).toBe(250_000_000);
		expect(broker.getAccount().buyingPower).toBe(250_000_000);
	});

	it("đóng tay không có giá thị trường -> throw", async () => {
		const adapter = new InMemoryStorageAdapter();
		const storage = new TradingStorage(adapter, "ns-noprice");
		await storage.saveState({
			version: 1,
			savedAt: 0,
			account: {
				accountId: "t",
				balance: 100_000_000,
				equity: 100_000_000,
				marginUsed: 0,
				freeMargin: 100_000_000,
				buyingPower: 100_000_000,
				currency: "VND",
				pnl: 0,
				pnlPercent: 0,
			},
			orders: [],
			positions: [
				{
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
				},
			],
			trailingPeaks: {},
			history: [],
			closedTrades: [],
			equityCurve: [],
		});
		const broker = new VirtualBrokerEngine({
			rules: VN_SPOT_RULES,
			storageAdapter: adapter,
			storageNamespace: "ns-noprice",
		});
		expect(await broker.hydrate()).toBe(true);
		expect(() => broker.closePosition("pos_1")).toThrow();
	});
});

describe("broker closeAllPositions(symbol) (Task M3)", () => {
	it("chỉ đóng vị thế đúng symbol, giữ nguyên mã khác", () => {
		const { broker } = futBroker(500_000_000);
		broker.onBar("VN30F1M", bar(1300, 1310, 1290, 1300), 1);
		broker.onBar("VN30F2M", bar(1310, 1320, 1300, 1310), 1);
		broker.placeOrder({ symbol: "VN30F1M", side: "buy", type: "market", quantity: 1 });
		broker.placeOrder({ symbol: "VN30F2M", side: "buy", type: "market", quantity: 1 });
		broker.onBar("VN30F1M", bar(1300, 1310, 1295, 1305), 2);
		broker.onBar("VN30F2M", bar(1310, 1320, 1305, 1315), 2);
		expect(broker.getPositions()).toHaveLength(2);
		expect(broker.closeAllPositions("manual", "VN30F1M")).toBe(1);
		expect(broker.getPositions().map((p) => p.symbol)).toEqual(["VN30F2M"]);
		expect(broker.closeAllPositions("manual")).toBe(1);
		expect(broker.getPositions()).toHaveLength(0);
	});
});

describe("P1.1 live fillMarketOnPlace (D-01 live-scoped)", () => {
	function liveBroker(balance = 100_000_000) {
		const adapter = new InMemoryStorageAdapter();
		const broker = new VirtualBrokerEngine({
			rules: VN_SPOT_RULES,
			storageAdapter: adapter,
			initialBalance: balance,
			fillMarketOnPlace: true,
		});
		return { adapter, broker };
	}

	it("market khớp ngay tại mark, không cần onBar sau", () => {
		const { broker } = liveBroker();
		broker.onBar("FPT", bar(128000, 128400, 127800, 128200), 1);
		const order = broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		expect(order.status).toBe("filled");
		expect(order.filledQuantity).toBe(100);
		expect(broker.getPositions()).toHaveLength(1);
		expect(broker.getPositions()[0].entryPrice).toBe(128200);
		expect(broker.getHistory()).toHaveLength(1);
	});

	it("limit vẫn đợi nến (không fill tức thì)", () => {
		const { broker } = liveBroker();
		broker.onBar("FPT", bar(128000, 128400, 127800, 128200), 1);
		const order = broker.placeOrder({ symbol: "FPT", side: "buy", type: "limit", quantity: 100, price: 127000 });
		expect(order.status).toBe("working");
		expect(broker.getPositions()).toHaveLength(0);
		broker.onBar("FPT", bar(128500, 129000, 128000, 128800), 2);
		expect(broker.getPositions()).toHaveLength(0);
		broker.onBar("FPT", bar(128000, 136000, 121000, 125000), 3);
		expect(broker.getPositions()).toHaveLength(1);
	});

	it("không mark (chưa feed) → validation reject như cũ (flag không bypass)", () => {
		const { broker } = liveBroker();
		const order = broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		expect(order.status).toBe("rejected");
		expect(broker.getPositions()).toHaveLength(0);
	});

	it("default (không flag) giữ quy ước nến-kế (backtest/replay an toàn)", () => {
		const { broker } = spotBroker();
		broker.onBar("FPT", bar(128000, 128400, 127800, 128200), 1);
		const order = broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		expect(order.status).toBe("working");
		expect(broker.getPositions()).toHaveLength(0);
	});

	it("P1.2b: IOC limit chạm mark khớp ngay; không chạm thì hủy (mọi broker)", () => {
		const { broker } = spotBroker();
		broker.onBar("FPT", bar(128000, 128400, 127800, 128200), 1);
	 const hit = broker.placeOrder({ symbol: "FPT", side: "buy", type: "limit", quantity: 100, price: 128200, timeInForce: "IOC" });
		expect(hit.status).toBe("filled");
		const miss = broker.placeOrder({ symbol: "FPT", side: "buy", type: "limit", quantity: 100, price: 1, timeInForce: "IOC" });
		expect(miss.status).toBe("cancelled");
		expect(broker.getPositions()).toHaveLength(1);
	});

	it("P1.2c VN: MP khớp ngay ở live (flag), crypto reject ở Risk", () => {
		const { broker } = liveBroker();
		broker.onBar("FPT", bar(128000, 128400, 127800, 128200), 1);
		const mp = broker.placeOrder({ symbol: "FPT", side: "buy", type: "mp", quantity: 100 });
		expect(mp.status).toBe("filled");
		expect(broker.getPositions()).toHaveLength(1);
	});

	it("P1.2b: DAY không đánh ngay (chờ nến như GTC), hết hạn qua ngày", () => {
		const { broker } = spotBroker();
		broker.onBar("FPT", bar(128000, 128400, 127800, 128200), 1);
		const order = broker.placeOrder({ symbol: "FPT", side: "buy", type: "limit", quantity: 100, price: 1, timeInForce: "DAY" });
		expect(order.status).toBe("working");
		expect(broker.getPositions()).toHaveLength(0);
	});
});
