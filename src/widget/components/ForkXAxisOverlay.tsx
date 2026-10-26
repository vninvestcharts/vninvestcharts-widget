import { type ForkXAxisTick, type ForkXAxisHoverLabel } from "../utils/widgetHelpers";
import styles from "../styles/fork-overlays.module.css";

export interface ForkXAxisOverlayProps {
	ticks: readonly ForkXAxisTick[];
	hoverLabel?: ForkXAxisHoverLabel;
	top: number;
	isDark: boolean;
	showHoverLabel?: boolean;
	/** Container width for edge clamping (grid cells are narrower than window). */
	width?: number;
}

export function ForkXAxisOverlay({
	ticks,
	hoverLabel,
	top,
	isDark,
	showHoverLabel = true,
	width,
}: ForkXAxisOverlayProps) {
	if (ticks.length === 0 && !hoverLabel) {
		return null;
	}
	// Hide ticks near hover label to avoid overlap (TradingView behavior)
	const visibleTicks = hoverLabel && showHoverLabel
		? ticks.filter((tick) => Math.abs(tick.x - hoverLabel.x) > 60)
		: ticks;

	return (
		<div className={styles.forkXAxisOverlay}>
			{hoverLabel && showHoverLabel ? (
				<div className={styles.forkXAxisHoverLabel} style={{ left: hoverLabel.x, top }}>
					<div className={styles.forkXAxisHoverLine} style={{ background: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }} />
					<div className={styles.forkXAxisHoverLabelText} data-rsc-fork-x-axis="hover-label" style={{ background: isDark ? '#1f2937' : '#ffffff', color: isDark ? '#d1d4dc' : '#0f172a', border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0'}` }}>
						{hoverLabel.label}
					</div>
				</div>
			) : null}
			{visibleTicks.map((tick) => {
			// Prevent truncation at edges: clamp label transform for first/last ticks.
			// Width is the chart container (not window) so grid cells clamp correctly.
				const viewWidth = width ?? (typeof window !== "undefined" ? window.innerWidth : 0);
				const isNearLeft = tick.x < 40;
				const isNearRight = viewWidth > 0 && tick.x > viewWidth - 60;
				const style: React.CSSProperties = { left: tick.x, top };
				// Edge ticks use 0% or -100% translate instead of -50% to stay visible
				let tickClass = styles.forkXAxisTick;
				if (isNearLeft) tickClass += ` ${styles.forkXAxisTickLeftEdge}`;
				if (isNearRight) tickClass += ` ${styles.forkXAxisTickRightEdge}`;
				return (
					<div key={tick.key} className={tickClass} style={style}>
						<div className={styles.forkXAxisTickLine} style={{ background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' }} />
						<div className={styles.forkXAxisTickLabel} data-rsc-fork-x-axis="label" style={{ color: isDark ? '#787b86' : '#475569', fontWeight: 400, fontSize: 12 }}>
							{tick.label}
						</div>
					</div>
				);
			})}
		</div>
	);
}