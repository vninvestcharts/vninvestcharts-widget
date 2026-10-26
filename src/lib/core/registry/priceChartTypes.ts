/**
 * Nhóm 1/8 — loại chart / price renderer gốc: các kiểu nến/line/area/bar mà
 * chart-type picker chọn được, cộng Histogram. Không phải chỉ báo.
 */

import { format } from "d3-format";
import AreaSeries from "../../series/AreaSeries";
import BarSeries from "../../series/BarSeries";
import HistogramSeries from "../../series/HistogramSeries";
import CandlestickSeries from "../../series/CandlestickSeries";
import LineSeries from "../../series/LineSeries";
import OHLCSeries from "../../series/OHLCSeries";
import KagiSeries from "../../series/KagiSeries";
import LineBreakSeries from "../../series/LineBreakSeries";
import PointAndFigureSeries from "../../series/PointAndFigureSeries";
import RenkoSeries from "../../series/RenkoSeries";
import { resolveSeriesValue } from "../seriesValueResolver";
import { registerLineSeries, registerSeries } from "./registryCore";

export const registerCandlestick = (): void => registerSeries("Candlestick", {
	component: CandlestickSeries,
	defaultParams: {},
	defaultYAxis: "right",
	tooltipEntry: () => ({
		label: "Price",
		format: format(".2f"),
		accessor: (d) => d.close,
	}),
});

export const registerHollowCandle = (): void => registerSeries("HollowCandle", {
	component: CandlestickSeries,
	defaultParams: { hollow: true },
	defaultYAxis: "right",
	tooltipEntry: () => ({
		label: "Hollow",
		format: format(".2f"),
		accessor: (d) => d.close,
	}),
});

export const registerOHLC = (): void => registerSeries("OHLC", {
	component: OHLCSeries,
	defaultParams: {},
	defaultYAxis: "right",
	tooltipEntry: () => ({
		label: "OHLC",
		format: format(".2f"),
		accessor: (d) => d.close,
	}),
});

export const registerHeikinAshi = (): void => registerSeries("HeikinAshi", {
	component: CandlestickSeries,
	defaultParams: { transformed: "heikinashi" },
	defaultYAxis: "right",
	tooltipEntry: () => ({
		label: "HA",
		format: format(".2f"),
		accessor: (d) => d.close,
	}),
});

export const registerLine = (): void => registerLineSeries("Line", {
	component: LineSeries,
	tooltipEntry: (config) => ({
		label: String(config.params?.label ?? "Line"),
		format: format(".2f"),
		accessor: (d) => d.close,
	}),
});

export const registerArea = (): void => registerLineSeries("Area", {
	component: AreaSeries,
	tooltipEntry: (config) => ({
		label: String(config.params?.label ?? "Area"),
		format: format(".2f"),
		accessor: (d) => d.close,
	}),
});

// ── A3 Baseline / A11 Renko / Kagi / Point & Figure / Line Break ───────────────
// Năm loại này KHÁC `Bar` ở đúng một điểm: giá trị vẽ không phải `close` mà là
// dữ liệu do `calculators/exoticChartData.ts` sản xuất, và engine cần một
// render mode riêng cho mỗi loại. `renderMode` ở đây là bản khai báo phía
// widget; `priceChartRenderMode.test.ts` đối chiếu nó với
// `resolveSeriesRenderMode` của engine nên hai bảng không thể trôi lệch.
// `tier: "pro"` là CỔNG RENDER (fail-closed): `filterAvailableSeries` loại series
// trước khi nó tới engine, không chỉ ẩn nút trong UI.

// Baseline = phần trăm so với bar mốc, không phải giá tuyệt đối. Lý do nằm ở
// producer: `normalizePricesToBaseline` chỉ phát phần trăm, và mọi consumer của
// map đó (`resolveOverlayValue`, overlay `valueMode: "percent"` của engine) đều
// đọc nó như phần trăm. Dùng giá tuyệt đối sẽ phải thêm một normaliser thứ hai
// cho cùng một khái niệm.
export const registerBaseline = (): void => registerSeries("Baseline", {
	component: LineSeries,
	renderMode: "baseline",
	defaultParams: {},
	defaultYAxis: "right",
	tier: "pro",
	tooltipEntry: (config) => ({
		label: String(config.params?.label ?? "Baseline"),
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

// Renko: một hộp mỗi bar, từ `renkoOpen` tới `renkoClose` (engine render mode
// "renko" tự lấy hai đầu đó làm baseline/giá trị).
export const registerRenko = (): void => registerSeries("Renko", {
	component: RenkoSeries,
	renderMode: "renko",
	defaultParams: {},
	defaultYAxis: "right",
	tier: "pro",
	tooltipEntry: (config) => ({
		label: String(config.params?.label ?? "Renko"),
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

// Kagi: đường bậc thang qua mức `current`, đổi hướng khi giá đảo đủ `reversal`.
export const registerKagi = (): void => registerSeries("Kagi", {
	component: KagiSeries,
	renderMode: "kagi",
	defaultParams: {},
	defaultYAxis: "right",
	tier: "pro",
	tooltipEntry: (config) => ({
		label: String(config.params?.label ?? "Kagi"),
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

// Point & Figure: mỗi BOX của một cột là một rect, và TẤT CẢ chúng dán ở cùng một
// x — x của bar Mở đầu cột (`pnfColumnStart`). Không thể alias sang renko: mode
// "renko" đi qua `toBarPoints` đặt mỗi bar một x riêng, nên một cột gồm 5 box sẽ
// bị nhoè ra 5 ô. Engine có `layoutPointAndFigure` riêng cho việc này, và
// `priceChartRenderMode.test.ts` khoá việc khai mode của registry khớp engine.
export const registerPointAndFigure = (): void => registerSeries("PointAndFigure", {
	component: PointAndFigureSeries,
	renderMode: "pointandfigure",
	defaultParams: {},
	defaultYAxis: "right",
	tier: "pro",
	tooltipEntry: (config) => ({
		label: String(config.params?.label ?? "Point & Figure"),
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

// Line Break: đường bậc thang qua mức `lineBreakClose` (mức đóng của đoạn hiện
// tại), đổi đoạn khi giá đi ngược đủ `n`. Engine render mode "linebreak" tự
// dùng `stepBefore` — không có nó thì đoạn ngang sẽ thành đường dốc.
export const registerLineBreak = (): void => registerSeries("LineBreak", {
	component: LineBreakSeries,
	renderMode: "linebreak",
	defaultParams: {},
	defaultYAxis: "right",
	tier: "pro",
	tooltipEntry: (config) => ({
		label: String(config.params?.label ?? "Line Break"),
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

// W1.2/A2 — Histogram. Không cần sửa render loop của engine: resolveSeriesMode
// đã map mọi type chứa "histogram" sang mode "bar" (KernelEngine.ts:3256-3261).
export const registerHistogram = (): void => registerSeries("Histogram", {
	component: HistogramSeries,
	defaultParams: { baseAt: 0 },
	defaultYAxis: "right",
	settingsFields: [
		{
			key: "baseAt",
			labelKey: "settings.baseAt",
			type: "number",
			defaultValue: 0,
			min: -1000000,
			max: 1000000,
			step: 0.5,
		},
	],
	tooltipEntry: (config) => ({
		label: "Histogram",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});
