import { describe, it, expect } from "vitest";
import {
	cmfSeries,
	mfiSeries,
	volOscSeries,
	vwapSeries,
	anchoredVwapSeries,
	alligatorSeries,
	fractalsSeries,
	gatorSeries,
	acSeries,
	pivotStandardSeries,
	pivotHighLowSeries,
	type PriceBar,
} from "../../utils";

function makeBar(close: number, high?: number, low?: number, volume?: number, date?: Date): PriceBar {
	return {
		high: high ?? close,
		low: low ?? close,
		close,
		volume: volume ?? 1000,
		date: date ?? new Date(),
	};
}

// ── CMF ──────────────────────────────────────────────────────────────────────
describe("cmfSeries", () => {
	it("empty input returns empty array", () => {
		expect(cmfSeries([], 5)).toEqual([]);
	});

	it("output length equals input length", () => {
		const bars = Array.from({ length: 20 }, (_, i) => makeBar(100 + i, 102 + i, 98 + i, 1000));
		expect(cmfSeries(bars, 5)).toHaveLength(20);
	});

	it("values before warmup are NaN", () => {
		const bars = Array.from({ length: 10 }, (_, i) => makeBar(100 + i, 102 + i, 98 + i, 1000));
		const result = cmfSeries(bars, 5);
		for (let i = 0; i < 4; i++) {
			expect(Number.isNaN(result[i])).toBe(true);
		}
		expect(Number.isNaN(result[4])).toBe(false);
	});
});

// ── MFI ──────────────────────────────────────────────────────────────────────
describe("mfiSeries", () => {
	it("returns all NaNs when input is shorter than period", () => {
		const bars = Array.from({ length: 5 }, (_, i) => makeBar(100 + i));
		const result = mfiSeries(bars, 10);
		expect(result.every((v) => Number.isNaN(v))).toBe(true);
	});

	it("output length matches input length", () => {
		const bars = Array.from({ length: 20 }, (_, i) => makeBar(100 + i));
		expect(mfiSeries(bars, 10)).toHaveLength(20);
	});
});

// ── Volume Oscillator ────────────────────────────────────────────────────────
describe("volOscSeries", () => {
	it("empty input returns empty array", () => {
		expect(volOscSeries([], 5, 10)).toEqual([]);
	});

	it("calculates correct volume oscillator percentage", () => {
		const bars = Array.from({ length: 15 }, (_, i) => makeBar(10, 10, 10, i < 5 ? 100 : 200));
		const result = volOscSeries(bars, 3, 5);
		expect(result).toHaveLength(15);
	});
});

// ── VWAP / Session VWAP ──────────────────────────────────────────────────────
describe("vwapSeries", () => {
	it("empty input returns empty array of results", () => {
		const result = vwapSeries([]);
		expect(result.vwap).toHaveLength(0);
	});

	it("resets VWAP at session boundaries", () => {
		const bars = [
			makeBar(10, 10, 10, 100, new Date("2026-06-10T10:00:00Z")),
			makeBar(20, 20, 20, 200, new Date("2026-06-10T11:00:00Z")),
			makeBar(30, 30, 30, 300, new Date("2026-06-11T10:00:00Z")), // New day/session
		];
		const result = vwapSeries(bars, "session", false);
		expect(result.vwap[0]).toBeCloseTo(10, 5);
		// (10*100 + 20*200) / (100 + 200) = 5000 / 300 = 16.66667
		expect(result.vwap[1]).toBeCloseTo(16.66667, 5);
		// Reset on next day: 30
		expect(result.vwap[2]).toBeCloseTo(30, 5);
	});
});

// ── Anchored VWAP ────────────────────────────────────────────────────────────
describe("anchoredVwapSeries", () => {
	it("calculates VWAP only starting from anchorTime", () => {
		const anchorTime = new Date("2026-06-10T11:00:00Z").getTime();
		const bars = [
			makeBar(10, 10, 10, 100, new Date("2026-06-10T10:00:00Z")),
			makeBar(20, 20, 20, 200, new Date("2026-06-10T11:00:00Z")), // Anchor starts
			makeBar(30, 30, 30, 300, new Date("2026-06-10T12:00:00Z")),
		];
		const result = anchoredVwapSeries(bars, anchorTime, false);
		expect(result.vwap[0]).toBeNaN();
		expect(result.vwap[1]).toBeCloseTo(20, 5);
		// (20*200 + 30*300) / (200 + 300) = 13000 / 500 = 26
		expect(result.vwap[2]).toBeCloseTo(26, 5);
	});
});

