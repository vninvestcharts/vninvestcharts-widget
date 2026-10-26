import { describe, expect, it } from "vitest";
import ChaikinOscillator, { chaikinOscSeries } from "../chaikinOscillator";
import type { OHLCVBar } from "../../../../lib/types/ohlcv";

function bar(i: number, o: number, h: number, l: number, c: number, v: number): OHLCVBar {
	return { date: new Date(i * 86_400_000), index: i, dataIndex: i, open: o, high: h, low: l, close: c, volume: v } as unknown as OHLCVBar;
}

/**
 * Volume tăng dần, còn close dồn từ 1/4 lên 3/4 range => money-flow multiplier tăng =>
 * CMF tăng => CO > 0.
 *
 * Fixture đầu tiên của tôi đặt close ở **cùng vị trí** mọi nến (base+0.5 trong
 * [base-1, base+1]) nên CMF hằng số 0.5, CO = 0 cho MỌI cặp tham số — test "tham số có
 * ảnh hưởng không" vô nghĩa và pass nhầm. Bài học: chỉ báo dạng hiệu chênh lệch rất dễ
 * trượt về 0 nếu fixture hằng.
 */
const rising: OHLCVBar[] = Array.from({ length: 60 }, (_, i) => {
	const mid = 100 + i;
	const frac = 0.25 + (0.5 * i) / 59;
	return bar(i, mid, mid + 2, mid - 2, mid - 2 + 4 * frac, 1000 + i * 20);
});

describe("ChaikinOscillator", () => {
	it("NaN ở vùng ấm, KHÔNG phải 0", () => {
		const out = chaikinOscSeries(rising, 3, 10);
		// Vùng ấm của EMA chậm (slow=10) dài hơn EMA nhanh ⇒ vài giá trị đầu phải là NaN.
		expect(out[0]).toBeNaN();
		expect(out[3]).toBeNaN();
		// Giá trị 0 ở đây sẽ vẽ thành đường ngang giữa chart và đọc như tín hiệu giả.
		expect(out.slice(0, 10).some((v) => v === 0)).toBe(false);
	});

	it("vùng nóng thì ra số hữu hạn", () => {
		const out = chaikinOscSeries(rising, 3, 10);
		const hot = out.slice(30);
		expect(hot.length).toBeGreaterThan(0);
		expect(hot.every((v) => Number.isFinite(v))).toBe(true);
	});

	it("độ dài bằng độ dài input", () => {
		expect(chaikinOscSeries(rising, 3, 10)).toHaveLength(rising.length);
	});

	it("mặc định fast=3 slow=10", () => {
		expect(ChaikinOscillator.compute(rising)).toEqual(chaikinOscSeries(rising, 3, 10));
	});

	it("tham số truyền vào THỰC SỰ thay đổi kết quả (không phải bị bỏ qua)", () => {
		const a = chaikinOscSeries(rising, 3, 10);
		const b = chaikinOscSeries(rising, 5, 20);
		expect(a).not.toEqual(b);
	});

	it("xu hướng CMF tăng ⇒ CO dương", () => {
		// CMF tăng dần khi close nằm ở nửa trên range và volume tăng ⇒ EMA nhanh > EMA chậm.
		const out = chaikinOscSeries(rising, 3, 10);
		expect(out[out.length - 1]).toBeGreaterThan(0);
	});

	it("dữ liệu rỗng không ném lỗi", () => {
		expect(chaikinOscSeries([], 3, 10)).toEqual([]);
	});

	it("computeExtents trả miền hữu hạn, bỏ qua NaN", () => {
		const values = ChaikinOscillator.compute(rising, 3, 10);
		const [lo, hi] = ChaikinOscillator.computeExtents!(values);
		expect(Number.isFinite(lo)).toBe(true);
		expect(Number.isFinite(hi)).toBe(true);
		expect(hi).toBeGreaterThanOrEqual(lo);
	});

	/**
	 * Regression — bug thật đã gặp: dùng `emaSeries` thay vì `emaSeriesSkipNaN`.
	 * CMF có NaN ở ~19 giá trị đầu; `emaSeries` nhân NaN một lần rồi NaN vĩnh viễn, nên
	 * CO **trống toàn bộ** (không phải chỉ trống vùng ấm). Test này fail nếu ai đó đổi lại
	 * về `emaSeries`.
	 */
	it("NaN-warmup ở input KHÔNG làm nhiễm toàn bộ series (bắt lỗi dùng emaSeries thay emaSeriesSkipNaN)", () => {
		const out = chaikinOscSeries(rising, 3, 10);
		const finiteCount = out.filter((v) => Number.isFinite(v)).length;
		// Series 60 nến, vùng ấm hợp lệ ~19 nến ⇒ phải còn phần lớn là số thật.
		expect(finiteCount).toBeGreaterThan(30);
		expect(out[out.length - 1]).toBeTypeOf("number");
	});
});
