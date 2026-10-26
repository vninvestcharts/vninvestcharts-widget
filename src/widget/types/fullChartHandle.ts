import type { ChartHandle } from "@vninvestcharts/engine-react";
import type { DrawingWorkspaceController } from "@vninvestcharts/engine-react";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import type { VNInvestChartsRef, WidgetChartHandle } from "../utils/widgetHelpers";

// Augment WidgetChartHandle with widget-specific methods that were previously in widgetHelpers (ARC-1)
// This avoids bloating the frozen widgetHelpers.ts (885 budget) while keeping the handle typed.
declare module "../utils/widgetHelpers" {
	interface WidgetChartHandle {
		_frozenSnapshot?: ImageBitmap | HTMLCanvasElement | null;
		openSettings?(): void;
		saveAsImage?(): void;
		saveTemplate?(): void;
		loadTemplate?(): void;
		cycleMagnet?(): void;
		getMagnetSensitivity?(): number;
		getDrawingWorkspace?(): DrawingWorkspaceController | null;
		getDrawingObjects?(): DrawingObject[];
		importDrawingObjects?(drawings: DrawingObject[]): void;
		freeze?(): Promise<void> | void;
		thaw?(): Promise<void> | void;
		captureSnapshot?(): Promise<ImageBitmap | HTMLCanvasElement | null>;
		restoreFromSnapshot?(snapshot: ImageBitmap | HTMLCanvasElement): Promise<void>;
		openAlerts?(): void;
		setTimeframe(timeframe: string, sourceChartId?: string): void;
		setChartType(chartType: string, sourceChartId?: string): void;
	}
}

export type FullChartHandle = VNInvestChartsRef & WidgetChartHandle;
