/**
 * WE2 P2-04: TimeframeFooter
 *
 * Bottom bar with timeframe chips and range selectors.
 * Uses .vnsc- CSS prefix.
 */

import { useCallback, type ReactNode } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { Timeframe } from "../../../lib/types/adapter";
import { useBarCountdown, useNow, parseTimeframeIntervalMs } from "./useBarCountdown";
import styles from "../../styles/timeframe-footer.module.css";

export type ScaleMode = "auto" | "log" | "percent";

export interface TimeframeFooterProps {
	timeframe?: Timeframe;
	onTimeframeChange?: (tf: Timeframe) => void;
	range?: string;
	onRangeChange?: (range: string) => void;
	children?: ReactNode;
	/** Price scale mode (UI-only until engine log/percent lands in Phase 5b). */
	scaleMode?: ScaleMode;
	onScaleModeChange?: (mode: ScaleMode) => void;
	/** IANA timezone shown as badge (e.g. "Asia/Ho_Chi_Minh" -> "UTC+7"). */
	timezone?: string;
	showClock?: boolean;
	/** UI-AUDIT: trailing node inside the right cluster (e.g. shortcut hint). */
	trailingNode?: ReactNode;
}

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
	{ value: "1m", label: "1m" },
	{ value: "5m", label: "5m" },
	{ value: "15m", label: "15m" },
	{ value: "1h", label: "1h" },
	{ value: "4h", label: "4h" },
	{ value: "1D", label: "1D" },
	{ value: "1W", label: "1W" },
];

// UI-AUDIT: no "1D" here — it duplicates the 1D candle-resolution chip.
// (1-day views remain reachable via resolution 1D + scroll/zoom.)
const RANGES = ["5D", "1M", "3M", "YTD", "1Y", "All"];

export function TimeframeFooter({
	timeframe,
	onTimeframeChange,
	range,
	onRangeChange,
	children,
	scaleMode = "auto",
	onScaleModeChange,
	timezone,
	showClock = true,
	trailingNode,
}: TimeframeFooterProps) {
	const { t } = useWidgetI18n();
	const ticking = showClock || parseTimeframeIntervalMs(timeframe) !== null;
	const now = useNow(ticking);
	const clock = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
	const countdown = useBarCountdown(timeframe, now);

	const handleTimeframeClick = useCallback(
		(tf: Timeframe) => {
			onTimeframeChange?.(tf);
		},
		[onTimeframeChange],
	);

	const handleRangeClick = useCallback(
		(r: string) => {
			onRangeChange?.(r);
		},
		[onRangeChange],
	);

	return (
		<div
			className={styles.timeframeFooter}
			data-testid="timeframe-footer"
		>
			{/* Timeframe chips */}
			<div className={styles.timeframeChips}>
				<span className={styles.groupCaption}>{t("footer.timeframeGroup", { defaultValue: "Interval" })}</span>
				{TIMEFRAMES.map((tf) => {
					const isActive = timeframe === tf.value;
					return (
						<button
							key={tf.value}
							type="button"
							className={`${styles.tfChip} ${isActive ? styles.tfChipActive : ""}`}
							onClick={() => handleTimeframeClick(tf.value)}
							data-timeframe={tf.value}
						>
							{tf.label}
						</button>
					);
				})}
			</div>

			{/* Separator */}
			<div className={styles.separator} />

			{/* Range chips */}
			<div className={styles.rangeChips}>
				<span className={styles.groupCaption}>{t("footer.rangeGroup", { defaultValue: "Range" })}</span>
				{RANGES.map((r) => {
					const isActive = range === r;
					return (
						<button
							key={r}
							type="button"
							className={`${styles.rangeChip} ${isActive ? styles.rangeChipActive : ""}`}
							onClick={() => handleRangeClick(r)}
							data-range={r}
						>
							{t(`library.range.${r.toLowerCase()}`, { defaultValue: r })}
						</button>
					);
				})}
			</div>

			{children && (
				<div className={styles.footerChildren}>
					{children}
				</div>
			)}

			{/* Right controls: scale toggles + timezone + clock */}
			<div className={styles.rightCluster}>
				<div className={styles.scaleGroup} role="group" aria-label={t("footer.scale.group", { defaultValue: "Price scale" })}>
					{(["auto", "log", "percent"] as const).map((mode) => (
						<button
							key={mode}
							type="button"
							data-scale={mode}
							className={`${styles.scaleBtn} ${scaleMode === mode ? styles.scaleBtnActive : ""}`}
							aria-pressed={scaleMode === mode}
							onClick={() => onScaleModeChange?.(mode)}
						>
							{t(`footer.scale.${mode}`, { defaultValue: mode === "percent" ? "%" : mode === "log" ? "Log" : "Auto" })}
						</button>
					))}
				</div>
				{timezone ? (
					<span className={styles.tzBadge} title={timezone} aria-label={`${t("footer.timezone", { defaultValue: "Timezone" })}: ${timezone}`}>
						{shortTimezone(timezone)}
					</span>
				) : null}
				{showClock ? (
					<span className={styles.clockText} data-testid="footer-clock" aria-live="off">
						{clock}
					</span>
				) : null}
				{countdown ? (
					<span className={styles.countdownText} data-testid="footer-countdown" title={t("footer.countdown", { defaultValue: "Bar countdown" })} aria-label={t("footer.countdown", { defaultValue: "Bar countdown" })}>
						<span aria-hidden="true" className={styles.countdownGlyph}>◷</span>
						{countdown}
					</span>
				) : null}
				{trailingNode}
			</div>
		</div>
	);
}

const TIMEZONE_SHORT: Record<string, string> = {
	"Asia/Ho_Chi_Minh": "UTC+7",
	"Asia/Bangkok": "UTC+7",
	"Asia/Singapore": "UTC+8",
	"Asia/Tokyo": "UTC+9",
	UTC: "UTC",
};

function shortTimezone(timezone: string): string {
	return TIMEZONE_SHORT[timezone] ?? timezone;
}