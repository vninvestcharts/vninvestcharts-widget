import { useState, useCallback, useEffect, useRef } from "react";
import type { ChartLayout } from "../../VNInvestMultiCharts";
import { VNSymbolSearch } from "../search/VNSymbolSearch";
import { CHART_TYPE_OPTIONS, isChartTypeLocked } from "../../utils/chartTypeOptions";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { IconLayoutGrid, IconClock, IconSync, IconSave, IconPlus, IconSun, IconMoon, IconCompare, IconReplay } from "../common/Icons";
import styles from "./MultiChartTopbar.module.css";

export interface MultiChartTopbarProps {
	layout: ChartLayout;
	onLayoutChange: (layout: ChartLayout) => void;
	activeChartId: string | null;
	activeSymbol?: string;
	activeTimeframe?: string;
	onSymbolChange: (symbol: string) => void;
	onTimeframeChange: (timeframe: string) => void;
	syncSettings: {
		visibleRange: boolean;
		crosshair: boolean;
		drawings: boolean;
		symbolLinks: boolean;
		timeframe: boolean;
		chartType: boolean;
		replay: boolean;
	};
	onSyncChange: (key: string, value: boolean) => void;
	onSaveWorkspace?: () => void;
	onAddChart?: () => void;
	onThemeToggle?: () => void;
	isDark?: boolean;
	isMobile?: boolean;
	/** Mobile-only: search toggle */
	onSearchToggle?: () => void;
	/** Mobile-only: fullscreen toggle */
	onFullscreenClick?: () => void;
	isFullscreen?: boolean;
	/** Mobile-only: snapshot click */
	onSnapshotClick?: () => void;
	/** Mobile-only: chart type */
	chartType?: string;
	onChartTypeChange?: (chartType: string) => void;
	/** Mobile-only: compare toggle */
	compareOpen?: boolean;
	onCompareToggle?: () => void;
	/** Mobile-only: replay */
	replayPlaying?: boolean;
	onReplayPlay?: () => void;
	onReplayPause?: () => void;
	/** System menu trigger (mobile) */
	onSystemMenuOpen?: () => void;
	/** Tier PAT đã xác minh — cổng cho chart type pro. Vắng ⇒ khoá (fail-closed). */
	patTier?: string;
}

