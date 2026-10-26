/**
 * Runtime exports for the types subpath bundle.
 * This ensures the bundle has actual JavaScript output, not just type definitions.
 */

export const VERSION = "0.4.0";

export const TYPE_SUBPATH_MARKER = "vninvestcharts-widget/types";

export type {
	AnyRecord,
	BarData,
	CandleData,
	CandleWick,
	ChartAccessor,
	ChartDatum,
	CanvasContexts,
	MoreProps,
	OHLCV,
} from "../types";

export type { OHLCVBar } from "./ohlcv";
export type { PaneConfig, IndicatorConfig, YAxisConfig } from "./pane";
export type {
	StockDataAdapter,
	Timeframe,
	Trade,
	OrderbookLevel,
	OrderbookSnapshot,
	SymbolInfo,
	Unsubscribe,
} from "./adapter";
export type { IndicatorDefinition } from "./indicator";