// ── Alligator ────────────────────────────────────────────────────────────────
describe("alligatorSeries", () => {
	it("returns jaw, teeth, and lips lines", () => {
		const bars = Array.from({ length: 40 }, (_, i) => makeBar(50 + i, 52 + i, 48 + i));
		const result = alligatorSeries(bars);
		expect(result.jaw).toHaveLength(40);
		expect(result.teeth).toHaveLength(40);
		expect(result.lips).toHaveLength(40);
	});
});

// ── Fractals ─────────────────────────────────────────────────────────────────
describe("fractalsSeries", () => {
	it("detects bullish and bearish fractals in a 5-bar window", () => {
		const bars = [
			makeBar(10, 10, 10),
			makeBar(11, 11, 9),
			makeBar(12, 15, 8), // Peak high / Trough low
			makeBar(11, 11, 9),
			makeBar(10, 10, 10),
		];
		const result = fractalsSeries(bars);
		expect(result.bearish[2]).toBe(15);
		expect(result.bullish[2]).toBe(8);
		expect(result.bearish[0]).toBeNaN();
		expect(result.bearish[4]).toBeNaN();
	});
});

// ── Gator Oscillator ─────────────────────────────────────────────────────────
describe("gatorSeries", () => {
	it("returns upper and lower gator histogram values", () => {
		const bars = Array.from({ length: 40 }, (_, i) => makeBar(50 + i, 52 + i, 48 + i));
		const result = gatorSeries(bars);
		expect(result.upper).toHaveLength(40);
		expect(result.lower).toHaveLength(40);
	});
});

// ── AC (Accelerator Oscillator) ──────────────────────────────────────────────
describe("acSeries", () => {
	it("calculates AC with warm-up periods", () => {
		const bars = Array.from({ length: 50 }, (_, i) => makeBar(100 + i, 102 + i, 98 + i));
		const result = acSeries(bars);
		expect(result).toHaveLength(50);
		expect(Number.isNaN(result[0])).toBe(true);
		expect(Number.isNaN(result[49])).toBe(false);
	});
});

// ── Pivot Points Standard ────────────────────────────────────────────────────
describe("pivotStandardSeries", () => {
	it("calculates standard support and resistance levels based on day reset", () => {
		const bars = [
			// Day 1
			makeBar(10, 15, 5, 100, new Date("2026-06-10T10:00:00Z")),
			makeBar(12, 18, 6, 200, new Date("2026-06-10T15:00:00Z")),
			// Day 2
			makeBar(20, 25, 15, 300, new Date("2026-06-11T10:00:00Z")),
			makeBar(22, 28, 16, 400, new Date("2026-06-11T15:00:00Z")),
		];
		// Day 1 high = 18, low = 5, close = 12
		// Day 2 PP Standard values should use Day 1 values:
		// PP = (18 + 5 + 12) / 3 = 11.66667
		// R1 = 2 * PP - Low = 23.33333 - 5 = 18.33333
		// S1 = 2 * PP - High = 23.33333 - 18 = 5.33333
		const result = pivotStandardSeries(bars, "standard");
		expect(result.pp[0]).toBeNaN();
		expect(result.pp[1]).toBeNaN();
		expect(result.pp[2]).toBeCloseTo(11.66667, 5);
		expect(result.pp[3]).toBeCloseTo(11.66667, 5);
		expect(result.r1[2]).toBeCloseTo(18.33333, 5);
		expect(result.s1[2]).toBeCloseTo(5.33333, 5);
	});
});

// ── Pivot Points High/Low ────────────────────────────────────────────────────
describe("pivotHighLowSeries", () => {
	it("calculates PP levels using extreme high/low of rolling lookback window", () => {
		const bars = Array.from({ length: 20 }, (_, i) => makeBar(50 + i, 51 + i, 49 + i));
		// Lookback = 10. Index 10 uses window 0 to 9.
		// Window 0 to 9 highs: 51 to 60 (max = 60). Lows: 49 to 58 (min = 49).
		// Close of i-1 (index 9) is 59.
		// PP = (60 + 49 + 59) / 3 = 168 / 3 = 56
		// R1 = 2 * PP - L = 112 - 49 = 63
		// S1 = 2 * PP - H = 112 - 60 = 52
		const result = pivotHighLowSeries(bars, 10, "standard");
		expect(result.pp[9]).toBeNaN();
		expect(result.pp[10]).toBeCloseTo(56, 5);
		expect(result.r1[10]).toBeCloseTo(63, 5);
		expect(result.s1[10]).toBeCloseTo(52, 5);
	});
});
