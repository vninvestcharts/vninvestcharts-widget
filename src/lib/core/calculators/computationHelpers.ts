/**
 * Nguyên thủy dùng chung cho plan + compute + materialize.
 *
 * Tách ra (split 2026-09-30) vì cả ba tầng đều cần đúng những hàm này, và giữ
 * chúng ở một chỗ là điều kiện để `indicatorComputation.ts` có thể thành barrel.
 *
 * `indicatorKey` và `defaultSeries` phải ở đây chứ không ở tầng trên: key chuỗi
 * quyết định ánh xạ `valuesByKey`/`*ByKey`, nên có một nguồn duy nhất là điều kiện
 * để các map trong `result` và các khóa mà `materializeIndicatorValues` ghi ra
 * không lệch nhau.
 */
import { buildIndicatorSeriesKey } from "../seriesValueResolver";
import type { SeriesConfig } from "../types/pane-descriptor";
import type { IndicatorBandValue } from "./types";

/** Trả về mảng `undefined` cho `startIndex` phần tử đầu (warmup của các bộ lọc). */
export function blankUntil<T>(values: readonly T[], startIndex: number): Array<T | undefined> {
	return values.map((value, index) => (index >= startIndex ? value : undefined));
}

/** Ghép 3 dải của Bollinger/Keltner thành một record `{top, middle, bottom}`. */
export function mergeBand(
	upper: readonly number[],
	middle: readonly number[],
	lower: readonly number[],
	startIndex: number,
): Array<IndicatorBandValue | undefined> {
	return upper.map((top, index) => {
		if (index < startIndex) {
			return undefined;
		}
		return {
			top,
			middle: middle[index] ?? middle[middle.length - 1] ?? top,
			bottom: lower[index] ?? lower[lower.length - 1] ?? top,
		};
	});
}

/** Đọc một tham số số; rơi về `fallback` khi thiếu, không phải số, hoặc NaN/Infinity. */
export function numberParam(series: SeriesConfig, key: string, fallback: number) {
	const value = series.params?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Khoá chuỗi của một series; `undefined` khi type không có trong `buildIndicatorSeriesKey`. */
export function indicatorKey(series: SeriesConfig) {
	return buildIndicatorSeriesKey(series);
}

/** Series "ảo" chỉ dùng để sinh khoá cho chỉ báo không có tham số (AO, BBI, OBV, PVT…). */
export function defaultSeries(type: SeriesConfig["type"], params: Record<string, number> = {}): SeriesConfig {
	return { type, yAxis: "right", params };
}
