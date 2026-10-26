/**
 * Default Chart Settings by Theme Preset
 */
import type { ChartSettingsState, ThemePresetName } from "./chartSettingsSchema";

export function createDefaultSettings(isDark: boolean = true, preset?: string, defaultShowTimeScrollbar: boolean = true): ChartSettingsState {
	const resolvedPreset: ThemePresetName = (preset as ThemePresetName) || (isDark ? "classic-dark" : "modern-light");
	const dark = resolvedPreset !== "modern-light" && resolvedPreset !== "neutral-pro";

	const upColor = dark ? "#26a69a" : "#089981";
	const downColor = dark ? "#ef5350" : "#f23645";
	const bgColor = dark ? "#0F1720" : "#ffffff";
	const gridColor = dark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)";
	const crosshairColor = dark ? "#94a3b8" : "#475569";

	return {
		version: 1,
		symbol: {
			candleStyle: "candle",
			upColor,
			downColor,
			borderUpColor: upColor,
			borderDownColor: downColor,
			wickUpColor: upColor,
			wickDownColor: downColor,
			showLastPriceLine: true,
			lastPriceLineColor: upColor,
			showPrevClosePriceLine: false,
			prevClosePriceLineColor: "#64748b",
			showHighLowPriceLines: false,
			precision: "default",
			timezone: "Asia/Ho_Chi_Minh",
		},
		statusLine: {
			showLogo: true,
			showTicker: true,
			showOhlc: true,
			showBarChange: true,
			showVolume: true,
			showIndicatorTitles: true,
			showIndicatorArguments: true,
			showIndicatorValues: true,
			backgroundOpacity: 0,
		},
		scales: {
			priceScaleMode: "normal",
			invertScale: false,
			priceAxisPosition: "right",
			showSymbolLastValue: true,
			showPrevCloseValue: false,
			showIndicatorValues: true,
			showCountdownToBarClose: true,
			showTimeScrollbar: defaultShowTimeScrollbar,
			dateFormat: "yyyy-mm-dd",
			timeFormat: "24h",
		},
		appearance: {
			backgroundType: "solid",
			backgroundColor: bgColor,
			vertGridVisible: true,
			vertGridColor: gridColor,
			vertGridStyle: "dashed",
			horzGridVisible: true,
			horzGridColor: gridColor,
			horzGridStyle: "dashed",
			crosshairMode: "cross",
			crosshairColor,
			crosshairWidth: 1,
			showWatermark: false,
			watermarkOpacity: 15,
			scalesFontSize: 11,
			marginTopRatio: 0.1,
			marginBottomRatio: 0.1,
		},
		panesLayout: {
			maxVisiblePanes: 6,
			showNonTradingDays: false,
			overlayTimeframe: undefined,
			overlayStyle: "candle",
		},
		tradingEvents: {
			showCorporateEvents: true,
			showWhaleFlow: true,
			whaleThreshold: 1000000,
			showCVD: false,
			cvdMode: "oscillator",
			alertAudioEnabled: false,
			showPaperOrders: true,
			showPaperPositions: true,
			dataAdapterName: "binance",
		},
		theme: {
			mode: dark ? "dark" : "light",
			presetName: resolvedPreset,
		},
	};
}
