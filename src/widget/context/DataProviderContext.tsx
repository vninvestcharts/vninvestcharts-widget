import React, { createContext, type ReactNode } from "react";
import { type IChartDataProvider } from "../types/dataProvider";

export const DataProviderContext = createContext<IChartDataProvider | null>(null);

export function DataProviderProvider({
	provider,
	children,
}: {
	provider: IChartDataProvider | null;
	children: ReactNode;
}) {
	return React.createElement(DataProviderContext.Provider, { value: provider }, children);
}
