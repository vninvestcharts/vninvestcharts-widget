/**
 * Tầng 2/2: điều phối `computeIndicatorComputationResult`.
 *
 * Trước split 2026-09-30 hàm này chiếm 877 dòng vì chứa thân của cả 60 khối chỉ báo.
 * Nay mỗi nhóm chỉ báo nằm ở module riêng (`computeMovingAverage`, `computeMomentum`,
 * `computeVolatility`, `computeTrend`, `computeVolumeFlow`, `computeMarketStructure`,
 * `computeProfile`) và hàm này chỉ còn: gọi từng nhóm, ghép `valuesByKey`, rồi trả về.
 *
 * HAI THỨ TUYỆT ĐỐI KHÔNG ĐƯỢC ĐỔI Ở ĐÂY
 * 1. Danh sách field của `intermediateResult` và của `return` phải giữ nguyên thứ tự
 *    và thứ tự khóa — UI và `valuesByKey` đọc theo thứ tự này.
 * 2. Vòng lặp `orderedSeries` phải chạy hai lần: lượt 1 tính mọi series gốc, lượt 2
 *    tính series con (indicator-on-indicator) sau khi đã có giá trị của cha.
 */
import {
	bollingerSeries,
	demaSeries,
	emaSeries,
	hmaSeries,
	rsiSeries,
	smaSeries,
	temaSeries,
	wmaSeries,
} from "../../indicators/utils";
import { buildIndicatorSeriesKey } from "../seriesValueResolver";
import { normalizeSeriesTypeId } from "../types/pane-descriptor";
import { getPineScriptAdapter } from "../../pinescript/adapter";
import { blankUntil, mergeBand, numberParam } from "./computationHelpers";
import { computeMarketStructureBlocks } from "./computeMarketStructure";
import { computeMomentumBlocks } from "./computeMomentum";
import { computeMovingAverageBlocks } from "./computeMovingAverage";
import { computeProfileBlocks } from "./computeProfile";
import { computeTrendBlocks } from "./computeTrend";
import { computeVolatilityBlocks } from "./computeVolatility";
import { computeVolumeFlowBlocks } from "./computeVolumeFlow";
import { materializeIndicatorValues } from "./materializeIndicatorValues";
import type {
	IndicatorComputationOptions,
	IndicatorComputationPlan,
	IndicatorComputationResult,
} from "./indicatorComputationTypes";
import type { RawOHLCV } from "./types";

