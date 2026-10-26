/**
 * Tầng đọc: gộp `IndicatorComputationResult` thành một record phẳng theo bar `index`.
 *
 * Đây là hợp đồng với `seriesValueResolver`: mỗi khoá trả về phải khớp đúng
 * `buildIndicatorSeriesKey(series)` mà UI dùng để tra, nên hai chiều ghi
 * (`materialize` ghi ra, `*ByKey` đọc vào) phải dùng chung một bộ tên map — đó là
 * lý do `mapPeriods`/`mapKeys` ở đây liệt kê tường minh thay vì suy ra từ tên field.
 *
 * Tách riêng (split 2026-09-30): hàm này là vòng đọc duy nhất, không phải trình tính
 * — để nó cạnh `computeIndicatorComputationResult` sẽ vẫn ra một file ~1100 dòng.
 */
import { buildIndicatorSeriesKey } from "../seriesValueResolver";
import type { SeriesConfig } from "../types/pane-descriptor";
import { computeFootprintBars } from "../../indicators/utils";
import { defaultSeries, indicatorKey } from "./computationHelpers";
import type {
	IndicatorComputationPlan,
	IndicatorComputationResult,
} from "./indicatorComputationTypes";
import type { IndicatorDatumValue, RawOHLCV } from "./types";

