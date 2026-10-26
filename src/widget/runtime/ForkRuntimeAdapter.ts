import { type EnrichedDatum } from "../../lib/core/calculators/types";
import {
	type WidgetPaneRuntimeSnapshot,
	type WidgetCoordinateBridge,
} from "../utils/widgetHelpers";
import { createWidgetCoordinateBridge } from "../utils/coordinateBridge";
import { type IRuntimeEngine } from "./IRuntimeEngine";

export class ForkRuntimeAdapter implements IRuntimeEngine {
	// L4: getChartScale removed (was dead — 0 callers; the main chart scale
	// comes from ChartScaleAdapter). This adapter owns pane snapshots (via
	// engine instance) + coordinate bridge only.

	buildPaneSnapshots(options: {
    visiblePanes: any[];
    activeHeights: number[];
    size: { width: number; height: number };
    scaleSlotDomains: Record<string, [number, number]>;
  }): readonly WidgetPaneRuntimeSnapshot[] {
		return []; // Fork snapshots come from the engine instance directly
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
