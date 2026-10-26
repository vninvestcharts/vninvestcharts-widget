/**
 * Batch B / B3 — the symbol tab writes `symbol.candleStyle` into the settings
 * composite, but no reader existed, so the "Display Style" control was dead.
 *
 * The function maps the setting to the chart-type key used by the chart-type
 * picker; `CHART_TYPE_MAP` (VNInvestCharts) turns that key into the engine
 * series type.
 */
import type { CandleStyle } from "../components/settings/model/chartSettingsSchema";

/**
 * `bar` maps to `ohlc`: the engine series "Bar" collides with the
 * `type.includes("bar")` heuristic of the engine (its volume mode was routed
 * wrongly) and was removed from the picker — ledger `WA_BAR_RUNTIME_2026-10-03`.
 */
export function resolveCandleStyleChartType(style: CandleStyle): string {
	switch (style) {
		case "hollow":
			return "hollow";
		case "line":
			return "line";
		case "area":
			return "area";
		case "bar":
			return "ohlc";
		case "candle":
		default:
			return "candlestick";
	}
}

export interface CandleStyleApplication {
	/** True when the chart type has to be applied to the price pane. */
	apply: boolean;
	/** Chart-type key to apply (empty when nothing must be applied). */
	chartType: string;
}

/**
 * Decide whether the stored display style has to be applied.
 *
 * The style is applied only when it really changes, so it never fights the
 * chart-type picker and never overwrites the series of the price pane on
 * mount. The first observation only records the current style: the chart type
 * at that moment belongs to the host (`initialEngineState`) or to the pane
 * state, and the stored style applies from the first change on.
 *
 * Consequence (deliberate): a saved style does not restore the chart type on
 * load — the tab selection applies as soon as the user changes it.
 */
export function resolveCandleStyleApplication(input: {
	appliedStyle: string | undefined;
	style: CandleStyle;
}): CandleStyleApplication {
	// Nothing applied yet -> only record the current style.
	if (input.appliedStyle === undefined) {
		return { apply: false, chartType: "" };
	}
	if (input.appliedStyle === input.style) {
		return { apply: false, chartType: "" };
	}
	return { apply: true, chartType: resolveCandleStyleChartType(input.style) };
}
