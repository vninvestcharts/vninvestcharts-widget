import { hasCapability, type Capability, type PatTier } from "@vninvestcharts/engine-core";

/**
 * Bảng chart type dùng chung cho MỌI picker (status line `OHLCHeader` và
 * `MultiChartTopbar`).
 *
 * Trước đây mỗi picker có một bản riêng và chúng đã trôi lệch: `OHLCHeader`
 * có `bar`, `MultiChartTopbar` có `renko`/`kagi` đánh dấu `comingSoon`. Một
 * chart type mà chỉ xuất hiện ở một nửa UI là chart type mà user không tìm thấy.
 * Một bảng, hai nơi import ⇒ không còn chỗ để trôi.
 *
 * `capability` là cổng TẦN 1 (UI): dùng `hasCapability` — cùng hàm và cùng cách
 * fail-closed như `components/dock/dockAccess.ts:29`. `tier` chưa biết (`null`)
 * nghĩa là khoá, không phải mở.
 *
 * Tần 2 là CỔNG RENDER: `RegistryEntry.tier = "pro"` trong
 * `core/registry/priceChartTypes.ts`, đọc bởi `filterAvailableSeries` trước khi
 * series tới engine. UI cho user thấy nút Pro; engine không bao giờ nhận series
 * đó ở tier thấp. `chartTypeCapability.test.tsx` khoá việc hai tầng phải cùng
 * một capability.
 */
export interface ChartTypeOption {
	/** Khóa của `CHART_TYPE_MAP` trong `VNInvestCharts.tsx`. */
	value: string;
	labelKey: string;
	/** Capability phải có mới chọn được. Vắng ⇒ ai cũng chọn được. */
	capability?: Capability;
	/**
	 * CHƯA build xong. Hiện tên + badge nhưng không chọn được, và tuyệt đối
	 * không được có trong `CHART_TYPE_MAP`: map tới một `SeriesTypeId` chưa có
	 * producer thì chart vẽ y hệt Line dưới nhãn khác.
	 */
	comingSoon?: boolean;
}

export const CHART_TYPE_OPTIONS: readonly ChartTypeOption[] = [
	{ value: "candlestick", labelKey: "chartType.candlestick" },
	{ value: "line", labelKey: "chartType.line" },
	{ value: "area", labelKey: "chartType.area" },
	{ value: "heikinAshi", labelKey: "chartType.heikinAshi" },
	// Gỡ 2026-10-03: `bar` bị gỡ khỏi picker. `Bar` là chart type giá nhưng tên nó
	// trùng với heuristic `type.includes("bar")` của engine, nên nó bị định tuyến
	// vào mode zero-based của volume ⇒ mọi cột vẽ từ 0 tới close, trục Y chạy
	// 0→100.000 và biến động giá nén trong ~8% trên cùng. `OHLC` đã render đúng
	// chart nến-tick (wick low→high, tick open/close) nên không mất khả năng nào.
	// Ledger `WA_BAR_RUNTIME_2026-10-03`.
	// A3 Baseline / A11 Renko / Kagi / Point & Figure / Line Break: đã có producer
	// + case resolver + render mode ở engine, nên KHÔNG còn `comingSoon`. Cổng là
	// capability pro, không phải "chưa làm" — xem `core/registry/priceChartTypes.ts`
	// cho tầng render.
	{ value: "baseline", labelKey: "chartType.baseline", capability: "chart_baseline" },
	{ value: "renko", labelKey: "chartType.renko", capability: "chart_exotic" },
	{ value: "kagi", labelKey: "chartType.kagi", capability: "chart_exotic" },
	{ value: "pointAndFigure", labelKey: "chartType.pointAndFigure", capability: "chart_exotic" },
	{ value: "lineBreak", labelKey: "chartType.lineBreak", capability: "chart_exotic" },
	{ value: "hollow", labelKey: "chartType.hollow" },
	{ value: "ohlc", labelKey: "chartType.ohlc" },
];

/** Tier chưa xác minh được (`null`/`undefined`) ⇒ khoá, không phải mở. */
export function isChartTypeLocked(option: ChartTypeOption, patTier: string | null | undefined): boolean {
	if (option.comingSoon === true) {
		return true;
	}
	return option.capability !== undefined && !hasCapability(patTier as PatTier, option.capability);
}

/** Đã khai báo trong `CHART_TYPE_OPTIONS` nhưng chưa build (khác với "bị khoá theo tier"). */
export function isChartTypeComingSoon(option: ChartTypeOption): boolean {
	return option.comingSoon === true;
}
