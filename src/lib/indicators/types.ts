import type { IndicatorDefinition } from "../types/indicator";
import type { OHLCVBar } from "../types/ohlcv";

export type IndicatorName = string;

export type RegisteredIndicator = IndicatorDefinition<OHLCVBar, unknown, readonly unknown[]>;

export type IndicatorRegistry = ReadonlyMap<string, RegisteredIndicator>;