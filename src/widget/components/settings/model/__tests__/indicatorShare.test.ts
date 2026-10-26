/**
 * indicatorShare unit tests: extract attribution/stripping + merge semantics.
 */
import { describe, expect, it } from "vitest";
import type { PaneDescriptor, SeriesConfig } from "../../../../../lib/core/types/pane-descriptor";
import {
	extractShareableIndicators,
	mergeIndicatorsIntoLayout,
} from "../indicatorShare";

function series(overrides: Partial<SeriesConfig> & { type: SeriesConfig["type"] }): SeriesConfig {
	return { yAxis: "left", params: {}, ...overrides };
}

function pane(id: string, seriesList: SeriesConfig[], extra: Partial<PaneDescriptor> = {}): PaneDescriptor {
	return {
		id,
		label: id,
		pinned: id === "price",
		visible: true,
		heightRatio: id === "price" ? 0.7 : 0.15,
		series: seriesList,
		splitScale: false,
		tooltip: "value",
		...extra,
	};
}

describe("extractShareableIndicators", () => {
	it("skips the price-pane main series but keeps sibling overlays", () => {
		const panes = [pane("price", [
			series({ type: "Candlestick", yAxis: "right", params: {} }),
			series({ type: "EMA", params: { period: 20 } }),
		])];
		const out = extractShareableIndicators(panes);
		expect(out).toHaveLength(1);
		expect(out[0].paneId).toBe("price");
		expect(out[0].series.type).toBe("EMA");
	});

	it("keeps other panes with attribution and strips identity/source bindings", () => {
		const panes = [pane("price", [series({ type: "Candlestick", yAxis: "right", params: {} })]), pane("rsi", [
			{ ...series({ type: "RSI", params: { period: 14 } }), id: "rsi-1", sourceType: "price", sourceId: "BTC", sourceKey: "k" } as SeriesConfig,
		])];
		const out = extractShareableIndicators(panes);
		expect(out).toHaveLength(1);
		expect(out[0].paneId).toBe("rsi");
		expect(out[0].paneLabel).toBe("rsi");
		const rec = out[0].series as unknown as Record<string, unknown>;
		expect(rec["id"]).toBeUndefined();
		expect(rec["sourceType"]).toBeUndefined();
		expect(rec["sourceId"]).toBeUndefined();
		expect(rec["sourceKey"]).toBeUndefined();
		expect(out[0].series.params).toEqual({ period: 14 });
	});

	it("skips compare overlays and derived-on-derived series", () => {
		const panes = [pane("price", [
			series({ type: "Candlestick", yAxis: "right", params: {} }),
			{ ...series({ type: "Line", params: {} }), overlaySymbolId: "VIC" } as SeriesConfig,
			{ ...series({ type: "Line", params: {} }), sourceType: "indicator", sourceId: "ema-1" } as SeriesConfig,
		])];
		expect(extractShareableIndicators(panes)).toEqual([]);
	});
});

describe("mergeIndicatorsIntoLayout", () => {
	it("adds missing series to the existing pane and returns the same ref when nothing new", () => {
		const target = [pane("price", [series({ type: "Candlestick", yAxis: "right", params: {} })])];
		const merged = mergeIndicatorsIntoLayout(target, [
			{ paneId: "price", paneLabel: "price", series: series({ type: "EMA", params: { period: 20 } }) },
		]);
		expect(merged).not.toBe(target);
		expect(merged[0].series.map((s) => s.type)).toEqual(["Candlestick", "EMA"]);
		expect(mergeIndicatorsIntoLayout(merged, [
			{ paneId: "price", paneLabel: "price", series: series({ type: "EMA", params: { period: 20 } }) },
		])).toBe(merged);
		expect(mergeIndicatorsIntoLayout(target, [])).toBe(target);
	});

	it("creates a missing non-price pane as a visible shell, never touches price main", () => {
		const target = [pane("price", [series({ type: "Candlestick", yAxis: "right", params: {} })])];
		const merged = mergeIndicatorsIntoLayout(target, [
			{ paneId: "rsi", paneLabel: "RSI", series: series({ type: "RSI", params: { period: 14 } }) },
		]);
		expect(merged).toHaveLength(2);
		expect(merged[1].id).toBe("rsi");
		expect(merged[1].visible).toBe(true);
		expect(merged[1].series.map((s) => s.type)).toEqual(["RSI"]);
		expect(merged[0].series[0].type).toBe("Candlestick");
	});

	it("does not recreate a missing price pane", () => {
		const target = [pane("rsi", [series({ type: "RSI", params: { period: 14 } })])];
		const merged = mergeIndicatorsIntoLayout(target, [
			{ paneId: "price", paneLabel: "price", series: series({ type: "EMA", params: {} }) },
		]);
		expect(merged).toBe(target);
	});
});
