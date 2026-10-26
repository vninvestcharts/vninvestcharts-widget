/**
 * 451-resilience: BinanceAdapter latches the regional-block signal so demo
 * shells can serve offline data with a visible status instead of an empty chart.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { BinanceAdapter } from "../BinanceAdapter";

function stubFetch(status: number, payload: unknown) {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
		status,
		ok: status >= 200 && status < 300,
		json: vi.fn().mockResolvedValue(payload),
	}));
}

const KLINE = [[1700000000000, "1", "2", "0.5", "1.5", "100"]];

describe("BinanceAdapter.isRegionBlocked", () => {
	let adapter: BinanceAdapter;

	beforeEach(() => {
		adapter = new BinanceAdapter();
		expect(adapter.isRegionBlocked()).toBe(false);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("latches true on HTTP 451 and returns empty bars", async () => {
		stubFetch(451, { code: 0, msg: "Restricted location" });
		const result = await adapter.getBars({ type: "backward", symbol: "BTCUSDT", interval: "1h", timestamp: 1700000000000, limit: 5 });
		expect(result.bars).toEqual([]);
		expect(adapter.isRegionBlocked()).toBe(true);
	});

	it("clears the latch on the next successful fetch", async () => {
		stubFetch(451, {});
		await adapter.getBars({ type: "backward", symbol: "BTCUSDT", interval: "1h", timestamp: 1700000000000, limit: 5 });
		expect(adapter.isRegionBlocked()).toBe(true);

		stubFetch(200, KLINE);
		const result = await adapter.getBars({ type: "backward", symbol: "BTCUSDT", interval: "1h", timestamp: 1700000000000, limit: 5 });
		expect(result.bars).toHaveLength(1);
		expect(adapter.isRegionBlocked()).toBe(false);
	});

	it("does not latch on non-451 errors (still throws)", async () => {
		stubFetch(500, {});
		await expect(
			adapter.getBars({ type: "backward", symbol: "BTCUSDT", interval: "1h", timestamp: 1700000000000, limit: 5 }),
		).rejects.toThrow();
		expect(adapter.isRegionBlocked()).toBe(false);
	});
});
