import { describe, expect, it } from "vitest";
import { computeProgressiveHTFData, mapWhaleEventsToBars } from "../useWidgetDataEnrichment";
import type { OHLCVBar } from "../../../lib/types/ohlcv";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";

function bar(dateMs: number, over: Record<string, unknown> = {}): OHLCVBar {
	return {
		date: new Date(dateMs),
		open: 100,
		high: 110,
		low: 90,
		close: 105,
		volume: 1000,
		...over,
	} as unknown as OHLCVBar;
}

const HOUR = 3600000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 8, 1);

describe("computeProgressiveHTFData (BL-01 extraction parity)", () => {
	it("returns [] for empty input or same-timeframe overlay", () => {
		expect(computeProgressiveHTFData([], "1h", "1D")).toEqual([]);
		expect(computeProgressiveHTFData([bar(T0)], "1h", "Same as chart")).toEqual([]);
		expect(computeProgressiveHTFData([bar(T0)], "1h", "1h")).toEqual([]);
	});

	it("aggregates hourly bars into daily periods with close flags", () => {
		const bars = [bar(T0), bar(T0 + HOUR), bar(T0 + DAY)];
		const out = computeProgressiveHTFData(bars, "1h", "1D");
		expect(out).toHaveLength(3);
		expect(out[0].periodStart).toBe(out[1].periodStart);
		expect(out[0].isClosed).toBe(false);
		expect(out[1].isClosed).toBe(true);
		expect(out[2].periodStart).not.toBe(out[0].periodStart);
		expect(out[2].high).toBe(110);
	});
});

describe("mapWhaleEventsToBars (BL-01 extraction parity)", () => {
	const plotData = [
		{ date: new Date(T0), open: 1, high: 1, low: 1, close: 1, volume: 1 },
		{ date: new Date(T0 + HOUR), open: 1, high: 1, low: 1, close: 1, volume: 1 },
	] as unknown as readonly EnrichedDatum[];

	it("returns [] when disabled or empty", () => {
		expect(mapWhaleEventsToBars({ enableWhale: false, whaleOrders: [], plotData })).toEqual([]);
		expect(mapWhaleEventsToBars({ enableWhale: true, whaleOrders: [], plotData })).toEqual([]);
		expect(mapWhaleEventsToBars({ enableWhale: true, whaleOrders: null, plotData })).toEqual([]);
	});

	it("maps orders to nearest bar with buy/sell split", () => {
		const orders = [
			{ ts: T0 + 1000, price: 10, volume: 5, matched_value: 0, side: "buy" },
			{ ts: T0 + HOUR - 1000, price: 10, volume: 5, matched_value: 0, side: "sell" },
		] as never;
		const out = mapWhaleEventsToBars({ enableWhale: true, whaleOrders: orders, plotData });
		expect(out).toHaveLength(2);
		expect(out[0].index).toBe(0);
		expect(out[0].buyVol).toBe(50);
		expect(out[0].netDelta).toBe(50);
		expect(out[1].index).toBe(1);
		expect(out[1].sellVol).toBe(50);
		expect(out[1].netDelta).toBe(-50);
	});

	it("skips non-finite matched values", () => {
		const orders = [{ ts: T0, price: 0, volume: 0, matched_value: 0, side: "buy" }] as never;
		expect(mapWhaleEventsToBars({ enableWhale: true, whaleOrders: orders, plotData })).toEqual([]);
	});
});