export function computeIndicatorComputationResult(
	raw: readonly RawOHLCV[],
	plan: IndicatorComputationPlan,
	options?: IndicatorComputationOptions,
): IndicatorComputationResult {
	const closes = raw.map((bar) => bar.close);

	const {
		emaByPeriod,
		smaByPeriod,
		macdByKey,
		bollingerByKey,
		wmaByPeriod,
		vwmaByPeriod,
		hmaByPeriod,
		demaByPeriod,
		temaByPeriod,
		maRibbonByKey,
	} = computeMovingAverageBlocks(raw, closes, plan);

	const {
		rsiByPeriod,
		wrByPeriod,
		vrByPeriod,
		kdjByKey,
		cciByPeriod,
		dmiByPeriod,
		biasByPeriod,
		brarByPeriod,
		mtmByKey,
		emvByPeriod,
		ao,
		rocByPeriod,
		trixByKey,
		psyByKey,
		crByKey,
		ac,
		smfi,
	} = computeMomentumBlocks(raw, closes, plan);

	const {
		bbi,
		sarByKey,
		keltnerByKey,
		donchianByPeriod,
		chaikinVolByPeriod,
		stdDevByPeriod,
		hvByKey,
		ciByPeriod,
		supertrendByKey,
	} = computeVolatilityBlocks(raw, closes, plan);

	const { dmaByKey, ichimokuByKey, alligatorByKey, fractals, gatorByKey } =
		computeTrendBlocks(raw, plan);

	const {
		obv,
		pvt,
		cmfByPeriod,
		mfiByPeriod,
		volOscByKey,
		chaikinOscByKey,
		vwapByKey,
		anchoredVwapByKey,
		cvd,
		strength,
		strengthRelativeByKey,
		whaleByKey,
	} = computeVolumeFlowBlocks(raw, plan, options);

	const { pivotStandardByKey, pivotHighLowByKey, wyckoffWaveByKey } =
		computeMarketStructureBlocks(raw, plan);

	const { marketProfileByKey, volumeProfileByKey, footprintByKey, deltaProfileByKey } =
		computeProfileBlocks(raw, plan, options);

	const valuesByKey = new Map<string, Array<any>>();
	const intermediateResult: Omit<IndicatorComputationResult, "valuesByKey"> = {
		emaByPeriod,
		smaByPeriod,
		rsiByPeriod,
		macdByKey,
		bollingerByKey,
		whaleByKey,
		bbi,
		sarByKey,
		obv,
		wrByPeriod,
		vrByPeriod,
		kdjByKey,
		cciByPeriod,
		dmiByPeriod,
		biasByPeriod,
		brarByPeriod,
		mtmByKey,
		emvByPeriod,
		ao,
		rocByPeriod,
		trixByKey,
		dmaByKey,
		pvt,
		psyByKey,
		crByKey,
		cvd,
		strength,
		wmaByPeriod,
		vwmaByPeriod,
		hmaByPeriod,
		demaByPeriod,
		temaByPeriod,
		maRibbonByKey,
		ichimokuByKey,
		supertrendByKey,
		keltnerByKey,
		donchianByPeriod,
		chaikinVolByPeriod,
		stdDevByPeriod,
		hvByKey,
		ciByPeriod,
		cmfByPeriod,
		mfiByPeriod,
		volOscByKey,
		chaikinOscByKey,
		vwapByKey,
		anchoredVwapByKey,
		alligatorByKey,
		fractals,
		gatorByKey,
		ac,
		pivotStandardByKey,
		pivotHighLowByKey,
		marketProfileByKey,
		volumeProfileByKey,
		footprintByKey,
		deltaProfileByKey,
		strengthRelativeByKey,
		smfi,
		wyckoffWaveByKey,
	};

	for (const series of plan.orderedSeries) {
		const key = buildIndicatorSeriesKey(series);
		if (!key) continue;
		if (valuesByKey.has(key)) {
			continue;
		}
		if (series.sourceType === "indicator" && series.sourceId) {
			continue;
		}
		const plugin = getPineScriptAdapter()?.getPinePlugin(series.type) as
			| { compute: (input: { bars: unknown }, params: unknown) => Record<string, number[]> }
			| undefined;
		if (plugin) {
			const output = plugin.compute({ bars: raw as any }, series.params || {});
			const keys = Object.keys(output);
			const values = raw.map((_, idx) => {
				if (keys.length === 1) {
					return output[keys[0]][idx];
				}
				const obj: Record<string, number> = {};
				for (const k of keys) {
					obj[k] = output[k][idx];
				}
				return obj;
			});
			valuesByKey.set(key, values);
			continue;
		}
		const arr = raw.map((_, index) => {
			const values = materializeIndicatorValues(index, plan, intermediateResult as IndicatorComputationResult, raw);
			return values[key];
		});
		valuesByKey.set(key, arr);
	}

	const getSubValue = (v: any, key?: string): number | undefined => {
		if (v === undefined || v === null || Number.isNaN(v)) return undefined;
		if (typeof v === "object" && key) {
			const sub = v[key];
			return typeof sub === "number" && !Number.isNaN(sub) ? sub : undefined;
		}
		return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
	};

	for (const series of plan.orderedSeries) {
		const key = buildIndicatorSeriesKey(series);
		if (!key) continue;
		if (valuesByKey.has(key)) {
			continue;
		}

		if (series.sourceType === "indicator" && series.sourceId) {
			const parent = plan.orderedSeries.find(s => s.id === series.sourceId);
			if (!parent) continue;

			const parentKey = buildIndicatorSeriesKey(parent);
			if (!parentKey) continue;

			const parentValues = valuesByKey.get(parentKey);
			if (!parentValues) continue;

			const inputValues = parentValues.map(v => getSubValue(v, series.sourceKey));

			let childResult: Array<any> | undefined;
			if (series.type === "EMA") {
				const period = numberParam(series, "period", 20);
				childResult = blankUntil(emaSeries(inputValues as any, period), Math.max(period - 1, 0));
			} else if (series.type === "MA") {
				const period = numberParam(series, "period", 20);
				childResult = blankUntil(smaSeries(inputValues as any, period), Math.max(period - 1, 0));
			} else if (series.type === "RSI") {
				const period = numberParam(series, "period", 14);
				childResult = blankUntil(rsiSeries(inputValues as any, period), Math.max(period, 1));
			} else if (normalizeSeriesTypeId(series.type) === "BollingerBand") {
				const period = numberParam(series, "period", 20);
				const stdDev = numberParam(series, "stdDev", 2);
				const band = bollingerSeries(inputValues as any, period, stdDev);
				childResult = mergeBand(band.upper, band.middle, band.lower, Math.max(period - 1, 0));
			} else if (series.type === "WMA") {
				const period = numberParam(series, "period", 9);
				childResult = blankUntil(wmaSeries(inputValues as any, period), Math.max(period - 1, 0));
			} else if (series.type === "HMA") {
				const period = numberParam(series, "period", 9);
				childResult = blankUntil(hmaSeries(inputValues as any, period), Math.max(period - 1, 0));
			} else if (series.type === "DEMA") {
				const period = numberParam(series, "period", 9);
				childResult = blankUntil(demaSeries(inputValues as any, period), Math.max(period - 1, 0));
			} else if (series.type === "TEMA") {
				const period = numberParam(series, "period", 9);
				childResult = blankUntil(temaSeries(inputValues as any, period), Math.max(period - 1, 0));
			}

			if (childResult) {
				valuesByKey.set(key, childResult);
			}
		}
	}

	return {
		valuesByKey,
		emaByPeriod,
		smaByPeriod,
		rsiByPeriod,
		macdByKey,
		bollingerByKey,
		whaleByKey,
		bbi,
		sarByKey,
		obv,
		wrByPeriod,
		vrByPeriod,
		kdjByKey,
		cciByPeriod,
		dmiByPeriod,
		biasByPeriod,
		brarByPeriod,
		mtmByKey,
		emvByPeriod,
		ao,
		rocByPeriod,
		trixByKey,
		dmaByKey,
		pvt,
		psyByKey,
		crByKey,
		cvd,
		strength,
		wmaByPeriod,
		vwmaByPeriod,
		hmaByPeriod,
		demaByPeriod,
		temaByPeriod,
		maRibbonByKey,
		ichimokuByKey,
		supertrendByKey,
		keltnerByKey,
		donchianByPeriod,
		chaikinVolByPeriod,
		stdDevByPeriod,
		hvByKey,
		ciByPeriod,
		cmfByPeriod,
		mfiByPeriod,
		volOscByKey,
		chaikinOscByKey,
		vwapByKey,
		anchoredVwapByKey,
		alligatorByKey,
		fractals,
		gatorByKey,
		ac,
		pivotStandardByKey,
		pivotHighLowByKey,
		marketProfileByKey,
		volumeProfileByKey,
		footprintByKey,
		deltaProfileByKey,
		strengthRelativeByKey,
		smfi,
		wyckoffWaveByKey,
	};
}
