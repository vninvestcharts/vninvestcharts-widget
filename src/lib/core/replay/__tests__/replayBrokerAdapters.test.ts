import { describe, it, expect } from "vitest";
import {
	REPLAY_SPOT_RULES,
	mapPositionToReplay,
	mapTicketToReplayTrade,
	mapReplayOrderToBrokerInput,
	matchCloseLeg,
} from "../replayBrokerAdapters";
import { VN_SPOT_RULES } from "../../trading/MarketRules";

// Task 11: khóa mapping broker mới <-> shapes legacy.
describe("replayBrokerAdapters", () => {
	it("REPLAY_SPOT_RULES = VN_SPOT nhưng settlementDays 0 (không T+2 trong replay)", () => {
		expect(REPLAY_SPOT_RULES.settlementDays).toBe(0);
		expect(REPLAY_SPOT_RULES.lotSize).toBe(VN_SPOT_RULES.lotSize);
		// Replay cho short cả 2 chiều như legacy (live vẫn cấm qua VN_SPOT gốc).
		expect(REPLAY_SPOT_RULES.allowShortSelling).toBe(true);
		expect(REPLAY_SPOT_RULES.getTickSize(5000)).toBe(10);
	});

	it("mapPositionToReplay giữ id/side/qty, tính unrealized từ mark", () => {
		const mapped = mapPositionToReplay(
			{
				id: "pos_1",
				symbol: "FPT",
				side: "long",
				quantity: 100,
				availableQuantity: 100,
				entryPrice: 128500,
				currentPrice: 0,
				unrealizedPnl: 0,
				realizedPnl: 0,
				createdAt: 1000,
				updatedAt: 1000,
			},
			{ mark: 135000, stopLoss: 122000, entryBarIndex: 5 },
		);
		expect(mapped.id).toBe("pos_1");
		expect(mapped.currentPrice).toBe(135000);
		expect(mapped.unrealizedPnl).toBe((135000 - 128500) * 100);
		expect(mapped.stopLoss).toBe(122000);
		expect(mapped.entryBarIndex).toBe(5);
		expect(mapped.symbol).toBe("FPT");
	});

	it("mapTicketToReplayTrade: side theo ENTRY, pnlPercent đúng dấu, barsHeld clamp", () => {
		const trade = mapTicketToReplayTrade(
			{
				orderId: "ord_9",
				symbol: "FPT",
				side: "sell",
				fillPrice: 135000,
				fillQuantity: 100,
				commission: 13500,
				tax: 13500,
				pnl: 623000,
				timestamp: 3000,
			},
			{ entryPrice: 128500, entryTimestamp: 1000, entryBarIndex: 2, positionSide: "long" },
			5,
		);
		expect(trade.side).toBe("buy");
		expect(trade.pnl).toBe(623000);
		expect(trade.pnlPercent).toBeCloseTo(((135000 - 128500) / 128500) * 100, 10);
		expect(trade.barsHeld).toBe(3);
		expect(trade.exitReason).toBe("manual");
	});

	it("mapTicketToReplayTrade: trailing_stop -> sl, short đảo dấu pnlPercent", () => {
		const trade = mapTicketToReplayTrade(
			{
				orderId: "ord_7",
				symbol: "X",
				side: "buy",
				fillPrice: 90,
				fillQuantity: 2,
				commission: 0,
				tax: 0,
				pnl: 20,
				exitReason: "trailing_stop",
				timestamp: 2000,
			},
			{ entryPrice: 100, entryTimestamp: 1000, entryBarIndex: 1, positionSide: "short" },
			1,
		);
		expect(trade.side).toBe("sell");
		expect(trade.exitReason).toBe("sl");
		expect(trade.pnlPercent).toBeCloseTo(((100 - 90) / 100) * 100, 10);
		expect(trade.barsHeld).toBe(0);
	});

	it("matchCloseLeg: fill mở -> null (journal chỉ ghi closes)", () => {
		const match = matchCloseLeg(
			{ symbol: "FPT", side: "buy", fillQuantity: 100, fillPrice: 128500, timestamp: 1 },
			[],
			new Map(),
			0,
		);
		expect(match).toBeNull();
	});

	it("matchCloseLeg: fill đóng khớp đối ứng, clamp reversal, fallback thiếu ledger", () => {
		const ledger = new Map([["pos_1", { entryPrice: 128500, entryTimestamp: 1000, entryBarIndex: 2 }]]);
	 const pre = [{ id: "pos_1", symbol: "FPT", side: "long" as const, quantity: 100 }];
		const close = matchCloseLeg(
			{ symbol: "FPT", side: "sell", fillQuantity: 100, fillPrice: 135000, timestamp: 3000 },
			pre,
			ledger,
			5,
		);
		expect(close?.closeQuantity).toBe(100);
		expect(close?.entry.positionSide).toBe("long");
		const reversal = matchCloseLeg(
			{ symbol: "FPT", side: "sell", fillQuantity: 150, fillPrice: 135000, timestamp: 3000 },
			pre,
			ledger,
			5,
		);
		expect(reversal?.closeQuantity).toBe(100);
		const orphan = matchCloseLeg(
			{ symbol: "VNM", side: "sell", fillQuantity: 10, fillPrice: 60000, timestamp: 3000 },
			pre,
			ledger,
			5,
		);
		expect(orphan).toBeNull();
	});

	it("mapReplayOrderToBrokerInput giữ type/price/symbol, mặc định GTC", () => {
		const input = mapReplayOrderToBrokerInput({ type: "limit", side: "buy", quantity: 2, price: 127000, symbol: "X" });
		expect(input).toMatchObject({ type: "limit", side: "buy", quantity: 2, price: 127000, symbol: "X", timeInForce: "GTC" });
	});
});