export function MultiChartTopbar({
	layout,
	onLayoutChange,
	activeChartId,
	activeSymbol = "",
	activeTimeframe = "",
	onSymbolChange,
	onTimeframeChange,
	syncSettings,
	onSyncChange,
	onSaveWorkspace,
	onAddChart,
	onThemeToggle,
	isDark = true,
	isMobile = false,
	onSearchToggle,
	onFullscreenClick,
	isFullscreen = false,
	onSnapshotClick,
	chartType,
	onChartTypeChange,
	compareOpen = false,
	onCompareToggle,
	replayPlaying = false,
	onReplayPlay,
	onReplayPause,
	patTier,
}: MultiChartTopbarProps) {
	const { t } = useWidgetI18n();

	// Dropdown states
	const [layoutOpen, setLayoutOpen] = useState(false);
	const [timeframeOpen, setTimeframeOpen] = useState(false);
	const [syncOpen, setSyncOpen] = useState(false);
	const [systemMenuOpen, setSystemMenuOpen] = useState(false);

	const layoutRef = useRef<HTMLDivElement>(null);
	const tfRef = useRef<HTMLDivElement>(null);
	const syncRef = useRef<HTMLDivElement>(null);
	const systemMenuRef = useRef<HTMLDivElement>(null);

	// Close dropdowns on click outside
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			const target = e.target as Node;
			if (layoutOpen && layoutRef.current && !layoutRef.current.contains(target)) {
				setLayoutOpen(false);
			}
			if (timeframeOpen && tfRef.current && !tfRef.current.contains(target)) {
				setTimeframeOpen(false);
			}
			if (syncOpen && syncRef.current && !syncRef.current.contains(target)) {
				setSyncOpen(false);
			}
			if (systemMenuOpen && systemMenuRef.current && !systemMenuRef.current.contains(target)) {
				setSystemMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [layoutOpen, timeframeOpen, syncOpen, systemMenuOpen]);

	const gridTemplates = [
		{ rows: 1, cols: 1, label: "1x1" },
		{ rows: 1, cols: 2, label: "1x2" },
		{ rows: 2, cols: 1, label: "2x1" },
		{ rows: 2, cols: 2, label: "2x2" },
		{ rows: 1, cols: 3, label: "1x3" },
		{ rows: 3, cols: 1, label: "3x1" },
	];

	const timeframes = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];

	const syncOptions: { key: keyof typeof syncSettings; label: string }[] = [
		{ key: "visibleRange", label: t("header.sync.visibleRange") || "Visible Range" },
		{ key: "crosshair", label: t("header.sync.crosshair") || "Crosshair" },
		{ key: "drawings", label: t("header.sync.drawings") || "Drawings" },
		{ key: "symbolLinks", label: t("header.sync.symbolLinks") || "Symbol Links" },
		{ key: "timeframe", label: t("header.sync.timeframe") || "Timeframe" },
		{ key: "chartType", label: t("header.sync.chartType") || "Chart Type" },
		{ key: "replay", label: t("header.sync.replay") || "Replay Sync" },
	];

	if (isMobile) {
		return (
			<header className={styles.topbar}>
				<div className={styles.leftSection}>
					<a href="https://vninvest.edusuccess.vn" target="_blank" rel="noopener noreferrer" className={styles.titleMobile} style={{ textDecoration: 'none' }}>VNI</a>
					{activeChartId ? (
						<div className={styles.mobileActiveInfo}>
							<span className={styles.mobileSymbol}>{activeSymbol}</span>
							<span className={styles.mobileTimeframe}>{activeTimeframe}</span>
						</div>
					) : null}
				</div>

				<div className={styles.rightSection}>
					{/* Search */}
					<button
						type="button"
						className={`${styles.btn} ${styles.iconBtn}`}
						onClick={onSearchToggle}
						title={t("header.searchTitle")}
						aria-label={t("header.searchTitle")}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<circle cx="7.5" cy="7.5" r="4.5" />
							<line x1="11" y1="11" x2="14" y2="14" />
						</svg>
					</button>

					{/* Fullscreen */}
					<button
						type="button"
						className={`${styles.btn} ${styles.iconBtn}`}
						onClick={onFullscreenClick}
						title={t("header.fullscreenTitle")}
						aria-label={t("header.fullscreenTitle")}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<path d="M3 6V3.5A.5.5 0 0 1 3.5 3H6" />
							<path d="M10 3h2.5a.5.5 0 0 1 .5.5V6" />
							<path d="M13 10v2.5a.5.5 0 0 1-.5.5H10" />
							<path d="M6 13H3.5a.5.5 0 0 1-.5-.5V10" />
						</svg>
					</button>

					{/* Snapshot */}
					<button
						type="button"
						className={`${styles.btn} ${styles.iconBtn}`}
						onClick={onSnapshotClick}
						title={t("header.snapshotTitle")}
						aria-label={t("header.snapshotTitle")}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<path d="M5 5.5 L6 3.5 H10 L11 5.5" />
							<rect x="2" y="5.5" width="12" height="8" rx="1.5" />
							<circle cx="8" cy="9.5" r="2" />
						</svg>
					</button>

					{/* System Menu (☰) */}
					<div ref={systemMenuRef} className={styles.dropdown}>
						<button
							type="button"
							className={`${styles.btn} ${styles.iconBtn} ${systemMenuOpen ? styles.btnActive : ""}`}
							onClick={() => setSystemMenuOpen(!systemMenuOpen)}
							title={t("mobile.systemMenu")}
							aria-label={t("mobile.systemMenu")}
						>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<line x1="2" y1="4" x2="14" y2="4" />
								<line x1="2" y1="8" x2="14" y2="8" />
								<line x1="2" y1="12" x2="14" y2="12" />
							</svg>
						</button>
						{systemMenuOpen && (
							<div className={`${styles.dropdownMenu} ${styles.dropdownMenuRight} ${styles.mobileSystemMenu}`}>
								{/* Timeframe */}
								<div className={styles.menuSection}>
									<div className={styles.menuSectionTitle}>{t("mobile.timeframe")}</div>
									<div className={styles.timeframeGridMobile}>
										{timeframes.map((tf) => (
											<button
												key={tf}
												type="button"
												className={`${styles.timeframeChip} ${activeTimeframe === tf ? styles.timeframeChipActive : ""}`}
												onClick={() => { onTimeframeChange(tf); setSystemMenuOpen(false); }}
											>
												{tf}
											</button>
										))}
									</div>
								</div>

								{/* Chart type */}
								{onChartTypeChange && (
									<div className={styles.menuSection}>
										<div className={styles.menuSectionTitle}>{t("mobile.chartType") || "Chart Type"}</div>
										<select
											value={chartType}
											onChange={(e) => { onChartTypeChange(e.target.value); setSystemMenuOpen(false); }}
											className={styles.mobileSelect}
										>
											{CHART_TYPE_OPTIONS.map((ct) => (
												<option key={ct.value} value={ct.value} disabled={isChartTypeLocked(ct, patTier)}>
													{t(ct.labelKey)}{ct.comingSoon ? ` (${t("chartType.comingSoon")})` : ""}
												</option>
											))}
										</select>
									</div>
								)}

								{/* Compare toggle */}
								{onCompareToggle && (
									<button
										type="button"
										className={`${styles.menuActionBtn} ${compareOpen ? styles.menuActionBtnActive : ""}`}
										onClick={() => { onCompareToggle(); setSystemMenuOpen(false); }}
									>
										<IconCompare size={13} /> {compareOpen ? (t("mobile.closeCompare") || "Close Compare") : (t("mobile.compare") || "Compare")}
									</button>
								)}

								{/* Replay toggle */}
								{onReplayPlay && (
									<button
										type="button"
										className={`${styles.menuActionBtn} ${replayPlaying ? styles.menuActionBtnActive : ""}`}
										onClick={() => {
											if (replayPlaying) { onReplayPause?.(); } else { onReplayPlay(); }
											setSystemMenuOpen(false);
										}}
									>
										<IconReplay size={13} /> {replayPlaying ? (t("mobile.pauseReplay") || "Pause Replay") : (t("mobile.replay") || "Replay")}
									</button>
								)}

								<div className={styles.menuDivider} />

								{/* Grid Presets */}
								<div className={styles.menuSection}>
									<div className={styles.menuSectionTitle}>{t("mobile.layout") || "Layout"}</div>
									<div className={styles.gridSelectorCompact}>
										{gridTemplates.map((tmpl) => {
											const isActive = layout.rows === tmpl.rows && layout.cols === tmpl.cols;
											return (
												<button
													key={tmpl.label}
													type="button"
													className={`${styles.gridItemCompact} ${isActive ? styles.gridItemActive : ""}`}
													onClick={() => {
														onLayoutChange({ rows: tmpl.rows, cols: tmpl.cols });
														setSystemMenuOpen(false);
													}}
												>
													{tmpl.label}
												</button>
											);
										})}
									</div>
								</div>

								{/* Sync Options */}
								<div className={styles.menuSection}>
									<div className={styles.menuSectionTitle}>{t("mobile.sync") || "Sync"}</div>
									<div className={styles.syncOptionsCompact}>
										{syncOptions.map((opt) => (
											<label key={opt.key} className={styles.syncOption}>
												<input
													type="checkbox"
													checked={syncSettings[opt.key]}
													onChange={(e) => onSyncChange(opt.key, e.target.checked)}
												/>
												<span>{opt.label}</span>
											</label>
										))}
									</div>
								</div>

								<div className={styles.menuDivider} />

								{/* Workspace actions */}
								<div className={styles.menuActions}>
									{onSaveWorkspace && (
										<button type="button" className={styles.menuActionBtn} onClick={() => { onSaveWorkspace(); setSystemMenuOpen(false); }}>
											<IconSave size={13} /> {t("mobile.saveWorkspace") || "Save"}
										</button>
									)}
									{onAddChart && (
										<button type="button" className={styles.menuActionBtn} onClick={() => { onAddChart(); setSystemMenuOpen(false); }}>
											<IconPlus size={13} /> {t("mobile.addChart") || "Add Chart"}
										</button>
									)}
									{onThemeToggle && (
										<button type="button" className={styles.menuActionBtn} onClick={() => { onThemeToggle(); setSystemMenuOpen(false); }}>
											{isDark ? <IconSun size={13} /> : <IconMoon size={13} />} {isDark ? (t("theme.light") || "Light") : (t("theme.dark") || "Dark")}
										</button>
									)}
								</div>
							</div>
						)}
					</div>
				</div>
			</header>
		);
	}

	return (
		<header className={styles.topbar}>
			<div className={styles.leftSection}>
				<a href="https://vninvest.edusuccess.vn" target="_blank" rel="noopener noreferrer" className={styles.title} style={{ textDecoration: 'none' }}>VNInvest Multi-Charts</a>

				<div className={styles.divider} />

				{/* Layout Grid Selector */}
				<div ref={layoutRef} className={styles.dropdown}>
					<button
						className={`${styles.btn} ${layoutOpen ? styles.btnActive : ""}`}
						onClick={() => setLayoutOpen(!layoutOpen)}
						title={t("topbar.layoutTitle")}
					>
						<IconLayoutGrid size={14} /> {layout.rows}x{layout.cols}
					</button>
					{layoutOpen && (
						<div className={styles.dropdownMenu}>
							<div className={styles.gridSelector}>
								{gridTemplates.map((tmpl) => {
									const isActive = layout.rows === tmpl.rows && layout.cols === tmpl.cols;
									return (
										<div
											key={tmpl.label}
											className={`${styles.gridItem} ${isActive ? styles.gridItemActive : ""}`}
											onClick={() => {
												onLayoutChange({ rows: tmpl.rows, cols: tmpl.cols });
												setLayoutOpen(false);
											}}
										>
											<div
												className={styles.gridIcon}
												style={{
													gridTemplateRows: `repeat(${tmpl.rows}, 1fr)`,
													gridTemplateColumns: `repeat(${tmpl.cols}, 1fr)`,
												}}
											>
												{Array.from({ length: tmpl.rows * tmpl.cols }).map((_, i) => (
													<div key={i} className={styles.gridCell} />
												))}
											</div>
											<span className={styles.gridLabel}>{tmpl.label}</span>
										</div>
									);
								})}
							</div>
						</div>
					)}
				</div>

				<div className={styles.divider} />

				{/* Active chart configuration (only shown if a chart is selected) */}
				{activeChartId ? (
					<>
						{/* VNSymbolSearch */}
						<div style={{ width: 140 }}>
							<VNSymbolSearch
								onChange={onSymbolChange}
								value={activeSymbol}
							/>
						</div>

						{/* Timeframe Select */}
						<div ref={tfRef} className={styles.dropdown}>
							<button
								className={`${styles.btn} ${timeframeOpen ? styles.btnActive : ""}`}
								onClick={() => setTimeframeOpen(!timeframeOpen)}
							>
								<IconClock size={14} /> {activeTimeframe || "Timeframe"}
							</button>
							{timeframeOpen && (
								<div className={styles.dropdownMenu}>
									{timeframes.map((tf) => (
										<button
											key={tf}
											className={`${styles.btn} ${activeTimeframe === tf ? styles.btnActive : ""}`}
											style={{ border: "none", justifyContent: "flex-start", width: "100%" }}
											onClick={() => {
												onTimeframeChange(tf);
												setTimeframeOpen(false);
											}}
										>
											{tf}
										</button>
									))}
								</div>
							)}
						</div>
					</>
				) : (
					<span style={{ fontSize: 13, color: "var(--vnsc-text-secondary, #94a3b8)", fontStyle: "italic" }}>
						{t("topbar.noChartHint")}
					</span>
				)}
			</div>

			<div className={styles.rightSection}>
				{/* Sync Settings Dropdown */}
				<div ref={syncRef} className={styles.dropdown}>
					<button
						className={`${styles.btn} ${syncOpen ? styles.btnActive : ""}`}
						onClick={() => setSyncOpen(!syncOpen)}
					>
						<IconSync size={14} /> {t("mobile.sync") || "Sync"}
					</button>
					{syncOpen && (
						<div className={`${styles.dropdownMenu} ${styles.dropdownMenuRight}`}>
							{syncOptions.map((opt) => (
								<label key={opt.key} className={styles.syncOption}>
									<input
										type="checkbox"
										checked={syncSettings[opt.key]}
										onChange={(e) => onSyncChange(opt.key, e.target.checked)}
									/>
									<span>{opt.label}</span>
								</label>
							))}
						</div>
					)}
				</div>

				{/* Save Workspace */}
				{onSaveWorkspace && (
					<button className={styles.btn} onClick={onSaveWorkspace}>
						<IconSave size={14} /> {t("mobile.saveWorkspace") || "Save"}
					</button>
				)}

				{/* Add Chart */}
				{onAddChart && (
					<button className={styles.btn} onClick={onAddChart}>
						<IconPlus size={14} /> {t("mobile.addChart") || "Add Chart"}
					</button>
				)}

				{/* Theme Toggle */}
				{onThemeToggle && (
					<button className={`${styles.btn} ${styles.iconBtn}`} onClick={onThemeToggle} title={isDark ? (t("theme.light") || "Light") : (t("theme.dark") || "Dark")} aria-label={isDark ? (t("theme.light") || "Light") : (t("theme.dark") || "Dark")}>
						{isDark ? <IconSun size={15} /> : <IconMoon size={15} />}
					</button>
				)}
			</div>
		</header>
	);
}
