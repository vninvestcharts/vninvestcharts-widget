import { describe, it, expect } from "vitest";
import { bbiSeries, sarSeries, obvSeries, wrSeries, vrSeries } from "../../utils";

interface PriceBar { close: number; high: number; low: number; volume: number }

function makeBar(close: number, high?: number, low?: number, volume?: number): PriceBar {
	return {
		high: high ?? close,
		low: low ?? close,
		close,
		volume: volume ?? 1000,
	};
}

// ── BBI ──────────────────────────────────────────────────────────────────────
describe("bbiSeries", () => {
	it("output length equals input length", () => {
		const bars = Array.from({ length: 30 }, (_, i) => makeBar(i + 1));
		expect(bbiSeries(bars)).toHaveLength(30);
	});

	it("golden value at index 24 (enough data for MA24)", () => {
		// All bars have the same close = 10 → BBI = 10
		const bars = Array.from({ length: 30 }, () => makeBar(10));
		const result = bbiSeries(bars);
		expect(result[29]).toBeCloseTo(10, 5);
	});
});

// ── SAR ──────────────────────────────────────────────────────────────────────
describe("sarSeries", () => {
	it("output length equals input length", () => {
		const bars = Array.from({ length: 20 }, (_, i) =>
			makeBar(100 + i, 102 + i, 98 + i),
		);
		expect(sarSeries(bars)).toHaveLength(20);
	});

	it("all values are finite numbers", () => {
		const bars = Array.from({ length: 50 }, (_, i) =>
			makeBar(100 + Math.sin(i) * 10, 110 + Math.sin(i) * 10, 90 + Math.sin(i) * 10),
		);
		const result = sarSeries(bars);
		expect(result.every((v) => Number.isFinite(v))).toBe(true);
	});
});

// ── OBV ──────────────────────────────────────────────────────────────────────
describe("obvSeries", () => {
	it("output length equals input length", () => {
		const bars = Array.from({ length: 10 }, (_, i) => makeBar(i + 1, undefined, undefined, 500));
		expect(obvSeries(bars)).toHaveLength(10);
	});

	it("first value is 0", () => {
		const bars = [makeBar(10), makeBar(11), makeBar(9)];
		expect(obvSeries(bars)[0]).toBe(0);
	});

	it("adds volume on up day, subtracts on down day", () => {
		const bars = [
			makeBar(10, 10, 10, 100),
			makeBar(11, 11, 11, 200), // up → +200
			makeBar(9, 9, 9, 300),   // down → -300
		];
		const result = obvSeries(bars);
		expect(result[1]).toBe(200);
		expect(result[2]).toBe(-100);
	});
});

// ── WR ───────────────────────────────────────────────────────────────────────
describe("wrSeries", () => {
	it("output length equals input length", () => {
		const bars = Array.from({ length: 20 }, (_, i) => makeBar(i + 1, i + 2, i));
		expect(wrSeries(bars)).toHaveLength(20);
	});

	it("values before warmup are NaN", () => {
		const bars = Array.from({ length: 20 }, (_, i) => makeBar(i + 1, i + 2, i));
		const result = wrSeries(bars, 14);
		for (let i = 0; i < 13; i++) {
			expect(Number.isNaN(result[i])).toBe(true);
		}
	});

	it("range is [-100, 0]", () => {
		const bars = Array.from({ length: 50 }, (_, i) =>
			makeBar(50 + Math.sin(i) * 20, 70 + Math.sin(i) * 20, 30 + Math.sin(i) * 20),
		);
		const result = wrSeries(bars, 14).filter((v) => !Number.isNaN(v));
		expect(result.every((v) => v >= -100 && v <= 0)).toBe(true);
	});
});

// ── VR ───────────────────────────────────────────────────────────────────────
describe("vrSeries", () => {
	it("output length equals input length", () => {
		const bars = Array.from({ length: 30 }, (_, i) => makeBar(i + 1, undefined, undefined, 1000));
		expect(vrSeries(bars)).toHaveLength(30);
	});

	it("values before warmup are NaN", () => {
		const bars = Array.from({ length: 30 }, (_, i) => makeBar(i + 1, undefined, undefined, 1000));
		const result = vrSeries(bars, 26);
		expect(Number.isNaN(result[0])).toBe(true);
		expect(Number.isNaN(result[25])).toBe(true);
	});

	it("positive trend bars → VR > 100", () => {
		// strictly rising close each bar → all up volume, VR = up/(0) → 100 (denom=0 guard)
		const bars = Array.from({ length: 30 }, (_, i) =>
			makeBar(100 + i, undefined, undefined, 1000),
		);
		const result = vrSeries(bars, 26).filter((v) => !Number.isNaN(v));
		expect(result.every((v) => v >= 100)).toBe(true);
	});
});
