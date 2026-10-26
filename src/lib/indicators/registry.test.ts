import { describe, expect, it } from "vitest";
import type { OHLCVBar } from "../types/ohlcv";
import { getIndicator, listIndicators, registerIndicator } from "./index";

const sampleBars: OHLCVBar[] = [
	{ date: new Date("2024-01-01"), open: 10, high: 14, low: 9, close: 13, volume: 100, index: 0, dataIndex: 0 },
	{ date: new Date("2024-01-02"), open: 13, high: 15, low: 11, close: 12, volume: 140, index: 1, dataIndex: 1 },
	{ date: new Date("2024-01-03"), open: 12, high: 16, low: 10, close: 15, volume: 180, index: 2, dataIndex: 2 },
	{ date: new Date("2024-01-04"), open: 15, high: 18, low: 14, close: 17, volume: 220, index: 3, dataIndex: 3 },
];

describe("indicator registry", () => {
	it("registers the built-in indicator definitions", () => {
		const names = listIndicators().map((indicator) => indicator.name).sort();

		expect(names).toEqual(expect.arrayContaining([
			"BOLLINGER",
			"CVD",
			"EMA",
			"MACD",
			"RSI",
			"SMA",
			"VOLUME",
		]));
	});

	it("retrieves a built-in indicator by name", () => {
		const emaIndicator = getIndicator("EMA");

		expect(emaIndicator).toBeDefined();
		expect(emaIndicator?.name).toBe("EMA");
		expect(emaIndicator?.compute(sampleBars)).toHaveLength(sampleBars.length);
	});

	it("registers and returns custom indicators", () => {
		const customIndicator = registerIndicator({
			name: "CUSTOM_TEST",
			compute: (bars: readonly OHLCVBar[]) => bars.map((bar) => bar.close - bar.open),
			computeExtents: (values: readonly number[]) => [Math.min(...values), Math.max(...values)] as const,
			render: () => undefined,
		});

		expect(getIndicator("custom_test")).toBe(customIndicator);
		expect(customIndicator.compute(sampleBars)).toEqual([3, -1, 3, 2]);
	});

	it("computes MACD and Bollinger series shapes", () => {
		const macdIndicator = getIndicator("MACD");
		const bollingerIndicator = getIndicator("BOLLINGER");

		expect(macdIndicator?.compute(sampleBars)).toMatchObject({
			macd: expect.any(Array),
			signal: expect.any(Array),
			histogram: expect.any(Array),
		});
		expect(bollingerIndicator?.compute(sampleBars)).toMatchObject({
			upper: expect.any(Array),
			middle: expect.any(Array),
			lower: expect.any(Array),
		});
	});
});
