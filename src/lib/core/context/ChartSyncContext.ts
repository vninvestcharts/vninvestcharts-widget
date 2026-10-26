import { createContext, createElement, useContext } from "react";
import type { ReactNode } from "react";
import type { ScaleLinear } from "d3-scale";
import type { OHLCVBar } from "../../types/ohlcv";
import type { PaneConfig } from "../../types/pane";

export interface ChartSyncState {
	pane: PaneConfig;
	data: readonly OHLCVBar[];
	visibleData: readonly OHLCVBar[];
	width: number;
	height: number;
	leftScale: ScaleLinear<number, number>;
	rightScale?: ScaleLinear<number, number>;
}

const ChartSyncContext = createContext<ChartSyncState | undefined>(undefined);

export interface ChartSyncProviderProps {
	value: ChartSyncState;
	children: ReactNode;
}

export function ChartSyncProvider({ value, children }: ChartSyncProviderProps) {
	return createElement(ChartSyncContext.Provider, { value }, children);
}

export function useChartSync() {
	const context = useContext(ChartSyncContext);
	if (!context) {
		throw new Error("useChartSync must be used within a ChartSyncProvider");
	}
	return context;
}

export { ChartSyncContext };