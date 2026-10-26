import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../data/bitfinex_xbtusd_1m.csv", () => ({ default: "" }));
import { fetchHistoricalDemoBars, mergeBarsByDate } from "../demoData";

function makeResponse(payload: unknown) {
	return {
		ok: true,
		json: async () => payload,
	};
}

describe("demoData history loaders", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("merges older bars without dropping newer timestamps", () => {
		const olderBars = [
			{ date: new Date(2026, 0, 1, 0, 0, 0), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
			{ date: new Date(2026, 0, 1, 1, 0, 0), open: 2, high: 3, low: 1.5, close: 2.5, volume: 11 },
		];
		const currentBars = [
			{ date: new Date(2026, 0, 1, 1, 0, 0), open: 20, high: 21, low: 19, close: 20.5, volume: 99 },
			{ date: new Date(2026, 0, 1, 2, 0, 0), open: 3, high: 4, low: 2.5, close: 3.5, volume: 12 },
		];

		const merged = mergeBarsByDate(olderBars, currentBars);

		expect(merged).toHaveLength(3);
		expect(merged.map((bar) => bar.date.getHours())).toEqual([0, 1, 2]);
		expect(merged[1]?.close).toBe(20.5);
	});

	it("pages backwards through Binance history", async () => {
		const firstPage = makeResponse([
			[1700003600000, "100", "110", "90", "105", "1000"],
			[1700007200000, "105", "115", "95", "110", "1100"],
		]);
		const secondPage = makeResponse([
			[1699996400000, "96", "106", "92", "101", "900"],
			[1700000000000, "101", "108", "97", "104", "950"],
		]);

		fetchMock
			.mockResolvedValueOnce(firstPage)
			.mockResolvedValueOnce(secondPage);

		const bars = await fetchHistoricalDemoBars({ interval: "1h", limit: 2, pages: 2 });

		expect(bars).toHaveLength(4);
		expect(bars.map((bar) => bar.date.getTime())).toEqual([
			1699996400000,
			1700000000000,
			1700003600000,
			1700007200000,
		]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(String(fetchMock.mock.calls[1]?.[0])).toContain("endTime=1700003599999");
		expect(String(fetchMock.mock.calls[1]?.[0])).toContain("limit=2");
	});
});