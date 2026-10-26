/**
 * Showcase Configurations Index
 * All demo showcase configurations exported from here
 */

export { overviewShowcase } from "./overview";
export type { OverviewShowcase } from "./overview";

export { technicalShowcase } from "./technical";
export type { TechnicalShowcase } from "./technical";

export { tradingShowcase } from "./trading";
export type { TradingShowcase } from "./trading";

export { comparisonShowcase } from "./comparison";
export type { ComparisonShowcase } from "./comparison";

export { customShowcase } from "./custom";
export type { CustomShowcase } from "./custom";

import type { ChartLayout, MultiChartConfig } from "../../widget/VNInvestMultiCharts";

export interface ShowcaseConfig {
  name: string;
  label: string;
  description: string;
  layout: ChartLayout;
  charts: MultiChartConfig[];
  defaultChartProps: Record<string, unknown>;
  syncSettings: {
    syncVisibleRange: boolean;
    syncCrosshair: boolean;
    syncDrawings: boolean;
    syncSymbolLinks: boolean;
    syncTimeframe: boolean;
    syncChartType: boolean;
  };
  featuredPanels?: readonly string[];
  activeBottomTab?: "strategy_tester" | "pine_editor" | null;
  workspaceId?: string;
  showTapePanel?: boolean;
  showPaperTradePanel?: boolean;
  allowAddChart?: boolean;
  allowRemoveChart?: boolean;
  allowLayoutChange?: boolean;
  enableWorkspacePersistence?: boolean;
}

// All showcases registry
import { overviewShowcase } from "./overview";
import { technicalShowcase } from "./technical";
import { tradingShowcase } from "./trading";
import { comparisonShowcase } from "./comparison";
import { customShowcase } from "./custom";

export const ALL_SHOWCASES = [
	overviewShowcase,
	technicalShowcase,
	tradingShowcase,
	comparisonShowcase,
	customShowcase,
] as const;

export type ShowcaseName = (typeof ALL_SHOWCASES)[number]["name"];

export function getShowcase(name: ShowcaseName): ShowcaseConfig {
	return ALL_SHOWCASES.find((s) => s.name === name) ?? overviewShowcase;
}

export function getShowcaseNames(): ShowcaseName[] {
	return ALL_SHOWCASES.map((s) => s.name);
}