import React, { useState, useCallback, useMemo } from "react";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";
import { formatPrice, formatVolume, formatChangeValue, formatPercent } from "../../utils/numberFormat";
import { type PaneDescriptor } from "../../../lib/core";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { formatSeriesDisplayName } from "../settings/helpers/seriesFormatters";
import { BarCountdownBadge } from "./BarCountdownBadge";
import styles from "./ChartStatusLine.module.css";

export interface ChartStatusLineProps {
	symbol: string;
	timeframe: string;
	hoveredDatum?: EnrichedDatum | null;
	lastDatum?: EnrichedDatum | null;
	isDark?: boolean;
	plotBounds?: { left: number; top: number; width: number; height: number };
	leftAxisWidth?: number;
	onSettingsClick?: () => void;
	onToggleSeriesVisibility?: (seriesId: string) => void;
	onRemoveIndicator?: (paneId: string, seriesId: string) => void;
	pane?: PaneDescriptor;
	showCountdown?: boolean;
	/**
	 * DECLUTTER_V4: compare legend node (same IndicatorLegend chips as the
	 * multichart pane header) rendered directly below the OHLC row, so the
	 * compare symbol never needs its own full-width strip above the chart.
	 */
	compareLegend?: React.ReactNode;
	/**
	 * SINGLE-OHLC: hide the main symbol+OHLC row (it duplicates the widget
	 * header OHLC cluster). Compare chips + indicator sub-rows stay and move
	 * up to the plot top, just under the chart header.
	 */
	hideMainRow?: boolean;
	/**
	 * `statusLine.showVolume`: ẩn/hiện số khối lượng trong dòng O/H/L/C.
	 * Mặc định `true` ⇒ không đổi hành vi cũ.
	 */
	showVolume?: boolean;
}

const STORAGE_KEY_COLLAPSED = "vnsc_statusline_collapsed";

export function resolveExchangeAndSymbol(rawSymbol: string): { exchange: string; cleanSymbol: string } {
	if (!rawSymbol) return { exchange: "VN", cleanSymbol: "" };
	if (rawSymbol.includes(":")) {
		const [ex, sym] = rawSymbol.split(":");
		return { exchange: ex.toUpperCase(), cleanSymbol: sym };
	}
	if (/^[A-Z]{3}$/.test(rawSymbol)) {
		return { exchange: "HOSE", cleanSymbol: rawSymbol };
	}
	if (rawSymbol.startsWith("BTC") || rawSymbol.startsWith("ETH") || rawSymbol.endsWith("USDT") || rawSymbol.endsWith("USD")) {
		return { exchange: "BYBIT", cleanSymbol: rawSymbol };
	}
	return { exchange: "MARKET", cleanSymbol: rawSymbol };
}

