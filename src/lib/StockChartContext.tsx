import React, { createContext, useContext } from "react";
import type { AnyRecord, CanvasContexts } from "./types";

export interface ChartConfig {
	id: number | string;
	paneId?: string;
	yScaleId?: string;
	origin: [number, number];
	padding: number | { top: number; bottom: number };
	yScale: any;
	yExtents: any[];
	width: number;
	height: number;
	mouseCoordinates?: {
		at: string;
		format: (n: number) => string;
	};
}

export interface StockChartContextValue {
	plotData: any[];
	fullData: any[];
	chartConfig: ChartConfig[];
	xScale: any;
	xAccessor: (d: any) => any;
	displayXAccessor: (d: any) => any;
	width: number;
	height: number;
	chartCanvasType: "svg" | "hybrid";
	margin: { top: number; right: number; bottom: number; left: number };
	ratio: number;
	getCanvasContexts?: () => CanvasContexts | undefined;
	xAxisZoom?: (newDomain: any[]) => void;
	yAxisZoom?: (chartId: string | number, newDomain: any[]) => void;
	amIOnTop?: (id: string | number) => boolean;
	redraw?: () => void;
	subscribe: (id: string | number, rest: AnyRecord) => void;
	unsubscribe: (id: string | number) => void;
	setCursorClass?: (className: string | null | undefined) => void;
	generateSubscriptionId: () => number;
	getMutableState: () => AnyRecord;
	morePropsDecorator?: (moreProps: AnyRecord) => AnyRecord;
}

const StockChartContext = createContext<StockChartContextValue | undefined>(undefined);

export const StockChartProvider = StockChartContext.Provider;

export const useStockChart = () => {
	const context = useContext(StockChartContext);
	if (!context) {
		throw new Error("useStockChart must be used within a StockChartProvider");
	}
	return context;
};

export default StockChartContext;
