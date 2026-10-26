import { describe, expect, it } from "vitest";
import { format } from "d3-format";

import type { EnrichedDatum } from "../calculators/types";
import { registerPhaseOneSeries } from "../registry/SeriesRegistry";
import { listRegistered, registerSeries } from "../registry/registryCore";
import {
	buildIndicatorSeriesKey,
	resolveSeriesDatumValue,
	resolveSeriesValue,
} from "../seriesValueResolver";
import type { SeriesConfig, SeriesTypeId } from "../types/pane-descriptor";
import LineSeries from "../../series/LineSeries";

// Populates the registry with every Phase-1 series thunk on import.
registerPhaseOneSeries();

/** Sentinel `close`. Anything the resolver hands back unchanged hit `default`. */
const CLOSE_SENTINEL = 105;

/**
 * Price-chart types whose value IS the close — explicit `return datum.close`
 * cases, i.e. design, not a fallthrough.
 */
const CLOSE_BY_DESIGN = new Set<SeriesTypeId>([
	"Candlestick",
	"HollowCandle",
	"OHLC",
	"HeikinAshi",
	"Line",
	"Area",
	// A rendering mode, not an indicator: `HistogramSeries` wraps `BarSeries`
	// and is registered with `defaultYAxis: "right"` / `baseAt`, exactly like
	// the other price chart types. Nothing in the repo builds a
	// `type: "Histogram"` series with an indicator identity, so `close` is the
	// correct scalar - same rule as `Area`.
	"Histogram",
]);

/**
 * Ids deliberately allowed to have no scalar accessor. Each entry must be
 * declared `renderable: false` in the catalog (`IndicatorCatalogEntry`).
 * Keep this list SHORT — an entry here means "we know this draws nothing".
 */
const NOT_RENDERABLE = new Set<SeriesTypeId>([]);

function closeSentinelDatum(): EnrichedDatum {
	return {
		date: new Date("2024-01-01T00:00:00.000Z"),
		open: 100,
		high: 110,
		low: 90,
		close: CLOSE_SENTINEL,
		volume: 1_000,
		indicatorValues: {},
	};
}

const registered: SeriesTypeId[] = listRegistered();

describe("indicator accessor coverage guard (H0.11)", () => {
	it("registers a meaningful number of series ids", () => {
		expect(registered.length).toBeGreaterThan(50);
	});

	for (const id of registered) {
		if (CLOSE_BY_DESIGN.has(id) || NOT_RENDERABLE.has(id)) {
			continue;
		}
		it(`${id} resolves something other than close`, () => {
			const series: SeriesConfig = { type: id, yAxis: "right" };
			const value = resolveSeriesValue(closeSentinelDatum(), series);
			expect(
				value,
				`${id} fell through to \`default: return datum.close\`. Either add a case in ` +
					`resolveSeriesValue/buildIndicatorSeriesKey, or declare it renderable:false.`,
			).not.toBe(CLOSE_SENTINEL);
		});
	}
});

/**
 * 1.8 — the gap this file could not see.
 *
 * `listRegistered()` above is captured at MODULE IMPORT time, which only ever contains the
 * statically declared types. Pine registers `pine_<scriptId>` at runtime, when the user presses
 * *Add to chart*, so the loop above never sees one. That is why this guard stayed green through
 * the bug where a compiled Pine script drew nothing: the guard was not blind to Pine by accident,
 * it was structurally incapable of seeing Pine.
 *
 * Enumeration cannot fix this — a runtime-generated id does not exist before it does. So the
 * coverage claim for dynamic types has to be asserted EXPLICITLY, against a type registered the
 * way production registers it.
 */
describe("runtime-generated Pine series (1.8)", () => {
	const PINE_TYPE = "pine_guardprobe1" as SeriesTypeId;

	it("registers a runtime Pine type through the production API", () => {
		// Goes through `registerSeries`, not a hand-built object, so a missing `tier` or a
		// missing `component` surfaces here instead of throwing later inside a different test
		// and being misread as that test's failure.
		registerSeries(PINE_TYPE, {
			component: LineSeries,
			tier: "pro",
			defaultParams: {},
			defaultYAxis: "right",
			tooltipEntry: () => ({ label: "probe", format: format(".2f"), accessor: () => 0 }),
		});
		expect(listRegistered()).toContain(PINE_TYPE);
	});

	it("appears in listRegistered() only AFTER registration, never before", () => {
		// The control. If this ever passes for an unregistered type the coverage claim above is
		// vacuous, which is the exact failure mode the Pine bug shipped with.
		expect(listRegistered()).not.toContain("pine_never_registered" as SeriesTypeId);
	});

	it("resolveSeriesValue returns the script value, not the bar close", () => {
		const datum = closeSentinelDatum();
		datum.indicatorValues = { [`PINE:${PINE_TYPE.slice("pine_".length)}`]: 42.5 };
		const series: SeriesConfig = { type: PINE_TYPE, id: PINE_TYPE, yAxis: "right" };

		const value = resolveSeriesValue(datum, series);

		expect(value, "a Pine series must not fall through to `default: return datum.close`").not.toBe(CLOSE_SENTINEL);
		expect(value).toBe(42.5);
	});

	it("resolveSeriesDatumValue finds it under the structured PINE: key", () => {
		const datum = closeSentinelDatum();
		datum.indicatorValues = { [`PINE:${PINE_TYPE.slice("pine_".length)}`]: 7 };
		const series: SeriesConfig = { type: PINE_TYPE, id: PINE_TYPE, yAxis: "right" };

		expect(buildIndicatorSeriesKey(series)).toBe(`PINE:${PINE_TYPE.slice("pine_".length)}`);
		expect(resolveSeriesDatumValue(datum, series)).toBe(7);
	});
});
