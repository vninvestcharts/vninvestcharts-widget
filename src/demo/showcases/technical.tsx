import type { MultiChartConfig, ChartLayout } from "../../widget/VNInvestMultiCharts";

/**
 * Technical Analysis Showcase - Deep technical analysis workspace
 * Demonstrates: Indicators, Pine Editor, Drawings, Multiple panes
 */
export const technicalShowcase = {
	name: "technical",
	label: "Phân tích kỹ thuật",
	description: "Workspace chuyên sâu với multiple panes và indicators",
	layout: { rows: 2, cols: 1 } as ChartLayout,
	charts: [
		{
			id: "btc-technical-main",
			symbol: "BTCUSDT",
			timeframe: "15m",
			symbolLinkGroup: "B" as const,
		},
		{
			id: "btc-technical-volume",
			symbol: "BTCUSDT",
			timeframe: "15m",
			symbolLinkGroup: "B" as const,
		},
	] as MultiChartConfig[],
	defaultChartProps: {
		showToolbar: true,
		showHeader: true,
		showFooter: true,
		drawingUiEnabled: true,
		theme: "classic-dark" as const,
		// Pre-configured panes for technical analysis
		panes: [
			{
				id: "price",
				label: "Price",
				visible: true,
				heightRatio: 3,
				pinned: false,
				splitScale: false,
				tooltip: "value" as const,
				series: [
					{ id: "price-main", type: "Candlestick" as const, yAxis: "right" as const },
					{ id: "ema-20", type: "EMA" as const, yAxis: "right" as const, params: { period: 20 } },
					{ id: "ema-50", type: "EMA" as const, yAxis: "right" as const, params: { period: 50 } },
					{ id: "bb", type: "BollingerBands" as const, yAxis: "right" as const, params: { period: 20, stdDev: 2 } },
				],
			},
			{
				id: "volume",
				label: "Volume",
				visible: true,
				heightRatio: 1,
				pinned: false,
				splitScale: false,
				tooltip: "value" as const,
				series: [
					{ id: "vol-main", type: "Volume" as const, yAxis: "right" as const },
				],
			},
			{
				id: "rsi",
				label: "RSI",
				visible: true,
				heightRatio: 1,
				pinned: false,
				splitScale: true,
				tooltip: "value" as const,
				series: [
					{ id: "rsi-14", type: "RSI" as const, yAxis: "right" as const, params: { period: 14 } },
				],
			},
			{
				id: "macd",
				label: "MACD",
				visible: true,
				heightRatio: 1,
				pinned: false,
				splitScale: true,
				tooltip: "value" as const,
				series: [
					{ id: "macd-main", type: "MACD" as const, yAxis: "right" as const, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
				],
			},
		],
	},
	syncSettings: {
		syncVisibleRange: true,
		syncCrosshair: true,
		syncDrawings: true,
		syncSymbolLinks: true,
		syncTimeframe: true,
		syncChartType: true,
	},
	featuredPanels: ["pine_editor", "drawings", "indicators"] as const,
	activeBottomTab: "pine_editor" as const,
} as const;

export type TechnicalShowcase = typeof technicalShowcase;