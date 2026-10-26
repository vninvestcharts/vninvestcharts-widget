import type { MultiChartConfig, ChartLayout } from "../../widget/VNInvestMultiCharts";

/**
 * Trading Workflow Showcase - Complete trading workspace
 * Demonstrates: Strategy Tester, Paper Trading, Tape Panel, Order Flow
 */
export const tradingShowcase = {
	name: "trading",
	label: "Quy trình giao dịch",
	description: "Workspace giao dịch đầy đủ: backtest, paper trade, tape reading",
	layout: { rows: 1, cols: 2 } as ChartLayout,
	charts: [
		{
			id: "btc-trading-chart",
			symbol: "BTCUSDT",
			timeframe: "5m",
			symbolLinkGroup: "C" as const,
		},
		{
			id: "btc-trading-tape",
			symbol: "BTCUSDT",
			timeframe: "5m",
			symbolLinkGroup: "C" as const,
		},
	] as MultiChartConfig[],
	defaultChartProps: {
		showToolbar: true,
		showHeader: true,
		showFooter: true,
		drawingUiEnabled: true,
		theme: "classic-dark" as const,
		enableCVD: true,
		externalCvdSeries: [],
		darkFlowStrength: 0.75,
		darkFlowSignalType: "bullish",
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
					{ id: "vwap", type: "VWAP" as const, yAxis: "right" as const },
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
					{ id: "cvd", type: "CVD" as const, yAxis: "right" as const },
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
	featuredPanels: ["strategy_tester", "paper_trade", "tape"] as const,
	activeBottomTab: "strategy_tester" as const,
	// Trading-specific props
	showTapePanel: true,
	showPaperTradePanel: true,
	// Paper trading sizing (H4) — demo config only
	sizingMode: "fixed",
	riskPercent: 1,
	initialEquity: 10000,
} as const;

export type TradingShowcase = typeof tradingShowcase;