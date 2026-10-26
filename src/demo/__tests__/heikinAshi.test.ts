import { describe, expect, it } from "vitest";

import type { OHLCVBar } from "../../lib/types/ohlcv";
import { transformHeikinAshi } from "../heikinAshi";

function makeBar(overrides: Partial<OHLCVBar> = {}): OHLCVBar {
	return {
		date: new Date("2026-01-01T00:00:00Z"),
		open: 10,
		high: 12,
		low: 9,
		close: 11,
		volume: 100,
		index: 0,
		dataIndex: 0,
		...overrides,
	};
}

describe("transformHeikinAshi", () => {
	it("computes the first candle from the source bar", () => {
		const input = makeBar();
		const result = transformHeikinAshi([input]);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			...input,
			open: (input.open + input.close) / 2,
			high: 12,
			low: 9,
			close: (input.open + input.high + input.low + input.close) / 4,
		});
	});

	it("uses the previous Heikin-Ashi candle for later opens", () => {
		const bars = [
			makeBar({ open: 10, high: 12, low: 8, close: 11, index: 0, dataIndex: 0 }),
			makeBar({ open: 11, high: 14, low: 10, close: 13, index: 1, dataIndex: 1, date: new Date("2026-01-01T01:00:00Z") }),
		];

		const result = transformHeikinAshi(bars);
		const firstClose = (bars[0].open + bars[0].high + bars[0].low + bars[0].close) / 4;
		const secondClose = (bars[1].open + bars[1].high + bars[1].low + bars[1].close) / 4;
		const expectedSecondOpen = ((bars[0].open + bars[0].close) / 2 + firstClose) / 2;

		expect(result[1]?.open).toBeCloseTo(expectedSecondOpen);
		expect(result[1]?.close).toBeCloseTo(secondClose);
		expect(result[1]?.high).toBe(Math.max(bars[1].high, expectedSecondOpen, secondClose));
		expect(result[1]?.low).toBe(Math.min(bars[1].low, expectedSecondOpen, secondClose));
	});

	it("does not mutate the input bars", () => {
		const input = makeBar();
		const snapshot = { ...input };

		transformHeikinAshi([input]);

		expect(input).toEqual(snapshot);
	});
});
