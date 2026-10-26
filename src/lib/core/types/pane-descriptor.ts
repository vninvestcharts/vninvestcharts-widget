export type SeriesTypeId =
	| "Candlestick"
	| "HollowCandle"
	| "OHLC"
	| "HeikinAshi"
	| "Line"
	| "Area"
	| "Volume"
	// W1.2/A2: histogram dùng cho MACD/RSI/OBV/Chaikin dạng cột. Engine đã map
	// mọi type chứa "histogram" sang mode "bar" (KernelEngine.resolveSeriesMode).
	| "Histogram"
	// A3 Baseline + A11 Renko/Kagi/PointAndFigure/LineBreak: chart type giá "loại".
	// Cả năm có render mode riêng ở engine (`exoticSeriesModes.ts`) và producer
	// riêng (`calculators/exoticChartData.ts`). Không có producer + case trong
	// `seriesValueResolver` thì chúng rơi về `default: datum.close` ⇒ vẽ y hệt
	// Line; xem `registry/__tests__/chartTypeContract.test.ts`.
	//
	// P&F cần thêm `pnfColumnStart`: một cột gom MỌI box vào cùng một x, còn
	// `toBarPoints` của engine đặt mỗi bar một x riêng ⇒ phải có mode xếp cột
	// (`pointAndFigureColumns.ts`), không phải alias sang renko.
	| "Baseline"
	| "Renko"
	| "Kagi"
	| "PointAndFigure"
	| "LineBreak"
	| "EMA"
	| "BollingerBand"
	| "RSI"
	| "MACD"
	| "CVDApprox"
	| "CVDRealtime"
	| "StrengthElder"
	| "StrengthRelative"
	| "Whale"
	// CE15 additions
	| "MA"
	| "BBI"
	| "SAR"
	| "OBV"
	| "WR"
	| "VR"
	// CE16 additions
	| "KDJ"
	| "CCI"
	| "DMI"
	| "BIAS"
	| "BRAR"
	| "MTM"
	| "EMV"
	| "AO"
	| "ROC"
	| "TRIX"
	| "DMA"
	| "PVT"
	| "PSY"
	| "CR"
	// CE26 additions
	| "WMA"
	| "VWMA"
	| "HMA"
	| "DEMA"
	| "TEMA"
	| "MARibbon"
	| "Ichimoku"
	| "Supertrend"
	| "Keltner"
	| "Donchian"
	| "ChaikinVol"
	| "StdDev"
	| "HV"
	| "CI"
	// CE27 additions
	| "CMF"
	| "ChaikinOscillator"
	| "MFI"
	| "VolOsc"
	| "VWAP"
	| "AnchoredVWAP"
	| "Alligator"
	| "Fractals"
	| "Gator"
	| "AC"
	| "PivotStandard"
	| "PivotHighLow"
	| "MarketProfile"
	| "VolumeProfile"
	| "Footprint"
	| "DeltaProfile"
	| "SMFI"
	| "WyckoffWave"
	| (string & {});

export type YAxisSide = "left" | "right";

/**
 * Canonicalize legacy series-type aliases to their canonical SeriesTypeId.
 * Currently only "BollingerBands" (plural, exposed historically via the
 * SeriesRegistry demo alias + settings composer) → "BollingerBand".
 * Central SSOT so compute/resolve/render/label paths cannot diverge again.
 */
export function normalizeSeriesTypeId(type: SeriesTypeId): SeriesTypeId {
	return (type === "BollingerBands" ? "BollingerBand" : type) as SeriesTypeId;
}

export interface SeriesConfig {
	id?: string;
	type: SeriesTypeId;
	params?: Record<string, unknown>;
	yAxis: YAxisSide;
	/** Optional explicit scale-slot id for native-style grouping. */
	scaleSlotId?: string;
	overlay?: boolean;
	color?: string;
	lineWidth?: number;
	lineStyle?: "solid" | "dashed" | "dotted";
	/** Per-component color overrides for multi-line indicators (MACD, BB, KDJ, …) */
	subColors?: Record<string, string>;
	visible?: boolean;  // undefined | true = render; false = hidden (soft-hide, data still computed)
	sourceType?: "price" | "indicator";
	sourceId?: string;
	sourceKey?: string;
	overlaySymbolId?: string;
	normalizeToBaseline?: boolean;
}

export type TooltipMode = "ohlc" | "value" | "none";

export interface PaneDescriptor {
	id: string;
	label: string;
	pinned: boolean;
	visible: boolean;
	heightRatio: number;
	series: SeriesConfig[];
	splitScale: boolean;
	tooltip: TooltipMode;
	/** Optional per-pane minimum height (px). Fallback to getPaneMinHeight() */
	minHeight?: number;
}

export const PANE_LAYOUT_STORAGE_KEY = "rsc-pane-layout-v2";
export const PANE_MAX_VISIBLE = 5;

export const DEFAULT_PANES: PaneDescriptor[] = [
	// ── 1: PRICE — pinned, always visible ────────────────────────────────────
	{
		id: "price",
		label: "Price",
		pinned: true,
		visible: true,
		heightRatio: 0.85,
		splitScale: false,
		tooltip: "ohlc",
		series: [
			{ type: "Candlestick", yAxis: "right" },
			{ type: "EMA", params: { period: 20, color: "#2d9cdb" }, yAxis: "right", overlay: true },
			{ type: "EMA", params: { period: 50, color: "#f2994a" }, yAxis: "right", overlay: true },
			{ type: "BollingerBand", params: { period: 20, stdDev: 2 }, color: "#38bdf8", yAxis: "right", overlay: true },
		],
	},
	// ── 2: VOLUME — visible by default ───────────────────────────────────────
	{
		id: "volume",
		label: "Volume",
		pinned: false,
		visible: true,
		heightRatio: 0.15,
		splitScale: false,
		tooltip: "value",
		series: [
			{ type: "Volume", yAxis: "right" },
		],
	},
	// ── 3: MOMENTUM (RSI + MACD) — hidden by default, enable via Panes menu ─────
	{
		id: "momentum",
		label: "RSI+MACD",
		pinned: false,
		visible: false,
		heightRatio: 0.20,
		splitScale: true,
		tooltip: "value",
		series: [
			{ type: "RSI", params: { period: 14 }, yAxis: "left", scaleSlotId: "momentum-left" },
			{ type: "MACD", params: { fast: 12, slow: 26, signal: 9 }, yAxis: "right", scaleSlotId: "momentum-right" },
		],
	},
	// ── 4: ORDER FLOW — hidden by default, enable via Panes menu ─────────────
	{
		id: "orderflow",
		label: "Order Flow",
		pinned: false,
		visible: false,
		heightRatio: 0.20,
		splitScale: false,
		tooltip: "value",
		series: [
			{ type: "Whale", params: { threshold: 50_000 }, yAxis: "right" },
			{ type: "CVDApprox", yAxis: "right" },
		],
	},
	// ── 5: STRENGTH — hidden by default, enable via Panes menu ───────────────
	{
		id: "strength",
		label: "Strength",
		pinned: false,
		visible: false,
		heightRatio: 0.18,
		splitScale: true,
		tooltip: "value",
		series: [
			{ type: "StrengthElder", yAxis: "left", scaleSlotId: "strength-left" },
			{ type: "StrengthRelative", yAxis: "right", scaleSlotId: "strength-right" },
		],
	},
];

const DEFAULT_PANE_ID_SET = new Set(DEFAULT_PANES.map((pane) => pane.id));

export function isDefaultPaneId(id: string): boolean {
	return DEFAULT_PANE_ID_SET.has(id);
}
