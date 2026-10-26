import { aoColorSeries } from "../../indicators/utils";
import { type CanonicalSeriesStore } from "@vninvestcharts/engine-core";
import type { SeriesConfig } from "../types/pane-descriptor";
import { buildIndicatorComputationPlan, computeIndicatorComputationResult, materializeIndicatorValues } from "./indicatorComputation";
import type { EnrichedDatum, RawOHLCV, VolumeProfileData } from "./types";
import { enrichData } from "./enrichData";
import { applyExoticChartData } from "./exoticChartData";
import { alignMTFData } from "../../indicators/builtin/MTFWrapper";
import { buildIndicatorSeriesKey } from "../seriesValueResolver";
import { alignBarsByDate } from "./alignBarsByDate";
import type { SymbolDataEntry } from "./normalizePrices";
import { normalizePricesToBaseline } from "./normalizePrices";

/**
 * Extended EnrichDataOptions for canonical store integration.
 * Allows passing a store to cache indicator computation results by canonical key.
 */
export interface EnrichDataWithStoreOptions {
	series?: readonly SeriesConfig[];
	whaleThreshold?: number;
	canonicalStore?: CanonicalSeriesStore<{
		plan: ReturnType<typeof buildIndicatorComputationPlan>;
		result: ReturnType<typeof computeIndicatorComputationResult>;
		aoColors: (string | undefined)[];
	}>;
	sourceId?: string;
	timeframe?: string;
	mtfBars?: Record<string, readonly RawOHLCV[]>;
	compareBarsBySymbol?: Record<string, readonly RawOHLCV[]>;
	asyncVolumeProfiles?: Record<string, VolumeProfileData>;
}

/**
 * Normalize series config array to stable canonical form for store key.
 * Two config arrays with same indicators (different order/duplication) should have different hashes.
 */
function seriesConfigHash(series: readonly SeriesConfig[]): string {
	const sorted = [...series].sort((a, b) => {
		const typeOrder = a.type.localeCompare(b.type);
		if (typeOrder !== 0) return typeOrder;
		const aParamsStr = JSON.stringify(a.params ?? {});
		const bParamsStr = JSON.stringify(b.params ?? {});
		return aParamsStr.localeCompare(bParamsStr);
	});
	return JSON.stringify(sorted);
}

/**
 * Enrich OHLCV bars with indicator values using a canonical series store.
 *
 * If a `canonicalStore` is provided and hit, the computation result is reused.
 * If store is not provided or miss, falls back to regular enrichData.
 *
 * @param raw Raw OHLCV bars
 * @param options Enrichment options including canonical store
 * @returns Enriched data with computed indicator values
 */
