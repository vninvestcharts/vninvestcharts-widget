import { describe, expect, it } from "vitest";
import { format } from "d3-format";

import { registerPhaseOneSeries } from "../SeriesRegistry";
import { getSeries, getSeriesTier, registerSeries } from "../registryCore";
import { filterPanesBySeriesTier } from "../filterPanesBySeriesTier";
import { registerPineScript } from "../../../../../packages/vn-kline-widget-pro/src/pinescript/scriptRegistry";
import { pineSeriesTypeFor } from "../../seriesValueResolver";
import { buildForkTooltipTokens } from "../../../../widget/utils/widgetHelpers";
import type { PaneDescriptor, SeriesConfig, SeriesTypeId } from "../../types/pane-descriptor";
import LineSeries from "../../../series/LineSeries";

/**
 * G-PINE-TIER — plan item 1.7.
 *
 * The hole: `filterAvailableSeries` describes itself as the fail-closed render gate
 * (`registryCore.ts:229`) but had ZERO production callers. Wiring it is the only thing standing
 * between a hand-written pane layout in localStorage and a Pro script on a free chart.
 *
 * The observable asserted here is deliberately NOT "the array looks right". It is the two things
 * a user would actually experience:
 *   a) the locked series is nowhere in the render tree, and
 *   b) hovering the pane does not throw.
 * (b) is the part a gate placed at `forkEnginePanes` would have missed, because the tooltip path
 * reads `resolvedPanes` and calls `getSeries` unguarded (`widgetHelpers.ts:447`), and it only
 * throws on hover (`ForkPaneTooltips.tsx:94-96`).
 */

registerPhaseOneSeries();

const PINE_PRO = "pine_tierprobe" as SeriesTypeId;
const PINE_ORPHAN = "pine_orphanprobe" as SeriesTypeId;

function registerPine(type: SeriesTypeId) {
	registerSeries(type, {
		component: LineSeries,
		tier: "pro",
		defaultParams: {},
		defaultYAxis: "right",
		tooltipEntry: () => ({ label: "Pine", format: format(".2f"), accessor: () => 1 }),
	});
}

function pane(series: SeriesConfig[], id = "price"): PaneDescriptor {
	return {
		id,
		label: id,
		pinned: true,
		visible: true,
		heightRatio: 1,
		series,
		splitScale: false,
		tooltip: "ohlc",
	} as PaneDescriptor;
}

const datum = {
	date: new Date("2024-01-01T00:00:00.000Z"),
	open: 100,
	high: 110,
	low: 90,
	close: 105,
	volume: 1000,
	indicatorValues: { [`PINE:${PINE_PRO.slice("pine_".length)}`]: 42 },
};

describe("G-PINE-TIER: a registered Pine series carries tier=pro", () => {
	it("getSeriesTier reports pro, not the 'free' default", () => {
		registerPine(PINE_PRO);
		// Without an explicit tier, `getSeriesTier` returns "free" (registryCore.ts:210) and the
		// gate has nothing to act on — which is exactly how a Pro script leaks.
		expect(getSeries(PINE_PRO).tier).toBe("pro");
	});

	it("the PRODUCTION registration path declares tier=pro", () => {
		// This is the assertion that binds to the real code. The other tests in this file
		// register their own probe series, so they would stay green even if
		// `scriptRegistry.ts` shipped `tier: "free"` — which is exactly what a mutation run
		// proved. Asserting against `registerPineScript` means changing the production default
		// turns this file red.
		const id = "pine_prodpath" as SeriesTypeId;
		const plugin = registerPineScript(id, "study(\"x\", overlay=true)\nplot(ta.sma(close, 3))");
		expect(plugin).not.toBeNull();
		expect(getSeries(pineSeriesTypeFor(id)).tier).toBe("pro");
		expect(getSeriesTier(pineSeriesTypeFor(id))).toBe("pro");
	});
});

describe("G-PINE-TIER: free tier", () => {
	it("W6: a registered Pine series is dropped from the render list", () => {
		registerPine(PINE_PRO);
		const out = filterPanesBySeriesTier([pane([{ id: PINE_PRO, type: PINE_PRO, yAxis: "right" }])], "free");
		expect(out[0].series).toEqual([]);
	});

	it("W7b (W-01): paid built-ins are dropped at free; the settings upgrade prompt reads UNFILTERED resolvedPanes, not this list", () => {
		const out = filterPanesBySeriesTier(
			// MarketProfile, not VolumeProfile: P0-b (2026-10-15) moved VolumeProfile to
			// Community, so it is no longer a valid exemplar of a type that free must lose.
			// MarketProfile keeps `tier: "pro"` and is the point of this lock.
			[pane([{ id: "mp", type: "MarketProfile", yAxis: "right" }])],
			"free",
		);
		// W-01 (plan D-1, PROBE C): the Pine-only bypass is removed — the paid built-ins
		// are gated like Pine. The upgrade prompt survives because it reads `resolvedPanes`
		// (VNInvestCharts.tsx:820-821 keeps it UNFILTERED); only the render list is gated.
		expect(out[0].series).toHaveLength(0);
	});

	it("W6: an ORPHANED Pine type (no registration) is dropped rather than thrown on", () => {
		// Simulates a stored layout naming a plugin that no longer exists in this session, which
		// `importScript` produces by minting a new script id (useScriptPersistence.ts:124).
		expect(() => getSeries(PINE_ORPHAN)).toThrow(/unknown type/);

		const out = filterPanesBySeriesTier([pane([{ id: PINE_ORPHAN, type: PINE_ORPHAN, yAxis: "right" }])], "pro");
		expect(out[0].series).toEqual([]);
	});

	it("W6: hovering the pane does not throw for a locked series", () => {
		registerPine(PINE_PRO);
		const gated = filterPanesBySeriesTier(
			[pane([{ id: PINE_PRO, type: PINE_PRO, yAxis: "right" }, { id: "c", type: "Candlestick", yAxis: "left" }])],
			"free",
		);
		expect(() => buildForkTooltipTokens(gated[0], datum, "#fff")).not.toThrow();
	});

	it("W6: hovering an UNGATED pane with the same orphan DOES throw — the control", () => {
		// If this stops throwing, the assertion above is vacuous and the gate is not what protects
		// the hover path. This is the exact failure mode the previous gate placement had.
		const ungated = [pane([{ id: PINE_ORPHAN, type: PINE_ORPHAN, yAxis: "right" }])];
		expect(() => buildForkTooltipTokens(ungated[0], datum, "#fff")).toThrow();
	});
});

