import type { MultiChartConfig, ChartLayout } from "../../widget/VNInvestMultiCharts";

/**
 * Overview Showcase - General multi-chart dashboard
 * Demonstrates: Basic charting, sync, crosshair, multiple symbols
 */
export const overviewShowcase = {
	name: "overview",
	label: "Tổng quan thị trường",
	description: "4 biểu đồ crypto 1h đồng bộ — BTC, ETH, SOL, BNB",
	layout: { rows: 2, cols: 2 } as ChartLayout,
	charts: [
		{
			id: "chart-1",
			symbol: "BTCUSDT",
			timeframe: "1h",
		},
		{
			id: "chart-2",
			symbol: "ETHUSDT",
			timeframe: "1h",
		},
		{
			id: "chart-3",
			symbol: "SOLUSDT",
			timeframe: "1h",
		},
		{
			id: "chart-4",
			symbol: "BNBUSDT",
			timeframe: "1h",
		},
	] as MultiChartConfig[],
	defaultChartProps: {
		showToolbar: true,
		showHeader: true,
		showFooter: true,
		drawingUiEnabled: true,
		showTimeScrollbar: false,
		theme: "classic-dark" as const,
	},
	syncSettings: {
		syncVisibleRange: false,
		syncCrosshair: true,
		syncDrawings: true,
		syncSymbolLinks: true,
		syncTimeframe: true,
		syncChartType: true,
	},
	showPaperTradePanel: true,
	featuredPanels: ["drawings", "indicators"] as const,
} as const;

export type OverviewShowcase = typeof overviewShowcase;