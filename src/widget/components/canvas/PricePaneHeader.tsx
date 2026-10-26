import React, { useCallback, useEffect, useRef, useState } from "react";
import type { PaneDescriptor, SeriesTypeId } from "../../../lib/core/types/pane-descriptor";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";
import { useHoverSubscription, type HoverEmitter } from "../../context/HoverEmitter";
import { resolveExchangeAndSymbol } from "./ChartStatusLine";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { formatPrice, formatVolume, formatChangeValue, formatPercent } from "../../utils/numberFormat";
import { useFeatureGate } from "../../hooks/useFeatureGate";
import styles from "./PricePaneHeader.module.css";

export interface PricePaneHeaderProps {
	pane: PaneDescriptor;
	symbol: string;
	timeframe: string;
	chartId: string;
	isActive?: boolean;
	symbolLinkGroup?: string | null;
	hoverEmitterRef: React.RefObject<HoverEmitter | null>;
	actions: {
		toggleVisibility: () => void;
		removePane: () => void;
		addSeries: () => void;
		toggleSeries: (seriesType: SeriesTypeId, seriesIndex?: number) => void;
		removeSeries: (seriesType: SeriesTypeId, seriesIndex?: number) => void;
	};
	onSettingsClick?: () => void;
	onSymbolSearchClick?: () => void;
	children?: React.ReactNode;
	/**
	 * UIUX_STATUSLINE_MULTI: 4 cờ `statusLine` (ngữ nghĩa mirror `OHLCHeader`:
	 * `showTicker` ⇒ ẩn mã · `showOHLC` ⇒ ẩn O/H/L/C **kèm** % (trong `OHLCHeader` % nằm trong cụm OHLC)
	 * · `showBarChange` ⇒ ẩn % · `showVolume` ⇒ ẩn `Vol:`). Mặc định `true` ⇒ không đổi hành vi cũ.
	 */
	showTicker?: boolean;
	showOHLC?: boolean;
	showBarChange?: boolean;
	showVolume?: boolean;
}

const GROUP_COLORS: Record<string, string> = {
	A: "#3b82f6",
	B: "#10b981",
	C: "#f59e0b",
	D: "#ef4444",
};

