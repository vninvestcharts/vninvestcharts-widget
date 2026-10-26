import { describe, it, expect } from "vitest";
import {
	wmaSeries,
	vwmaSeries,
	hmaSeries,
	demaSeries,
	temaSeries,
	maRibbonSeries,
	ichimokuSeries,
	supertrendSeries,
	keltnerSeries,
	donchianSeries,
	chaikinVolSeries,
	stdDevSeries,
	historicalVolSeries,
	choppinessIndexSeries,
	type PriceBar,
} from "../../utils";

function makeBar(close: number, high?: number, low?: number, volume?: number): PriceBar {
	return {
		high: high ?? close,
		low: low ?? close,
		close,
		volume: volume ?? 1000,
	};
}

// ── WMA ──────────────────────────────────────────────────────────────────────
describe("wmaSeries", () => {
	it("empty input returns empty array", () => {
		expect(wmaSeries([], 5)).toEqual([]);
	});

	it("output length equals input length", () => {
		const values = Array.from({ length: 20 }, (_, i) => i + 1);
		expect(wmaSeries(values, 5)).toHaveLength(20);
	});

	it("values before warmup are NaN", () => {
		const values = Array.from({ length: 10 }, (_, i) => i + 1);
		const result = wmaSeries(values, 5);
		for (let i = 0; i < 4; i++) {
			expect(Number.isNaN(result[i])).toBe(true);
		}
		expect(Number.isNaN(result[4])).toBe(false);
	});

	it("constant input yields constant output", () => {
		const values = Array(15).fill(10);
		const result = wmaSeries(values, 5);
		expect(result[4]).toBeCloseTo(10, 5);
		expect(result[14]).toBeCloseTo(10, 5);
	});
});

// ── VWMA ─────────────────────────────────────────────────────────────────────
describe("vwmaSeries", () => {
	it("empty input returns empty array", () => {
		expect(vwmaSeries([], 5)).toEqual([]);
	});

	it("correctly calculates volume-weighted moving average", () => {
		const bars = [
			makeBar(10, 10, 10, 100),
			makeBar(20, 20, 20, 200),
			makeBar(30, 30, 30, 300),
		];
		const result = vwmaSeries(bars, 3);
		// VWMA = (10*100 + 20*200 + 30*300) / (100 + 200 + 300) = (1000 + 4000 + 9000) / 600 = 14000 / 600 = 23.33333
		expect(result[0]).toBeNaN();
		expect(result[1]).toBeNaN();
		expect(result[2]).toBeCloseTo(23.33333, 5);
	});
});

// ── HMA ──────────────────────────────────────────────────────────────────────
describe("hmaSeries", () => {
	it("empty input returns empty array", () => {
		expect(hmaSeries([], 9)).toEqual([]);
	});

	it("output length matches input", () => {
		const values = Array.from({ length: 30 }, (_, i) => i + 1);
		expect(hmaSeries(values, 9)).toHaveLength(30);
	});
});

// ── DEMA ─────────────────────────────────────────────────────────────────────
describe("demaSeries", () => {
	it("empty input returns empty array", () => {
		expect(demaSeries([], 10)).toEqual([]);
	});

	it("constant values yield constant output", () => {
		const values = Array(30).fill(5);
		const result = demaSeries(values, 10);
		expect(result[29]).toBeCloseTo(5, 5);
	});
});

// ── TEMA ─────────────────────────────────────────────────────────────────────
describe("temaSeries", () => {
	it("empty input returns empty array", () => {
		expect(temaSeries([], 10)).toEqual([]);
	});

	it("constant values yield constant output", () => {
		const values = Array(30).fill(5);
		const result = temaSeries(values, 10);
		expect(result[29]).toBeCloseTo(5, 5);
	});
});

// ── MA Ribbon ────────────────────────────────────────────────────────────────
describe("maRibbonSeries", () => {
	it("calculates correct periods and types", () => {
		const values = Array(50).fill(10);
		const result = maRibbonSeries(values, "SMA", [5, 10]);
		expect(result).toHaveProperty("ma5");
		expect(result).toHaveProperty("ma10");
		expect(result.ma5).toHaveLength(50);
		expect(result.ma10).toHaveLength(50);
		expect(result.ma5[49]).toBeCloseTo(10, 5);
		expect(result.ma10[49]).toBeCloseTo(10, 5);
	});
});

