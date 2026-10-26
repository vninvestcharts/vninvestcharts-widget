import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { PremiumFeatureGate } from "../PremiumFeatureGate";
import { isClickOutside } from "../../utils/clickOutside";
import { CHART_TYPE_OPTIONS, isChartTypeComingSoon, isChartTypeLocked } from "../../utils/chartTypeOptions";
import { OHLCCluster } from "./OHLCCluster";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { IconSearch, IconCompare, IconReplay, IconSettings, IconBell, IconCamera, IconSave, IconFolderOpen, IconExpand, IconMenu, IconStar, IconDownload } from "../common/Icons";
import { REPLAY_SPEEDS } from "../../../lib/core/replay/BarReplayController";
import type { ReplayAnalyticsStats } from "../../../lib/core/replay/ReplaySessionAnalytics";
import type { CrosshairMode } from "@vninvestcharts/engine-core";
import styles from "../../styles/ohlc-header.module.css";

export interface OHLCHeaderProps {
	symbol?: string;
	timeframe?: string;

	// Chart type control
	chartType?: string;
	onChartTypeChange?: (chartType: string) => void;

	// Replay controls
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
	replayAwaitingStartBar?: boolean;
	showReplayBar?: boolean;
	onShowReplayBarChange?: (show: boolean) => void;
	replayInterval?: string;
	onReplayStartBarSelect?: (date: Date | number) => void;
	onReplayEnterSelectionMode?: () => void;
	onReplayCancelSelection?: () => void;
	onReplayIntervalChange?: (interval: string) => void;
	replayTotalPnl?: number;
	replayAnalytics?: ReplayAnalyticsStats;

	// Compare controls
	compareOpen?: boolean;
	onCompareToggle?: () => void;

	// P2: crosshair display mode (cross | dot | magnet). Hidden when no handler.
	crosshairMode?: CrosshairMode;
	onCrosshairModeChange?: (mode: CrosshairMode) => void;

	// Menu controls
	showMenu?: boolean;
	isFullscreen?: boolean;
	searchOpen?: boolean;
	onSearchToggle?: () => void;
	onSettingsClick?: () => void;
	onFullscreenClick?: () => void;
	onSnapshotClick?: () => void;
	onCsvExportClick?: () => void;
	onAlertsClick?: () => void;
	onSaveTemplate?: () => void;
	onLoadTemplate?: () => void;
	onSystemMenuOpen?: () => void;
	showLogo?: boolean;
	showOHLCV?: boolean;
	showTicker?: boolean;
	/**
	 * `statusLine.showVolume`: hiện volume trong cụm O/H/L/C. Ở surface single
	 * dòng status trong pane bị ẩn (SINGLE-OHLC) ⇒ đây là nơi DUY NHẤT hiện Vol.
	 * Mặc định `false` ⇒ không đổi hành vi các call site khác.
	 */
	showVolume?: boolean;
	/**
	 * AUTH-03: replay entitlement, resolved by the host widget from the same
	 * feature flag that gates the imperative replay API. Defaults to true so the
	 * header stays a pure presentational component that renders standalone.
	 */
	canUseReplay?: boolean;
	showBarChange?: boolean;
	ohlcData?: {
		open: number;
		high: number;
		low: number;
		close: number;
		volume?: number;
		change?: number;
		changePercent?: number;
	};
	onTimeframeChange?: (timeframe: string) => void;
	upgradeUrl?: string;
	quickTimeframes?: string[];
	isMobile?: boolean;
	/** Tier PAT đã xác minh — cổng cho chart type pro (`chart_baseline`/`chart_exotic`). */
	patTier?: string;
}

