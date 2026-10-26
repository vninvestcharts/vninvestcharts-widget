// Tier-gate matrix (user decision 2026-09-24): Free/Starter/unknown = 2,
// Pro = 4 (opens 1x3 + 2x2), Enterprise/Custom/Internal = full.
import { describe, expect, it } from "vitest";
import {
	clampChartLayoutToMax,
	countLayoutCharts,
	resolveMaxChartsForTier,
} from "../VNInvestMultiCharts";

describe("tier-gate matrix", () => {
	it("caps free/starter/unknown at 2 charts", () => {
		expect(resolveMaxChartsForTier("free")).toBe(2);
		expect(resolveMaxChartsForTier("starter")).toBe(2);
		expect(resolveMaxChartsForTier("none")).toBe(2);
		expect(resolveMaxChartsForTier(undefined)).toBe(2);
	});

	it("caps pro at 4 charts (1x3 + 2x2 allowed, 5+ gated)", () => {
		expect(resolveMaxChartsForTier("pro")).toBe(4);
		expect(countLayoutCharts({ rows: 1, cols: 3 })).toBe(3);
		expect(countLayoutCharts({ rows: 2, cols: 2 })).toBe(4);
		expect(clampChartLayoutToMax({ rows: 2, cols: 2 }, 4)).toEqual({ rows: 2, cols: 2 });
		expect(clampChartLayoutToMax({ rows: 2, cols: 3 }, 4)).toEqual({ rows: 1, cols: 2 });
	});

	it("enterprise+ is uncapped", () => {
		expect(resolveMaxChartsForTier("enterprise")).toBe(Number.POSITIVE_INFINITY);
		expect(resolveMaxChartsForTier("custom")).toBe(Number.POSITIVE_INFINITY);
		expect(resolveMaxChartsForTier("internal")).toBe(Number.POSITIVE_INFINITY);
	});
});