describe("G-PINE-TIER: pro tier", () => {
	it("W7: a registered Pine series SURVIVES (positive test)", () => {
		registerPine(PINE_PRO);
		const out = filterPanesBySeriesTier([pane([{ id: PINE_PRO, type: PINE_PRO, yAxis: "right" }])], "pro");
		// `filterAvailableSeries` is `catch -> false`, i.e. it silently drops anything it cannot
		// resolve. A paying user whose own script vanished would look identical to an attack, so
		// the positive direction has to be asserted or this gate can pass while Pro is broken.
		expect(out[0].series).toHaveLength(1);
		expect(out[0].series[0].type).toBe(PINE_PRO);
	});

	it("W7: enterprise also sees it", () => {
		registerPine(PINE_PRO);
		const out = filterPanesBySeriesTier([pane([{ id: PINE_PRO, type: PINE_PRO, yAxis: "right" }])], "enterprise");
		expect(out[0].series).toHaveLength(1);
	});

	it("W7: mixing locked and unlocked keeps only the unlocked one", () => {
		registerPine(PINE_PRO);
		const out = filterPanesBySeriesTier(
			[pane([{ id: PINE_PRO, type: PINE_PRO, yAxis: "right" }, { id: "e", type: "EMA", yAxis: "right" }])],
			"free",
		);
		expect(out[0].series.map((s) => s.type)).toEqual(["EMA"]);
	});
});

describe("G-PINE-TIER: structural invariants", () => {
	it("returns the SAME array reference when nothing changes, so the memo above it holds", () => {
		const panes = [pane([{ id: "e", type: "EMA", yAxis: "right" }])];
		expect(filterPanesBySeriesTier(panes, "free")).toBe(panes);
		expect(filterPanesBySeriesTier(panes, "enterprise")).toBe(panes);
	});

	it("preserves array length and order — paneDescriptorBridge maps 1:1", () => {
		const panes = [
			pane([{ id: PINE_PRO, type: PINE_PRO, yAxis: "right" }], "p1"),
			pane([{ id: "e", type: "EMA", yAxis: "right" }], "p2"),
			pane([{ id: PINE_PRO, type: PINE_PRO, yAxis: "right" }], "p3"),
		];
		const out = filterPanesBySeriesTier(panes, "free");
		expect(out).toHaveLength(3);
		expect(out.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
		// A fully-locked pane becomes an EMPTY pane, never a dropped pane.
		expect(out[0].series).toEqual([]);
		expect(out[1].series).toHaveLength(1);
	});

	it("does not mutate the input array or its panes", () => {
		const series = [{ id: PINE_PRO, type: PINE_PRO, yAxis: "right" as const }];
		const paneRef = pane(series as never);
		const panes = [paneRef];
		filterPanesBySeriesTier(panes, "free");
		expect(paneRef.series).toHaveLength(1);
		expect(paneRef).toBe(panes[0]);
	});

	it("handles undefined and empty input", () => {
		expect(filterPanesBySeriesTier(undefined, "free")).toEqual([]);
		expect(filterPanesBySeriesTier([], "pro")).toEqual([]);
	});

	it("W-01: a pane mixing Pine with a pro BUILT-IN type drops BOTH at free", () => {
		registerPine(PINE_PRO);
		const out = filterPanesBySeriesTier(
			// MarketProfile for the same reason as W7b above: VolumeProfile is Community since
			// P0-b, so it would no longer demonstrate the mixed-pane drop.
			[pane([{ id: "mp", type: "MarketProfile", yAxis: "right" }, { id: PINE_PRO, type: PINE_PRO, yAxis: "right" }])],
			"free",
		);
		// W-01 (plan D-1): the Pine-only bypass is removed — MarketProfile (pro) is gated
		// exactly like the Pine series. At pro both survive (see builtInSeriesTierGate.test.ts).
		expect(out[0].series.map((s) => s.type)).toEqual([]);
	});
});