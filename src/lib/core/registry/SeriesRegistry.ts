/**
 * Barrel của SeriesRegistry — điểm import duy nhất cho toàn bộ consumer.
 *
 * Trước slice 0.8, file này chứa cả state, cả API, cả 73 lệnh `register*Series`.
 * Nay đã tách:
 *
 * - `registryCore.ts` — singleton map, kiểu `RegistryEntry`/`SeriesTier`/`TooltipEntryDef`,
 *   `registerSeries`/`registerLineSeries`, getter, override style, helper tier.
 * - `registerPhaseOne.ts` — `registerPhaseOneSeries()`: clear registry rồi chạy 73 thunk
 *   theo đúng thứ tự lịch sử.
 * - 8 module nhóm chỉ báo: `priceChartTypes`, `movingAverage`, `volatility`, `momentum`,
 *   `volumeFlow`, `trend`, `marketStructure`, `profile`.
 *
 * File này chỉ re-export, không có state và không có logic đăng ký — nên import
 * `SeriesRegistry` bây giờ không còn kéo theo 15 component series.
 *
 * Hướng phụ thuộc (một chiều, không cycle):
 *   SeriesRegistry → registerPhaseOne → {nhóm chỉ báo} → registryCore
 */
export type { RegistryEntry, SeriesStyleOverride, SeriesTier, TooltipEntryDef } from "./registryCore";
export {
	clearRegistry,
	clearSeriesStyleOverrides,
	listSeriesStyleOverrides,
	overrideSeriesStyle,
	getSeriesStyleOverride,
	clearSeriesStyleOverride,
	subscribeSeriesStyle,
	subscribeSeriesStyleChanges,
	registerSeries,
	getSeries,
	listRegistered,
	getSeriesTier,
	isSeriesAvailableForTier,
	toSeriesTier,
	filterAvailableSeries,
} from "./registryCore";
export { registerPhaseOneSeries } from "./registerPhaseOne";
