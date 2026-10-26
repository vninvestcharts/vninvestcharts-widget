import { describe, expect, it } from "vitest";
import { computeNormalizedPrices, normalizePricesToBaseline } from "../normalizePrices";

describe("computeNormalizedPrices", () => {
	it("returns empty for empty input", () => {
		expect(computeNormalizedPrices([], 100)).toEqual([]);
		expect(computeNormalizedPrices([{ open: 1, high: 2, low: 1, close: 1, volume: 100 }], 0)).toEqual([]);
	});

	it("returns 0 for baseline index", () => {
		const result = computeNormalizedPrices(
			[{ open: 100, high: 105, low: 99, close: 100, volume: 1000 }],
			100,
			0,
		);
		expect(result).toEqual([0]);
	});

	it("computes positive % change", () => {
		const result = computeNormalizedPrices(
			[
				{ open: 100, high: 105, low: 99, close: 100, volume: 1000 },
				{ open: 101, high: 106, low: 100, close: 105, volume: 1000 },
			],
			100,
			0,
		);
		expect(result[0]).toBe(0);
		expect(result[1]).toBeCloseTo(5, 2);
	});

	it("computes negative % change", () => {
		const result = computeNormalizedPrices(
			[
				{ open: 100, high: 105, low: 99, close: 100, volume: 1000 },
				{ open: 90, high: 95, low: 89, close: 90, volume: 1000 },
			],
			100,
			0,
		);
		expect(result[0]).toBe(0);
		expect(result[1]).toBeCloseTo(-10, 2);
	});

	it("handles custom baseline index", () => {
		const result = computeNormalizedPrices(
			[
				{ open: 100, high: 105, low: 99, close: 100, volume: 1000 },
				{ open: 101, high: 106, low: 100, close: 105, volume: 1000 },
				{ open: 102, high: 107, low: 101, close: 110, volume: 1000 },
			],
			105,
			1,
		);
		expect(result[1]).toBe(0);
	});
});

describe("normalizePricesToBaseline", () => {
	it("returns empty arrays for empty primary", () => {
		const result = normalizePricesToBaseline([], { VIC: [{ open: 1, high: 2, low: 1, close: 1, volume: 100 }] });
		expect(result.symbolData).toEqual([]);
		expect(result.normalizedPrices).toEqual([]);
	});

	it("normalizes single overlay symbol relative to primary baseline", () => {
		const primary = [
			{ open: 100, high: 105, low: 99, close: 100, volume: 1000 },
			{ open: 101, high: 106, low: 100, close: 105, volume: 1000 },
		];
		const overlay = {
			VIC: [
				{ open: 50, high: 52, low: 49, close: 50, volume: 500 },
				{ open: 51, high: 53, low: 50, close: 52, volume: 500 },
			],
		};
		const result = normalizePricesToBaseline(primary, overlay);
		expect(result.symbolData).toHaveLength(2);
		expect(result.symbolData[0].VIC?.close).toBe(50);
		expect(result.symbolData[1].VIC?.close).toBe(52);
		expect(result.normalizedPrices[0].VIC).toBe(0);
		// VIC close = 52, primary baseline = 100 → ((52-100)/100)*100 = -48
		expect(result.normalizedPrices[1].VIC).toBeCloseTo(-48, 2);
	});

	it("handles filterSymbolIds", () => {
		const primary = [
			{ open: 100, high: 105, low: 99, close: 100, volume: 1000 },
		];
		const overlay = {
			VIC: [{ open: 50, high: 52, low: 49, close: 50, volume: 500 }],
			FPT: [{ open: 80, high: 82, low: 79, close: 80, volume: 800 }],
		};
		const result = normalizePricesToBaseline(primary, overlay, 0, new Set(["VIC"]));
		expect(result.symbolData[0].VIC).toBeDefined();
		expect(result.symbolData[0].FPT).toBeUndefined();
	});

	it("handles missing overlay bars gracefully", () => {
		const primary = [
			{ open: 100, high: 105, low: 99, close: 100, volume: 1000 },
			{ open: 101, high: 106, low: 100, close: 105, volume: 1000 },
		];
		const overlay = {
			VIC: [{ open: 50, high: 52, low: 49, close: 50, volume: 500 }],
		};
		const result = normalizePricesToBaseline(primary, overlay);
		expect(result.symbolData).toHaveLength(2);
		expect(result.symbolData[0].VIC?.close).toBe(50);
		expect(result.symbolData[1].VIC).toBeUndefined();
	});
});
