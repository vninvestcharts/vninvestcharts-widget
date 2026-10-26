/**
 * INT-1: VNInvest response → RawOHLCVBar adapter
 */
import type { RawOHLCVBar, NullableChartPoint } from "./types";

/**
 * Convert VNInvest chart points → RawOHLCVBar[] cho enrichData pipeline.
 * Giá đã ở đơn vị VND — không cần convert.
 * Points có close=null bị lọc bỏ.
 * Points có date parse lỗi bị lọc bỏ.
 */
export function chartPointsToRawOHLCV(
	points: NullableChartPoint[],
): RawOHLCVBar[] {
	const result: RawOHLCVBar[] = [];
	for (const p of points) {
		if (p.close === null || p.close === undefined) continue;
		const date = new Date(p.date);
		if (isNaN(date.getTime())) continue;
		result.push({
			date,
			open: p.open ?? p.close,
			high: p.high ?? p.close,
			low: p.low ?? p.close,
			close: p.close,
			volume: p.volume ?? 0,
		});
	}
	return result;
}
