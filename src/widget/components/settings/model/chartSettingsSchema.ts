/**
 * Chart Settings SSOT Data Schema (TradingView Parity)
 */

export type CandleStyle = "candle" | "hollow" | "bar" | "line" | "area";
export type PriceScaleMode = "normal" | "logarithmic" | "percentage";
export type GridLineStyle = "solid" | "dashed" | "dotted";
export type CrosshairMode = "cross" | "dot" | "magnet";
export type ThemePresetName = "classic-dark" | "modern-light" | "trading-night" | "neutral-pro" | "high-contrast" | "midnight-blue";
export type OverlayStyle = "candle" | "hollow" | "step" | "area";

export interface SymbolSettings {
	candleStyle: CandleStyle;
	upColor: string;
	downColor: string;
	borderUpColor: string;
	borderDownColor: string;
	wickUpColor: string;
	wickDownColor: string;
	showLastPriceLine: boolean;
	lastPriceLineColor?: string;
	showPrevClosePriceLine: boolean;
	prevClosePriceLineColor?: string;
	showHighLowPriceLines: boolean;
	precision: "default" | "0" | "1" | "2" | "3" | "4";
	timezone: string;
}

export interface StatusLineSettings {
	showLogo: boolean;
	showTicker: boolean;
	showOhlc: boolean;
	showBarChange: boolean;
	showVolume: boolean;
	showIndicatorTitles: boolean;
	showIndicatorArguments: boolean;
	showIndicatorValues: boolean;
	backgroundOpacity: number;
}

export interface ScalesSettings {
	priceScaleMode: PriceScaleMode;
	invertScale: boolean;
	priceAxisPosition: "right" | "left";
	showSymbolLastValue: boolean;
	showPrevCloseValue: boolean;
	showIndicatorValues: boolean;
	showCountdownToBarClose: boolean;
	showTimeScrollbar: boolean;
	dateFormat: "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy";
	timeFormat: "24h" | "12h";
}

export interface AppearanceSettings {
	backgroundType: "solid" | "gradient";
	backgroundColor: string;
	backgroundGradientTop?: string;
	backgroundGradientBottom?: string;
	vertGridVisible: boolean;
	vertGridColor: string;
	vertGridStyle: GridLineStyle;
	horzGridVisible: boolean;
	horzGridColor: string;
	horzGridStyle: GridLineStyle;
	crosshairMode: CrosshairMode;
	crosshairColor: string;
	crosshairWidth: number;
	showWatermark: boolean;
	watermarkOpacity: number;
	scalesFontSize: 10 | 11 | 12 | 14;
	marginTopRatio: number;
	marginBottomRatio: number;
}

export interface PanesLayoutSettings {
	maxVisiblePanes: number;
	showNonTradingDays: boolean;
	overlayTimeframe?: string;
	overlayStyle: OverlayStyle;
}

export interface TradingEventsSettings {
	showCorporateEvents: boolean;
	showWhaleFlow: boolean;
	whaleThreshold: number;
	showCVD: boolean;
	cvdMode: "oscillator" | "histogram";
	alertAudioEnabled: boolean;
	showPaperOrders: boolean;
	showPaperPositions: boolean;
	dataAdapterName: "binance" | "local" | "vnstocks" | string;
}

export interface ThemeSettings {
	mode: "dark" | "light";
	presetName: ThemePresetName;
}

export interface ChartSettingsState {
	version: 1;
	symbol: SymbolSettings;
	statusLine: StatusLineSettings;
	scales: ScalesSettings;
	appearance: AppearanceSettings;
	panesLayout: PanesLayoutSettings;
	tradingEvents: TradingEventsSettings;
	theme: ThemeSettings;
}

export type SettingsTabId =
	| "symbol"
	| "statusLine"
	| "scales"
	| "appearance"
	| "panes"
	| "indicators"
	| "indicatorSets"
	| "trading"
	| "theme"
	| "licensing"
	| "reset";

