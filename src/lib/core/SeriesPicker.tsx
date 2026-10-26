import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject, ChangeEvent } from "react";
import { getSeries, listRegistered } from "./registry/SeriesRegistry";
import type { PaneDescriptor, SeriesConfig, SeriesTypeId } from "./types/pane-descriptor";

export interface SeriesPickerProps {
	pane: PaneDescriptor;
	onAddSeries: (series: SeriesConfig) => void;
	onRemoveSeries: (type: SeriesTypeId) => void;
	anchorRef: RefObject<HTMLButtonElement | null>;
	onClose?: () => void;
}

interface PositionState {
	top: number;
	left: number;
}

const SERIES_LABELS: Partial<Record<SeriesTypeId, string>> = {
	Candlestick: "Candlestick",
	HollowCandle: "Hollow Candle",
	OHLC: "OHLC Bar",
	HeikinAshi: "Heikin-Ashi",
	Line: "Line",
	Area: "Area",
	EMA: "Exponential Moving Average",
	BollingerBand: "Bollinger Bands",
	Volume: "Volume",
	Whale: "Whale Orders",
	CVDApprox: "Cumulative Volume Delta",
	CVDRealtime: "Real-time Cumulative Volume Delta",
	RSI: "Relative Strength Index",
	MACD: "Moving Average Convergence Divergence",
	StrengthElder: "Elder Ray Index",
	StrengthRelative: "Relative Strength",
	MA: "Moving Average",
	BBI: "Bull and Bear Index",
	SAR: "Parabolic SAR",
	OBV: "On Balance Volume",
	WR: "Williams %R",
	VR: "Volume Ratio",
	KDJ: "Stochastic KDJ",
	CCI: "Commodity Channel Index",
	DMI: "Directional Movement Index",
	BIAS: "Bias Ratio",
	BRAR: "Bull Bear Ratio",
	MTM: "Momentum",
	EMV: "Ease of Movement",
	AO: "Awesome Oscillator",
	ROC: "Rate of Change",
	TRIX: "Triple Exponential Moving Average",
	DMA: "Differential Moving Average",
	PVT: "Price Volume Trend",
	PSY: "Psychological Line",
	CR: "CR Indicator",
};

function paramNumber(params: Record<string, unknown> | undefined, key: string, fallback: number): number {
	const value = params?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatSeriesLabel(type: SeriesTypeId, params?: Record<string, unknown>): string {
	const base = SERIES_LABELS[type] ?? type;
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

function buildDefaultSeries(type: SeriesTypeId): SeriesConfig {
	const entry = getSeries(type);
	return {
		type,
		params: { ...entry.defaultParams },
		yAxis: entry.defaultYAxis,
	};
}

export function SeriesPicker({ pane, onAddSeries, onRemoveSeries, anchorRef, onClose }: SeriesPickerProps) {
	const [position, setPosition] = useState<PositionState>({ top: 0, left: 0 });
	const [search, setSearch] = useState("");
	const pickerRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);

	const allSeriesTypes = useMemo(() => listRegistered(), []);

	const filteredTypes = useMemo(() => {
		const q = search.toLowerCase().trim();
		if (!q) return allSeriesTypes;
		return allSeriesTypes.filter((type) => {
			const label = (SERIES_LABELS[type] ?? type).toLowerCase();
			return label.includes(q) || type.toLowerCase().includes(q);
		});
	}, [allSeriesTypes, search]);

	useEffect(() => {
		const updatePosition = () => {
			const anchor = anchorRef.current;
			if (!anchor) {
				return;
			}
			const container = anchor.closest(".rsc-pane-wrap") as HTMLElement | null;
			const anchorRect = anchor.getBoundingClientRect();
			const containerRect = container?.getBoundingClientRect();
			const pickerW = pickerRef.current?.offsetWidth ?? 340;
			const anchorRight = containerRect ? anchorRect.right - containerRect.left : anchorRect.right;
			const anchorLeft = containerRect ? anchorRect.left - containerRect.left : anchorRect.left;
			let left = anchorRight - pickerW;
			if (left < 8) {
				left = anchorLeft;
			}
			if (containerRect && containerRect.left + left + pickerW + 8 > window.innerWidth) {
				left = Math.max(8, window.innerWidth - containerRect.left - pickerW - 8);
			}
			if (containerRect && containerRect.left + left < 8) {
				left = 8 - containerRect.left;
			}
			setPosition({
				top: containerRect ? anchorRect.bottom - containerRect.top + 6 : anchorRect.bottom + 6,
				left,
			});
		};

		updatePosition();
		window.addEventListener("resize", updatePosition);
		window.addEventListener("scroll", updatePosition, true);
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose?.();
			}
		};
		const handleMouseDown = (event: MouseEvent) => {
			const target = event.target as Node;
			const anchor = anchorRef.current;
			const picker = pickerRef.current;
			const clickInsidePicker = Boolean(picker?.contains(target));
			const clickInsideAnchor = Boolean(anchor?.contains(target));
			if (!clickInsidePicker && !clickInsideAnchor) {
				onClose?.();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		document.addEventListener("mousedown", handleMouseDown);
		inputRef.current?.focus();
		return () => {
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", updatePosition, true);
			document.removeEventListener("keydown", handleKeyDown);
			document.removeEventListener("mousedown", handleMouseDown);
		};
	}, [anchorRef, onClose]);

	return (
		<div ref={pickerRef} className="rsc-series-picker" style={{ top: position.top, left: position.left }} role="dialog" aria-label="Series picker">
			<div className="rsc-series-picker__search">
				<input
					ref={inputRef}
					className="rsc-series-picker__search-input"
					type="text"
					placeholder="Tìm chỉ báo..."
					value={search}
					onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
				/>
			</div>
			<ul className="rsc-series-picker__list">
				{filteredTypes.length === 0 && (
					<li className="rsc-series-picker__empty">Không tìm thấy chỉ báo</li>
				)}
				{filteredTypes.map((type) => {
					const active = pane.series.some((series) => series.type === type);
					return (
						<li key={type}>
							<button
								type="button"
								className={`rsc-series-picker__item${active ? " rsc-series-picker__item--active" : ""}`}
								onClick={() => {
									if (active) {
										onRemoveSeries(type);
									} else {
										onAddSeries(buildDefaultSeries(type));
									}
								}}
								aria-pressed={active}
							>
								<span className="rsc-series-picker__label">{formatSeriesLabel(type, getSeries(type).defaultParams)}</span>
								<span className="rsc-series-picker__check">{active ? "✓" : ""}</span>
							</button>
						</li>
					);
				})}
			</ul>
			<div className="rsc-series-picker__footer">Nhấn Esc để đóng. Chạm lại vào một mục để xóa series.</div>
		</div>
	);
}
