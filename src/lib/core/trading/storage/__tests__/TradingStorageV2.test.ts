import { describe, expect, it } from "vitest";
import { TradingStorage } from "../TradingStorage";
import { InMemoryStorageAdapter } from "../InMemoryStorageAdapter";

describe("TradingStorage v2 migration (S6)", () => {
	it("loads a v1 ledger intact and upgrades the envelope to v2", async () => {
		const adapter = new InMemoryStorageAdapter();
		await adapter.setItem(
			"vnsc_paper_trading_v1",
			JSON.stringify({
				version: 1,
				savedAt: 1,
				account: { balance: 100 },
				orders: [{ id: "o1" }],
				positions: [],
				trailingPeaks: {},
				history: [],
				closedTrades: [],
				equityCurve: [],
			}),
		);
		const storage = new TradingStorage(adapter);
		const loaded = await storage.loadState();
		expect(loaded?.version).toBe(2);
		expect(loaded?.orders).toHaveLength(1);
		expect(loaded?.config).toBeUndefined();
	});

	it("round-trips v2 state with config", async () => {
		const adapter = new InMemoryStorageAdapter();
		const storage = new TradingStorage(adapter);
		await adapter.setItem(
			"vnsc_paper_trading_v1",
			JSON.stringify({
				version: 2,
				savedAt: 2,
				account: {},
				orders: [],
				positions: [],
				trailingPeaks: {},
				history: [],
				closedTrades: [],
				equityCurve: [],
				config: { brokerFeeRate: 0 },
				isChartOverride: true,
			}),
		);
		const loaded = await storage.loadState();
		expect(loaded?.version).toBe(2);
		expect(loaded?.config).toEqual({ brokerFeeRate: 0 });
		expect(loaded?.isChartOverride).toBe(true);
	});

	it("rejects corrupt and unknown versions", async () => {
		const adapter = new InMemoryStorageAdapter();
		const storage = new TradingStorage(adapter);
		await adapter.setItem("vnsc_paper_trading_v1", "{broken");
		expect(await storage.loadState()).toBeNull();
		await adapter.setItem("vnsc_paper_trading_v1", JSON.stringify({ version: 99 }));
		expect(await storage.loadState()).toBeNull();
	});
});
