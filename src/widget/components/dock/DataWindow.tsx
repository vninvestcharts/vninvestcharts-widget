/**
 * P4a: DataWindow — quick-win OHLCV + indicator readout (hovered ?? last bar).
 * Pure presentational; values come from EnrichedDatum (no new data plumbing).
 */
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { formatCustomDateWithTimezone } from "../../../lib/utils/timezoneFormatter";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";
import styles from "../../styles/right-sidebar-dock.module.css";

export interface DataWindowProps {
	symbol: string;
	timeframe: string;
	datum?: EnrichedDatum | null;
}

function formatNumber(value: number): string {
	if (!Number.isFinite(value)) return "—";
	const abs = Math.abs(value);
	if (abs !== 0 && (abs >= 100000 || abs < 0.01)) return value.toExponential(2);
	return value.toLocaleString("en-US", { maximumFractionDigits: abs < 10 ? 4 : 2 });
}

function firstFinite(value: unknown): number | null {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (value !== null && typeof value === "object") {
		for (const entry of Object.values(value as Record<string, unknown>)) {
			if (typeof entry === "number" && Number.isFinite(entry)) return entry;
		}
	}
	return null;
}

export function DataWindow({ symbol, timeframe, datum }: DataWindowProps) {
	const { t, locale } = useWidgetI18n();

	if (!datum) {
		return <div className={styles.dwEmpty}>{t("widget.noData")}</div>;
	}

	const change = datum.open !== 0 ? ((datum.close - datum.open) / Math.abs(datum.open)) * 100 : 0;
	const changeClass = change > 0 ? styles.dwUp : change < 0 ? styles.dwDown : undefined;
	// Route the timestamp through the timezone SSOT. Calling
	// `datum.date.toLocaleString(...)` here formatted in the *machine's*
	// zone, so with the widget set to a timezone other than the host's the dock
	// disagreed with the axis and tooltip on the same bar - measured as a
	// one-day drift, since the date part shifted before the clock did.
	//
	// locale still selects the order (vi dd/mm, en mm/dd); the SSOT only supplies
	// the numbers, under the widget's configured zone.
	const timeLabel =
		datum.date instanceof Date
			? formatCustomDateWithTimezone(
				datum.date,
				locale === "vi" ? "dd/mm/yyyy" : "mm/dd/yyyy",
				true,
			)
			: String(datum.date ?? "");
	const indicatorRows = Object.entries(datum.indicatorValues ?? {})
		.map(([key, value]) => ({ key, value: firstFinite(value) }))
		.filter((row): row is { key: string; value: number } => row.value !== null)
		.slice(0, 12);

	return (
		<div className={styles.dw}>
			<div className={styles.dwHead}>
				<span className={styles.dwSymbol}>{symbol} · {timeframe}</span>
				<span className={styles.dwTime}>{timeLabel}</span>
			</div>
			<div className={styles.dwRow}><span className={styles.dwLabel}>{t("datawindow.open")}</span><span className={styles.dwValue}>{formatNumber(datum.open)}</span></div>
			<div className={styles.dwRow}><span className={styles.dwLabel}>{t("datawindow.high")}</span><span className={styles.dwValue}>{formatNumber(datum.high)}</span></div>
			<div className={styles.dwRow}><span className={styles.dwLabel}>{t("datawindow.low")}</span><span className={styles.dwValue}>{formatNumber(datum.low)}</span></div>
			<div className={styles.dwRow}><span className={styles.dwLabel}>{t("datawindow.close")}</span><span className={styles.dwValue}>{formatNumber(datum.close)}</span></div>
			<div className={styles.dwRow}><span className={styles.dwLabel}>{t("datawindow.change")}</span><span className={`${styles.dwValue}${changeClass ? ` ${changeClass}` : ""}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span></div>
			<div className={styles.dwRow}><span className={styles.dwLabel}>{t("datawindow.volume")}</span><span className={styles.dwValue}>{formatNumber(datum.volume)}</span></div>
			{indicatorRows.length > 0 ? (
				<>
					<div className={styles.dwSection}>{t("dock.indicators")}</div>
					{indicatorRows.map((row) => (
						<div key={row.key} className={styles.dwRow}><span className={styles.dwLabel} title={row.key}>{row.key}</span><span className={styles.dwValue}>{formatNumber(row.value)}</span></div>
					))}
				</>
			) : null}
		</div>
	);
}
