/**
 * Khối compute: họ trung bình động (EMA/SMA/MACD/Bollinger + biến thể CE26).
 *
 * Một nhóm trong `computeIndicatorComputationResult`, tách riêng (split 2026-09-30)
 * để file orchestrator chỉ còn phần điều phối. Các khối trong nhóm là độc lập: không
 * khối nào đọc kết quả của khối khác, nên thứ tự gọi giữa các nhóm không quan sát
 * được — nhưng thứ tự các *khốa trong cùng nhóm* giữ nguyên văn bản gốc.
 */
import {
	bollingerSeries,
	demaSeries,
	emaSeries,
	hmaSeries,
	maRibbonSeries,
	macdSeries,
	smaSeries,
	temaSeries,
	vwmaSeries,
	wmaSeries,
} from "../../indicators/utils";
import type { IndicatorComputationPlan } from "./indicatorComputationTypes";
import type {
	IndicatorBandValue,
	IndicatorMacdValue,
	IndicatorMARibbonValue,
	RawOHLCV,
} from "./types";
import { blankUntil, mergeBand } from "./computationHelpers";

export interface MovingAverageBlocks {
	emaByPeriod: Map<number, Array<number | undefined>>;
	smaByPeriod: Map<number, Array<number | undefined>>;
	macdByKey: Map<string, Array<IndicatorMacdValue | undefined>>;
	bollingerByKey: Map<string, Array<IndicatorBandValue | undefined>>;
	wmaByPeriod: Map<number, Array<number | undefined>>;
	vwmaByPeriod: Map<number, Array<number | undefined>>;
	hmaByPeriod: Map<number, Array<number | undefined>>;
	demaByPeriod: Map<number, Array<number | undefined>>;
	temaByPeriod: Map<number, Array<number | undefined>>;
	maRibbonByKey: Map<string, Array<IndicatorMARibbonValue | undefined>>;
}

export function computeMovingAverageBlocks(
	raw: readonly RawOHLCV[],
	closes: readonly number[],
	plan: IndicatorComputationPlan,
): MovingAverageBlocks {
	const emaByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.emaPeriods) {
		emaByPeriod.set(period, blankUntil(emaSeries(closes, period), Math.max(period - 1, 0)));
	}

	const smaByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.smaPeriods) {
		smaByPeriod.set(period, blankUntil(smaSeries(closes, period), Math.max(period - 1, 0)));
	}

	const macdByKey = new Map<string, Array<IndicatorMacdValue | undefined>>();
	for (const [key, config] of plan.macdConfigs) {
		const macd = macdSeries(closes, config.fast, config.slow, config.signal);
		const macdLine = blankUntil(macd.macd, Math.max(config.slow - 1, 0));
		const signalLine = blankUntil(macd.signal, Math.max(config.slow - 1, 0));
		const histogramLine = blankUntil(macd.histogram, Math.max(config.slow - 1, 0));
		macdByKey.set(key, raw.map((_, index) => {
			const macdValue = macdLine[index];
			const signalValue = signalLine[index];
			const histogramValue = histogramLine[index];
			if (macdValue === undefined || signalValue === undefined || histogramValue === undefined) {
				return undefined;
			}
			return {
				macd: macdValue,
				signal: signalValue,
				divergence: histogramValue,
			};
		}));
	}

	const bollingerByKey = new Map<string, Array<IndicatorBandValue | undefined>>();
	for (const [key, config] of plan.bollingerConfigs) {
		const series = bollingerSeries(closes, config.period, config.stdDev);
		bollingerByKey.set(key, mergeBand(series.upper, series.middle, series.lower, Math.max(config.period - 1, 0)));
	}

	// CE26 additions
	const wmaByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.wmaPeriods) {
		wmaByPeriod.set(period, blankUntil(wmaSeries(closes, period), Math.max(period - 1, 0)));
	}

	const vwmaByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.vwmaPeriods) {
		vwmaByPeriod.set(period, blankUntil(vwmaSeries(raw, period), Math.max(period - 1, 0)));
	}

	const hmaByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.hmaPeriods) {
		hmaByPeriod.set(period, blankUntil(hmaSeries(closes, period), Math.max(period - 1, 0)));
	}

	const demaByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.demaPeriods) {
		demaByPeriod.set(period, blankUntil(demaSeries(closes, period), Math.max(period - 1, 0)));
	}

	const temaByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.temaPeriods) {
		temaByPeriod.set(period, blankUntil(temaSeries(closes, period), Math.max(period - 1, 0)));
	}

	const maRibbonByKey = new Map<string, Array<IndicatorMARibbonValue | undefined>>();
	for (const [key, config] of plan.maRibbonConfigs) {
		const series = maRibbonSeries(closes, config.type, config.periods);
		maRibbonByKey.set(key, raw.map((_, index) => {
			const val: IndicatorMARibbonValue = {};
			let allNaN = true;
			for (const p of config.periods) {
				const v = series[`ma${p}`]?.[index];
				if (v !== undefined && !isNaN(v)) {
					val[`ma${p}`] = v;
					allNaN = false;
				}
			}
			return allNaN ? undefined : val;
		}));
	}

	return {
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
	};
}
