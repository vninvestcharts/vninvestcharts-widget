import { describe, expect, it, beforeEach } from "vitest";
import { LocalCacheAdapter } from "./LocalCacheAdapter";
import type { KLineBar } from "./DataAdapter";

const makeBars = (count: number, startTs = 1_700_000_000_000, stepMs = 3_600_000): KLineBar[] =>
	Array.from({ length: count }, (_, i) => ({
		timestamp: startTs + i * stepMs,
		open: 100 + i,
		high: 110 + i,
		low: 90 + i,
		close: 105 + i,
		volume: 50 + i,
	}));

describe("CE20-03: LocalCacheAdapter", () => {
	let adapter: LocalCacheAdapter;

	beforeEach(() => {
		adapter = new LocalCacheAdapter();
	});

	it("returns empty result when no bars loaded", async () => {
		const result = await adapter.getBars({
			type: "init",
			symbol: "BTCUSDT",
			interval: "1h",
			timestamp: null,
			limit: 10,
		});

		expect(result.bars).toHaveLength(0);
		expect(result.hasMore).toBe(false);
	});

	it("returns up to limit bars on init fetch", async () => {
		adapter.loadBars("BTCUSDT", "1h", makeBars(50));

		const result = await adapter.getBars({
			type: "init",
			symbol: "BTCUSDT",
			interval: "1h",
			timestamp: null,
			limit: 10,
		});

		expect(result.bars).toHaveLength(10);
	});

	it("returns bars sorted ascending on init", async () => {
		adapter.loadBars("BTCUSDT", "1h", makeBars(5));

		const result = await adapter.getBars({
			type: "init",
			symbol: "BTCUSDT",
			interval: "1h",
			timestamp: null,
			limit: 10,
		});

		for (let i = 1; i < result.bars.length; i++) {
			expect(result.bars[i].timestamp).toBeGreaterThan(result.bars[i - 1].timestamp);
		}
	});

	it("returns bars strictly before timestamp on backward fetch", async () => {
		const bars = makeBars(10);
		adapter.loadBars("BTCUSDT", "1h", bars);
		const cutoff = bars[4].timestamp; // 5th bar

		const result = await adapter.getBars({
			type: "backward",
			symbol: "BTCUSDT",
			interval: "1h",
			timestamp: cutoff,
			limit: 100,
		});

		expect(result.bars.every((b) => b.timestamp < cutoff)).toBe(true);
		expect(result.bars).toHaveLength(4);
	});

	it("isolates bars by symbol+interval key", async () => {
		adapter.loadBars("BTCUSDT", "1h", makeBars(5));
		adapter.loadBars("ETHUSDT", "1h", makeBars(3));

		const btcResult = await adapter.getBars({
			type: "init", symbol: "BTCUSDT", interval: "1h", timestamp: null, limit: 100,
		});
		const ethResult = await adapter.getBars({
			type: "init", symbol: "ETHUSDT", interval: "1h", timestamp: null, limit: 100,
		});

		expect(btcResult.bars).toHaveLength(5);
		expect(ethResult.bars).toHaveLength(3);
	});

	it("always returns hasMore=false", async () => {
		adapter.loadBars("BTCUSDT", "1h", makeBars(100));

		const result = await adapter.getBars({
			type: "init", symbol: "BTCUSDT", interval: "1h", timestamp: null, limit: 10,
		});

		expect(result.hasMore).toBe(false);
	});

	it("drops invalid bars before caching offline data", async () => {
		adapter.loadBars("BTCUSDT", "1h", [
			{ timestamp: 1_700_000_000_000, open: 100, high: 110, low: 90, close: 105, volume: 50 },
			{ timestamp: Number.NaN, open: 101, high: 111, low: 91, close: 106, volume: 51 },
			{ timestamp: 1_700_000_000_000 + 3_600_000, open: 102, high: 112, low: 92, close: 107, volume: 52 },
			{ timestamp: 1_700_000_000_000 + 7_200_000, open: Number.POSITIVE_INFINITY, high: 113, low: 93, close: 108, volume: 53 },
		] as KLineBar[]);

		const result = await adapter.getBars({
			type: "init",
			symbol: "BTCUSDT",
			interval: "1h",
			timestamp: null,
			limit: 10,
		});

		expect(result.bars).toHaveLength(2);
		expect(result.bars[0]?.timestamp).toBe(1_700_000_000_000);
		expect(result.bars[1]?.timestamp).toBe(1_700_000_000_000 + 3_600_000);
	});
});