export function enrichDataWithCanonicalStore(
	raw: readonly RawOHLCV[],
	options?: EnrichDataWithStoreOptions,
): EnrichedDatum[] {
	if (raw.length === 0) {
		return [];
	}

	const {
		series = [],
		whaleThreshold = 50_000,
		canonicalStore,
		sourceId,
		timeframe,
		mtfBars,
		compareBarsBySymbol,
		asyncVolumeProfiles,
	} = options ?? {};

	// If no store provided, use regular enrichData
	if (!canonicalStore || !sourceId || !timeframe) {
		return enrichData(raw, { series, whaleThreshold });
	}

	// Build canonical store key from series config
	// Include data signature (first/last timestamp + bar count) so that different data
	// sources (e.g. switching from offline CSV ~430 USD to live Binance ~80k USD) always
	// trigger a cache miss and force recomputation instead of reusing stale indicator values.
	const dataSignature = `${raw[0]?.date?.getTime() ?? 0}:${raw[raw.length - 1]?.date?.getTime() ?? 0}:${raw.length}`;
	const storeKeyInput = {
		sourceId,
		timeframe,
		indicatorType: "indicator_batch" as const,
		transformKey: `${seriesConfigHash(series)}:${dataSignature}`,
		normalizedParams: null,
	};

	// Try to retrieve cached computation from store
	const cachedEntry = canonicalStore.get(storeKeyInput);
	let plan: ReturnType<typeof buildIndicatorComputationPlan>;
	let result: ReturnType<typeof computeIndicatorComputationResult>;
	let aoColors: (string | undefined)[];

	if (cachedEntry) {
		// Cache hit: reuse computation plan and result
		plan = cachedEntry.plan;
		result = cachedEntry.result;
		aoColors = cachedEntry.aoColors;
	} else {
		// Cache miss: compute and store
		plan = buildIndicatorComputationPlan(series, whaleThreshold);
		result = computeIndicatorComputationResult(raw, plan, { compareBarsBySymbol, mtfBars, asyncVolumeProfiles });

		// Handle MTF calculations for any series that specifies a different timeframe
		for (const s of plan.orderedSeries) {
			const tf = s.params?.timeframe as string | undefined;
			if (tf && tf !== "Same as chart" && tf !== timeframe) {
				const targetBars = mtfBars?.[tf];
				if (targetBars && targetBars.length > 0) {
					// Build a sub-plan without the timeframe parameter to calculate it on targetBars
					const tfPlan = buildIndicatorComputationPlan([{ ...s, params: { ...s.params, timeframe: undefined } }], whaleThreshold);
					const tfResult = computeIndicatorComputationResult(targetBars, tfPlan);
					const targetKey = buildIndicatorSeriesKey({ ...s, params: { ...s.params, timeframe: undefined } });
					if (targetKey) {
						const targetValues = tfResult.valuesByKey.get(targetKey);
						if (targetValues) {
							const alignedValues = alignMTFData(raw as any, targetBars as any, targetValues, tf);
							result.valuesByKey.set(buildIndicatorSeriesKey(s)!, alignedValues);
						}
					}
				}
			}
		}

		aoColors = plan.aoEnabled ? aoColorSeries(result.ao.map((value) => value ?? Number.NaN)) : [];

		canonicalStore.set(storeKeyInput, {
			plan,
			result,
			aoColors,
		});
	}

	// Extract first values for materialization (same logic as enrichData)
	const firstKdj = result.kdjByKey.size > 0 ? [...result.kdjByKey.values()][0] : undefined;
	const firstCci = result.cciByPeriod.size > 0 ? [...result.cciByPeriod.values()][0] : undefined;
	const firstDmi = result.dmiByPeriod.size > 0 ? [...result.dmiByPeriod.values()][0] : undefined;
	const firstBias = result.biasByPeriod.size > 0 ? [...result.biasByPeriod.values()][0] : undefined;
	const firstBrar = result.brarByPeriod.size > 0 ? [...result.brarByPeriod.values()][0] : undefined;
	const firstMtm = result.mtmByKey.size > 0 ? [...result.mtmByKey.values()][0] : undefined;
	const firstEmv = result.emvByPeriod.size > 0 ? [...result.emvByPeriod.values()][0] : undefined;
	const firstRoc = result.rocByPeriod.size > 0 ? [...result.rocByPeriod.values()][0] : undefined;
	const firstTrix = result.trixByKey.size > 0 ? [...result.trixByKey.values()][0] : undefined;
	const firstDma = result.dmaByKey.size > 0 ? [...result.dmaByKey.values()][0] : undefined;
	const firstPsy = result.psyByKey.size > 0 ? [...result.psyByKey.values()][0] : undefined;
	const firstCr = result.crByKey.size > 0 ? [...result.crByKey.values()][0] : undefined;

	// Materialize enriched data
	const enriched: EnrichedDatum[] = raw.map((bar, index) => {
		const indicatorValues = materializeIndicatorValues(index, plan, result, raw);
		return {
			...bar,
			aoColor: aoColors[index],
			indicatorValues: Object.keys(indicatorValues).length > 0 ? indicatorValues : undefined,
		};
	});

	// — Multi-symbol comparison: align + normalize overlay bars — //

	const overlaySeries = series.filter(
		(s): s is SeriesConfig & { overlaySymbolId: string } =>
			typeof s.overlaySymbolId === "string" && s.overlaySymbolId.length > 0,
	);

	if (overlaySeries.length > 0 && compareBarsBySymbol && Object.keys(compareBarsBySymbol).length > 0) {
		const overlaySymbolIds = new Set(overlaySeries.map((s) => s.overlaySymbolId));
		const rawComparable = raw as readonly {
			date: Date;
			open: number;
			high: number;
			low: number;
			close: number;
			volume: number;
		}[];

		// Align each overlay symbol
		const alignedBySymbol: Record<string, readonly SymbolDataEntry[]> = {};
		for (const symbolId of overlaySymbolIds) {
			const overlayBars = compareBarsBySymbol[symbolId];
			if (!overlayBars || overlayBars.length === 0) continue;

			const compareComparable = overlayBars as readonly {
				date: Date;
				open: number;
				high: number;
				low: number;
				close: number;
				volume: number;
			}[];

			const aligned = alignBarsByDate(rawComparable, compareComparable);
			const validAligned: SymbolDataEntry[] = [];

			// Find a global fallback price in case the dataset starts outside trading hours
			const firstValid = aligned.find(b => b !== null && b !== undefined);
			const fallbackPrice = firstValid ? firstValid.close : 0;

			let lastValidBar: SymbolDataEntry | null = null;
			for (const bar of aligned) {
				if (bar) {
					const entry = {
						open: bar.open,
						high: bar.high,
						low: bar.low,
						close: bar.close,
						volume: bar.volume,
					};
					validAligned.push(entry);
					lastValidBar = entry;
				} else {
					const fillPrice = lastValidBar ? lastValidBar.close : fallbackPrice;
					validAligned.push({
						open: fillPrice,
						high: fillPrice,
						low: fillPrice,
						close: fillPrice,
						volume: 0, // No trading volume outside session
					});
				}
			}
			alignedBySymbol[symbolId] = validAligned;
		}

		if (Object.keys(alignedBySymbol).length > 0) {
			const { symbolData: sd, normalizedPrices: np } = normalizePricesToBaseline(
				rawComparable,
				alignedBySymbol,
				0,
				overlaySymbolIds,
			);

			for (let i = 0; i < enriched.length; i++) {
				if (sd[i] && Object.keys(sd[i]).length > 0) {
					enriched[i] = { ...enriched[i], symbolData: sd[i] };
				}
				if (np[i] && Object.keys(np[i]).length > 0) {
					enriched[i] = { ...enriched[i], normalizedPrices: np[i] };
				}
			}
		}
	}

	return applyExoticChartData(enriched, raw, series);
}