export function materializeIndicatorValues(
	index: number,
	plan: IndicatorComputationPlan,
	result: IndicatorComputationResult,
	raw?: readonly RawOHLCV[],
): Record<string, IndicatorDatumValue | undefined> {
	const indicatorValues: Record<string, IndicatorDatumValue | undefined> = {};

	if (result.valuesByKey) {
		for (const series of plan.orderedSeries) {
			const key = buildIndicatorSeriesKey(series);
			if (key) {
				const arr = result.valuesByKey.get(key);
				if (arr && arr[index] !== undefined && arr[index] !== null) {
					indicatorValues[key] = arr[index];
				}
			}
		}
	}

	const mapPeriods = (byPeriodMap: Map<number, Array<unknown>>, type: SeriesConfig["type"]) => {
		for (const [period, values] of byPeriodMap) {
			const key = indicatorKey(defaultSeries(type, { period }));
			const val = values[index];
			if (key && val !== undefined) indicatorValues[key] = val as any;
		}
	};

	const mapKeys = (byKeyMap: Map<string, Array<unknown>>) => {
		for (const [key, values] of byKeyMap) {
			const val = values[index];
			if (val !== undefined) indicatorValues[key] = val as any;
		}
	};

	mapPeriods(result.emaByPeriod, "EMA");
	mapPeriods(result.smaByPeriod, "MA");
	mapPeriods(result.rsiByPeriod, "RSI");
	mapPeriods(result.wrByPeriod, "WR");
	mapPeriods(result.vrByPeriod, "VR");
	mapPeriods(result.cciByPeriod, "CCI");
	mapPeriods(result.dmiByPeriod, "DMI");
	mapPeriods(result.biasByPeriod, "BIAS");
	mapPeriods(result.brarByPeriod, "BRAR");
	mapPeriods(result.emvByPeriod, "EMV");
	mapPeriods(result.rocByPeriod, "ROC");
	// CE26 additions
	mapPeriods(result.wmaByPeriod, "WMA");
	mapPeriods(result.vwmaByPeriod, "VWMA");
	mapPeriods(result.hmaByPeriod, "HMA");
	mapPeriods(result.demaByPeriod, "DEMA");
	mapPeriods(result.temaByPeriod, "TEMA");
	mapPeriods(result.donchianByPeriod, "Donchian");
	mapPeriods(result.chaikinVolByPeriod, "ChaikinVol");
	mapPeriods(result.stdDevByPeriod, "StdDev");
	mapPeriods(result.ciByPeriod, "CI");
	// CE27 additions
	mapPeriods(result.cmfByPeriod, "CMF");
	mapPeriods(result.mfiByPeriod, "MFI");

	mapKeys(result.macdByKey);
	mapKeys(result.bollingerByKey);
	mapKeys(result.whaleByKey);
	mapKeys(result.sarByKey);
	mapKeys(result.kdjByKey);
	mapKeys(result.mtmByKey);
	mapKeys(result.trixByKey);
	mapKeys(result.dmaByKey);
	mapKeys(result.psyByKey);
	mapKeys(result.crByKey);
	// CE26 additions
	mapKeys(result.maRibbonByKey);
	mapKeys(result.ichimokuByKey);
	mapKeys(result.supertrendByKey);
	mapKeys(result.keltnerByKey);
	mapKeys(result.hvByKey);
	// CE27 additions
	mapKeys(result.volOscByKey);
	mapKeys(result.chaikinOscByKey);
	mapKeys(result.vwapByKey);
	mapKeys(result.anchoredVwapByKey);
	mapKeys(result.alligatorByKey);
	mapKeys(result.gatorByKey);
	mapKeys(result.pivotStandardByKey);
	mapKeys(result.pivotHighLowByKey);

	for (const [key, val] of result.marketProfileByKey) {
		indicatorValues[key] = val;
	}
	for (const [key, val] of result.volumeProfileByKey) {
		indicatorValues[key] = val;
	}
	for (const [key, fpBars] of result.footprintByKey) {
		const barTime = raw?.[index]?.date instanceof Date ? raw[index].date.getTime() : Date.now();
		const fpBar = fpBars.find(b => b.timestamp === barTime);
		if (fpBar) {
			indicatorValues[key] = fpBar;
		} else {
			const priceTickSize = plan.footprintConfigs.get(key)?.priceTickSize ?? 0.01;
			const barIntervalMs = plan.footprintConfigs.get(key)?.barIntervalMs ?? 60000;
			const singleFpBar = computeFootprintBars([raw![index]], barIntervalMs, priceTickSize)[0];
			if (singleFpBar) indicatorValues[key] = singleFpBar;
		}
	}
	for (const [key, deltaData] of result.deltaProfileByKey) {
		const barTime = raw?.[index]?.date instanceof Date ? raw[index].date.getTime() : Date.now();
		const fpBars = result.footprintByKey.get(key) || [];
		const fpIndex = fpBars.findIndex(b => b.timestamp === barTime);
		if (fpIndex !== -1) {
			const div = deltaData.divergenceSignals.find(s => s.index === fpIndex)?.type;
			indicatorValues[key] = {
				cumulativeDelta: deltaData.cumulativeDelta[fpIndex] ?? 0,
				barDelta: deltaData.barDelta[fpIndex] ?? 0,
				deltaSMA: deltaData.deltaSMA[fpIndex] ?? 0,
				divergence: div,
			};
		} else {
			indicatorValues[key] = {
				cumulativeDelta: 0,
				barDelta: 0,
				deltaSMA: 0,
			};
		}
	}

	const aoKey = indicatorKey(defaultSeries("AO"));
	if (aoKey && result.ao[index] !== undefined) {
		indicatorValues[aoKey] = result.ao[index];
	}

	const pvtKey = indicatorKey(defaultSeries("PVT"));
	if (pvtKey && result.pvt[index] !== undefined) {
		indicatorValues[pvtKey] = result.pvt[index];
	}

	const bbiKey = indicatorKey(defaultSeries("BBI"));
	if (bbiKey && plan.bbiEnabled && result.bbi[index] !== undefined) {
		indicatorValues[bbiKey] = result.bbi[index];
	}

	const obvKey = indicatorKey(defaultSeries("OBV"));
	if (obvKey && plan.obvEnabled && result.obv[index] !== undefined) {
		indicatorValues[obvKey] = result.obv[index];
	}

	const cvdApproxKey = indicatorKey(defaultSeries("CVDApprox"));
	if (cvdApproxKey && result.cvd[index]?.cvdApprox !== undefined) {
		indicatorValues[cvdApproxKey] = result.cvd[index].cvdApprox;
	}

	const cvdRealtimeKey = indicatorKey(defaultSeries("CVDRealtime"));
	if (cvdRealtimeKey) {
		const rawBar = raw?.[index];
		const cvdRealtime = rawBar ? (rawBar as any).cvdRealtime : undefined;
		if (cvdRealtime !== undefined) {
			indicatorValues[cvdRealtimeKey] = cvdRealtime;
		}
	}

	const strengthKey = indicatorKey(defaultSeries("StrengthElder"));
	if (strengthKey) {
		const s = result.strength[index];
		if (s && s.bullPower !== undefined && s.bearPower !== undefined) {
			indicatorValues[strengthKey] = { bullPower: s.bullPower, bearPower: s.bearPower };
		}
	}

	const fractalsKey = indicatorKey(defaultSeries("Fractals"));
	if (fractalsKey && plan.fractalsEnabled) {
		const val = result.fractals[index];
		if (val !== undefined) {
			indicatorValues[fractalsKey] = val;
		}
	}

	const acKey = indicatorKey(defaultSeries("AC"));
	if (acKey && plan.acEnabled && result.ac[index] !== undefined) {
		indicatorValues[acKey] = result.ac[index];
	}

	const smfiKey = indicatorKey(defaultSeries("SMFI"));
	if (smfiKey && result.smfi[index] !== undefined) {
		indicatorValues[smfiKey] = result.smfi[index];
	}

	mapKeys(result.strengthRelativeByKey);
	mapKeys(result.wyckoffWaveByKey);

	return indicatorValues;
}
