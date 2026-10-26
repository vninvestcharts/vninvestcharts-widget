/**
 * 451-resilience: GeoBlockedBinanceAdapter serves offline CSV with a visible
 * status when Binance is region-blocked, instead of an empty chart.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GeoBlockedBinanceAdapter } from "../GeoBlockedBinanceAdapter";
import type { BinanceStockDataAdapter } from "../BinanceStockDataAdapter";
import type { BinanceAdapter } from "../../../lib/adapters/BinanceAdapter";

vi.mock("../../demoData", () => ({
	getOfflineDemoBars: () => [
		{ date: new Date("2026-01-01T00:00:00.000Z"), open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
		{ date: new Date("2026-01-02T00:00:00.000Z"), open: 1.5, high: 2.5, low: 1, close: 2, volume: 200 },
	],
}));

function makeHarness(regionBlocked: boolean, liveBars: number) {
	const inner = {
		fetchBarsInRange: vi.fn().mockResolvedValue(
			Array.from({ length: liveBars }, (_, i) => ({
				date: new Date(1700000000000 + i * 3_600_000),
				open: 1, high: 2, low: 0.5, close: 1.5, volume: 100, index: i, dataIndex: i,
			})),
		),
		fetchBarsBefore: vi.fn().mockResolvedValue([]),
		subscribeToBar: vi.fn().mockReturnValue(() => {}),
		searchSymbols: vi.fn().mockResolvedValue([]),
		getSourceSemantics: vi.fn().mockReturnValue({ sourceId: "binance" }),
	} as unknown as BinanceStockDataAdapter;
	const lib = { isRegionBlocked: () => regionBlocked } as Pick<BinanceAdapter, "isRegionBlocked">;
	return { inner, wrapper: new GeoBlockedBinanceAdapter(inner, lib) };
}

describe("GeoBlockedBinanceAdapter", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("passes live bars through when not blocked", async () => {
		const { inner, wrapper } = makeHarness(false, 2);
		const bars = await wrapper.fetchBarsInRange("BTCUSDT", "1h", new Date(1699000000000), new Date(1700100000000));
		expect(bars).toHaveLength(2);
		expect(wrapper.getStatus()).toBe("live");
		expect(inner.fetchBarsInRange).toHaveBeenCalledTimes(1);
	});

	it("serves offline CSV without network when region-blocked", async () => {
		const { inner, wrapper } = makeHarness(true, 0);
		const statuses: string[] = [];
		wrapper.onStatusChange((s) => statuses.push(s));
		const bars = await wrapper.fetchBarsInRange("BTCUSDT", "1h", new Date(1700000000000), new Date(1780000000000));
		expect(inner.fetchBarsInRange).not.toHaveBeenCalled();
		expect(bars.length).toBeGreaterThan(0);
		expect(wrapper.getStatus()).toBe("geo-blocked");
		expect(statuses).toContain("geo-blocked");
	});

	it("force-offline toggle serves CSV and reports offline", async () => {
		const { inner, wrapper } = makeHarness(false, 2);
		wrapper.setForceOffline(true);
		const bars = await wrapper.fetchBarsInRange("BTCUSDT", "1h", new Date(1700000000000), new Date(1780000000000));
		expect(inner.fetchBarsInRange).not.toHaveBeenCalled();
		expect(bars.length).toBeGreaterThan(0);
		expect(wrapper.getStatus()).toBe("offline");
	});

	it("subscribeToBar is a no-op when blocked", () => {
		const { wrapper } = makeHarness(true, 0);
		const cb = vi.fn();
		const unsub = wrapper.subscribeToBar("BTCUSDT", "1h", cb);
		expect(typeof unsub).toBe("function");
		expect(cb).not.toHaveBeenCalled();
	});
});
