/**
 * WE2 P1-03: VNInvestChartsConfigContext
 *
 * Low-frequency configuration context: theme, locale, symbol, timeframe, adapter.
 * These values change only on user action (not per-frame), so they can safely
 * live in a single React context without causing re-render storms.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { ChartTheme } from "../../lib/core";
import type { WidgetLocale } from "../i18n/types";
import type { StockDataAdapter, Timeframe } from "../../lib/types/adapter";

export interface VNInvestChartsConfigContextValue {
	theme: ChartTheme;
	locale: WidgetLocale;
	symbol?: string;
	timeframe?: Timeframe;
	adapter: StockDataAdapter;
}

const defaultValue: VNInvestChartsConfigContextValue = {
	theme: "modern-light",
	locale: "vi",
	adapter: undefined as unknown as StockDataAdapter,
};

export const VNInvestChartsConfigContext = createContext<VNInvestChartsConfigContextValue>(defaultValue);

export function useVNInvestChartsConfig() {
	return useContext(VNInvestChartsConfigContext);
}

export function VNInvestChartsConfigProvider({
	value,
	children,
}: {
	value: VNInvestChartsConfigContextValue;
	children: ReactNode;
}) {
	return (
		<VNInvestChartsConfigContext.Provider value={value}>
			{children}
		</VNInvestChartsConfigContext.Provider>
	);
}