export function OHLCHeader({
	symbol,
	timeframe,
	chartType = "candlestick",
	onChartTypeChange,
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
	replayAwaitingStartBar = false,
	showReplayBar,
	onShowReplayBarChange,
	onReplayStartBarSelect,
	onReplayEnterSelectionMode,
	onReplayCancelSelection,
	replayInterval = "source",
	onReplayIntervalChange,
	replayTotalPnl,
	replayAnalytics,
	showMenu = true,
	isFullscreen = false,
	compareOpen = false,
	onCompareToggle,
	crosshairMode,
	onCrosshairModeChange,
	searchOpen = false,
	onSearchToggle,
	onSettingsClick,
	onFullscreenClick,
	onSnapshotClick,
	onCsvExportClick,
	onAlertsClick,
	onSaveTemplate,
	onLoadTemplate,
	onSystemMenuOpen,
	showLogo = false,
	showOHLCV = false,
	showTicker = true,
	showVolume = false,
	showBarChange = true,
	ohlcData,
	onTimeframeChange,
	upgradeUrl,
	quickTimeframes = ["1m", "5m", "15m", "1h", "1D"],
	isMobile = false,
	canUseReplay = true,
	patTier,
}: OHLCHeaderProps) {
	const { t } = useWidgetI18n();
	const [showChartTypeDropdown, setShowChartTypeDropdown] = useState(false);
	const [showReplay, setShowReplay] = useState(false);
	const [selectingStartBar, setSelectingStartBar] = useState(false);
	const [systemMenuOpen, setSystemMenuOpen] = useState(false);
	const chartTypeDropdownRef = useRef<HTMLDivElement>(null);
	// CLIP-FIX: the menu portals to document.body (fixed) — the header's
	// overflow-x:auto would clip an in-flow absolute menu (state toggled fine,
	// nothing visible => "dropdown doesn't work").
	const chartTypeBtnRef = useRef<HTMLButtonElement>(null);
	const chartTypeMenuRef = useRef<HTMLUListElement>(null);
	const [chartTypeMenuPos, setChartTypeMenuPos] = useState<{ top: number; left: number } | null>(null);

	const toggleChartTypeDropdown = useCallback(() => {
		setShowChartTypeDropdown((prev) => {
			if (!prev) {
				const r = chartTypeBtnRef.current?.getBoundingClientRect();
				if (r) {
					const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
					setChartTypeMenuPos({ top: r.bottom + 4, left: Math.max(0, Math.min(r.left, vw - 160)) });
				} else {
					setChartTypeMenuPos(null);
				}
			}
			return !prev;
		});
	}, []);

	const REPLAY_INTERVAL_OPTIONS = [
		{ value: "source", label: t("replay.interval.source") },
		{ value: "1s", label: t("replay.interval.1s"), disabled: true },
		{ value: "1m", label: t("replay.interval.1m"), disabled: true },
		{ value: "5m", label: t("replay.interval.5m"), disabled: true },
		{ value: "15m", label: t("replay.interval.15m"), disabled: true },
		{ value: "1h", label: t("replay.interval.1h"), disabled: true },
	];
	const systemMenuRef = useRef<HTMLDivElement>(null);

	// Controlled visibility: parent owns showReplayBar; header mirrors it + notifies parent.
	const setReplayVisible = useCallback((show: boolean) => {
		setShowReplay(show);
		onShowReplayBarChange?.(show);
	}, [onShowReplayBarChange]);

	// R1.2: dedicated enter-selection signal — no magic date=0 seek.
	const enterStartBarSelection = useCallback(() => {
		if (onReplayEnterSelectionMode) onReplayEnterSelectionMode();
		else onReplayStartBarSelect?.(0);
	}, [onReplayEnterSelectionMode, onReplayStartBarSelect]);

	// Reset header internal replay state when floating toolbar is closed externally
	// (parent sets showReplayBar true→false, e.g. toolbar × button or Escape).
	const prevShowReplayBarRef = useRef(showReplayBar);
	useEffect(() => {
		if (prevShowReplayBarRef.current === true && showReplayBar === false) {
			setShowReplay(false);
			setSelectingStartBar(false);
		}
		prevShowReplayBarRef.current = showReplayBar;
	}, [showReplayBar]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			// Portal menu lives outside the button wrap — check both refs.
			if (isClickOutside(chartTypeDropdownRef.current, event) && isClickOutside(chartTypeMenuRef.current, event)) {
				setShowChartTypeDropdown(false);
			}
			if (systemMenuOpen && systemMenuRef.current && !systemMenuRef.current.contains(event.target as Node)) {
				setSystemMenuOpen(false);
			}
		};
		// A fixed portal detaches from its anchor on scroll/resize — dismiss.
		const handleDismissMenu = () => setShowChartTypeDropdown(false);
		document.addEventListener("mousedown", handleClickOutside);
		window.addEventListener("scroll", handleDismissMenu, true);
		window.addEventListener("resize", handleDismissMenu);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			window.removeEventListener("scroll", handleDismissMenu, true);
			window.removeEventListener("resize", handleDismissMenu);
		};
	}, [systemMenuOpen]);

	// Hotkeys for replay controls (active only when replay bar is shown)
	useEffect(() => {
		if (!showReplay) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
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
				case "KeyR":
					e.preventDefault();
					onReplayStop?.();
					setShowReplay(false);
					break;
				case "Escape":
					e.preventDefault();
					if (selectingStartBar) {
						setSelectingStartBar(false);
					}
					onReplayCancelSelection?.();
					onReplayStop?.();
					setShowReplay(false);
					break;
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [showReplay, replayPlaying, onReplayPlay, onReplayPause, onReplayStop, onReplayStepBack, onReplayStepForward, selectingStartBar]);

	// Exit start-bar selection mode only when parent confirms (prop goes true→false)
	const prevAwaitingRef = useRef(replayAwaitingStartBar);
	useEffect(() => {
		if (prevAwaitingRef.current === true && replayAwaitingStartBar === false) {
			setSelectingStartBar(false);
		}
		prevAwaitingRef.current = replayAwaitingStartBar;
	}, [replayAwaitingStartBar]);

	const getChartTypeLabel = useCallback((value: string) => {
		const opt = CHART_TYPE_OPTIONS.find(ct => ct.value === value);
		if (!opt) return value;
		return t(opt.labelKey);
	}, [t]);

	const replayProgress = replayTotalBars > 0 ? (replayCurrentBar / replayTotalBars) * 100 : 0;

	if (isMobile) {
		return (
			<div
				className={styles.ohlcHeader}
				data-testid="ohlc-header"
			>
				{/* Left Section: Logo VNI + Symbol */}
				<div className={styles.leftGroup}>
					{showLogo && (
						<a href="https://vninvest.edusuccess.vn" target="_blank" rel="noopener noreferrer" className={styles.logoBadgeMobile} style={{ textDecoration: 'none' }}>
							VNI
						</a>
					)}
					{showTicker && (
						<strong className={styles.symbol}>
							{symbol ?? "—"}
						</strong>
					)}
					{timeframe && (
						<span className={styles.timeframeBadgeMobile} style={{ marginLeft: "6px", fontSize: "11px", color: "var(--vnsc-text-secondary, #94a3b8)", opacity: 0.8 }}>
							{timeframe}
						</span>
					)}
				</div>

				{/* Right Section: System Settings Button for Mobile */}
				<div className={styles.rightGroupMobile}>
					<div ref={systemMenuRef} className={styles.dropdownContainerMobile}>
						<button
							className={`${styles.selectorBtn} ${systemMenuOpen ? styles.selectorBtnOpen : ""}`}
							onClick={() => setSystemMenuOpen(!systemMenuOpen)}
							title={t("header.settings")}
							aria-label={t("header.settings")}
							style={{ width: "32px", height: "32px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
						>
							<IconSettings size={15} />
						</button>
						{systemMenuOpen && (
							<div className={`${styles.dropdownMenu} ${styles.dropdownMenuRight} ${styles.mobileChartSystemMenu}`}>
								{/* Timeframe Select inside menu */}
								{onTimeframeChange && (
									<div className={styles.menuSection} style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "4px 8px" }}>
										<div className={styles.menuSectionTitle} style={{ fontSize: "11px", fontWeight: "bold", color: "var(--vnsc-text-muted, #64748b)", textTransform: "uppercase", textAlign: "left" }}>
											{t("header.timeframe")}
										</div>
										<select
											value={timeframe}
											onChange={(e) => {
												onTimeframeChange?.(e.target.value);
												setSystemMenuOpen(false);
											}}
											className={styles.combobox}
											style={{ width: "100%", height: "30px", background: "var(--vnsc-bg-hover, rgba(255,255,255,0.05))", border: "1px solid var(--vnsc-border, rgba(148,163,184,0.18))", borderRadius: "6px", color: "var(--vnsc-text-primary, #e2e8f0)", outline: "none", cursor: "pointer" }}
										>
											{quickTimeframes.map(tf => (
												<option key={tf} value={tf}>{tf}</option>
											))}
										</select>
									</div>
								)}

								{/* Chart Type Select inside menu */}
								{onChartTypeChange && (
									<div className={styles.menuSection} style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "4px 8px" }}>
										<div className={styles.menuSectionTitle} style={{ fontSize: "11px", fontWeight: "bold", color: "var(--vnsc-text-muted, #64748b)", textTransform: "uppercase", textAlign: "left" }}>
											{t("header.chartType")}
										</div>
										<select
											value={chartType}
											data-testid="chart-type-select"
											onChange={(e) => {
												onChartTypeChange?.(e.target.value);
												setSystemMenuOpen(false);
											}}
											className={styles.combobox}
											style={{ width: "100%", height: "30px", background: "var(--vnsc-bg-hover, rgba(255,255,255,0.05))", border: "1px solid var(--vnsc-border, rgba(148,163,184,0.18))", borderRadius: "6px", color: "var(--vnsc-text-primary, #e2e8f0)", outline: "none", cursor: "pointer" }}
										>
											{CHART_TYPE_OPTIONS.map(ct => (
												<option key={ct.value} value={ct.value} disabled={isChartTypeLocked(ct, patTier)}>
													{t(ct.labelKey)}{isChartTypeComingSoon(ct) ? ` (${t("chartType.comingSoon")})` : ""}
												</option>
											))}
										</select>
									</div>
								)}

								<div style={{ borderTop: "1px solid var(--vnsc-border, rgba(148, 163, 184, 0.15))", margin: "6px 0" }} />

								{onSearchToggle && (
									<button className={styles.menuActionBtn} onClick={() => { onSearchToggle(); setSystemMenuOpen(false); }}>
										<IconSearch size={13} /> {t("mobile.searchSymbol")}
									</button>
								)}
								{onCompareToggle && (
									<button className={styles.menuActionBtn} onClick={() => { onCompareToggle(); setSystemMenuOpen(false); }}>
										<IconCompare size={13} /> {t("header.compare")}
									</button>
								)}
								<button
									className={`${styles.menuActionBtn} ${showReplay ? styles.active : ""} ${selectingStartBar ? styles.active : ""}`}
									onClick={() => {
										if (selectingStartBar) {
											setSelectingStartBar(false);
											setReplayVisible(false);
											onReplayCancelSelection?.();
											onReplayStop?.();
										} else if (!showReplay) {
											setReplayVisible(true);
											setSelectingStartBar(true);
											enterStartBarSelection();
										} else {
											setReplayVisible(false);
											onReplayCancelSelection?.();
											onReplayStop?.();
										}
										setSystemMenuOpen(false);
									}}
								>
									<IconReplay size={13} /> {t("replay.toggle")}
								</button>
								{onSettingsClick && (
									<button className={styles.menuActionBtn} onClick={() => { onSettingsClick(); setSystemMenuOpen(false); }}>
										<IconSettings size={13} /> {t("header.settings")}
									</button>
								)}
								{onAlertsClick && (
									<button className={styles.menuActionBtn} onClick={() => { onAlertsClick(); setSystemMenuOpen(false); }}>
										<IconBell size={13} /> {t("header.alerts")}
									</button>
								)}
								{onSnapshotClick && (
									<button className={styles.menuActionBtn} onClick={() => { onSnapshotClick(); setSystemMenuOpen(false); }}>
										<IconCamera size={13} /> {t("header.snapshot")}
									</button>
								)}
								{onCsvExportClick && (
									<button className={styles.menuActionBtn} onClick={() => { onCsvExportClick(); setSystemMenuOpen(false); }}>
										<IconDownload size={13} /> {t("header.csvExport")}
									</button>
								)}
								{onSaveTemplate && (
									<button className={styles.menuActionBtn} onClick={() => { onSaveTemplate(); setSystemMenuOpen(false); }}>
										<IconSave size={13} /> {t("header.saveTemplate")}
									</button>
								)}
								{onLoadTemplate && (
									<button className={styles.menuActionBtn} onClick={() => { onLoadTemplate(); setSystemMenuOpen(false); }}>
										<IconFolderOpen size={13} /> {t("header.loadTemplate")}
									</button>
								)}
								{onFullscreenClick && (
									<button className={styles.menuActionBtn} onClick={() => { onFullscreenClick(); setSystemMenuOpen(false); }}>
										<IconExpand size={13} /> {isFullscreen ? t("header.exitFullscreen") : t("header.fullscreen")}
									</button>
								)}
								{onSystemMenuOpen && (
									<button className={styles.menuActionBtn} onClick={() => { onSystemMenuOpen(); setSystemMenuOpen(false); }}>
										<IconMenu size={13} /> {t("mobile.systemMenu")}
									</button>
								)}
								{upgradeUrl && (
									<a
										href={upgradeUrl}
										target="_blank"
										rel="noopener noreferrer"
										className={styles.menuActionBtn}
										style={{ textDecoration: "none", color: "var(--vnsc-accent, #22d3ee)" }}
									>
										<IconStar size={12} /> {t("mobile.upgradePro")}
									</a>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			className={styles.ohlcHeader}
			data-testid="ohlc-header"
		>
			{/* Symbol + Timeframe + Chart Type */}
			<div className={styles.leftGroup}>
				{showLogo && (
					<a href="https://vninvest.edusuccess.vn" target="_blank" rel="noopener noreferrer" className={styles.logoBadge} style={{ textDecoration: 'none' }}>
						VNINVESTCHARTS
					</a>
				)}
				{showTicker && (
					<strong className={styles.symbol}>
						{symbol ?? "—"}
					</strong>
				)}
				{timeframe && (
					onTimeframeChange ? (
						<select
							value={timeframe}
							onChange={(e) => onTimeframeChange(e.target.value)}
							className={styles.selectorBtn}
							style={{ marginLeft: "6px", cursor: "pointer", fontSize: "11px", padding: "4px 6px" }}
							aria-label={t("header.timeframe")}
						>
							{quickTimeframes.map(tf => (
								<option key={tf} value={tf}>{tf}</option>
							))}
						</select>
					) : (
						<span className={styles.timeframe}>
							{timeframe}
						</span>
					)
				)}

				{/* Chart Type Dropdown */}
				<div className={styles.selectorGroup} ref={chartTypeDropdownRef}>
					<button
						type="button"
						ref={chartTypeBtnRef}
						data-testid="chart-type-btn"
						className={`${styles.selectorBtn} ${showChartTypeDropdown ? styles.selectorBtnOpen : ""}`}
						onClick={toggleChartTypeDropdown}
						aria-expanded={showChartTypeDropdown}
						aria-haspopup="listbox"
						title={t("header.chartType")}
					>
						{getChartTypeLabel(chartType)}
						<span className={styles.selectorArrow}>▼</span>
					</button>
					{showChartTypeDropdown && chartTypeMenuPos && typeof document !== "undefined" && createPortal(
						<ul ref={chartTypeMenuRef} className={`${styles.dropdown} ${styles.dropdownFloating}`} role="listbox" aria-label={t("header.chartTypeOptions")} style={{ top: chartTypeMenuPos.top, left: chartTypeMenuPos.left }}>
							{CHART_TYPE_OPTIONS.map(ct => {
								// Tier CHƯA biết (`patTier` vắng) ⇒ khoá, theo
								// `hasCapability(null, …) === false` — fail-closed.
								const locked = isChartTypeLocked(ct, patTier);
								const comingSoon = isChartTypeComingSoon(ct);
								return (
									<li
										key={ct.value}
										role="option" data-chart-type={ct.value}
										aria-selected={ct.value === chartType}
										aria-disabled={locked}
										data-coming-soon={comingSoon ? ct.value : undefined}
										data-locked={locked && !comingSoon ? ct.value : undefined}
										className={`${styles.dropdownItem} ${ct.value === chartType ? styles.dropdownItemSelected : ""} ${locked ? styles.dropdownItemDisabled : ""}`}
										onClick={(e) => {
											e.stopPropagation();
											if (locked) return;
											onChartTypeChange?.(ct.value);
											setShowChartTypeDropdown(false);
										}}
									>
										{t(ct.labelKey)}
										{comingSoon && <span className={styles.comingSoonBadge}>{t("chartType.comingSoon")}</span>}
										{locked && !comingSoon && <span className={styles.comingSoonBadge}>{t("chartType.proLocked")}</span>}
									</li>
								);
							})}
						</ul>,
						document.body
					)}
				</div>

				{/* OHLC Status Line cluster (tách sang OHLCCluster.tsx — giữ budget file fat) */}
				{showOHLCV && ohlcData && (
					<OHLCCluster ohlcData={ohlcData} showBarChange={showBarChange} showVolume={showVolume} />
				)}
			</div>

			{/* Compare Toggle (DECLUTTER_V1: icon-only — label lives in title/aria to keep one slim row) */}
			<div className={styles.replayControl}>
				<button
					type="button"
					className={`${styles.replayToggleBtn} ${compareOpen ? styles.replayToggleBtnActive : ""}`}
					onClick={onCompareToggle}
					title={t("header.compareTitle")}
					aria-label={`${t("header.compareTitle")} — ${t("header.compare")}`}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
						<line x1="12" y1="2" x2="12" y2="22" />
						<line x1="4" y1="8" x2="16" y2="8" />
						<line x1="8" y1="14" x2="20" y2="14" />
					</svg>
				</button>
			</div>

			{/* P2: Crosshair mode segmented control */}
			{onCrosshairModeChange && (
				<div className={styles.replayControl} role="group" aria-label={t("crosshair.mode.label")}>
					{([
						{ value: "cross", titleKey: "crosshair.mode.crossTitle", glyph: (
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
								<line x1="12" y1="2" x2="12" y2="22" />
								<line x1="2" y1="12" x2="22" y2="12" />
							</svg>
						) },
						{ value: "dot", titleKey: "crosshair.mode.dotTitle", glyph: (
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
								<circle cx="12" cy="12" r="5" />
							</svg>
						) },
						{ value: "magnet", titleKey: "crosshair.mode.magnetTitle", glyph: (
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M6 3v8a6 6 0 0 0 12 0V3" />
								<line x1="6" y1="3" x2="10" y2="3" />
								<line x1="14" y1="3" x2="18" y2="3" />
							</svg>
						) },
					] as const).map((option) => (
						<button
							key={option.value}
							type="button"
							className={`${styles.replayToggleBtn} ${crosshairMode === option.value ? styles.replayToggleBtnActive : ""}`}
							aria-pressed={crosshairMode === option.value}
							onClick={() => onCrosshairModeChange(option.value)}
							title={t(option.titleKey)}
							aria-label={t(option.titleKey)}
						>
							{option.glyph}
						</button>
					))}
				</div>
			)}

			{/* Replay Controls — toggle always visible, playback bar premium-gated */}
			<div className={styles.replayControl}>
				<button
					type="button"
					// AUTH-03: the toggle is discoverable for every tier but cannot
					// start replay without entitlement (same guard as the imperative API).
					disabled={!canUseReplay}
					aria-disabled={!canUseReplay}
					data-testid="replay-toggle"
					className={`${styles.replayToggleBtn} ${showReplay ? styles.replayToggleBtnActive : ""} ${selectingStartBar ? styles.replayToggleBtnSelecting : ""}`}
					onClick={() => {
						if (!canUseReplay) return;
						if (selectingStartBar) {
							setSelectingStartBar(false);
							setReplayVisible(false);
							onReplayCancelSelection?.();
							onReplayStop?.();
						} else if (!showReplay) {
							setReplayVisible(true);
							setSelectingStartBar(true);
							enterStartBarSelection();
						} else {
							setReplayVisible(false);
							onReplayCancelSelection?.();
							onReplayStop?.();
						}
					}}
					title={selectingStartBar ? t("replay.hintClickBar") : `${t("replay.mode")} — ${t("replay.toggle")}`}
					aria-label={`${t("replay.mode")} — ${t("replay.toggle")}`}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
						<circle cx="12" cy="12" r="10" />
						<polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
					</svg>
				</button>
				{selectingStartBar && !replayPlaying && (
					<span style={{
						marginLeft: "8px",
						fontSize: "11px",
						color: "var(--vnsc-accent, #22d3ee)",
						whiteSpace: "nowrap",
					}}>
						{t("replay.cutHint")}
					</span>
				)}
			</div>

			{/* Menu Action Items */}
			{showMenu && (
				<div className={styles.menu}>
					{/* Quick Search */}
					<button
						type="button"
						className={`${styles.menuBtn} ${searchOpen ? styles.menuBtnActive : ""}`}
						onClick={onSearchToggle}
						title={t("header.searchTitle")}
						aria-label={t("header.searchTitle")}
						data-testid="menu-search-btn"
					>
						<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<circle cx="7.5" cy="7.5" r="4.5" />
							<line x1="11" y1="11" x2="14" y2="14" />
							<path d="M8 4.5 L6.5 7.5 H8.5 L7.5 10.5 L9.5 7.5 H7.5 Z" />
						</svg>
					</button>

					{/* Settings */}
					<button
						type="button"
						className={styles.menuBtn}
						onClick={onSettingsClick}
						title={t("header.settingsTitle")}
						aria-label={t("header.settingsTitle")}
						data-testid="menu-settings-btn"
					>
						<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<polygon points="8,2 13.5,5 13.5,11 8,14 2.5,11 2.5,5" />
							<circle cx="8" cy="8" r="2.5" />
						</svg>
					</button>

					{/* Full Screen Mode */}
					<button
						type="button"
						className={`${styles.menuBtn} ${isFullscreen ? styles.menuBtnActive : ""}`}
						onClick={onFullscreenClick}
						title={t("header.fullscreenTitle")}
						aria-label={t("header.fullscreenTitle")}
						data-testid="menu-fullscreen-btn"
					>
						<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<path d="M3 6V3.5A.5.5 0 0 1 3.5 3H6" />
							<path d="M10 3h2.5a.5.5 0 0 1 .5.5V6" />
							<path d="M13 10v2.5a.5.5 0 0 1-.5.5H10" />
							<path d="M6 13H3.5a.5.5 0 0 1-.5-.5V10" />
						</svg>
					</button>

					{/* Export CSV — desktop toolbar.
					The system menu copy of this action only renders in the MOBILE dropdown
					(`dropdownContainerMobile`), so on desktop the feature was unreachable:
					verified by E2E — no CSV control existed in the DOM at desktop width.
					Snapshot already has a desktop toolbar button here, so CSV sits beside it. */}
					{onCsvExportClick && (
						<button
							type="button"
							className={styles.menuBtn}
							onClick={onCsvExportClick}
							title={t("header.csvExportTitle")}
							aria-label={t("header.csvExportTitle")}
							data-testid="menu-csv-btn"
						>
							<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M8 2v7" />
								<path d="M5 6.5 L8 9.5 L11 6.5" />
								<path d="M2.5 12.5h11" />
							</svg>
						</button>
					)}

					{/* Take a Snapshot */}
					<button
						type="button"
						className={styles.menuBtn}
						onClick={onSnapshotClick}
						title={t("header.snapshotTitle")}
						aria-label={t("header.snapshotTitle")}
						data-testid="menu-snapshot-btn"
					>
						<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<path d="M5 5.5 L6 3.5 H10 L11 5.5" />
							<rect x="2" y="5.5" width="12" height="8" rx="1.5" />
							<circle cx="8" cy="9.5" r="2" />
						</svg>
					</button>

					{/* Template Save */}
					{onSaveTemplate && (
						<button
							type="button"
							className={styles.menuBtn}
							onClick={onSaveTemplate}
							title={t("header.saveTemplateTitle")}
							aria-label={t("header.saveTemplateTitle")}
							data-testid="menu-save-template-btn"
						>
							<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M12 2 H4 A2 2 0 0 0 2 4 V12 A2 2 0 0 0 4 14 H12 A2 2 0 0 0 14 12 V4 A2 2 0 0 0 12 2 Z" />
								<rect x="5" y="2" width="6" height="4" />
								<rect x="4" y="9" width="8" height="5" />
							</svg>
						</button>
					)}

					{/* Template Load */}
					{onLoadTemplate && (
						<button
							type="button"
							className={styles.menuBtn}
							onClick={onLoadTemplate}
							title={t("header.loadTemplateTitle")}
							aria-label={t("header.loadTemplateTitle")}
							data-testid="menu-load-template-btn"
						>
							<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M2 10 V14 H14 V10" />
								<path d="M8 2 V10 M5 7 L8 10 L11 7" />
							</svg>
						</button>
					)}

					{/* Alerts Manager */}
					{onAlertsClick && (
						<button
							type="button"
							className={styles.menuBtn}
							onClick={onAlertsClick}
							title={t("header.alertsTitle")}
							aria-label={t("header.alertsTitle")}
							data-testid="menu-alerts-btn"
						>
							<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M8 2 C9.5 2 11 3.5 11 5 L11 9 C11 10.5 12 11 12 11.5 L4 11.5 C4 11 5 10.5 5 9 L5 5 C5 3.5 6.5 2 8 2 Z" />
								<path d="M7 13 A1 1 0 0 0 9 13" />
							</svg>
						</button>
					)}

					{/* System Menu */}
					{onSystemMenuOpen && (
						<button
							type="button"
							className={styles.menuBtn}
							onClick={onSystemMenuOpen}
							title={t("header.systemMenuTitle")}
							aria-label={t("header.systemMenuTitle")}
							data-testid="menu-system-btn"
						>
							<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<line x1="2" y1="4" x2="14" y2="4" />
								<line x1="2" y1="8" x2="14" y2="8" />
								<line x1="2" y1="12" x2="14" y2="12" />
							</svg>
						</button>
					)}

					{/* Upgrade Link */}
					{upgradeUrl && (
						<a
							href={upgradeUrl}
							target="_blank"
							rel="noopener noreferrer"
							className={styles.upgradeBtn}
							data-testid="header-upgrade-btn"
						>
							<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z"/>
							</svg>
							{t("header.upgradePro")}
						</a>
					)}
				</div>
			)}
		</div>
	);
}