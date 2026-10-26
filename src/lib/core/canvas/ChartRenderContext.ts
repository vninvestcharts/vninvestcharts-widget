import { createContext, useContext } from "react";

import type { VisibleRange } from "../types/chart";

export interface ChartRenderContextValue {
	xScale: (value: Date) => number;
	xScaleByIndex?: (index: number) => number;
	yScale: (value: number) => number;
	plotData: readonly Record<string, unknown>[];
	candleWidth: number;
	devicePixelRatio: number;
	visibleRange: VisibleRange | null;
	width: number;
	height: number;
}

export const ChartRenderContext = createContext<ChartRenderContextValue | null>(null);

export function useChartRenderContext(): ChartRenderContextValue {
	const context = useContext(ChartRenderContext);
	if (!context) {
		throw new Error("useChartRenderContext phải được dùng bên trong ChartCanvas tree");
	}
	return context;
}
