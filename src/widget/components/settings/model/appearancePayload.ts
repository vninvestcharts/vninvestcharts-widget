/**
 * Appearance-style payload for "Apply to All" (Settings S5).
 * Field-level whitelist: only visual/display fields are copied.
 * Symbol identity, timeframe, panes, scale modes and data sources are NEVER copied.
 */
import type { ChartSettingsState } from "./chartSettingsSchema";

export interface AppearanceStylePayload {
	symbol: Pick<
		ChartSettingsState["symbol"],
		| "candleStyle"
		| "upColor"
		| "downColor"
		| "borderUpColor"
		| "borderDownColor"
		| "wickUpColor"
		| "wickDownColor"
		| "showLastPriceLine"
		| "lastPriceLineColor"
		| "showPrevClosePriceLine"
		| "prevClosePriceLineColor"
		| "showHighLowPriceLines"
		| "precision"
	>;
	statusLine: ChartSettingsState["statusLine"];
	scales: Pick<
		ChartSettingsState["scales"],
		| "priceAxisPosition"
		| "showSymbolLastValue"
		| "showPrevCloseValue"
		| "showIndicatorValues"
		| "showCountdownToBarClose"
		| "dateFormat"
		| "timeFormat"
	>;
	appearance: ChartSettingsState["appearance"];
	theme: ChartSettingsState["theme"];
}

/** Window event fired by the source chart when user clicks Apply to All. */
export const APPLY_APPEARANCE_EVENT = "vnsc-apply-appearance-to-all";
/** Window event fired after fan-out completes (feedback + tests). */
export const APPLIED_APPEARANCE_EVENT = "vnsc-applied-appearance-to-all";

export interface ApplyAppearanceDetail {
	sourceChartId: string;
	payload: AppearanceStylePayload;
	/** Source chart's paper-trading visibility; fans out to every chart when defined. */
	paperEnabled?: boolean;
}

const SYMBOL_STYLE_KEYS = [
	"candleStyle",
	"upColor",
	"downColor",
	"borderUpColor",
	"borderDownColor",
	"wickUpColor",
	"wickDownColor",
	"showLastPriceLine",
	"lastPriceLineColor",
	"showPrevClosePriceLine",
	"prevClosePriceLineColor",
	"showHighLowPriceLines",
	"precision",
] as const;

const SCALES_DISPLAY_KEYS = [
	"priceAxisPosition",
	"showSymbolLastValue",
	"showPrevCloseValue",
	"showIndicatorValues",
	"showCountdownToBarClose",
	"dateFormat",
	"timeFormat",
] as const;

/** Extract the copyable appearance slice (pure). */
export function extractAppearancePayload(state: ChartSettingsState): AppearanceStylePayload {
	const symbol = {} as AppearanceStylePayload["symbol"];
	for (const k of SYMBOL_STYLE_KEYS) {
		(symbol as Record<string, unknown>)[k] = state.symbol[k];
	}
	const scales = {} as AppearanceStylePayload["scales"];
	for (const k of SCALES_DISPLAY_KEYS) {
		(scales as Record<string, unknown>)[k] = state.scales[k];
	}
	return {
		symbol,
		statusLine: { ...state.statusLine },
		scales,
		appearance: { ...state.appearance },
		theme: { ...state.theme },
	};
}

/**
 * Merge payload into a target state (pure). Blacklisted fields
 * (timezone, priceScaleMode/invertScale/showTimeScrollbar, panesLayout,
 * tradingEvents incl. dataAdapterName) are preserved from target.
 */
export function applyAppearancePayload(
	target: ChartSettingsState,
	payload: AppearanceStylePayload
): ChartSettingsState {
	return {
		...target,
		symbol: { ...target.symbol, ...payload.symbol },
		statusLine: { ...payload.statusLine },
		scales: { ...target.scales, ...payload.scales },
		appearance: { ...payload.appearance },
		theme: { ...payload.theme },
	};
}
