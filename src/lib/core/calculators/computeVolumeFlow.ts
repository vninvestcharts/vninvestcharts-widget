/**
 * Khối compute: dòng tiền (OBV, PVT, CMF, MFI, VolOsc, ChaikinOsc, VWAP,
 * AnchoredVWAP, CVD, Strength Elder, Strength Relative, Whale).
 *
 * Một nhóm trong `computeIndicatorComputationResult`, tách riêng (split 2026-09-30).
 * Nhóm này là nhóm duy nhất ngoài `profile` cần `options` — StrengthRelative đọc
 * `compareBarsBySymbol` để so sánh với một symbol khác.
 */
import {
	anchoredVwapSeries,
	cmfSeries,
	mfiSeries,
	obvSeries,
	pvtSeries,
	volOscSeries,
	vwapSeries,
} from "../../indicators/utils";
import { chaikinOscSeries } from "../../indicators/builtin/chaikinOscillator";
import { calcCVDApprox } from "./calcCVDApprox";
import { calcStrengthElder } from "./calcStrengthElder";
import { calcWhaleApprox } from "./calcWhaleApprox";
import type {
	IndicatorComputationOptions,
	IndicatorComputationPlan,
} from "./indicatorComputationTypes";
import type { IndicatorVwapValue, IndicatorWhaleValue, RawOHLCV } from "./types";
import { blankUntil, defaultSeries, indicatorKey } from "./computationHelpers";

export interface VolumeFlowBlocks {
	obv: Array<number | undefined>;
	pvt: Array<number | undefined>;
	cmfByPeriod: Map<number, Array<number | undefined>>;
	mfiByPeriod: Map<number, Array<number | undefined>>;
	volOscByKey: Map<string, Array<number | undefined>>;
	chaikinOscByKey: Map<string, Array<number | undefined>>;
	vwapByKey: Map<string, Array<IndicatorVwapValue | undefined>>;
	anchoredVwapByKey: Map<string, Array<IndicatorVwapValue | undefined>>;
	cvd: ReturnType<typeof calcCVDApprox>;
	strength: ReturnType<typeof calcStrengthElder>;
	strengthRelativeByKey: Map<string, Array<number | undefined>>;
	whaleByKey: Map<string, Array<IndicatorWhaleValue | undefined>>;
}

export function computeVolumeFlowBlocks(
	raw: readonly RawOHLCV[],
	plan: IndicatorComputationPlan,
	options?: IndicatorComputationOptions,
): VolumeFlowBlocks {
	const cvd = calcCVDApprox(raw);
	const strength = calcStrengthElder(raw);

	const strengthRelativeByKey = new Map<string, Array<number | undefined>>();
	for (const [key, config] of plan.strengthRelativeConfigs) {
		const compareBars = options?.compareBarsBySymbol?.[config.compareSymbol];
		const indexMap = new Map<number, number>();
		if (compareBars) {
			compareBars.forEach((b) => {
				indexMap.set(new Date(b.date).getTime(), b.close);
			});
		}
		const ratio = raw.map((bar) => {
			const t = new Date(bar.date).getTime();
			const idxClose = indexMap.has(t) ? indexMap.get(t)! : bar.close;
			return bar.close / (idxClose || 1);
		});
		const srValues = ratio.map((val, i) => {
			if (i < config.period) {
				return undefined;
			}
			const prevRatio = ratio[i - config.period];
			if (prevRatio === undefined || prevRatio === 0) {
				return undefined;
			}
			return (val / prevRatio) * 100;
		});
		strengthRelativeByKey.set(key, srValues);
	}

	const obv: Array<number | undefined> = plan.obvEnabled
		? (obvSeries(raw) as Array<number | undefined>)
		: new Array(raw.length).fill(undefined) as Array<undefined>;

	const pvt = plan.pvtEnabled
		? (pvtSeries(raw) as Array<number | undefined>)
		: new Array(raw.length).fill(undefined) as Array<undefined>;

	// CE27 additions
	const cmfByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.cmfPeriods) {
		cmfByPeriod.set(period, blankUntil(cmfSeries(raw, period), Math.max(period - 1, 0)));
	}

	const mfiByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.mfiPeriods) {
		mfiByPeriod.set(period, blankUntil(mfiSeries(raw, period), Math.max(period - 1, 0)));
	}

	const volOscByKey = new Map<string, Array<number | undefined>>();
	for (const [key, config] of plan.volOscConfigs) {
		volOscByKey.set(key, blankUntil(volOscSeries(raw, config.shortPeriod, config.longPeriod), Math.max(config.longPeriod - 1, 0)));
	}

	const chaikinOscByKey = new Map<string, Array<number | undefined>>();
	for (const [key, config] of plan.chaikinOscConfigs) {
		chaikinOscByKey.set(key, blankUntil(chaikinOscSeries(raw, config.fast, config.slow), Math.max(config.slow - 1, 0)));
	}

	const vwapByKey = new Map<string, Array<IndicatorVwapValue | undefined>>();
	for (const [key, config] of plan.vwapConfigs) {
		const series = vwapSeries(raw, config.anchor, config.showBands, config.multiplier);
		vwapByKey.set(key, raw.map((_, index) => {
			const v = series.vwap[index];
			if (v === undefined || isNaN(v)) return undefined;
			return {
				vwap: v,
				upper1: series.upper1[index]!,
				lower1: series.lower1[index]!,
				upper2: series.upper2[index]!,
				lower2: series.lower2[index]!,
				upper3: series.upper3[index]!,
				lower3: series.lower3[index]!,
			};
		}));
	}

	const anchoredVwapByKey = new Map<string, Array<IndicatorVwapValue | undefined>>();
	for (const [key, config] of plan.anchoredVwapConfigs) {
		const series = anchoredVwapSeries(raw, config.anchorTime, config.showBands, config.multiplier);
		anchoredVwapByKey.set(key, raw.map((_, index) => {
			const v = series.vwap[index];
			if (v === undefined || isNaN(v)) return undefined;
			return {
				vwap: v,
				upper1: series.upper1[index]!,
				lower1: series.lower1[index]!,
				upper2: series.upper2[index]!,
				lower2: series.lower2[index]!,
				upper3: series.upper3[index]!,
				lower3: series.lower3[index]!,
			};
		}));
	}

	const whaleByKey = new Map<string, Array<IndicatorWhaleValue | undefined>>();
	for (const threshold of plan.whaleThresholds) {
		const key = indicatorKey(defaultSeries("Whale", { threshold }));
		if (!key) {
			continue;
		}
		whaleByKey.set(
			key,
			calcWhaleApprox(raw, threshold).map((point) => (
				point.whaleBuyVol === undefined && point.whaleSellVol === undefined
					? undefined
					: { whaleBuyVol: point.whaleBuyVol, whaleSellVol: point.whaleSellVol }
			)),
		);
	}

	return {
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
	};
}
