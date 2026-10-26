/**
 * Barrel của `indicatorComputation` — điểm import duy nhất cho mọi consumer.
 *
 * File này trước đây dài 1933 dòng và ngồi sát trần budget 1940, nên thêm một slice
 * chỉ báo mới là phải nộp đơn xin nới budget. Nay nó chỉ re-export (commit split
 * 2026-09-30), đúng như `registry/SeriesRegistry.ts` đã làm cho registry.
 *
 * - `indicatorComputationTypes.ts` — `IndicatorComputationPlan` / `IndicatorComputationResult`.
 * - `computationHelpers.ts` — `blankUntil` / `mergeBand` / `numberParam` / `indicatorKey` / `defaultSeries`.
 * - `buildIndicatorComputationPlan.ts` — gom series thành plan (switch 60+ nhánh).
 * - `resolveCalculationOrder.ts` — sắp series cha trước con.
 * - `computeIndicatorComputationResult.ts` — điều phối + `valuesByKey`.
 * - `compute{MovingAverage,Momentum,Volatility,Trend,VolumeFlow,MarketStructure,Profile}.ts`
 *   — thân của 60 khối chỉ báo, chia theo nhóm.
 * - `materializeIndicatorValues.ts` — gộp result thành record phẳng theo bar.
 *
 * Hướng phụ thuộc (một chiều, không cycle):
 *   indicatorComputation → computeIndicatorComputationResult → {compute*} → computationHelpers → indicatorComputationTypes
 *   computeIndicatorComputationResult → materializeIndicatorValues → computationHelpers
 * `materializeIndicatorValues` KHÔNG import ngược lại orchestrator; hàm này chỉ cần
 * kiểu `IndicatorComputationResult` của nó.
 */
export type {
	IndicatorComputationOptions,
	IndicatorComputationPlan,
	IndicatorComputationResult,
} from "./indicatorComputationTypes";
export { buildIndicatorComputationPlan } from "./buildIndicatorComputationPlan";
export { resolveCalculationOrder } from "./resolveCalculationOrder";
export { computeIndicatorComputationResult } from "./computeIndicatorComputationResult";
export { materializeIndicatorValues } from "./materializeIndicatorValues";
