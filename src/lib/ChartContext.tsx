import React, { createContext, useContext } from "react";
import { ChartConfig } from "./StockChartContext";

export interface ChartContextValue {
	chartId: number | string;
	chartConfig: ChartConfig;
}

const ChartContext = createContext<ChartContextValue | undefined>(undefined);

export const ChartProvider = ChartContext.Provider;

export const useChart = () => {
	const context = useContext(ChartContext);
	if (!context) {
		throw new Error("useChart must be used within a ChartProvider");
	}
	return context;
};

export default ChartContext;
