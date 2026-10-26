import { useRef, useCallback, useEffect } from "react";
import { PremiumFeatureGate } from "../PremiumFeatureGate";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { REPLAY_SPEEDS } from "../../../lib/core/replay/BarReplayController";
import type { ReplayAnalyticsStats } from "../../../lib/core/replay/ReplaySessionAnalytics";
import styles from "./FloatingReplayToolbar.module.css";

export interface FloatingReplayToolbarProps {
	replayPlaying?: boolean;
	replaySpeed?: number;
	replayCurrentBar?: number;
	replayTotalBars?: number;
	onReplayPlay?: () => void;
	onReplayPause?: () => void;
	onReplayStop?: () => void;
	onReplayStepForward?: () => void;
	onReplayStepBack?: () => void;
	onReplayRewind?: () => void;
	onReplaySpeedChange?: (speed: number) => void;
	onReplaySeek?: (barIndex: number) => void;
	replayInterval?: string;
	onReplayIntervalChange?: (interval: string) => void;
	replayMode?: "single" | "all";
	onReplayModeChange?: (mode: "single" | "all") => void;
	replayTotalPnl?: number;
	replayAnalytics?: ReplayAnalyticsStats;
	onJumpToBar?: () => void;
	onClose?: () => void;
}

const REPLAY_INTERVAL_OPTIONS = [
	{ value: "source", labelKey: "replay.interval.source" },
	{ value: "1s", labelKey: "replay.interval.1s", disabled: true },
	{ value: "1m", labelKey: "replay.interval.1m", disabled: true },
	{ value: "5m", labelKey: "replay.interval.5m", disabled: true },
	{ value: "15m", labelKey: "replay.interval.15m", disabled: true },
	{ value: "1h", labelKey: "replay.interval.1h", disabled: true },
];

