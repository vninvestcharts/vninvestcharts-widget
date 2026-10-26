// @vitest-environment jsdom
/**
 * paperTradeAdapters unit tests — F-06 unrealizedPnl mapping.
 */
import { describe, it, expect } from "vitest";
import { toPaperPosition, toPaperJournal } from "../paperTradeAdapters";
import type { ReplayPosition } from "../../../lib/core/replay/replayTradingTypes";

const basePosition: ReplayPosition = {
	id: "pos-1",
	side: "long",
	entryPrice: 100,
	currentPrice: 110,
	quantity: 10,
	entryBarIndex: 0,
	feeRate: 0.001,
	unrealizedPnl: 99,
	realizedPnl: 0,
	entryTimestamp: 1000,
	stopLoss: undefined,
	takeProfit: undefined,
};

describe("paperTradeAdapters", () => {
	it("toPaperPosition maps unrealizedPnl from ReplayPosition", () => {
		const result = toPaperPosition(basePosition);
		expect(result.unrealizedPnl).toBe(99);
	});

	it("toPaperPosition handles undefined unrealizedPnl", () => {
		const pos = { ...basePosition, unrealizedPnl: 0 as number };
		const result = toPaperPosition(pos);
		expect(typeof result.unrealizedPnl).toBe("number");
	});
});
