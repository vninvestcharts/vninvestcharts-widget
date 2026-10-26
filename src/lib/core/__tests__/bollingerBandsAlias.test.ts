import { describe, expect, it } from "vitest";
import { normalizeSeriesTypeId } from "../types/pane-descriptor";
import {
	buildIndicatorSeriesKey,
	resolveSeriesValue,
	resolveSeriesValueAccessors,
} from "../seriesValueResolver";
import { dynamicPanesReducer } from "../hooks/useDynamicPanes";
import { DEFAULT_PANES } from "../types/pane-descriptor";
import type { EnrichedDatum } from "../calculators/types";

function bbDatum(): EnrichedDatum {
	return {
		date: new Date("2024-01-01T00:00:00.000Z"),
		open: 100, high: 110, low: 90, close: 105, volume: 1000,
		indicatorValues: {
			"BollingerBand:period=20:stdDev=2": { top: 112, middle: 104, bottom: 96 },
		},
	} as EnrichedDatum;
}

describe("BollingerBands legacy alias", () => {
	it("normalizes to the canonical singular type", () => {
		expect(normalizeSeriesTypeId("BollingerBands" as never)).toBe("BollingerBand");
		expect(normalizeSeriesTypeId("BollingerBand")).toBe("BollingerBand");
		expect(normalizeSeriesTypeId("EMA")).toBe("EMA");
	});
	it("builds the same indicator key as the singular type", () => {
		const singular = buildIndicatorSeriesKey({ type: "BollingerBand", yAxis: "right", params: { period: 20, stdDev: 2 } });
		const plural = buildIndicatorSeriesKey({ type: "BollingerBands" as never, yAxis: "right", params: { period: 20, stdDev: 2 } });
		expect(plural).toBe("BollingerBand:period=20:stdDev=2");
		expect(plural).toBe(singular);
	});
	it("resolves BB middle instead of the close-price fallback", () => {
		const plural = { type: "BollingerBands", yAxis: "right", params: { period: 20, stdDev: 2 } } as never;
		expect(resolveSeriesValue(bbDatum(), plural as never)).toBe(104);
		const [top, middle, bottom] = resolveSeriesValueAccessors(plural as never).map((fn) => fn(bbDatum()));
		expect([top, middle, bottom]).toEqual([112, 104, 96]);
	});
	it("addSeries reducer stores the canonical type", () => {
		const next = dynamicPanesReducer(DEFAULT_PANES, {
			type: "addSeries", paneId: "price",
			series: { type: "BollingerBands", yAxis: "right", params: { period: 20, stdDev: 2 } } as never,
		});
		const added = next.find((p) => p.id === "price")!.series.at(-1)!;
		expect(added.type).toBe("BollingerBand");
	});
});
