import type { MultiChartConfig, ChartLayout } from "../../widget/VNInvestMultiCharts";

/**
 * Custom Layout Showcase - User-defined workspace
 * Demonstrates: Dynamic layout, add/remove charts, layout persistence
 */
export const customShowcase = {
	name: "custom",
	label: "Tùy chỉnh workspace",
	description: "Tự tạo layout, thêm/xóa biểu đồ, lưu workspace cá nhân",
	layout: { rows: 2, cols: 2 } as ChartLayout,
	charts: [
		{ id: "custom-1", symbol: "BTCUSDT", timeframe: "1h", symbolLinkGroup: null },
		{ id: "custom-2", symbol: "ETHUSDT", timeframe: "1h", symbolLinkGroup: null },
		{ id: "custom-3", symbol: "SOLUSDT", timeframe: "1h", symbolLinkGroup: null },
		{ id: "custom-4", symbol: "BNBUSDT", timeframe: "1h", symbolLinkGroup: null },
	] as MultiChartConfig[],
	defaultChartProps: {
		showToolbar: true,
		showHeader: true,
		showFooter: true,
		drawingUiEnabled: true,
		theme: "classic-dark" as const,
	},
	syncSettings: {
		syncVisibleRange: false,
		syncCrosshair: false,
		syncDrawings: false,
		syncSymbolLinks: false,
		syncTimeframe: false,
		syncChartType: false,
	},
	featuredPanels: ["workspace", "drawings", "indicators"] as const,
	activeBottomTab: null,
	// Custom layout features
	allowAddChart: true,
	allowRemoveChart: true,
	allowLayoutChange: true,
	workspaceId: "user-custom-workspace",
} as const;

export type CustomShowcase = typeof customShowcase;