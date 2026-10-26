import { useWidgetI18n } from "../../context/WidgetI18nContext";

export interface ChartA11ySummaryProps {
	/**
	 * DOM id, referenced by the chart root's `aria-describedby`.
	 *
	 * MUST be unique per chart instance: a shared id yields duplicate ids in a
	 * multi-chart workspace and every `aria-describedby` then resolves to the
	 * first match in document order, so the wrong chart is announced.
	 */
	id: string;
	symbol: string;
	timeframe: string;
	/** Latest OHLC of the active series, when known. */
	ohlc?: { open: number; high: number; low: number; close: number } | null;
	/** Number of bars currently loaded. */
	barCount: number;
	/** Visible (viewport) range in bar indices, when known. */
	visibleRange?: { from: number; to: number } | null;
	/** Human-readable status, e.g. "loading" or an error message. */
	status?: string;
}

const fmt = (value: number): string =>
	Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 8 }) : "—";

/**
 * UX-03 — DOM alternative for the canvas chart.
 *
 * The engine renders to a bare `<canvas>`, which screen readers cannot read.
 * This region exposes the same essential facts as text, and is linked to the
 * chart container via `aria-describedby` so it is announced on focus without
 * interrupting pointer interaction.
 *
 * It is visually hidden (not `display:none`, which would remove it from the
 * accessibility tree) and polite, so data ticks do not spam a screen reader.
 */
export function ChartA11ySummary({
	id,
	symbol,
	timeframe,
	ohlc,
	barCount,
	visibleRange,
	status,
}: ChartA11ySummaryProps) {
	const { t } = useWidgetI18n();

	const parts: string[] = [];
	parts.push(`${t("a11y.chart.symbol", { defaultValue: "Symbol" })}: ${symbol || "—"}`);
	parts.push(`${t("a11y.chart.timeframe", { defaultValue: "Timeframe" })}: ${timeframe || "—"}`);
	if (ohlc) {
		parts.push(
			`${t("a11y.chart.ohlc", { defaultValue: "OHLC" })}: ${fmt(ohlc.open)} / ${fmt(ohlc.high)} / ${fmt(ohlc.low)} / ${fmt(ohlc.close)}`
		);
	}
	parts.push(`${t("a11y.chart.bars", { defaultValue: "Bars" })}: ${barCount}`);
	if (visibleRange) {
		parts.push(
			`${t("a11y.chart.visibleRange", { defaultValue: "Visible range" })}: ${visibleRange.from}–${visibleRange.to}`
		);
	}
	if (status) {
		parts.push(`${t("a11y.chart.status", { defaultValue: "Status" })}: ${status}`);
	}

	return (
		<p
			id={id}
			data-testid="chart-a11y-summary"
			// The rendered text above is LOCALIZED (`a11y.chart.bars` is "Bars" in en,
			// "Số nến" in vi), so any gate that scrapes this text for a bar count silently
			// stops proving anything the moment the locale changes - it becomes a green gate
			// that measured nothing. This attribute carries the SAME number as a plain
			// integer, so a harness can assert `barCount > 0` without knowing the language,
			// and it cannot be a placeholder string the way a non-empty textContent can.
			data-bar-count={barCount}
			// Politeness matters: live price ticks would otherwise flood a screen
			// reader on every websocket update.
			aria-live="polite"
			aria-atomic="true"
			style={{
				position: "absolute",
				width: "1px",
				height: "1px",
				margin: "-1px",
				padding: 0,
				overflow: "hidden",
				clip: "rect(0 0 0 0)",
				clipPath: "inset(50%)",
				whiteSpace: "nowrap",
				border: 0,
			}}
		>
			{parts.join(" · ")}
		</p>
	);
}