// ── Ichimoku Cloud ───────────────────────────────────────────────────────────
describe("ichimokuSeries", () => {
	it("returns correct properties and lengths", () => {
		const bars = Array.from({ length: 100 }, (_, i) => makeBar(10 + i, 12 + i, 8 + i));
		const result = ichimokuSeries(bars);
		expect(result).toHaveProperty("tenkan");
		expect(result).toHaveProperty("kijun");
		expect(result).toHaveProperty("senkouA");
		expect(result).toHaveProperty("senkouB");
		expect(result).toHaveProperty("chikou");
		expect(result.tenkan).toHaveLength(100);
		expect(result.chikou).toHaveLength(100);
	});
});

// ── Supertrend ───────────────────────────────────────────────────────────────
describe("supertrendSeries", () => {
	it("returns correct supertrend direction and values", () => {
		const bars = Array.from({ length: 30 }, (_, i) => makeBar(100 + i, 102 + i, 98 + i));
		const result = supertrendSeries(bars, 10, 3);
		expect(result.supertrend).toHaveLength(30);
		expect(result.direction).toHaveLength(30);
	});
});

// ── Keltner Channels ─────────────────────────────────────────────────────────
describe("keltnerSeries", () => {
	it("returns upper, middle, and lower bands", () => {
		const bars = Array.from({ length: 40 }, (_, i) => makeBar(50 + i, 52 + i, 48 + i));
		const result = keltnerSeries(bars, 20, 10, 2);
		expect(result.middle).toHaveLength(40);
		expect(result.upper).toHaveLength(40);
		expect(result.lower).toHaveLength(40);
		for (let i = 25; i < 40; i++) {
			expect(result.upper[i]).toBeGreaterThan(result.middle[i]!);
			expect(result.middle[i]!).toBeGreaterThan(result.lower[i]);
		}
	});
});

// ── Donchian Channels ────────────────────────────────────────────────────────
describe("donchianSeries", () => {
	it("correctly calculates highest high and lowest low channels", () => {
		const bars = Array.from({ length: 30 }, (_, i) => makeBar(50 + i, 52 + i, 48 + i));
		const result = donchianSeries(bars, 10);
		expect(result.upper).toHaveLength(30);
		expect(result.middle).toHaveLength(30);
		expect(result.lower).toHaveLength(30);
		// Donchian upper should be highest of last 10 highs
		expect(result.upper[29]).toBe(52 + 29); // highest is current
		expect(result.lower[29]).toBe(48 + 20); // lowest is i-9 low (i.e. index 20 low)
	});
});

// ── Chaikin Volatility ───────────────────────────────────────────────────────
describe("chaikinVolSeries", () => {
	it("returns correct array length", () => {
		const bars = Array.from({ length: 30 }, (_, i) => makeBar(100 + i, 102 + i, 98 + i));
		const result = chaikinVolSeries(bars, 10);
		expect(result).toHaveLength(30);
	});
});

// ── Standard Deviation ───────────────────────────────────────────────────────
describe("stdDevSeries", () => {
	it("empty standard deviation when data < period", () => {
		const result = stdDevSeries([1, 2, 3], 5);
		expect(result.every((v) => Number.isNaN(v))).toBe(true);
	});

	it("zero standard deviation for constant input", () => {
		const values = Array(30).fill(15);
		const result = stdDevSeries(values, 10);
		expect(result[9]).toBeCloseTo(0, 5);
		expect(result[29]).toBeCloseTo(0, 5);
	});
});

// ── Historical Volatility ────────────────────────────────────────────────────
describe("historicalVolSeries", () => {
	it("returns correct array length", () => {
		const values = Array.from({ length: 30 }, (_, i) => 100 + i);
		const result = historicalVolSeries(values, 10);
		expect(result).toHaveLength(30);
	});
});

// ── Choppiness Index ─────────────────────────────────────────────────────────
describe("choppinessIndexSeries", () => {
	it("returns correct array length and limits values to index scale", () => {
		const bars = Array.from({ length: 30 }, (_, i) => makeBar(100 + i, 102 + i, 98 + i));
		const result = choppinessIndexSeries(bars, 14);
		expect(result).toHaveLength(30);
	});
});
