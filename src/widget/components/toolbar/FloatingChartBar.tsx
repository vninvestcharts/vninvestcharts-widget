/**
 * FloatingChartBar — hover-revealed chart navigation bar (GoCharting style).
 *
 * Rendered as last child of `.rsc-engine-surface`; auto-hide handled by
 * `styles/floating-chart-bar.css`. All labels via `useWidgetI18n` (Rule 1).
 * Root stops click/mousedown/pointerdown/contextmenu/doubleclick propagation
 * so bar interaction never leaks into fork surface handlers (P3 drawings,
 * price-scale menu). Toggle button only renders in multi-chart cells.
 */

import type { ReactNode } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import styles from "../../styles/floating-chart-bar.module.css";

export interface FloatingChartBarProps {
	onZoomIn: () => void;
	onZoomOut: () => void;
	onPanLeft: () => void;
	onPanRight: () => void;
	onFitToData: () => void;
	onToggleLayout?: () => void;
	isSoloMode?: boolean;
	panDisabled?: boolean;
}

function BarIcon({ children }: { children: ReactNode }) {
	return (
		<svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			{children}
		</svg>
	);
}

export function FloatingChartBar(props: FloatingChartBarProps) {
	const { onZoomIn, onZoomOut, onPanLeft, onPanRight, onFitToData, onToggleLayout, isSoloMode, panDisabled } = props;
	const { t } = useWidgetI18n();
	return (
		<div
			className={`vnsc-floating-bar ${styles.bar}`}
			role="toolbar"
			aria-label={t("chart.nav.toolbarLabel")}
			onClick={(e) => e.stopPropagation()}
			onMouseDown={(e) => e.stopPropagation()}
			onPointerDown={(e) => e.stopPropagation()}
			onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
			onDoubleClick={(e) => e.stopPropagation()}
		>
			<span className={styles.grip} data-testid="floating-bar-grip" aria-hidden="true">
				<BarIcon><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></BarIcon>
			</span>
			<button type="button" className={styles.btn} data-testid="floating-bar-pan-left" aria-label={t("chart.nav.panLeft")} disabled={panDisabled} onClick={onPanLeft}>
				<BarIcon><path d="M15 18l-6-6 6-6" /></BarIcon>
			</button>
			<button type="button" className={styles.btn} data-testid="floating-bar-zoom-out" aria-label={t("toolbar.utility.zoomOut")} onClick={onZoomOut}>
				<BarIcon><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6" /></BarIcon>
			</button>
			<button type="button" className={styles.btn} data-testid="floating-bar-fit" aria-label={t("chart.nav.fitToData")} onClick={onFitToData}>
				<BarIcon><path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" /></BarIcon>
			</button>
			<button type="button" className={styles.btn} data-testid="floating-bar-zoom-in" aria-label={t("toolbar.utility.zoomIn")} onClick={onZoomIn}>
				<BarIcon><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></BarIcon>
			</button>
			<button type="button" className={styles.btn} data-testid="floating-bar-pan-right" aria-label={t("chart.nav.panRight")} disabled={panDisabled} onClick={onPanRight}>
				<BarIcon><path d="M9 18l6-6-6-6" /></BarIcon>
			</button>
			{onToggleLayout !== undefined && (
				<>
					<span className={styles.separator} aria-hidden="true" />
					<button type="button" className={`${styles.btn}${isSoloMode ? ` ${styles.btnActive}` : ""}`} data-testid="floating-bar-toggle-layout" aria-label={t(isSoloMode ? "chart.nav.restoreGrid" : "chart.nav.toggleSolo")} aria-pressed={isSoloMode} onClick={onToggleLayout}>
						{isSoloMode ? (
							<BarIcon><rect x="4" y="4" width="16" height="16" rx="2" /></BarIcon>
						) : (
							<BarIcon><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></BarIcon>
						)}
					</button>
				</>
			)}
		</div>
	);
}
