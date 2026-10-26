import type { SeriesTypeId } from "./pane-descriptor";

export interface SeriesSubComponent {
	/** Key used in series.subColors record */
	key: string;
	/** i18n key for the label shown in Settings */
	labelKey: string;
	/** Default color when user has not customised this component */
	defaultColor: string;
}

/**
 * Defines the named sub-components of multi-line/multi-bar indicators.
 * Used by DynamicChart to resolve per-component colors and by
 * PaneSettingsModal to render per-component color pickers.
 */
export const SERIES_SUB_COMPONENTS: Partial<Record<SeriesTypeId, SeriesSubComponent[]>> = {
	RSI: [
		{ key: "line",       labelKey: "settings.sub.rsiLine",       defaultColor: "#2962ff" },
		{ key: "overbought", labelKey: "settings.sub.rsiOverbought", defaultColor: "#f23645" },
		{ key: "middle",     labelKey: "settings.sub.rsiMiddle",     defaultColor: "#9ca3af" },
		{ key: "oversold",   labelKey: "settings.sub.rsiOversold",   defaultColor: "#089981" },
	],
	MACD: [
		{ key: "macd",    labelKey: "settings.sub.macd",    defaultColor: "#2962ff" },
		{ key: "signal",  labelKey: "settings.sub.signal",  defaultColor: "#ff6d00" },
		{ key: "diverge", labelKey: "settings.sub.diverge", defaultColor: "#26a69a" },
	],
	BollingerBand: [
		{ key: "middle", labelKey: "settings.sub.bbMiddle", defaultColor: "#2962ff" },
		{ key: "top",    labelKey: "settings.sub.bbUpper",  defaultColor: "#2962ff" },
		{ key: "bottom", labelKey: "settings.sub.bbLower",  defaultColor: "#2962ff" },
	],
	KDJ: [
		{ key: "k", labelKey: "settings.sub.k", defaultColor: "#2962ff" },
		{ key: "d", labelKey: "settings.sub.d", defaultColor: "#ff6d00" },
		{ key: "j", labelKey: "settings.sub.j", defaultColor: "#26a69a" },
	],
	DMI: [
		{ key: "plusDI",  labelKey: "settings.sub.plusDI",  defaultColor: "#089981" },
		{ key: "minusDI", labelKey: "settings.sub.minusDI", defaultColor: "#f23645" },
		{ key: "adx",     labelKey: "settings.sub.adx",     defaultColor: "#ff6d00" },
	],
	BRAR: [
		{ key: "ar", labelKey: "settings.sub.ar", defaultColor: "#2962ff" },
		{ key: "br", labelKey: "settings.sub.br", defaultColor: "#ff6d00" },
	],
	StrengthElder: [
		{ key: "bull", labelKey: "settings.sub.bull", defaultColor: "#089981" },
		{ key: "bear", labelKey: "settings.sub.bear", defaultColor: "#f23645" },
	],
	MTM: [
		{ key: "mtm",    labelKey: "settings.sub.mtm",    defaultColor: "#2962ff" },
		{ key: "signal", labelKey: "settings.sub.signal", defaultColor: "#ff6d00" },
	],
	EMV: [
		{ key: "emv",    labelKey: "settings.sub.emv",    defaultColor: "#2962ff" },
		{ key: "signal", labelKey: "settings.sub.signal", defaultColor: "#ff6d00" },
	],
	TRIX: [
		{ key: "trix",   labelKey: "settings.sub.trix",   defaultColor: "#2962ff" },
		{ key: "signal", labelKey: "settings.sub.signal", defaultColor: "#ff6d00" },
	],
	DMA: [
		{ key: "ddd", labelKey: "settings.sub.ddd", defaultColor: "#2962ff" },
		{ key: "ama", labelKey: "settings.sub.ama", defaultColor: "#ff6d00" },
	],
	PSY: [
		{ key: "psy",    labelKey: "settings.sub.psy",    defaultColor: "#2962ff" },
		{ key: "signal", labelKey: "settings.sub.signal", defaultColor: "#ff6d00" },
	],
	CR: [
		{ key: "cr",  labelKey: "settings.sub.cr",  defaultColor: "#2962ff" },
		{ key: "ma1", labelKey: "settings.sub.ma1", defaultColor: "#ff6d00" },
		{ key: "ma2", labelKey: "settings.sub.ma2", defaultColor: "#26a69a" },
		{ key: "ma3", labelKey: "settings.sub.ma3", defaultColor: "#f23645" },
		{ key: "ma4", labelKey: "settings.sub.ma4", defaultColor: "#9ca3af" },
	],
};
