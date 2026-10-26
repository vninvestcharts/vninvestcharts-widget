import { aoColorSeries } from "../../indicators/utils";
import type { SeriesConfig } from "../types/pane-descriptor";
import { buildIndicatorComputationPlan, computeIndicatorComputationResult, materializeIndicatorValues } from "./indicatorComputation";
import { applyExoticChartData } from "./exoticChartData";
import type { EnrichedDatum, RawOHLCV } from "./types";

export interface EnrichDataOptions {
	series?: readonly SeriesConfig[];
	whaleThreshold?: number;
}

function normalizeOptions(optionsOrWhaleThreshold?: EnrichDataOptions | number): Required<EnrichDataOptions> {
	if (typeof optionsOrWhaleThreshold === "number") {
		return { series: [], whaleThreshold: optionsOrWhaleThreshold };
	}
	return {
		series: optionsOrWhaleThreshold?.series ?? [],
		whaleThreshold: optionsOrWhaleThreshold?.whaleThreshold ?? 50_000,
	};
}
export function enrichData(raw: readonly RawOHLCV[], optionsOrWhaleThreshold?: EnrichDataOptions | number): EnrichedDatum[] {
	if (raw.length === 0) {
		return [];
	}
	const options = normalizeOptions(optionsOrWhaleThreshold);
	const plan = buildIndicatorComputationPlan(options.series, options.whaleThreshold);
	const result = computeIndicatorComputationResult(raw, plan);
	const aoColors = plan.aoEnabled ? aoColorSeries(result.ao.map((value) => value ?? Number.NaN)) : [];
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

	return applyExoticChartData(
		raw.map((bar, index) => {
			const indicatorValues = materializeIndicatorValues(index, plan, result, raw);
			return {
				...bar,
				aoColor: aoColors[index],
				indicatorValues: Object.keys(indicatorValues).length > 0 ? indicatorValues : undefined,
			};
		}),
		raw,
		options.series,
	);
}
