import type { DataSourceConfig } from "@vninvestcharts/engine-core";

import type { EnrichedDatum } from "../../lib/core/calculators/types";
import {
	pineScriptIdFromSeriesType,
	resolveSeriesDatumValue,
} from "../../lib/core/seriesValueResolver";
import type { PaneDescriptor, SeriesConfig } from "../../lib/core/types/pane-descriptor";

/**
 * Pine -> engine delivery channel (plan item 1.3).
 *
 * The engine already has an extension channel: `KernelEngine.resolveSeriesValues` reads
 * `this.dataSource?.seriesData?.[series.id]` as PRIORITY 1, before its own closed
 * `INDICATOR_ACCESSORS` table (`engine/KernelEngine.ts:3391`). Its table cannot name a type
 * generated at runtime, so a `pine_<scriptId>` series falls through to `return []`
 * (`engine/KernelEngine.ts:3447`) and draws nothing.
 *
 * Two hard constraints, both load-bearing:
 *
 * 1. The arrays are anchored to GLOBAL candle index, not to the visible window — the engine
 *    slices the window itself (`engine/KernelEngine.ts:3393-3396`). Returning a window-length
 *    array is what makes a value "drift when you zoom".
 * 2. `na` must stay `undefined`. `missingValueFallback` (`engine/KernelEngine.ts:3357`) exists to
 *    handle it. Substituting 0 would draw a line along the floor — a silent wrong answer that
 *    looks plausible, which is the worst failure mode on a chart.
 */
export interface PineSeriesData {
	/** Keyed by `series.id`, which is what the engine looks up. */
	seriesData: Record<string, readonly (number | null | undefined)[]>;
	/** Stable string of the Pine series currently present; drives the 1.3b re-push. */
	signature: string;
}

const EMPTY_PINE_SERIES_DATA: PineSeriesData = { seriesData: {}, signature: "" };

function scalarOf(value: unknown): number | undefined {
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	// A multi-plot Pine script produces a keyed object per bar. There is no single
	// "right" band to draw for that, so we take the first declared plot rather than
	// inventing a channel. `computeIndicatorComputationResult` picks the first key the
	// same way, so engine and widget agree on what the line is.
	if (value && typeof value === "object" && !Array.isArray(value)) {
		const first = Object.values(value as Record<string, unknown>)[0];
		return typeof first === "number" && Number.isFinite(first) ? first : undefined;
	}
	return undefined;
}

/**
 * Pure. Walks the pane descriptors, keeps only runtime-generated Pine series, and projects
 * each one onto a global-index value array taken from `plotData`.
 *
 * `plotData` must be the widget's React-state array (memoised at `useWidgetData.ts:1283`), NOT
 * `engine.enrichedData`: the latter is behind two hash-guarded push chokepoints
 * (`VNInvestCharts.tsx:593,603` and `useWidgetData.ts:1336`), so reading it here would make
 * this function silently return stale data. See plan M-1.
 */
export function buildPineSeriesData(
	panes: readonly PaneDescriptor[] | undefined,
	plotData: readonly EnrichedDatum[] | undefined,
): PineSeriesData {
	if (!panes || panes.length === 0 || !plotData || plotData.length === 0) {
		return EMPTY_PINE_SERIES_DATA;
	}

	const seriesData: Record<string, readonly (number | null | undefined)[]> = {};
	const seenTypes: string[] = [];

	for (const pane of panes) {
		if (!pane.series || pane.series.length === 0) continue;
		for (const series of pane.series as readonly SeriesConfig[]) {
			const scriptId = pineScriptIdFromSeriesType(String(series.type));
			// Unknown / non-Pine types are not this module's business. Anything reaching the
			// engine through `seriesData` must have passed the tier gate first.
			if (!scriptId) continue;

			seenTypes.push(String(series.type));
			// Without an id the engine cannot address the series at all (`seriesData[series.id]`),
			// and `paneDescriptorBridge` would synthesise a positional id the producer never saw.
			const id = series.id;
			if (!id) continue;

			const values = new Array<number | undefined>(plotData.length);
			for (let i = 0; i < plotData.length; i += 1) {
				values[i] = scalarOf(resolveSeriesDatumValue(plotData[i] as EnrichedDatum, series));
			}
			seriesData[id] = values;
		}
	}

	if (seenTypes.length === 0) return EMPTY_PINE_SERIES_DATA;

	seenTypes.sort();
	return { seriesData, signature: seenTypes.join("|") };
}

export interface PineCompileBars {
	open: number[];
	high: number[];
	low: number[];
	close: number[];
	volume: number[];
}

/**
 * Columnar OHLCV view of the enriched datums, which is what the compiler and the Pine worker
 * expect. The single-chart mount site used to pass nothing at all, so the worker validated every
 * script against ZERO bars — a second silent no-op next to the one Stage 1.1/1.2 fixed.
 */
export function toPineCompileBars(
	bars: readonly { open?: number; high?: number; low?: number; close?: number; volume?: number }[] | undefined,
): PineCompileBars {
	const out: PineCompileBars = { open: [], high: [], low: [], close: [], volume: [] };
	if (!bars) return out;
	for (let i = 0; i < bars.length; i += 1) {
		const b = bars[i] as { open?: number; high?: number; low?: number; close?: number; volume?: number };
		out.open.push(b?.open ?? 0);
		out.high.push(b?.high ?? 0);
		out.low.push(b?.low ?? 0);
		out.close.push(b?.close ?? 0);
		out.volume.push(b?.volume ?? 0);
	}
	return out;
}

/** Ordered list of Pine series types present, independent of value. Cheap (O(#series)). */
export function pineSeriesSignature(panes: readonly PaneDescriptor[] | undefined): string {
	if (!panes || panes.length === 0) return "";
	const types: string[] = [];
	for (const pane of panes) {
		if (!pane.series) continue;
		for (const series of pane.series as readonly SeriesConfig[]) {
			if (pineScriptIdFromSeriesType(String(series.type))) types.push(String(series.type));
		}
	}
	if (types.length === 0) return "";
	types.sort();
	return types.join("|");
}

export interface EngineDataSourceIdentity {
	adapterLabel: string;
	/** Optional upstream: `useForkRuntime` declares `activeSymbol?: string`. */
	activeSymbol?: string;
	activeTimeframe: string;
}

/**
 * Builds the object handed to `EngineHost` -> `engine.setDataSource(...)`. Pure so that the
 * caller can memoise on its inputs; `DataSourceConfig` is entirely optional
 * (`vn-kline-engine-core/src/types.ts:88-94`), so omitting `seriesData` when there is no Pine
 * script keeps the payload byte-identical to the pre-Pine shape.
 */
export function buildEngineDataSource(
	identity: EngineDataSourceIdentity,
	pine: PineSeriesData,
): DataSourceConfig {
	const { adapterLabel, activeSymbol, activeTimeframe } = identity;
	const hasPine = Object.keys(pine.seriesData).length > 0;
	return {
		sourceId: `${adapterLabel}:${activeSymbol}:${activeTimeframe}`,
		symbol: activeSymbol,
		timeframe: activeTimeframe,
		adapterLabel,
		...(hasPine ? { seriesData: pine.seriesData } : {}),
	};
}