import { describe, it, expect } from "vitest";
import { applyCanaryFilter, getCanarySliceInfo } from "../canaryBarFiltering";
import type { OHLCVBar } from "../../lib/types/ohlcv";

describe("canaryBarFiltering", () => {
	// Helper to create mock OHLCV bars
	function createMockBars(count: number): OHLCVBar[] {
		return Array.from({ length: count }, (_, i) => ({
			date: new Date(1000000 + i * 60000), // 1-minute intervals
			open: 100 + i * 0.1,
			high: 100.5 + i * 0.1,
			low: 99.5 + i * 0.1,
			close: 100.2 + i * 0.1,
			volume: 1000000 + i * 1000,
			index: i,
			dataIndex: i,
		}));
	}

	describe("applyCanaryFilter", () => {
		it("returns all bars when canaryLevel is 100", () => {
			const bars = createMockBars(100);
			const result = applyCanaryFilter(bars, 100);
			expect(result).toBe(bars); // Same reference
			expect(result).toHaveLength(100);
		});

		it("returns ~10% of bars when canaryLevel is 10", () => {
			const bars = createMockBars(1000);
			const result = applyCanaryFilter(bars, 10);

			expect(result).toHaveLength(100); // 10% of 1000
			// Verify it's the most recent bars (last 100)
			expect(result[0]).toEqual(bars[900]);
			expect(result[result.length - 1]).toEqual(bars[999]);
		});

		it("returns ~30% of bars when canaryLevel is 30", () => {
			const bars = createMockBars(1000);
			const result = applyCanaryFilter(bars, 30);

			expect(result).toHaveLength(300); // 30% of 1000
			// Verify temporal order (most recent)
			expect(result[0]).toEqual(bars[700]);
			expect(result[result.length - 1]).toEqual(bars[999]);
		});

		it("maintains temporal order (most recent bars kept)", () => {
			const bars = createMockBars(100);
			const result = applyCanaryFilter(bars, 10);

			// Check that dates are in ascending order
			for (let i = 1; i < result.length; i++) {
				expect(result[i].date.getTime()).toBeGreaterThanOrEqual(result[i - 1].date.getTime());
			}
		});

		it("handles empty array gracefully", () => {
			const empty: OHLCVBar[] = [];
			expect(applyCanaryFilter(empty, 10)).toHaveLength(0);
			expect(applyCanaryFilter(empty, 30)).toHaveLength(0);
			expect(applyCanaryFilter(empty, 100)).toHaveLength(0);
		});

		it("keeps at least 1 bar even for tiny datasets", () => {
			const bars = createMockBars(1);
			expect(applyCanaryFilter(bars, 10)).toHaveLength(1);
			expect(applyCanaryFilter(bars, 30)).toHaveLength(1);
		});

		it("handles small datasets with ceiling rounding", () => {
			// 3 bars, 10% = ceil(0.3) = 1
			const bars3 = createMockBars(3);
			expect(applyCanaryFilter(bars3, 10)).toHaveLength(1);

			// 3 bars, 30% = ceil(0.9) = 1
			expect(applyCanaryFilter(bars3, 30)).toHaveLength(1);

			// 10 bars, 10% = ceil(1) = 1
			const bars10 = createMockBars(10);
			expect(applyCanaryFilter(bars10, 10)).toHaveLength(1);

			// 10 bars, 30% = ceil(3) = 3
			expect(applyCanaryFilter(bars10, 30)).toHaveLength(3);
		});

		it("preserves data integrity (no mutation)", () => {
			const bars = createMockBars(100);
			const original = JSON.stringify(bars);

			applyCanaryFilter(bars, 10);
			applyCanaryFilter(bars, 30);

			expect(JSON.stringify(bars)).toBe(original);
		});
	});

	describe("getCanarySliceInfo", () => {
		it("returns full info at 100%", () => {
			const info = getCanarySliceInfo(1000, 100);
			expect(info.keepCount).toBe(1000);
			expect(info.percentage).toBe(100);
			expect(info.description).toContain("All 1000 bars (100%)");
		});

		it("calculates info for 10% canary", () => {
			const info = getCanarySliceInfo(1000, 10);
			expect(info.keepCount).toBe(100);
			expect(info.percentage).toBe(10);
			expect(info.description).toContain("100 of 1000 bars (10%)");
		});

		it("calculates info for 30% canary", () => {
			const info = getCanarySliceInfo(1000, 30);
			expect(info.keepCount).toBe(300);
			expect(info.percentage).toBe(30);
			expect(info.description).toContain("300 of 1000 bars (30%)");
		});

		it("handles zero bars", () => {
			const info = getCanarySliceInfo(0, 10);
			expect(info.keepCount).toBe(0);
			expect(info.percentage).toBe(100);
			expect(info.description).toContain("0 bars (100%)");
		});

		it("rounds ceiling for partial bar counts", () => {
			// 7 bars at 10% = ceil(0.7) = 1
			const info1 = getCanarySliceInfo(7, 10);
			expect(info1.keepCount).toBe(1);

			// 7 bars at 30% = ceil(2.1) = 3
			const info2 = getCanarySliceInfo(7, 30);
			expect(info2.keepCount).toBe(3);
		});
	});
});
