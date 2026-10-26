import { describe, it, expect } from "vitest";
import StrengthRelative from "../strengthRelative";
import SMFI from "../smfi";
import WyckoffWave, { computeWyckoffWave } from "../wyckoffWave";
import { CSVAdapter } from "../../../adapters/CSVAdapter";
import { WSAdapter } from "../../../adapters/WSAdapter";
import type { OHLCVBar } from "../../../types/ohlcv";

function makeBar(open: number, high: number, low: number, close: number, volume: number, dateStr: string): OHLCVBar {
	return {
		open,
		high,
		low,
		close,
		volume,
		date: new Date(dateStr),
		index: 0,
		dataIndex: 0,
	};
}

describe("CE30 VN-Exclusive Indicators & Adapters", () => {
	// ── StrengthRelative Indicator ──────────────────────────────────────────────
	describe("StrengthRelative", () => {
		it("calculates relative strength values comparing stock vs index correctly", () => {
			const bars: OHLCVBar[] = [
				makeBar(100, 100, 100, 100, 1000, "2026-06-01T09:00:00Z"),
				makeBar(102, 102, 102, 102, 1000, "2026-06-02T09:00:00Z"),
				makeBar(105, 105, 105, 105, 1000, "2026-06-03T09:00:00Z"),
			];
			const compareBars: OHLCVBar[] = [
				makeBar(1000, 1000, 1000, 1000, 10000, "2026-06-01T09:00:00Z"),
				makeBar(1010, 1010, 1010, 1010, 10000, "2026-06-02T09:00:00Z"),
				makeBar(1020, 1020, 1020, 1020, 10000, "2026-06-03T09:00:00Z"),
			];

			const period = 1;
			const results = StrengthRelative.compute(bars, compareBars, period);

			expect(results).toHaveLength(3);
			expect(results[0]).toBe(100); // lookback bound

			// at t=1, stock ratio = 102 / 1010 = 0.10099
			// at t=0, stock ratio = 100 / 1000 = 0.1
			// relative strength = (0.10099 / 0.1) * 100 = 100.99
			expect(results[1]).toBeCloseTo(100.99, 1);
		});
	});

	// ── SMFI Indicator ───────────────────────────────────────────────────────────
	describe("SMFI", () => {
		it("runs fallback daily index calculation correctly", () => {
			const bars: OHLCVBar[] = [
				makeBar(100, 105, 95, 102, 1000, "2026-06-01T09:00:00Z"),
				makeBar(102, 108, 101, 107, 2000, "2026-06-02T09:00:00Z"),
			];
			const results = SMFI.compute(bars);
			expect(results).toHaveLength(2);
			// t=0: prevClose=100. changeFirst=100-100=0. volFirst=0. changeLast=102-100=2. volLast=300. smfi = 10000 - 0 + 600 = 10600
			expect(results[0]).toBe(10600);
		});
	});

	// ── WyckoffWave Indicator ─────────────────────────────────────────────────────
	describe("WyckoffWave", () => {
		it("detects ZigZag pivots and accumulates swing wave statistics", () => {
			const bars: OHLCVBar[] = [
				makeBar(100, 100, 100, 100, 100, "2026-06-01T09:00:00Z"),
				makeBar(102, 102, 102, 102, 200, "2026-06-02T09:00:00Z"),
				makeBar(105, 105, 105, 105, 300, "2026-06-03T09:00:00Z"),
				makeBar(101, 101, 101, 101, 400, "2026-06-04T09:00:00Z"), // Down swing > 3% threshold
			];

			const results = computeWyckoffWave(bars, 2); // 2% threshold
			expect(results).toHaveLength(4);

			// Last bar should be in down swing
			expect(results[3].direction).toBe(-1);
			// Cumulative volume at last bar should include volumes of down swing bars
			expect(results[3].waveVolume).toBeGreaterThan(0);
		});
	});

	// ── CSVAdapter ───────────────────────────────────────────────────────────────
	describe("CSVAdapter", () => {
		it("successfully parses csv content and queries range", async () => {
			const csv = "date,open,high,low,close,volume\n2026-06-01,100,105,95,102,1000\n2026-06-02,102,108,101,107,2000";
			const adapter = new CSVAdapter(csv);

			const bars = await adapter.fetchBarsInRange("TEST", "D", new Date("2026-06-01"), new Date("2026-06-02"));
			expect(bars).toHaveLength(2);
			expect(bars[0].close).toBe(102);
			expect(bars[1].volume).toBe(2000);
		});
	});

	// ── WSAdapter ────────────────────────────────────────────────────────────────
	describe("WSAdapter", () => {
		it("creates instance and exposes subscription routing", () => {
			const adapter = new WSAdapter("http://localhost");
			expect(adapter.subscribeToBar).toBeDefined();
			expect(adapter.subscribeToTrades).toBeDefined();
		});
	});
});