export function FloatingReplayToolbar({
	replayPlaying = false,
	replaySpeed = 1,
	replayCurrentBar = 0,
	replayTotalBars = 0,
	onReplayPlay,
	onReplayPause,
	onReplayStop,
	onReplayStepForward,
	onReplayStepBack,
	onReplayRewind,
	onReplaySpeedChange,
	onReplaySeek,
	replayInterval = "source",
	onReplayIntervalChange,
	replayMode = "all",
	onReplayModeChange,
	replayTotalPnl,
	replayAnalytics,
	onJumpToBar,
	onClose,
}: FloatingReplayToolbarProps) {
	const { t } = useWidgetI18n();
	const toolbarRef = useRef<HTMLDivElement>(null);
	const dragState = useRef<{ startX: number; startY: number; origLeft: number; origTop: number } | null>(null);

	const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		onReplaySeek?.(Number(e.target.value));
	}, [onReplaySeek]);

	const handleDragStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		const el = toolbarRef.current;
		if (!el) return;
		const parentRect = el.offsetParent?.getBoundingClientRect();
		const parentLeft = parentRect?.left ?? 0;
		const parentTop = parentRect?.top ?? 0;
		const rect = el.getBoundingClientRect();
		dragState.current = {
			startX: e.clientX,
			startY: e.clientY,
			origLeft: rect.left - parentLeft,
			origTop: rect.top - parentTop,
		};
		const handleMove = (ev: MouseEvent) => {
			if (!dragState.current) return;
			const dx = ev.clientX - dragState.current.startX;
			const dy = ev.clientY - dragState.current.startY;
			const newLeft = dragState.current.origLeft + dx;
			const newTop = dragState.current.origTop + dy;
			el.style.left = `${Math.max(0, newLeft)}px`;
			el.style.top = `${Math.max(0, newTop)}px`;
		};
		const handleUp = () => {
			dragState.current = null;
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
		};
		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleUp);
	}, []);

	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
			switch (e.code) {
				case "Space":
					e.preventDefault();
					if (replayPlaying) onReplayPause?.();
					else onReplayPlay?.();
					break;
				case "ArrowLeft":
					e.preventDefault();
					onReplayStepBack?.();
					break;
				case "ArrowRight":
					e.preventDefault();
					onReplayStepForward?.();
					break;
				case "Escape":
					e.preventDefault();
					onClose?.();
					break;
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [replayPlaying, onReplayPlay, onReplayPause, onReplayStepBack, onReplayStepForward, onClose]);

	return (
		<div ref={toolbarRef} className={styles.toolbar} style={{ left: 12, top: 38 }} onMouseDown={handleDragStart}>
			<PremiumFeatureGate feature="isReplayEnabled">
				{/* Transport controls */}
				<button type="button" className={styles.transportBtn} onClick={(e) => { e.stopPropagation(); onReplayRewind?.(); }} title={t("replay.rewind")}>
					<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2 L1 8 L8 14 Z M9 2 L15 8 L9 14 Z" /></svg>
				</button>
				<button type="button" className={styles.transportBtn} onClick={(e) => { e.stopPropagation(); onReplayStepBack?.(); }} title={t("replay.stepBack")}>
					<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M10 2 L3 8 L10 14 Z" /></svg>
				</button>
				<button
					type="button"
					className={`${styles.transportBtn} ${replayPlaying ? styles.transportBtnActive : ""}`}
					onClick={(e) => { e.stopPropagation(); replayPlaying ? onReplayPause?.() : onReplayPlay?.(); }}
					title={replayPlaying ? t("replay.pause") : t("replay.play")}
				>
					{replayPlaying
						? <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12" /><rect x="9" y="2" width="4" height="12" /></svg>
						: <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2 L14 8 L4 14 Z" /></svg>
					}
				</button>
				<button type="button" className={styles.transportBtn} onClick={(e) => { e.stopPropagation(); onReplayStop?.(); }} title={t("replay.stop")}>
					<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="1" /></svg>
				</button>
				<button type="button" className={styles.transportBtn} onClick={(e) => { e.stopPropagation(); onReplayStepForward?.(); }} title={t("replay.stepForward")}>
					<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M6 2 L13 8 L6 14 Z" /></svg>
				</button>

				<div className={styles.separator} />

				{/* Seek */}
				<input
					type="range"
					className={styles.slider}
					min={0}
					max={replayTotalBars}
					value={replayCurrentBar}
					onChange={handleSeek}
					onClick={(e) => e.stopPropagation()}
					onMouseDown={(e) => e.stopPropagation()}
					aria-label={t("replay.seek")}
				/>
				<span className={styles.progress}>{replayCurrentBar}/{replayTotalBars}</span>

				<div className={styles.separator} />

				{/* PnL */}
				{replayTotalPnl !== undefined && (
					<span className={styles.pnl} data-pnl-positive={replayTotalPnl >= 0}>
						{replayTotalPnl >= 0 ? "+" : ""}{replayTotalPnl.toFixed(2)}
					</span>
				)}

				{/* Speed */}
				<select
					className={styles.speedSelect}
					value={replaySpeed}
					onChange={(e) => { e.stopPropagation(); onReplaySpeedChange?.(Number(e.target.value)); }}
					onClick={(e) => e.stopPropagation()}
					onMouseDown={(e) => e.stopPropagation()}
					aria-label={t("replay.speedLabel")}
				>
					{REPLAY_SPEEDS.map(s => (
						<option key={s} value={s}>{s}{t("replay.speedUnit")}</option>
					))}
				</select>

				{/* Interval */}
				<select
					className={styles.speedSelect}
					value={replayInterval}
					onChange={(e) => { e.stopPropagation(); onReplayIntervalChange?.(e.target.value); }}
					onClick={(e) => e.stopPropagation()}
					onMouseDown={(e) => e.stopPropagation()}
					aria-label={t("replay.intervalLabel")}
					title={t("replay.interval")}
				>
					{REPLAY_INTERVAL_OPTIONS.map(opt => (
						<option key={opt.value} value={opt.value} disabled={opt.disabled}>
							{t(opt.labelKey)}
						</option>
					))}
				</select>

				{/* Replay scope: single chart vs all charts (R1-a) */}
				<select
					className={styles.speedSelect}
					value={replayMode}
					onChange={(e) => { e.stopPropagation(); onReplayModeChange?.(e.target.value as "single" | "all"); }}
					onClick={(e) => e.stopPropagation()}
					onMouseDown={(e) => e.stopPropagation()}
					aria-label={t("replay.modeLabel")}
					title={t("replay.modeLabel")}
				>
					<option value="single">{t("replay.mode.single")}</option>
					<option value="all">{t("replay.mode.all")}</option>
				</select>

				<div className={styles.separator} />

				{/* Jump to bar (re-enter cut selection) */}
				{onJumpToBar && (
					<button type="button" className={styles.transportBtn} onClick={(e) => { e.stopPropagation(); onJumpToBar?.(); }} title={t("replay.jumpToBar")} aria-label={t("replay.jumpToBar")}>
						<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<circle cx="7" cy="7" r="4.5" />
							<line x1="10.5" y1="10.5" x2="14" y2="14" />
							<line x1="7" y1="4.5" x2="7" y2="9.5" />
							<line x1="4.5" y1="7" x2="9.5" y2="7" />
						</svg>
					</button>
				)}

				{/* Close */}
				<button type="button" className={styles.closeBtn} onClick={(e) => { e.stopPropagation(); onClose?.(); }} title={t("replay.stop")}>
					×
				</button>
			</PremiumFeatureGate>
		</div>
	);
}
