import { createContext, createElement, useContext } from "react";
import type { ReactNode } from "react";
import type { StockDataAdapter } from "../../types/adapter";
import type { OHLCVBar } from "../../types/ohlcv";

export interface DataContextValue {
	data: readonly OHLCVBar[];
	adapter?: StockDataAdapter;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export interface DataProviderProps {
	value: DataContextValue;
	children: ReactNode;
}

export function DataProvider({ value, children }: DataProviderProps) {
	return createElement(DataContext.Provider, { value }, children);
}

export function useDataContext() {
	const context = useContext(DataContext);
	if (!context) {
		throw new Error("useDataContext must be used within a DataProvider");
	}
	return context;
}

export { DataContext };