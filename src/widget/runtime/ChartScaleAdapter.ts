import { discontinuousTimeScaleProviderBuilder } from "../../lib/scale";
import { type EnrichedDatum } from "../../lib/core/calculators/types";
import {
	buildLegacyPaneSnapshots,
	resolveDiscontinuousXExtents,
	type WidgetPaneRuntimeSnapshot,
	type WidgetCoordinateBridge,
} from "../utils/widgetHelpers";
import { createWidgetCoordinateBridge } from "../utils/coordinateBridge";
import { type IRuntimeEngine, type IRuntimeScale } from "./IRuntimeEngine";

/**
 * L4: runtime-agnostic LIVE chart scale provider (renamed from LegacyRuntimeAdapter).
 * Despite the old name, this feeds the main DynamicChart surface in ALL modes
 * (useWidgetCoordinateBridge → VNInvestCharts). Discontinuous gap handling lives here.
 *
 * ## READ THIS BEFORE CHANGING ANYTHING ABOUT GAPS — `showNonTradingDays` is a NO-OP FOR X
 *
 * Coordinator decision 2026-10-05 (`G3_DEFER_GATE_HARDEN_B2_2026-10-05` D1) closes G3 as
 * **DEFERRED**. This file is *not* where the X axis is projected, and the flag below does not
 * reach it. Three separate sessions have now written a confident causal sentence here and been
 * wrong; the measurements are in the plan and they are unambiguous.
 *
 * - **The live projection is index-domain.** `showNonTradingDays` does not affect the rendered X
 *   axis at this commit. The fork renderer projects through
 *   `src/widget/utils/coordinateBridge.ts:316-326` → `resolvePanePixelAtDataIndex` →
 *   `indexToPixelX`, which is `left + (index - from) / span * width`. Measured on a weekend
 *   fixture (Fri 2026-09-18, Mon 09-21, Tue 09-22, Wed 09-23; `plotBounds = {left: 0, width:
 *   1000}`; `visibleRange {from: 0, to: 4}`): bar centres at **125, 375, 625, 875 px**, deltas
 *   **250, 250, 250**, while the wall-clock deltas are **3 d, 1 d, 1 d**. Equal pixel steps over an
 *   unequal wall-clock gap *is* the compression. A wall-clock projection would give unequal
 *   steps. The lock is `src/widget/runtime/chartScaleAdapter.gap.test.ts`.
 *
 * - **`usesDiscontinuousScale` reads backwards.** `true` means gaps are **COMPRESSED** (the
 *   discontinuous provider packs bars at `index + initialIndex`), not "shown". Do not use the name
 *   as a definition.
 *
 * - **This class's only consumer is a dead `useCallback`.** `getChartScale`'s result is read at
 *   `VNInvestCharts.tsx:1384` and `:1386`, inside `handleLegacyVisibleDomainChange`, declared at
 *   `:1383` and referenced nowhere else in that file. `useForkRuntime.ts:276` destructures the
 *   value and never uses it.
 *
 * - **What the flag DOES do** (all measured, none of it a pixel): it is a React remount key at
 *   `VNInvestCharts.tsx:2876`; it re-runs this `getChartScale` memo, producing a new `data` array
 *   identity per toggle; and it round-trips through `localStorage` and the workspace file.
 *
 * - **The engine does not know the flag at all** — 0 hits for `showNonTradingDays` across the
 *   whole of `packages` + `src` in `vninvestcharts-engine` at `6264903` (351 files scanned).
 *
 * To actually make gaps appear, the work is a time-scale projection in the engine
 * (`PaneRuntimeSnapshot.time`, `paneProjector`, the X tick generator, `AxisGridRenderCache` keys,
 * both `barWidth` sources, zoom pivot, pan) — plan
 * `G3_ENGINE_TIMESCALE_PLAN_2026-10-03.md`, audit verdict **NEED_REVISION** with 6 open
 * objections. It was **not** done, deliberately, because it could not be verified in a browser.
 * Start by reading that audit, not by editing this file.
 */
export class ChartScaleAdapter implements IRuntimeEngine {
	getChartScale(options: {
    plotData: readonly EnrichedDatum[];
    enrichedData: readonly EnrichedDatum[];
    controlledXExtents: readonly [Date | number, Date | number] | undefined;
    computedXExtents: readonly [Date | number, Date | number] | undefined;
    showNonTradingDays: boolean;
  }): IRuntimeScale {
		const { plotData, enrichedData, controlledXExtents, computedXExtents, showNonTradingDays } = options;

		const safeXAccessor = (datum?: EnrichedDatum) => datum?.date ?? new Date(0);

		if (showNonTradingDays || plotData.length === 0) {
			// Continuous branch. It used to return `xScale: scaleUtc()` — a d3 time scale with
			// zero readers, since the X projection runs through the engine projector and not
			// through here. Removed with the interface field; see the class docblock and
			// `IRuntimeEngine.ts`.
			const resolvedXExtents = controlledXExtents ?? computedXExtents;
			return {
				data: plotData,
				xAccessor: (datum?: EnrichedDatum) => datum?.date?.getTime() ?? 0,
				displayXAccessor: safeXAccessor,
				xExtents: resolvedXExtents as readonly [Date, Date] | undefined,
				usesDiscontinuousScale: false,
			};
		}

		const scaleProvider = discontinuousTimeScaleProviderBuilder().inputDateAccessor((datum: EnrichedDatum) => datum.date);
		const scaled = scaleProvider(plotData as EnrichedDatum[]);
		const scaledData = scaled.data as EnrichedDatum[];
		const scaledXAccessor = scaled.xAccessor as (datum: EnrichedDatum) => number;
		const resolvedXExtents = controlledXExtents ?? computedXExtents;

		// `scaled.xScale` is dropped here too, for the same reason. The provider still builds it
		// internally, because `scaledData` and `scaledXAccessor` are genuinely used (the latter by
		// `resolveDiscontinuousXExtents` below), so `src/lib/scale/` stays live.
		return {
			data: scaledData,
			xAccessor: scaledXAccessor,
			displayXAccessor: scaled.displayXAccessor as (datum: EnrichedDatum) => Date,
			xExtents: resolveDiscontinuousXExtents(resolvedXExtents, scaledData, scaledXAccessor) as readonly [Date, Date] | undefined,
			usesDiscontinuousScale: true,
		};
	}

	buildPaneSnapshots(options: {
    visiblePanes: any[];
    activeHeights: number[];
    size: { width: number; height: number };
    scaleSlotDomains: Record<string, [number, number]>;
  }): readonly WidgetPaneRuntimeSnapshot[] {
		const { visiblePanes, activeHeights, size, scaleSlotDomains } = options;
		return buildLegacyPaneSnapshots(visiblePanes, activeHeights, size, scaleSlotDomains);
	}

	createCoordinateBridge(options: {
    paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
    visibleRange: any;
    plotData: readonly EnrichedDatum[];
  }): WidgetCoordinateBridge | null {
		const { paneSnapshots, visibleRange, plotData } = options;
		return createWidgetCoordinateBridge({
			paneSnapshots,
			visibleRange,
			plotData,
			engineRuntime: "fork",
		});
	}
}

/** L4: deprecated alias kept for old host/test imports (use ChartScaleAdapter). */
export { ChartScaleAdapter as LegacyRuntimeAdapter };
