import type { MultiChartConfig, ChartLayout } from "../../widget/VNInvestMultiCharts";

/**
 * Multi-Symbol Comparison Showcase - Crypto market comparison
 * Demonstrates: Symbol linking, workspace save/load, 8-chart grid
 */
export const comparisonShowcase = {
	name: "comparison",
	label: "So sánh đa mã",
	description: "So sánh 8 mã crypto cùng lúc với symbol linking",
	layout: { rows: 2, cols: 4 } as ChartLayout,
	charts: [
		{ id: "crypto-btc", symbol: "BTCUSDT", timeframe: "1h", symbolLinkGroup: "D" as const },
		{ id: "crypto-eth", symbol: "ETHUSDT", timeframe: "1h", symbolLinkGroup: "D" as const },
		{ id: "crypto-sol", symbol: "SOLUSDT", timeframe: "1h", symbolLinkGroup: "D" as const },
		{ id: "crypto-bnb", symbol: "BNBUSDT", timeframe: "1h", symbolLinkGroup: "D" as const },
		{ id: "crypto-xrp", symbol: "XRPUSDT", timeframe: "1h", symbolLinkGroup: "D" as const },
		{ id: "crypto-doge", symbol: "DOGEUSDT", timeframe: "1h", symbolLinkGroup: "D" as const },
		{ id: "crypto-ada", symbol: "ADAUSDT", timeframe: "1h", symbolLinkGroup: "D" as const },
		{ id: "crypto-avax", symbol: "AVAXUSDT", timeframe: "1h", symbolLinkGroup: "D" as const },
	] as MultiChartConfig[],
	defaultChartProps: {
		showToolbar: true,
		showHeader: true,
		showFooter: true,
		drawingUiEnabled: true,
		theme: "classic-dark" as const,
	},
	syncSettings: {
		syncVisibleRange: true,
		syncCrosshair: true,
		syncDrawings: false, // Don't sync drawings across different symbols
		syncSymbolLinks: true,
		syncTimeframe: true,
		syncChartType: true,
	},
	featuredPanels: ["workspace", "drawings"] as const,
	activeBottomTab: null,
	// Workspace features
	workspaceId: "crypto-comparison",
	enableWorkspacePersistence: true,
} as const;

export type ComparisonShowcase = typeof comparisonShowcase;