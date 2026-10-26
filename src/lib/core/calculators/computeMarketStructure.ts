/**
 * Khối compute: cấu trúc thị trường (Pivot Standard, Pivot High/Low, Wyckoff Wave).
 *
 * Một nhóm trong `computeIndicatorComputationResult`, tách riêng (split 2026-09-30).
 * Cả ba đều vẽ mốc ngang/sóng theo toàn bộ lịch sử thay vì theo chu kỳ, nên chúng
 * không thuộc nhóm dao động dù đều là "chỉ báo tham số theo khoá".
 */
import { pivotHighLowSeries, pivotStandardSeries } from "../../indicators/utils";
import { computeWyckoffWave } from "../../indicators/builtin/wyckoffWave";
import type { IndicatorComputationPlan } from "./indicatorComputationTypes";
import type { IndicatorPivotValue, IndicatorWyckoffValue, RawOHLCV } from "./types";

export interface MarketStructureBlocks {
	pivotStandardByKey: Map<string, Array<IndicatorPivotValue | undefined>>;
	pivotHighLowByKey: Map<string, Array<IndicatorPivotValue | undefined>>;
	wyckoffWaveByKey: Map<string, Array<IndicatorWyckoffValue | undefined>>;
}

export function computeMarketStructureBlocks(
	raw: readonly RawOHLCV[],
	plan: IndicatorComputationPlan,
): MarketStructureBlocks {
	const pivotStandardByKey = new Map<string, Array<IndicatorPivotValue | undefined>>();
	for (const [key, config] of plan.pivotStandardConfigs) {
		const typesStr = ["standard", "fibonacci", "camarilla", "woodie", "demark"] as const;
		const typeStr = typesStr[config.pivotType] || "standard";
		const series = pivotStandardSeries(raw, typeStr);
		pivotStandardByKey.set(key, raw.map((_, index) => {
			const pp = series.pp[index];
			if (pp === undefined || isNaN(pp)) return undefined;
			return {
				pp,
				r1: series.r1[index]!,
				s1: series.s1[index]!,
				r2: series.r2[index]!,
				s2: series.s2[index]!,
				r3: series.r3[index]!,
				s3: series.s3[index]!,
			};
		}));
	}

	const pivotHighLowByKey = new Map<string, Array<IndicatorPivotValue | undefined>>();
	for (const [key, config] of plan.pivotHighLowConfigs) {
		const typesStr = ["standard", "fibonacci"] as const;
		const typeStr = typesStr[config.pivotType] || "standard";
		const series = pivotHighLowSeries(raw, config.lookback, typeStr);
		pivotHighLowByKey.set(key, raw.map((_, index) => {
			const pp = series.pp[index];
			if (pp === undefined || isNaN(pp)) return undefined;
			return {
				pp,
				r1: series.r1[index]!,
				s1: series.s1[index]!,
				r2: series.r2[index]!,
				s2: series.s2[index]!,
				r3: series.r3[index]!,
				s3: series.s3[index]!,
			};
		}));
	}

	const wyckoffWaveByKey = new Map<string, Array<IndicatorWyckoffValue | undefined>>();
	for (const [key, config] of plan.wyckoffWaveConfigs) {
		const wyckoffValues = computeWyckoffWave(raw as any, config.thresholdPercent);
		wyckoffWaveByKey.set(key, wyckoffValues);
	}

	return {
		pivotStandardByKey,
		pivotHighLowByKey,
		wyckoffWaveByKey,
	};
}