export const ChartStatusLine: React.FC<ChartStatusLineProps> = ({
	symbol,
	timeframe,
	hoveredDatum,
	lastDatum,
	isDark = true,
	plotBounds,
	leftAxisWidth = 0,
	onSettingsClick,
	onToggleSeriesVisibility,
	onRemoveIndicator,
	pane,
	showCountdown = true,
	compareLegend,
	hideMainRow = false,
	showVolume = true,
}) => {
	const { t } = useWidgetI18n();
	const [isCollapsed, setIsCollapsed] = useState(() => {
		try {
			if (typeof window !== "undefined" && window.localStorage) {
				return window.localStorage.getItem(STORAGE_KEY_COLLAPSED) === "true";
			}
		} catch {
			// ignore storage errors
		}
		return false;
	});

	const [isSeriesVisible, setIsSeriesVisible] = useState(true);

	const handleToggleCollapse = useCallback(() => {
		setIsCollapsed((prev) => {
			const next = !prev;
			try {
				if (typeof window !== "undefined" && window.localStorage) {
					window.localStorage.setItem(STORAGE_KEY_COLLAPSED, String(next));
				}
			} catch {
				// ignore
			}
			return next;
		});
	}, []);

	const handleToggleSeries = useCallback(() => {
		setIsSeriesVisible((prev) => {
			const next = !prev;
			onToggleSeriesVisibility?.("primary-series");
			return next;
		});
	}, [onToggleSeriesVisibility]);

	const datum = hoveredDatum ?? lastDatum;
	const { exchange, cleanSymbol } = useMemo(() => resolveExchangeAndSymbol(symbol), [symbol]);

	const ohlcData = useMemo(() => {
		if (!datum) return null;
		const open = typeof datum.open === "number" ? datum.open : 0;
		const high = typeof datum.high === "number" ? datum.high : 0;
		const low = typeof datum.low === "number" ? datum.low : 0;
		const close = typeof datum.close === "number" ? datum.close : 0;
		const volume = typeof datum.volume === "number" ? datum.volume : 0;

		const isBullish = close >= open;
		const diff = close - open;
		const pct = open !== 0 ? (diff / open) * 100 : 0;
		const changeFormatted = `${formatChangeValue(diff)} (${formatPercent(pct)})`;

		return {
			open: formatPrice(open),
			high: formatPrice(high),
			low: formatPrice(low),
			close: formatPrice(close),
			volume: formatVolume(volume),
			changeFormatted,
			isBullish,
		};
	}, [datum]);

	// Extract active non-candle indicators for this pane.
	// DECLUTTER_V3: Comparison overlays are excluded — the embedded legend chip
	// already shows them with change% + live value (multichart parity), so a
	// statusline sub-row would duplicate the same symbol on its own line.
	const indicatorSeries = useMemo(() => {
		if (!pane?.series) return [];
		return pane.series.filter((s) => {
			const type = s.type?.toLowerCase() || "";
			return (
				type !== "candlestick" &&
				type !== "candles" &&
				type !== "ohlc" &&
				type !== "line" &&
				type !== "area" &&
				type !== "hollowcandle" &&
				type !== "heikinashi" &&
				type !== "comparison"
			);
		});
	}, [pane?.series]);

	const topOffset = (plotBounds?.top ?? 0) + 8;
	const leftOffset = Math.max(8, (plotBounds?.left ?? leftAxisWidth) + 8);

	return (
		<div
			data-rsc-chart-status-line="true"
			className={styles.statusLineContainer}
			style={{
				top: topOffset,
				left: leftOffset,
			}}
		>
			{/* Main Symbol & OHLCV Bar (hidden in SINGLE-OHLC mode — header owns it) */}
			{!hideMainRow && (
				<div className={`${styles.statusRow} ${isDark ? styles.statusRowDark : styles.statusRowLight}`}>
					{/* Collapse/Expand chevron */}
					<button
						type="button"
						className={`${styles.collapseBtn} ${isCollapsed ? styles.collapseBtnCollapsed : ""}`}
						onClick={handleToggleCollapse}
						aria-label={isCollapsed ? t("statusLine.expand", { defaultValue: "Expand status line" }) : t("statusLine.collapse", { defaultValue: "Collapse status line" })}
						title={isCollapsed ? t("statusLine.expand", { defaultValue: "Expand" }) : t("statusLine.collapse", { defaultValue: "Collapse" })}
					>
						<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<polyline points="2.5 3.5 5 6 7.5 3.5" />
						</svg>
					</button>

					{/* Exchange & Symbol Badge */}
					<div className={styles.symbolBadge} data-testid="status-symbol-badge">
						<span className={styles.exchangeTag}>{exchange}</span>
						<span>{cleanSymbol || symbol}</span>
						<span className={styles.timeframeTag}>· {timeframe}</span>
					</div>

					{/* Hover Action buttons */}
					<div className={styles.actionsGroup}>
						<button
							type="button"
							className={styles.actionBtn}
							onClick={handleToggleSeries}
							aria-label={isSeriesVisible ? t("statusLine.hideSeries", { defaultValue: "Hide series" }) : t("statusLine.showSeries", { defaultValue: "Show series" })}
							title={isSeriesVisible ? t("statusLine.hideSeries", { defaultValue: "Hide series" }) : t("statusLine.showSeries", { defaultValue: "Show series" })}
						>
							{isSeriesVisible ? (
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
									<circle cx="12" cy="12" r="3" />
								</svg>
							) : (
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
									<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
									<line x1="1" y1="1" x2="23" y2="23" />
								</svg>
							)}
						</button>

						{onSettingsClick && (
							<button
								type="button"
								className={styles.actionBtn}
								onClick={onSettingsClick}
								aria-label={t("statusLine.settings", { defaultValue: "Settings" })}
								title={t("statusLine.settings", { defaultValue: "Settings" })}
							>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
									<circle cx="12" cy="12" r="3" />
									<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
								</svg>
							</button>
						)}
					</div>

					{/* OHLCV Values */}
					{ohlcData && (
						<div className={styles.ohlcValues} data-testid="status-ohlc-values">
							<span><span className={styles.label}>O</span><span className={ohlcData.isBullish ? styles.bullish : styles.bearish}>{ohlcData.open}</span></span>
							<span><span className={styles.label}>H</span><span className={ohlcData.isBullish ? styles.bullish : styles.bearish}>{ohlcData.high}</span></span>
							<span><span className={styles.label}>L</span><span className={ohlcData.isBullish ? styles.bullish : styles.bearish}>{ohlcData.low}</span></span>
							<span><span className={styles.label}>C</span><span className={ohlcData.isBullish ? styles.bullish : styles.bearish}>{ohlcData.close}</span></span>
							<span className={ohlcData.isBullish ? styles.bullish : styles.bearish}>{ohlcData.changeFormatted}</span>
							{showVolume && <span><span className={styles.label}>Vol</span><span>{ohlcData.volume}</span></span>}
						</div>
					)}

					{/* Bar Countdown Timer Badge */}
					{showCountdown && (
						<BarCountdownBadge timeframe={timeframe} isDark={isDark} />
					)}
				</div>
			)}

			{/* DECLUTTER_V4: compare chips below the OHLC row (multichart format).
		    SINGLE-OHLC: with the main row hidden these sit at the plot top. */}
			{compareLegend != null && (
				<div style={{ display: "flex", marginTop: "2px" }}>
					{compareLegend}
				</div>
			)}

			{/* Sub-rows for Active Indicators (hidden when collapsed) */}
			{!isCollapsed && indicatorSeries.length > 0 && (
				<div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
					{indicatorSeries.map((series, idx) => {
						// DECLUTTER_V2: Comparison rows show the overlay symbol (multichart
						// chip parity) — never the raw `compare-<id>` series id. Mirrors
						// IndicatorLegend's Comparison label branch.
						// BB-ALIAS: legacy "BollingerBands" series (stored id
						// `bollingerbands-<uuid>`) render under the canonical display name,
						// never the raw storage id.
						const seriesLabel = (series as any).title
					|| (series.type === "Comparison" ? String((series as any).overlaySymbolId ?? "Overlay") : undefined)
					|| formatSeriesDisplayName(series.type as any, (series as any).params, t as any)
					|| series.type?.toUpperCase() || `Ind ${idx + 1}`;
						return (
							<div
								key={series.id || `series-${idx}`}
								className={`${styles.indicatorRow} ${isDark ? styles.statusRowDark : styles.statusRowLight}`}
							>
								<span style={{ fontWeight: 600, color: isDark ? "#e2e8f0" : "#334155" }}>
									{seriesLabel}
								</span>
								<div className={styles.actionsGroup}>
									{onSettingsClick && (
										<button
											type="button"
											className={styles.actionBtn}
											onClick={onSettingsClick}
											aria-label={t("statusLine.settings") || "Settings"}
											title={t("statusLine.settings") || "Settings"}
										>
											<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
												<circle cx="12" cy="12" r="3" />
												<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
											</svg>
										</button>
									)}
									{onRemoveIndicator && (
										<button
											type="button"
											className={styles.actionBtn}
											onClick={() => onRemoveIndicator(pane?.id || "price", series.id || "")}
											aria-label={t("statusLine.remove") || "Remove"}
											title={t("statusLine.remove") || "Remove"}
										>
											<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
												<line x1="18" y1="6" x2="6" y2="18" />
												<line x1="6" y1="6" x2="18" y2="18" />
											</svg>
										</button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
};