export const PricePaneHeader: React.FC<PricePaneHeaderProps> = ({
	pane,
	symbol,
	timeframe,
	chartId,
	isActive,
	symbolLinkGroup,
	hoverEmitterRef,
	actions,
	onSettingsClick,
	onSymbolSearchClick,
	children,
	showTicker = true,
	showOHLC = true,
	showBarChange = true,
	showVolume = true,
}) => {
	const [lastDatum, setLastDatum] = useState<EnrichedDatum | undefined>(undefined);
	const [hovered, setHovered] = useState(false);
	const { flags } = useFeatureGate();
	const { t } = useWidgetI18n();

	useHoverSubscription(hoverEmitterRef, useCallback((payload) => {
		const { datum } = payload;
		setLastDatum(datum ?? undefined);
	}, []));

	// UI-A: self-measured density (GridContainer renders this outside
	// ChartRenderContext, so context width cannot be assumed here).
	const rootRef = useRef<HTMLDivElement | null>(null);
	const [headerWidth, setHeaderWidth] = useState<number>(600);
	useEffect(() => {
		const el = rootRef.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const rect = el.getBoundingClientRect();
		if (rect.width > 0) setHeaderWidth(rect.width);
		const ro = new ResizeObserver((entries) => {
			const w = entries[0]?.contentRect.width;
			if (typeof w === "number" && Number.isFinite(w)) setHeaderWidth(w);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const density: "full" | "compact" | "minimal" =
		headerWidth >= 750 ? "full" : headerWidth >= 340 ? "compact" : "minimal";

	const handleSettingsClick = useCallback(() => {
		if (onSettingsClick) {
			onSettingsClick();
		}
	}, [onSettingsClick]);

	const handleSymbolClick = useCallback(() => {
		onSymbolSearchClick?.();
	}, [onSymbolSearchClick]);

	// Q1: international financial format (shared with Y-axis crosshair labels).
	const changeText = lastDatum
		? (() => {
			const diff = lastDatum.close - lastDatum.open;
			const pct = lastDatum.open !== 0 ? (diff / lastDatum.open) * 100 : 0;
			return { text: `${formatChangeValue(diff)} (${formatPercent(pct)})`, positive: diff >= 0 };
		})()
		: null;
	// V-03: single direction-based OHLC coloring (D3) — by-field 4-color removed.
	const isBullish = lastDatum ? lastDatum.close >= lastDatum.open : true;
	// UI-A: density-aware legend — never ellipsis-truncate financial figures.
	// full: prefixed O/H/L/C · compact: bare numbers · minimal: close only.
	const ohlc = lastDatum
		? {
			open: formatPrice(lastDatum.open),
			high: formatPrice(lastDatum.high),
			low: formatPrice(lastDatum.low),
			close: formatPrice(lastDatum.close),
		}
		: null;

	const volText = lastDatum ? `Vol:${formatVolume(lastDatum.volume)}` : "";

	return (
		<div
			ref={rootRef}
			className={`${styles.header} ${isActive === false ? styles.headerInactive : ""}`}
			data-density={density}
			// UIUX_MULTI_CELL_HEADER: testid ổn để probe assert "mỗi ô có đúng 1 hàng toolbar"
			// (dải header thừa đã bỏ ⇒ đây là nơi DUY NHẤT hiện mã + O/H/L/C của ô).
			data-testid="price-pane-header"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			{showTicker && (
				<>
					<button className={`${styles.symbol} ${isActive === false ? styles.symbolInactive : styles.symbolActive}`} onClick={handleSymbolClick} title={t("pricePaneHeader.searchSymbol", { defaultValue: "Click to search symbol" })}>
						{symbol}
					</button>
					<span className={styles.exchangeTag}>{resolveExchangeAndSymbol(symbol).exchange}</span>
				</>
			)}
			{symbolLinkGroup && (
				<span
					className={styles.groupBadge}
					style={{ background: GROUP_COLORS[symbolLinkGroup] ?? "#6b7280" }}
					title={t("pricePaneHeader.linkGroup", {
						defaultValue: "Symbol link group {group}",
						group: String(symbolLinkGroup),
					})}
				>
					{symbolLinkGroup}
				</span>
			)}
			<span className={styles.timeframePill}>{timeframe}</span>
			{/* HOVER_FIX: OHLC stays mounted on hover (TradingView standard).
			A previous revision swapped the readout for hover-only toolbar
			`children`, but no production consumer passes children — hovering
			just wiped every figure, leaving a bare symbol row. */}
			<div className={styles.ohlcGroup}>
				{ohlc && showOHLC && density === "full" && (
					<>
						<span className={`${styles.ohlcItem} ${isBullish ? styles.ohlcBull : styles.ohlcBear}`}><span className={styles.ohlcLabel}>O:</span>{ohlc.open}</span>
						<span className={`${styles.ohlcItem} ${isBullish ? styles.ohlcBull : styles.ohlcBear}`}><span className={styles.ohlcLabel}>H:</span>{ohlc.high}</span>
						<span className={`${styles.ohlcItem} ${isBullish ? styles.ohlcBull : styles.ohlcBear}`}><span className={styles.ohlcLabel}>L:</span>{ohlc.low}</span>
						<span className={`${styles.ohlcItem} ${isBullish ? styles.ohlcBull : styles.ohlcBear}`}><span className={styles.ohlcLabel}>C:</span>{ohlc.close}</span>
					</>
				)}
				{ohlc && showOHLC && density === "compact" && (
					<>
						<span className={`${styles.ohlcItem} ${isBullish ? styles.ohlcBull : styles.ohlcBear}`}><span className={styles.ohlcLabel}>O</span>{ohlc.open}</span>
						<span className={`${styles.ohlcItem} ${isBullish ? styles.ohlcBull : styles.ohlcBear}`}><span className={styles.ohlcLabel}>H</span>{ohlc.high}</span>
						<span className={`${styles.ohlcItem} ${isBullish ? styles.ohlcBull : styles.ohlcBear}`}><span className={styles.ohlcLabel}>L</span>{ohlc.low}</span>
						<span className={`${styles.ohlcItem} ${isBullish ? styles.ohlcBull : styles.ohlcBear}`}><span className={styles.ohlcLabel}>C</span>{ohlc.close}</span>
					</>
				)}
				{ohlc && showOHLC && density === "minimal" && (
					<span className={`${styles.ohlcItem} ${isBullish ? styles.ohlcBull : styles.ohlcBear}`}><span className={styles.ohlcLabel}>C:</span>{ohlc.close}</span>
				)}
				{showOHLC && showBarChange && changeText && (
					<span className={styles.change} style={{ color: changeText.positive ? "var(--vnsc-up, #0ecb81)" : "var(--vnsc-down, #f23645)" }}>
						{changeText.text}
					</span>
				)}
				{density !== "minimal" && showVolume && volText && <span className={styles.volume}>{volText}</span>}
			</div>
			{children && (
				<div style={{ display: hovered ? "flex" : "none", flex: "1 1 auto", minWidth: 0, overflow: "hidden", alignItems: "center" }}>
					{children}
				</div>
			)}
			<div className={styles.spacer} />
			<button className={styles.settingsBtn} onClick={handleSettingsClick} title={t("pricePaneHeader.chartSettings", { defaultValue: "Chart settings" })} aria-label={t("pricePaneHeader.chartSettings", { defaultValue: "Chart settings" })}>
				⚙
			</button>
			<a className={styles.trademark} href="https://vninvest.edusuccess.vn" target="_blank" rel="noopener noreferrer" title="VNInvest">
				<span className={styles.trademarkIcon}>⚡</span>
				vninvest
			</a>
		</div>
	);
};

export default PricePaneHeader;
