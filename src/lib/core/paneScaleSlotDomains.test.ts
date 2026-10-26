import { describe, expect, it } from "vitest";

import { computePaneScaleSlotDomains } from "./paneScaleSlotDomains";
import { clearSeriesStyleOverrides, overrideSeriesStyle } from "./registry/SeriesRegistry";
import { comparisonSeriesId } from "../../widget/hooks/useComparisonState";
import type { EnrichedDatum } from "./calculators/types";
import type { PaneDescriptor } from "./types/pane-descriptor";

function createDatum(index: number, close = index + 100): EnrichedDatum {
	return {
		date: new Date(Date.UTC(2024, 0, 1, index)),
		open: close - 1,
		high: close + 2,
		low: close - 3,
		close,
		volume: index * 10 + 100,
	};
}

describe("computePaneScaleSlotDomains", () => {
	it("computes left/right domains for visible pane series", () => {
		const panes: PaneDescriptor[] = [
			{
				id: "price",
				label: "Price",
				pinned: true,
				visible: true,
				heightRatio: 0.6,
				splitScale: false,
				tooltip: "ohlc",
				series: [
					{ type: "Candlestick", yAxis: "right" },
				],
			},
			{
				id: "volume",
				label: "Volume",
				pinned: false,
				visible: true,
				heightRatio: 0.4,
				splitScale: false,
				tooltip: "value",
				series: [
					{ type: "Volume", yAxis: "left" },
				],
			},
		];
		const data = [createDatum(0, 100), createDatum(1, 110), createDatum(2, 105)];

		expect(computePaneScaleSlotDomains(panes, data)).toEqual({
			"price-right": [97, 112],
			"volume-left": [0, 120],
		});
	});

	it("handles large datasets without overflowing the call stack", () => {
		const panes: PaneDescriptor[] = [
			{
				id: "price",
				label: "Price",
				pinned: true,
				visible: true,
				heightRatio: 1,
				splitScale: false,
				tooltip: "ohlc",
				series: [
					{ type: "Line", yAxis: "right" },
				],
			},
		];
		const data: EnrichedDatum[] = Array.from({ length: 50_000 }, (_, index) => createDatum(index, index + 1));

		expect(() => computePaneScaleSlotDomains(panes, data)).not.toThrow();
		expect(computePaneScaleSlotDomains(panes, data)["price-right"]).toEqual([1, 50_000]);
	});

	// N1 / W-18. The one production reader of series-style overrides is this module,
	// (paneScaleSlotDomains.ts:37), and it decides Y-axis inclusion from them. So writing
	// per-chart comparison state into that process-wide registry meant a sibling chart
	// toggling its overlay off removed this chart overlay from this chart axis - while this
	// chart still drew it. Measured before the fix: domain [49,51] -> undefined.
	//
	// The test lives here rather than in the hook suite on purpose. Asserting hook state
	// would pass on the broken version too - the hook always reported visible:true correctly.
	// Only the axis read told the truth, so only the axis is worth asserting.
	it("N1: a series id in the override registry decides axis inclusion", () => {
		const key = comparisonSeriesId("scope-a", "VNINDEX");

		// What a sibling chart's toggle used to do to a shared key: the reader at
		// paneScaleSlotDomains.ts:37 lets a `visible:false` override hide a series whose
		// own config says visible. That is the module working as designed - and it is
		// precisely why the leak was possible.
		clearSeriesStyleOverrides();
		overrideSeriesStyle(key, { visible: false });

		const panes: PaneDescriptor[] = [
			{
				id: "price",
				label: "Price",
				pinned: true,
				visible: true,
				heightRatio: 1,
				splitScale: false,
				tooltip: "ohlc",
				series: [
					// Candlestick rather than Comparison: the series type is incidental here.
					// What is under test is that the *id* is read, and Candlestick resolves
					// without the overlaySymbolId / normalizedPrices plumbing a Comparison
					// series needs.
					{ id: key, type: "Candlestick", yAxis: "right", visible: true },
				],
			},
		];
		const data = [createDatum(0, 50), createDatum(1, 51)];

		expect(computePaneScaleSlotDomains(panes, data)["price-right"]).toBeUndefined();

		// W-18: comparison overlays no longer enter this registry, so a sibling cannot
		// poison the key and the series config alone decides.
		clearSeriesStyleOverrides();
		// closes 50,51 padded by the high/low of each bar (52 and 48).
		expect(computePaneScaleSlotDomains(panes, data)["price-right"]).toEqual([47, 53]);
	});
});
