import { describe, expect, it } from "vitest";
import {
	clampChartLayoutToMax,
	countLayoutCharts,
	resolveMaxChartsForTier,
} from "../VNInvestMultiCharts";

describe("multi-chart tier gate (S5a)", () => {
	it("free/starter/unknown capped at 2, pro at 4, enterprise+ unlimited", () => {
		expect(resolveMaxChartsForTier("free")).toBe(2);
		expect(resolveMaxChartsForTier("starter")).toBe(2);
		expect(resolveMaxChartsForTier("pro")).toBe(4);
		expect(resolveMaxChartsForTier(undefined)).toBe(2);
		expect(resolveMaxChartsForTier("enterprise")).toBe(Number.POSITIVE_INFINITY);
		expect(resolveMaxChartsForTier("custom")).toBe(Number.POSITIVE_INFINITY);
		expect(resolveMaxChartsForTier("internal")).toBe(Number.POSITIVE_INFINITY);
	});

	it("counts slots when explicit, rows*cols otherwise", () => {
		expect(countLayoutCharts({ rows: 2, cols: 2 })).toBe(4);
		expect(
			countLayoutCharts({
				rows: 2,
				cols: 2,
				slots: [{ id: "a" }, { id: "b" }, { id: "c" }] as never,
			}),
		).toBe(3);
	});

	it("clamps over-max layouts to 1x2, passes the rest through", () => {
		expect(clampChartLayoutToMax({ rows: 2, cols: 2 }, 2)).toEqual({ rows: 1, cols: 2 });
		expect(clampChartLayoutToMax({ rows: 1, cols: 2 }, 2)).toEqual({ rows: 1, cols: 2 });
		expect(clampChartLayoutToMax({ rows: 2, cols: 2 }, Number.POSITIVE_INFINITY)).toEqual({
			rows: 2,
			cols: 2,
		});
	});
});
