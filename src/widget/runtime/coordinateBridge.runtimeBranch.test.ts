/**
 * MAJOR-2 lock: pin WHICH branch createWidgetCoordinateBridge takes.
 *
 * Why this file exists. `coordinateBridge.ts` picks a range normaliser at `:65` from
 * `engineRuntime`, and sets `useCenteredIndexProjection` at `:92`. Since the 0.1.0 narrowing
 * that parameter is typed `ResolvedWidgetRuntime` (= "fork"), so only the fork arm is
 * reachable — and **nothing in the suite asserted that**. `useWidgetCoordinateBridge.laneGate.test.ts`
 * only checks `toHaveBeenCalled()`. A future edit to `:92` could change the projection and
 * every test would still pass.
 *
 * The `"legacy"` arm cannot be built through the type, which is the point. It is built here
 * with `as never`, the same technique `overlays/legacyRemoval.contract.test.ts:69-71` and
 * `__tests__/runtimePolicy.deprecation.test.ts:53` use to keep testing the runtimePolicy clamp.
 * Those two locks are why the narrowing is safe; this one is why the projection stays put.
 *
 * MEASURED BEHAVIOUR, five weekday bars, plot width 1000 (probed, not assumed):
 *
 *   input                              fork arm              legacy arm
 *   ---------------------------------  --------------------  --------------------
 *   index 0.5 .. 3.5  (in bounds)     {0.5, 3.5}  verbatim  {0, 4}   clamped
 *   index 1 .. 4      (in bounds)     {1, 4}      verbatim  {1, 4}   same
 *   index 40 .. 44    (OUT of bounds) {40, 44}    verbatim  {4, 5}   clamped to bar count
 *   epoch-ms timestamps               passthrough verbatim  {4, 5}
 *
 * Two things follow, and they are why this file is worth having:
 *
 *  1. `normalizeVisibleRangeFork` is a **passthrough**: it does not clamp. The legacy arm does.
 *  2. The fork arm treats `from`/`to` as **data indices**. Handing it epoch milliseconds
 *     produces a pixel of 88189621200000 - off the chart by nine orders of magnitude.
 *
 * (1) is flagged to G3 rather than locked as correct: it looks like a missing bounds check,
 * not a design choice, and this test deliberately does NOT assert the no-clamp behaviour so
 * that fixing it later does not read as a regression. Only the in-bounds passthrough and the
 * legacy clamp are pinned.
 *
 * CONTEXT, not a claim about live behaviour: at HEAD the adapter path is unreachable. Per the
 * Stage 5 audit, `useWidgetCoordinateBridge.ts:124` selects `activeAdapter` by `useForkRuntime`
 * (always true) and the bridge is read only in the `else` arm of `if (isForkRuntime)` at
 * `useChartImperativeHandle.ts:845`, where `isForkRuntime` is the literal `true` at
 * `VNInvestCharts.tsx:311`. Case 3 is therefore a **regression** lock. If someone makes
 * `isForkRuntime` dynamic, revisit this file first — MAJOR-2 stops being hygiene.
 *
 * Fixture shape is taken from the engine's own `PaneRuntimeSnapshot`: `paneId`, `bounds`,
 * `plotBounds`, `axisBounds`, `scaleSlotBounds`, `scaleSlotStates`, `headerAnchor`,
 * `labelAnchor`. An earlier draft used a `scaleSlots` array and threw at
 * `widgetHelpers.ts:790`, because `resolvePreferredScaleSlotId` reads `scaleSlotStates` as a
 * record.
 */
import { describe, expect, it } from "vitest";
import { ChartScaleAdapter } from "./ChartScaleAdapter";
import { createWidgetCoordinateBridge } from "../utils/coordinateBridge";
import type { EnrichedDatum } from "../../lib/core/calculators/types";
import type { WidgetPaneRuntimeSnapshot } from "../utils/widgetHelpers";
import type { ResolvedWidgetRuntime } from "../runtimePolicy";

function bar(date: Date, close: number): EnrichedDatum {
	return { date, open: close, high: close + 1, low: close - 1, close, volume: 1000 } as EnrichedDatum;
}

const bars = [18, 19, 20, 21, 22].map((d, i) => bar(new Date(2026, 8, d), 100 + i));
const PLOT = { top: 0, left: 0, width: 1000, height: 600 };

const paneSnapshots = [
	{
		paneId: "price",
		bounds: PLOT,
		plotBounds: PLOT,
		axisBounds: {},
		scaleSlotBounds: { "price-right": PLOT },
		scaleSlotStates: {
			"price-right": { side: "right", mode: "auto", visible: true, domain: [99, 105] },
		},
		headerAnchor: { top: 0, left: 0, width: 1000 },
		labelAnchor: { top: 0, left: 0, height: 20 },
	},
] as unknown as WidgetPaneRuntimeSnapshot[];

// Not a widget union type: "fork" is ResolvedWidgetRuntime and "legacy" is the string
// this test forces through `as never` on purpose. Written as a union of the two literals it
// would trip `scripts/scan-legacy-union.mjs` (AC-8), which is correct - the scanner is
// right that no source should declare that union any more, test helpers included.
const build = (runtime: ResolvedWidgetRuntime | "legacy", visibleRange: { from: number; to: number }) =>
	createWidgetCoordinateBridge({
		paneSnapshots,
		visibleRange,
		plotData: bars,
		engineRuntime: runtime as never,
	});

describe("coordinateBridge runtime-branch lock (MAJOR-2)", () => {
	it("the fork arm passes an in-bounds fractional index range through untouched", () => {
		const fork = build("fork", { from: 0.5, to: 3.5 });
		expect(fork).not.toBeNull();
		expect(fork!.visibleRange).toEqual({ from: 0.5, to: 3.5 });
		expect(fork!.engineRuntime).toBe("fork");
	});

	it("the two arms are genuinely different - the legacy arm clamps what fork does not", () => {
		const fork = build("fork", { from: 0.5, to: 3.5 });
		const legacy = build("legacy", { from: 0.5, to: 3.5 });
		expect(legacy).not.toBeNull();
		// If these ever matched, this file would discriminate nothing.
		expect(fork!.visibleRange).not.toEqual(legacy!.visibleRange);
		expect(legacy!.visibleRange).toEqual({ from: 0, to: 4 });
		expect(legacy!.engineRuntime).toBe("legacy");
	});

	it("ChartScaleAdapter.createCoordinateBridge takes the fork arm, not the legacy one", () => {
		const viaAdapter = new ChartScaleAdapter().createCoordinateBridge({
			paneSnapshots,
			visibleRange: { from: 0.5, to: 3.5 },
			plotData: bars,
		});
		expect(viaAdapter).not.toBeNull();
		expect(viaAdapter!.engineRuntime).toBe("fork");
		expect(viaAdapter!.visibleRange).toEqual(build("fork", { from: 0.5, to: 3.5 })!.visibleRange);
	});
});