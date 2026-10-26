import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent, cmfSeries, emaSeriesSkipNaN, type PriceBar } from "../utils";

/**
 * Chaikin Oscillator = EMA(CMF, fast) − EMA(CMF, slow). Mặc định fast=3, slow=10 (chuẩn Chaikin).
 * Đây là **momentum của dòng tiền**: CMF cho biết dòng tiền vào hay ra, CO cho biết dòng
 * tiền đang mạnh lên hay yếu đi — nên đọc cùng CMF mới có ý nghĩa.
 *
 * NaN-first: trả `NaN` ở vùng ấm, KHÔNG trả 0. 0 sẽ vẽ thành đường ngang giữa chart và
 * đọc như tín hiệu giả.
 */
export function chaikinOscSeries(bars: readonly PriceBar[], fast = 3, slow = 10): number[] {
	const cmf = cmfSeries(bars, 20);
	// BẮT BUỘC SkipNaN: CMF có ~19 NaN ở đầu, mà `emaSeries` nhân NaN một lần là NaN vĩnh
	// viễn ⇒ CO trống TOÀN BỘ thay vì chỉ trống vùng ấm. Đã gặp bug này và có test khoá.
	const fastEma = emaSeriesSkipNaN(cmf, fast);
	const slowEma = emaSeriesSkipNaN(cmf, slow);
	return cmf.map((_, i) => {
		const f = fastEma[i];
		const s = slowEma[i];
		return Number.isFinite(f) && Number.isFinite(s) ? f - s : NaN;
	});
}

const ChaikinOscillator: IndicatorDefinition<OHLCVBar, number[], readonly [number?, number?]> = {
	name: "ChaikinOscillator",
	compute: (bars, fast = 3, slow = 10) => chaikinOscSeries(bars, fast, slow),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default ChaikinOscillator;
