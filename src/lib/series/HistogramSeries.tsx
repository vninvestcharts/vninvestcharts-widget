import BarSeries from "./BarSeries";
import type { BarSeriesProps } from "./BarSeries";

/**
 * W1.2/A2 — Histogram series: cột tô màu theo dấu so với đường cơ sở.
 *
 * Dùng cho MACD histogram, RSI bars, OBV, Chaikin oscillator — những chỉ báo mà
 * dạng cột trực quan hơn đường. Engine đã map mọi type chứa "histogram" sang
 * mode `"bar"` (`KernelEngine.resolveSeriesMode:3256-3261`) nên không cần sửa
 * render loop — chỉ cần một series type ở phía widget.
 *
 * Vì sao không dùng thẳng `BarSeries`: nó lấy `fill` từ prop, không biết dấu của
 * giá trị. Ở đây `fill` là hàm bọc quanh `yAccessor` để chọn màu theo vế trên/dưới
 * `baseAt`, đúng như TradingView hiển thị MACD histogram.
 *
 * `baseAt` mặc định là 0 (đường zero của chỉ báo), không phải `yScale(0)` — cùng
 * kết quả với giá trị 0 nhưng rõ ràng hơn khi pane không có 0 trong domain.
 */

export interface HistogramSeriesProps extends Omit<BarSeriesProps, "fill" | "baseAt"> {
	/** Giá trị cơ sở để so dấu. Mặc định 0 — đường zero của chỉ báo. */
	baseAt?: number | ((xScale: any, yScale: any, datum?: any) => number);
	/** Màu khi giá trị > baseAt. */
	upColor?: string;
	/** Màu khi giá trị < baseAt. */
	downColor?: string;
	/** Màu khi bằng đúng baseAt (mặc định lấy `upColor` để không tạo cột ba màu). */
	flatColor?: string;
	/** Độ đậm. Histogram đặc hơn volume nên mặc định đậm hơn BarSeries. */
	opacity?: number;
}

export interface HistogramColors {
	baseAt: number;
	upColor: string;
	downColor: string;
	flatColor?: string;
}

export const HISTOGRAM_DEFAULTS = {
	baseAt: 0,
	upColor: "#26a69a",
	downColor: "#ef5350",
	opacity: 0.9,
} as const;

/**
 * Chọn màu cột theo dấu so với đường cơ sở. Tách thành hàm thuần để test được
 * mà không cần dựng chart — logic này là toàn bộ giá trị của histogram.
 *
 * Giá trị không hợp lệ (NaN/undefined/không phải số) trả `upColor` **không phải**
 * `downColor`: một cột không có dữ liệu tô màu "giảm" sẽ đọc thành tín hiệu xu hướng
 * không tồn tại.
 */
export function resolveHistogramFill(value: unknown, colors: HistogramColors): string {
	// `Number.isFinite` chứ không phải `!Number.isNaN`: -Infinity < 0 là đúng nên
	// nếu chỉ chặn NaN thì cột vô hạn âm sẽ tô màu "giảm" và đọc thành tín
	// hiệu xu hướng. Giá trị không hữu hạn không phải tín hiệu.
	if (typeof value !== "number" || !Number.isFinite(value)) return colors.upColor;
	if (value > colors.baseAt) return colors.upColor;
	if (value < colors.baseAt) return colors.downColor;
	return colors.flatColor ?? colors.upColor;
}

export function HistogramSeries(props: HistogramSeriesProps) {
	const {
		baseAt = HISTOGRAM_DEFAULTS.baseAt,
		upColor = HISTOGRAM_DEFAULTS.upColor,
		downColor = HISTOGRAM_DEFAULTS.downColor,
		flatColor,
		opacity = HISTOGRAM_DEFAULTS.opacity,
		yAccessor,
		...rest
	} = props;

	const baseOf = (xScale: any, yScale: any, datum?: any): number =>
		typeof baseAt === "function" ? baseAt(xScale, yScale, datum) : baseAt;

	return (
		<BarSeries
			{...rest}
			yAccessor={yAccessor}
			opacity={opacity}
			baseAt={baseOf}
			fill={(d: any) =>
				resolveHistogramFill(yAccessor ? yAccessor(d) : undefined, {
					baseAt: baseOf(null, null, d),
					upColor,
					downColor,
					flatColor,
				})
			}
		/>
	);
}

export default HistogramSeries;
