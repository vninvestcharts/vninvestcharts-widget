import { describe, expect, it } from "vitest";
import type { PaneDescriptor } from "../../types/pane-descriptor";
import {
	applySplitterDelta,
	calculatePaneHeights,
	calculateSplitterBounds,
	equalizePairHeights,
	getPaneMinHeight,
} from "../paneSizingHelpers";

function makePane(id: string, overrides: Partial<PaneDescriptor> = {}): PaneDescriptor {
	return {
		id,
		label: id,
		pinned: false,
		visible: true,
		heightRatio: 0.33,
		series: [],
		splitScale: false,
		tooltip: "value",
		...overrides,
	};
}

describe("getPaneMinHeight", () => {
	it("returns per-pane floors (price 80 / volume 36 / indicator 48 / generic 40)", () => {
		expect(getPaneMinHeight(makePane("price"))).toBe(80);
		expect(getPaneMinHeight(makePane("volume"))).toBe(36);
		expect(getPaneMinHeight(makePane("momentum"))).toBe(48);
		expect(getPaneMinHeight(makePane("orderflow"))).toBe(48);
		expect(getPaneMinHeight(makePane("strength"))).toBe(48);
		expect(getPaneMinHeight(makePane("custom"))).toBe(40);
	});

	it("honours explicit pane.minHeight override", () => {
		expect(getPaneMinHeight(makePane("price", { minHeight: 120 }))).toBe(120);
		expect(getPaneMinHeight(makePane("custom", { minHeight: 12 }))).toBe(12);
	});

	it("ignores non-positive minHeight overrides", () => {
		expect(getPaneMinHeight(makePane("price", { minHeight: 0 }))).toBe(80);
		expect(getPaneMinHeight(makePane("price", { minHeight: -10 }))).toBe(80);
	});
});

describe("calculatePaneHeights", () => {
	it("returns [] when no pane is visible", () => {
		const panes = [makePane("price", { visible: false })];
		expect(calculatePaneHeights(panes, 500)).toEqual([]);
	});

	it("sums exactly to available and respects every min floor", () => {
		const panes = [
			makePane("price", { heightRatio: 0.65 }),
			makePane("volume", { heightRatio: 0.12 }),
			makePane("momentum", { heightRatio: 0.23 }),
		];
		const heights = calculatePaneHeights(panes, 500);
		expect(heights).toHaveLength(3);
		expect(heights.reduce((sum, h) => sum + h, 0)).toBe(500);
		expect(heights[1]).toBeGreaterThanOrEqual(36);
		expect(heights[2]).toBeGreaterThanOrEqual(48);
		expect(heights[0]).toBeGreaterThanOrEqual(80);
	});

	it("V-10: short 2x2 cells inflate volume share via 36px floor (explains ~25%)", () => {
		const panes = [
			makePane("price", { heightRatio: 0.85 }),
			makePane("volume", { heightRatio: 0.15 }),
		];
		// Roomy cell: ratio holds (~15%).
		expect(calculatePaneHeights(panes, 500)[1]).toBe(75);
		// Short grid cell: 0.15*140=21 < 36 floor -> 36/140 ~= 26%.
		const short = calculatePaneHeights(panes, 140);
		expect(short[1]).toBe(36);
		expect(short[1] / 140).toBeGreaterThan(0.25);
	});

	it("parks the rounding remainder on the price pane (index 0)", () => {
		const panes = [
			makePane("price", { heightRatio: 1 / 3 }),
			makePane("a", { heightRatio: 1 / 3 }),
			makePane("b", { heightRatio: 1 / 3 }),
		];
		const heights = calculatePaneHeights(panes, 500);
		expect(heights.reduce((sum, h) => sum + h, 0)).toBe(500);
		// 500/3 rounds to 167+167, remainder lands on pane 0.
		expect(heights[1]).toBe(167);
		expect(heights[2]).toBe(167);
		expect(heights[0]).toBe(166);
	});
});

describe("calculateSplitterBounds / applySplitterDelta", () => {
	const top = makePane("price");
	const bottom = makePane("volume");

	it("derives clamp bounds from min floors", () => {
		expect(calculateSplitterBounds(top, bottom, 300, 200)).toEqual({
			minDeltaY: 80 - 300,
			maxDeltaY: 200 - 36,
		});
	});

	it("splits a normal delta zero-sum", () => {
		const result = applySplitterDelta([300, 200], 0, 50, [top, bottom]);
		expect(result).toEqual([350, 150]);
	});

	it("clamps a delta that would crush the bottom pane", () => {
		const result = applySplitterDelta([300, 200], 0, 500, [top, bottom]);
		expect(result).toEqual([300 + (200 - 36), 36]);
	});

	it("clamps a delta that would crush the top pane", () => {
		const result = applySplitterDelta([300, 200], 0, -500, [top, bottom]);
		expect(result).toEqual([80, 200 + (300 - 80)]);
	});

	it("ignores out-of-range splitter indexes", () => {
		expect(applySplitterDelta([300, 200], 5, 50, [top, bottom])).toEqual([300, 200]);
		expect(applySplitterDelta([300, 200], -1, 50, [top, bottom])).toEqual([300, 200]);
	});
});

describe("equalizePairHeights", () => {
	it("splits the pair total evenly", () => {
		const panes = [makePane("price"), makePane("volume")];
		expect(equalizePairHeights([300, 200], 0, panes)).toEqual([250, 250]);
	});

	it("respects min floors when the even split is infeasible", () => {
		const panes = [makePane("price", { minHeight: 400 }), makePane("volume")];
		const result = equalizePairHeights([100, 500], 0, panes);
		expect(result[0]).toBeGreaterThanOrEqual(400);
		expect(result[0] + result[1]).toBe(600);
	});

	it("ignores out-of-range splitter indexes", () => {
		const panes = [makePane("price"), makePane("volume")];
		expect(equalizePairHeights([300, 200], 7, panes)).toEqual([300, 200]);
	});
});

describe("dynamicPanesReducer equalizePair (wiring lock)", () => {
	it("equalizes the targeted pair and keeps ratios normalized", async () => {
		const { createDefaultPaneLayout, dynamicPanesReducer } = await import("../useDynamicPanes");
		const panes = createDefaultPaneLayout();
		const visible = panes.filter((p) => p.visible);
		expect(visible.length).toBeGreaterThanOrEqual(2);

		const available = 600;
		const next = dynamicPanesReducer(panes, { type: "equalizePair", splitterIndex: 0, available });
		const nextVisible = next.filter((p) => p.visible);
		const heights = nextVisible.map((p) => p.heightRatio * available);
		expect(Math.abs(heights[0]! - heights[1]!) ).toBeLessThanOrEqual(1);
		const ratioSum = nextVisible.reduce((sum, p) => sum + p.heightRatio, 0);
		expect(ratioSum).toBeCloseTo(1, 6);
	});

	it("ignores out-of-range splitter indexes without touching state", async () => {
		const { createDefaultPaneLayout, dynamicPanesReducer } = await import("../useDynamicPanes");
		const panes = createDefaultPaneLayout();
		const next = dynamicPanesReducer(panes, { type: "equalizePair", splitterIndex: 99, available: 600 });
		expect(next.map((p) => p.heightRatio)).toEqual(panes.map((p) => p.heightRatio));
	});
});
