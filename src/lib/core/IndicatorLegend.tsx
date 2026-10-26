import type { CSSProperties, ReactNode } from "react";
import type { PaneDescriptor, SeriesTypeId } from "./types/pane-descriptor";

export interface IndicatorLegendProps {
	pane: PaneDescriptor;
	onToggleSeries: (seriesType: SeriesTypeId, seriesIndex?: number) => void;
	onRemoveSeries: (seriesType: SeriesTypeId, seriesIndex?: number) => void;
	/** Optional: open per-series settings (gear button). Omitted = no gear button. */
	onEditSeries?: (seriesType: SeriesTypeId, seriesIndex?: number) => void;
	/** Optional vector glyphs (widget layer passes Icons.tsx). Defaults preserve legacy glyphs. */
	icons?: {
		eye?: ReactNode;
		eyeOff?: ReactNode;
		edit?: ReactNode;
		remove?: ReactNode;
	};
	className?: string;
	style?: CSSProperties;
	labels?: {
		seriesLabel?: (seriesType: SeriesTypeId, params?: Record<string, unknown>) => string;
		showIndicatorTitle?: string;
		hideIndicatorTitle?: string;
		removeIndicatorTitle?: string;
		editIndicatorTitle?: string;
		showIndicatorAriaLabel?: (seriesLabel: string) => string;
		hideIndicatorAriaLabel?: (seriesLabel: string) => string;
		removeIndicatorAriaLabel?: (seriesLabel: string) => string;
		editIndicatorAriaLabel?: (seriesLabel: string) => string;
	};
	/** Per-series suffix appended after the label (e.g. "+2.34%"). Indexed by position in pane.series. */
	seriesSuffix?: (seriesIndex: number) => string | undefined;
	/** UI-P3: live value shown after the label (e.g. "204.22K"). Indexed by position in pane.series. */
	seriesValue?: (seriesType: SeriesTypeId, seriesIndex: number) => { text: string; color?: string } | undefined;
	/** When true, render inline inside the pane header row (rsc-pane-header__legend) instead of the separate below-header row. */
	embedded?: boolean;
	/**
	 * DECLUTTER_V4: render-only series filter. `visibleTypes` allowlists and
	 * `hiddenTypes` denylists chip rendering WITHOUT touching `pane.series`,
	 * so `seriesSuffix`/`seriesValue` indices (position in pane.series) stay
	 * exact. Used to relocate compare chips between header and statusline.
	 */
	visibleTypes?: readonly string[];
	hiddenTypes?: readonly string[];
}

// Abbreviated labels for each series type (shown in pane header chips)
const SERIES_LABELS: Partial<Record<SeriesTypeId, string>> = {
	Candlestick: "Candle",
	HollowCandle: "Hollow",
	OHLC: "OHLC",
	HeikinAshi: "HA",
	Line: "Line",
	Area: "Area",
	EMA: "EMA",
	BollingerBand: "BB",
	Volume: "Vol",
	Whale: "Whale",
	CVDApprox: "CVD",
	CVDRealtime: "CVD Real",
	RSI: "RSI",
	MACD: "MACD",
	StrengthElder: "Elder",
	StrengthRelative: "RelStr",
	KDJ: "KDJ",
	CCI: "CCI",
	DMI: "DMI",
	BIAS: "BIAS",
	BRAR: "BRAR",
	MTM: "MTM",
	EMV: "EMV",
	AO: "AO",
	ROC: "ROC",
	TRIX: "TRIX",
	DMA: "DMA",
	PVT: "PVT",
	PSY: "PSY",
	CR: "CR",
};

