import type { IndicatorDefinition } from "../types/indicator";
import type { OHLCVBar } from "../types/ohlcv";
import type { RegisteredIndicator } from "./types";

const indicatorRegistry = new Map<string, RegisteredIndicator>();

function normalizeIndicatorName(name: string) {
	return name.trim().toUpperCase();
}

export function registerIndicator<TOutput, TParams extends readonly unknown[]>(indicator: IndicatorDefinition<OHLCVBar, TOutput, TParams>) {
	indicatorRegistry.set(normalizeIndicatorName(indicator.name), indicator as RegisteredIndicator);
	return indicator;
}

export function getIndicator(name: string) {
	return indicatorRegistry.get(normalizeIndicatorName(name));
}

export function listIndicators() {
	return [...indicatorRegistry.values()];
}