import { describe, expect, it } from "vitest";
import {
	HISTOGRAM_DEFAULTS,
	HistogramSeries,
	resolveHistogramFill,
} from "../HistogramSeries";

/**
 * W1.2/A2 — regression lock cho Histogram series.
 *
 * Engine đã sẵn sàng: `KernelEngine.resolveSeriesMode` map mọi type chứa
 * "histogram" sang mode `"bar"`, nên phía engine **không** cần sửa. Thứ đáng bảo vệ
 * ở đây là logic tô màu theo dấu — nếu ngược thì MACD histogram đọc như cột
 * một màu và mất hết ý nghĩa.
 *
 * Logic màu đã tách thành hàm thuần `resolveHistogramFill` để test được mà không
 * cần dựng chart (BarSeries cần GenericChartComponent + scale).
 */

const C = { baseAt: 0, upColor: "#UP", downColor: "#DOWN" } as const;

describe("resolveHistogramFill: chọn màu theo dấu", () => {
	it("giá trị > baseAt ⇒ màu tăng", () => {
		expect(resolveHistogramFill(5, C)).toBe("#UP");
	});

	it("giá trị < baseAt ⇒ màu giảm", () => {
		expect(resolveHistogramFill(-5, C)).toBe("#DOWN");
	});

	it("bằng đúng baseAt ⇒ flatColor; không có flatColor thì dùng upColor (không sinh màu thứ 3)", () => {
		expect(resolveHistogramFill(0, { ...C, flatColor: "#FLAT" })).toBe("#FLAT");
		expect(resolveHistogramFill(0, C)).toBe("#UP");
	});

	it("baseAt khác 0 vẫn so đúng", () => {
		const c = { ...C, baseAt: 50 };
		expect(resolveHistogramFill(51, c)).toBe("#UP");
		expect(resolveHistogramFill(49, c)).toBe("#DOWN");
		expect(resolveHistogramFill(50, c)).toBe("#UP");
	});

	it("giá trị không hợp lệ ⇒ màu TĂNG, KHÔNG phải màu giảm", () => {
		// Cột không có dữ liệu tô màu "giảm" sẽ đọc thành tín hiệu xu hướng
		// không tồn tại — đây là loại lỗi trực quan nguy hiểm nhất với histogram.
		for (const bad of [NaN, undefined, null, "5", Infinity, -Infinity]) {
			expect(resolveHistogramFill(bad, C), `input=${String(bad)}`).toBe("#UP");
		}
	});

	it("số âm 0 và số rất nhỏ vẫn phân loại đúng", () => {
		expect(resolveHistogramFill(-0, C)).toBe("#UP");
		expect(resolveHistogramFill(1e-12, C)).toBe("#UP");
		expect(resolveHistogramFill(-1e-12, C)).toBe("#DOWN");
	});
});

describe("HistogramSeries: mặc định", () => {
	it("HISTOGRAM_DEFAULTS: baseAt 0, đậm hơn BarSeries (0.5)", () => {
		expect(HISTOGRAM_DEFAULTS.baseAt).toBe(0);
		expect(HISTOGRAM_DEFAULTS.opacity).toBeGreaterThan(0.5);
		expect(HISTOGRAM_DEFAULTS.upColor).not.toBe(HISTOGRAM_DEFAULTS.downColor);
	});

	it("component là function, dùng được như series component", () => {
		expect(typeof HistogramSeries).toBe("function");
	});

	it("baseAt dạng hàm được truyền xuống BarSeries", () => {
		const baseFn = () => 42;
		const el = HistogramSeries({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			yAccessor: (d: any) => d.v,
			baseAt: baseFn,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any) as any;
		const inner = el.props.baseAt;
		expect(typeof inner).toBe("function");
		expect(inner(null, null, { v: 1 })).toBe(42);
	});
});