function paramNumber(params: Record<string, unknown> | undefined, key: string, fallback: number): number {
	const value = params?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function seriesLabel(type: SeriesTypeId, params?: Record<string, unknown>): string {
	// Legacy alias: BollingerBands (plural) renders exactly like BollingerBand.
	const canonical = (type === "BollingerBands" ? "BollingerBand" : type) as SeriesTypeId;
	const base = SERIES_LABELS[canonical] ?? SERIES_LABELS[type] ?? type;
	type = canonical;
	if (type === "EMA") return `${base} (${paramNumber(params, "period", 20)})`;
	if (type === "RSI") return `${base} (${paramNumber(params, "period", 14)})`;
	if (type === "BollingerBand") return `${base} (${paramNumber(params, "period", 20)},${paramNumber(params, "stdDev", 2)})`;
	if (type === "MACD") return `${base} (${paramNumber(params, "fast", 12)},${paramNumber(params, "slow", 26)},${paramNumber(params, "signal", 9)})`;
	if (type === "KDJ") return `${base} (${paramNumber(params, "period", 9)},${paramNumber(params, "m1", 3)},${paramNumber(params, "m2", 3)})`;
	if (type === "CCI") return `${base} (${paramNumber(params, "period", 20)})`;
	if (type === "DMI") return `${base} (${paramNumber(params, "period", 14)})`;
	if (type === "BIAS") return `${base} (${paramNumber(params, "period", 6)})`;
	if (type === "BRAR") return `${base} (${paramNumber(params, "period", 26)})`;
	if (type === "MTM") return `${base} (${paramNumber(params, "period", 6)})`;
	if (type === "EMV") return `${base} (${paramNumber(params, "period", 14)})`;
	if (type === "ROC") return `${base} (${paramNumber(params, "period", 12)})`;
	if (type === "TRIX") return `${base} (${paramNumber(params, "period", 12)})`;
	if (type === "DMA") return `${base} (${paramNumber(params, "fastPeriod", 10)},${paramNumber(params, "slowPeriod", 50)})`;
	if (type === "PSY") return `${base} (${paramNumber(params, "period", 12)})`;
	if (type === "CR") return `${base} (${paramNumber(params, "period", 26)})`;
	if (type === "Whale") return `${base} (${paramNumber(params, "threshold", 50_000)})`;
	return base;
}

// Price-chart primary series: shown in the chip strip only for non-pinned panes.
// For the pinned (price) pane, price type chips are hidden since chart type is
// controlled separately by the chart type button in the topbar.
const PRIMARY_CHART_TYPES: SeriesTypeId[] = [
	"Candlestick", "HollowCandle", "OHLC", "HeikinAshi", "Line", "Area",
];

export function IndicatorLegend({ pane, onToggleSeries, onRemoveSeries, onEditSeries, icons, className, style, labels, seriesSuffix, seriesValue, embedded, visibleTypes, hiddenTypes }: IndicatorLegendProps) {
	// For the price pane: exclude primary chart types (controlled by topbar chart type picker)
	// For other panes: show all series
	const chips = pane.pinned
		? pane.series.filter((s) => !PRIMARY_CHART_TYPES.includes(s.type))
		: pane.series;

	// DECLUTTER_V4: render-only filter — indices below still come from the
	// full pane.series, so suffix/value mapping cannot shift.
	const shown = chips.filter((s) => {
		const type = String(s.type);
		if (visibleTypes && !visibleTypes.includes(type)) return false;
		if (hiddenTypes?.includes(type)) return false;
		return true;
	});

	if (shown.length === 0) return null;

	return (
		<div className={`${embedded ? "rsc-pane-header__legend" : "rsc-indicator-legend"}${className ? ` ${className} ` : ""}`} style={embedded ? undefined : style}>
			{shown.map((series) => {
				const seriesIndex = pane.series.indexOf(series);
				const hidden = series.visible === false;
				const shortLabel = labels?.seriesLabel?.(series.type, series.params)
					?? (series.type === "Comparison" ? String(series.overlaySymbolId ?? "Overlay") : undefined)
					?? seriesLabel(series.type, series.params);
				const suffix = seriesSuffix?.(seriesIndex);
				const liveValue = seriesValue?.(series.type, seriesIndex);
				const chipStyle = series.color
					? ({ "--chip-color": series.color } as CSSProperties)
					: undefined;

				return (
					<div
						key={`${series.type}-${seriesIndex}`}
						className={`rsc-indicator-chip${hidden ? " rsc-indicator-chip--hidden" : ""}`}
						style={chipStyle}
					>
						<span className="rsc-indicator-chip__dot" aria-hidden="true" />
						<span className="rsc-indicator-chip__name">
							{shortLabel}
							{suffix !== undefined ? <span className="rsc-indicator-chip__suffix">{suffix}</span> : null}
							{liveValue !== undefined ? (
								<span
									className="rsc-indicator-chip__value"
									style={liveValue.color ? { color: liveValue.color } : undefined}
								>
									{liveValue.text}
								</span>
							) : null}
						</span>
						<button
							type="button"
							className="rsc-indicator-chip__btn rsc-indicator-chip__btn--eye"
							onClick={() => onToggleSeries(series.type, seriesIndex)}
							title={hidden ? labels?.showIndicatorTitle ?? "Hiện indicator" : labels?.hideIndicatorTitle ?? "Ẩn indicator"}
							aria-label={hidden ? labels?.showIndicatorAriaLabel?.(shortLabel) ?? `Hiện ${series.type}` : labels?.hideIndicatorAriaLabel?.(shortLabel) ?? `Ẩn ${series.type}`}
							aria-pressed={!hidden}
						>
							{hidden ? (icons?.eyeOff ?? "◌") : (icons?.eye ?? "👁")}
						</button>
						{onEditSeries ? (
							<button
								type="button"
								className="rsc-indicator-chip__btn rsc-indicator-chip__btn--edit"
								onClick={() => onEditSeries(series.type, seriesIndex)}
								title={labels?.editIndicatorTitle ?? "Cài đặt indicator"}
								aria-label={labels?.editIndicatorAriaLabel?.(shortLabel) ?? `Cài đặt ${series.type}`}
							>
								{icons?.edit ?? "⚙"}
							</button>
						) : null}
						<button
							type="button"
							className="rsc-indicator-chip__btn rsc-indicator-chip__btn--remove"
							onClick={() => onRemoveSeries(series.type, seriesIndex)}
							title={labels?.removeIndicatorTitle ?? "Xóa indicator khỏi pane này"}
							aria-label={labels?.removeIndicatorAriaLabel?.(shortLabel) ?? `Xóa ${series.type}`}
						>
							{icons?.remove ?? "×"}
						</button>
					</div>
				);
			})}
		</div>
	);
}
