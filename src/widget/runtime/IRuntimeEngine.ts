import { type VisibleRange } from "../../lib/core";
import { type EnrichedDatum } from "../../lib/core/calculators/types";
import { type WidgetCoordinateBridge, type WidgetPaneRuntimeSnapshot } from "../utils/widgetHelpers";

export interface IRuntimeScale {
  data: readonly EnrichedDatum[];
  xAccessor: (datum: EnrichedDatum) => number;
  displayXAccessor: (datum: EnrichedDatum) => Date;
  xExtents: readonly [Date, Date] | undefined;
  /**
   * `xScale` was removed from this interface on 2026-10-05.
   *
   * It had **zero readers**. Both branches of `ChartScaleAdapter.getChartScale` produced one —
   * `scaleUtc()` and `financeDiscontinuousScale` — and nothing in the repo ever called it. The
   * only live readers of this object are `VNInvestCharts.tsx:1384` and `:1386`, and both sit
   * inside `handleLegacyVisibleDomainChange`, a `useCallback` declared at `:1383` whose
   * identifier occurs exactly once in the file: it is dead.
   *
   * Removing the field is enforced by the compiler, not by a grep. `legacyChartScale` was typed
   * `any` at both holders, so `tsc` could not see a read; both are now typed `IRuntimeScale`, so
   * any future read of a field that does not exist here is TS2339. `npm run type-check` is the
   * gate. Do not re-add a scale without a consumer — see the docblock at the top of
   * `ChartScaleAdapter.ts` for why the gap feature does not live here.
   */
  usesDiscontinuousScale: boolean;
}

export interface IRuntimeEngine {
	// L4: getChartScale removed from the contract (was only served by the live
	// ChartScaleAdapter; the fork adapter's copy was dead). Scale callers use
	// the concrete ChartScaleAdapter type.

  buildPaneSnapshots(options: {
    visiblePanes: any[];
    activeHeights: number[];
    size: { width: number; height: number };
    scaleSlotDomains: Record<string, [number, number]>;
  }): readonly WidgetPaneRuntimeSnapshot[];

  createCoordinateBridge(options: {
    paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
    visibleRange: any;
    plotData: readonly EnrichedDatum[];
  }): WidgetCoordinateBridge | null;
}
