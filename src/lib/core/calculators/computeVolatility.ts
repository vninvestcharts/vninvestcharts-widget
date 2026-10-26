/**
 * Khối compute: phân tán / biên độ (BBI, SAR, Keltner, Donchian, ChaikinVol,
 * StdDev, HV, CI, Supertrend).
 *
 * Một nhóm trong `computeIndicatorComputationResult`, tách riêng (split 2026-09-30).
 * Supertrend nằm ở đây vì nó là dải biên độ (ATR-based), không phải hệ thống xu hướng
 * — dù nó hay đi cùng DMA/Ichimoku trong UI.
 */
import {
	bbiSeries,
	chaikinVolSeries,
	choppinessIndexSeries,
	donchianSeries,
	historicalVolSeries,
	keltnerSeries,
	sarSeries,
	stdDevSeries,
	supertrendSeries,
} from "../../indicators/utils";
import type { IndicatorComputationPlan } from "./indicatorComputationTypes";
import type {
	IndicatorDonchianValue,
	IndicatorKeltnerValue,
	IndicatorSupertrendValue,
	RawOHLCV,
} from "./types";
import { blankUntil } from "./computationHelpers";

export interface VolatilityBlocks {
	bbi: Array<number | undefined>;
	sarByKey: Map<string, Array<number | undefined>>;
	keltnerByKey: Map<string, Array<IndicatorKeltnerValue | undefined>>;
	donchianByPeriod: Map<number, Array<IndicatorDonchianValue | undefined>>;
	chaikinVolByPeriod: Map<number, Array<number | undefined>>;
	stdDevByPeriod: Map<number, Array<number | undefined>>;
	hvByKey: Map<string, Array<number | undefined>>;
	ciByPeriod: Map<number, Array<number | undefined>>;
	supertrendByKey: Map<string, Array<IndicatorSupertrendValue | undefined>>;
}

export function computeVolatilityBlocks(
	raw: readonly RawOHLCV[],
	closes: readonly number[],
	plan: IndicatorComputationPlan,
): VolatilityBlocks {
	// CE15 indicators
	const bbi: Array<number | undefined> = plan.bbiEnabled
		? bbiSeries(raw)
		: new Array(raw.length).fill(undefined) as Array<undefined>;

	const sarByKey = new Map<string, Array<number | undefined>>();
	for (const [key, config] of plan.sarByKey) {
		sarByKey.set(key, blankUntil(sarSeries(raw, config.afStep, config.afMax), 1));
	}

	const keltnerByKey = new Map<string, Array<IndicatorKeltnerValue | undefined>>();
	for (const [key, config] of plan.keltnerConfigs) {
		const series = keltnerSeries(raw, config.period, config.atrPeriod, config.multiplier);
		keltnerByKey.set(key, raw.map((_, index) => {
			const up = series.upper[index];
			const mid = series.middle[index];
			const low = series.lower[index];
			if (isNaN(mid)) {
				return undefined;
			}
			return { upper: up, middle: mid, lower: low };
		}));
	}

	const donchianByPeriod = new Map<number, Array<IndicatorDonchianValue | undefined>>();
	for (const period of plan.donchianPeriods) {
		const series = donchianSeries(raw, period);
		donchianByPeriod.set(period, raw.map((_, index) => {
			const up = series.upper[index];
			const mid = series.middle[index];
			const low = series.lower[index];
			if (isNaN(mid)) {
				return undefined;
			}
			return { upper: up, middle: mid, lower: low };
		}));
	}

	const chaikinVolByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.chaikinVolPeriods) {
		chaikinVolByPeriod.set(period, blankUntil(chaikinVolSeries(raw, period), period));
	}

	const stdDevByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.stdDevPeriods) {
		stdDevByPeriod.set(period, blankUntil(stdDevSeries(closes, period), Math.max(period - 1, 0)));
	}

	const hvByKey = new Map<string, Array<number | undefined>>();
	for (const [key, config] of plan.hvConfigs) {
		hvByKey.set(key, blankUntil(historicalVolSeries(closes, config.period, config.annualize), Math.max(config.period, 1)));
	}

	const ciByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.ciPeriods) {
		ciByPeriod.set(period, blankUntil(choppinessIndexSeries(raw, period), Math.max(period - 1, 0)));
	}

	const supertrendByKey = new Map<string, Array<IndicatorSupertrendValue | undefined>>();
	for (const [key, config] of plan.supertrendConfigs) {
		const series = supertrendSeries(raw, config.period, config.multiplier);
		supertrendByKey.set(key, raw.map((_, index) => {
			const st = series.supertrend[index];
			const dir = series.direction[index];
			const ub = series.upperBand[index];
			const lb = series.lowerBand[index];
			if (isNaN(st)) {
				return undefined;
			}
			return {
				supertrend: st,
				direction: dir,
				upperBand: ub,
				lowerBand: lb,
			};
		}));
	}

	return {
		bbi,
		sarByKey,
		keltnerByKey,
		donchianByPeriod,
		chaikinVolByPeriod,
		stdDevByPeriod,
		hvByKey,
		ciByPeriod,
		supertrendByKey,
	};
}
