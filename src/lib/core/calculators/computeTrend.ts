/**
 * Khối compute: hệ thống xu hướng dài hạn (DMA, Ichimoku, Alligator, Gator, Fractals).
 *
 * Một nhóm trong `computeIndicatorComputationResult`, tách riêng (split 2026-09-30).
 * Gator dùng lại đúng bộ tham số hàm răng của Alligator nên đi chung nhóm.
 */
import {
	alligatorSeries,
	dmaSeries,
	fractalsSeries,
	gatorSeries,
	ichimokuSeries,
} from "../../indicators/utils";
import type { IndicatorComputationPlan } from "./indicatorComputationTypes";
import type {
	IndicatorAlligatorValue,
	IndicatorDmaValue,
	IndicatorFractalValue,
	IndicatorGatorValue,
	IndicatorIchimokuValue,
	RawOHLCV,
} from "./types";
import { blankUntil } from "./computationHelpers";

export interface TrendBlocks {
	dmaByKey: Map<string, Array<IndicatorDmaValue | undefined>>;
	ichimokuByKey: Map<string, Array<IndicatorIchimokuValue | undefined>>;
	alligatorByKey: Map<string, Array<IndicatorAlligatorValue | undefined>>;
	fractals: Array<IndicatorFractalValue | undefined>;
	gatorByKey: Map<string, Array<IndicatorGatorValue | undefined>>;
}

export function computeTrendBlocks(
	raw: readonly RawOHLCV[],
	plan: IndicatorComputationPlan,
): TrendBlocks {
	const dmaByKey = new Map<string, Array<IndicatorDmaValue | undefined>>();
	for (const [key, config] of plan.dmaConfigs) {
		const series = dmaSeries(raw, config.fastPeriod, config.slowPeriod, config.signalPeriod);
		const warmup = Math.max(config.slowPeriod - 1, 0);
		const dddValues = blankUntil(series.ddd, warmup);
		const amaValues = blankUntil(series.ama, warmup);
		dmaByKey.set(key, raw.map((_, index) => {
			const ddd = dddValues[index];
			const ama = amaValues[index];
			if (!Number.isFinite(ddd ?? NaN) || !Number.isFinite(ama ?? NaN)) {
				return undefined;
			}
			return { ddd: ddd!, ama: ama! };
		}));
	}

	const ichimokuByKey = new Map<string, Array<IndicatorIchimokuValue | undefined>>();
	for (const [key, config] of plan.ichimokuConfigs) {
		const series = ichimokuSeries(raw, config.tenkan, config.kijun, config.senkouB, config.displacement);
		ichimokuByKey.set(key, raw.map((_, index) => {
			const tenkan = series.tenkan[index];
			const kijun = series.kijun[index];
			const senkouA = series.senkouA[index];
			const senkouB = series.senkouB[index];
			const chikou = series.chikou[index];
			if (isNaN(tenkan) && isNaN(kijun) && isNaN(senkouA) && isNaN(senkouB) && isNaN(chikou)) {
				return undefined;
			}
			return {
				tenkan: tenkan ?? NaN,
				kijun: kijun ?? NaN,
				senkouA: senkouA ?? NaN,
				senkouB: senkouB ?? NaN,
				chikou: chikou ?? NaN,
			};
		}));
	}

	const alligatorByKey = new Map<string, Array<IndicatorAlligatorValue | undefined>>();
	for (const [key, config] of plan.alligatorConfigs) {
		const series = alligatorSeries(raw, config.jawPeriod, config.jawShift, config.teethPeriod, config.teethShift, config.lipsPeriod, config.lipsShift);
		alligatorByKey.set(key, raw.map((_, index) => {
			const j = series.jaw[index];
			const t = series.teeth[index];
			const l = series.lips[index];
			if (j === undefined || t === undefined || l === undefined || isNaN(j) || isNaN(t) || isNaN(l)) return undefined;
			return { jaw: j, teeth: t, lips: l };
		}));
	}

	const fractals: Array<IndicatorFractalValue | undefined> = plan.fractalsEnabled
		? (() => {
			const series = fractalsSeries(raw);
			return raw.map((_, index) => {
				const bearish = series.bearish[index];
				const bullish = series.bullish[index];
				return { bearish: bearish ?? NaN, bullish: bullish ?? NaN };
			});
		  })()
		: new Array(raw.length).fill(undefined);

	const gatorByKey = new Map<string, Array<IndicatorGatorValue | undefined>>();
	for (const [key, config] of plan.gatorConfigs) {
		const series = gatorSeries(raw, config.jawPeriod, config.jawShift, config.teethPeriod, config.teethShift, config.lipsPeriod, config.lipsShift);
		gatorByKey.set(key, raw.map((_, index) => {
			const u = series.upper[index];
			const l = series.lower[index];
			if (u === undefined || l === undefined || isNaN(u) || isNaN(l)) return undefined;

			let upperColor = "#f23645"; // red default
			let lowerColor = "#f23645"; // red default

			if (index > 0) {
				const prevU = series.upper[index - 1];
				if (prevU !== undefined && !isNaN(prevU) && u > prevU) {
					upperColor = "#089981"; // green
				}
				const prevL = series.lower[index - 1];
				if (prevL !== undefined && !isNaN(prevL) && Math.abs(l) > Math.abs(prevL)) {
					lowerColor = "#089981"; // green
				}
			}

			return { upper: u, lower: l, upperColor, lowerColor } as any;
		}));
	}

	return {
		dmaByKey,
		ichimokuByKey,
		alligatorByKey,
		fractals,
		gatorByKey,
	};
}
