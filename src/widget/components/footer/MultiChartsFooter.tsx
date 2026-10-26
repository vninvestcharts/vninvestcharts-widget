import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ALL_PRESETS } from '../../grid/presets';
import { LayoutPreset } from '../../grid/types';
import { useWidgetI18n } from '../../context/WidgetI18nContext';
import { BottomTab } from '../BottomPanelHost';
import { ToolGlyph, IconExpand, IconClock, IconLink, IconReplay, IconCode, IconFlask, IconList } from '../common/Icons';
import styles from './MultiChartsFooter.module.css';


interface MultiChartsFooterProps {
  currentLayout: LayoutPreset;
  onLayoutChange: (preset: LayoutPreset) => void;
  chartCount: number;
  activeTab?: BottomTab;
  onTabChange?: (tab: BottomTab) => void;
  /** UI-D2: Solo/Grid toggle for the focused chart (shown when provided). */
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  syncSettings: {
    visibleRange: boolean;
    crosshair: boolean;
    drawings: boolean;
    symbolLinks: boolean;
    timeframe: boolean;
    chartType: boolean;
    replay: boolean;
  };
  onSyncChange: (settings: Partial<MultiChartsFooterProps['syncSettings']>) => void;
  className?: string;
  autoHide?: boolean;
  isChartFocused?: boolean;
  onSystemMenuOpen?: () => void;
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  chartsData?: Array<{ id: string; symbol: string; timeframe: string }>;
  isMobile?: boolean;
}

export const MultiChartsFooter: React.FC<MultiChartsFooterProps> = ({
	currentLayout,
	onLayoutChange,
	chartCount,
	syncSettings,
	onSyncChange,
	className = '',
	autoHide = true,
	isChartFocused = false,
	onSystemMenuOpen,
	activeTab = null,
	onTabChange,
	isMaximized = false,
	onToggleMaximize,
	activeIndex = 0,
	onActiveIndexChange,
	chartsData,
	isMobile = false,
}) => {
	const { t } = useWidgetI18n();
	const [showLayoutSelector, setShowLayoutSelector] = useState(false);
	const [showSyncPopover, setShowSyncPopover] = useState(false);
	const [timestamp, setTimestamp] = useState('--:--:--');
	const syncPopoverRef = useRef<HTMLDivElement | null>(null);

	// TASK-10: close sync popover on outside click (commercial UX standard).
	useEffect(() => {
		if (!showSyncPopover) return;
		const onDown = (e: MouseEvent) => {
			if (syncPopoverRef.current && !syncPopoverRef.current.contains(e.target as Node)) {
				setShowSyncPopover(false);
			}
		};
		document.addEventListener("mousedown", onDown);
		return () => document.removeEventListener("mousedown", onDown);
	}, [showSyncPopover]);

	useEffect(() => {
		const updateTime = () => {
			const now = new Date();
			setTimestamp(now.toLocaleTimeString('vi-VN', { hour12: false }));
		};
		updateTime();
		const interval = setInterval(updateTime, 1000);
		return () => clearInterval(interval);
	}, []);

	const layoutRows = useMemo(() => {
		return [
			{ id: 1, label: "1", presets: [
				{ preset: ALL_PRESETS.find(p => p.id === '1x1')!, label: '1 Chart' }
			]
			},
			{ id: 2, label: "2", presets: [
				{ preset: ALL_PRESETS.find(p => p.id === '2x1')!, label: '2 Rows' },
				{ preset: ALL_PRESETS.find(p => p.id === '1x2')!, label: '2 Columns' }
			]
			},
			{ id: 3, label: "3", presets: [
				{ preset: ALL_PRESETS.find(p => p.id === '3x1')!, label: '3 Rows' },
				{ preset: ALL_PRESETS.find(p => p.id === '1x3')!, label: '3 Columns' },
				{ preset: ALL_PRESETS.find(p => p.id === 'l-shape')!, label: 'L-Shape' }
			]
			},
			{ id: 4, label: "4", presets: [
				{ preset: ALL_PRESETS.find(p => p.id === '2x2')!, label: '2x2 Grid' },
				{ preset: ALL_PRESETS.find(p => p.id === '4x1')!, label: '4 Rows' },
				{ preset: ALL_PRESETS.find(p => p.id === '1x4')!, label: '4 Columns' },
				{ preset: ALL_PRESETS.find(p => p.id === 't-shape')!, label: 'T-Shape' },
				{ preset: ALL_PRESETS.find(p => p.id === 'main-3-sidebar')!, label: 'Main + 3 Sidebar' }
			]
			},
			{ id: 5, label: "5", presets: [
				{ preset: ALL_PRESETS.find(p => p.id === 'quad-focus')!, label: 'Quad Focus' }
			]
			},
			{ id: 6, label: "6", presets: [
				{ preset: ALL_PRESETS.find(p => p.id === '3x2')!, label: '3x2 Grid' },
				{ preset: ALL_PRESETS.find(p => p.id === '2x3')!, label: '2x3 Grid' }
			]
			},
			{ id: 8, label: "8", presets: [
				{ preset: ALL_PRESETS.find(p => p.id === '2x4')!, label: '2x4 Grid' },
				{ preset: ALL_PRESETS.find(p => p.id === '3x3')!, label: '3x3 Grid' }
			]
			}
		].map(row => ({
			...row,
			presets: row.presets.filter(p => p.preset)
		}));
	}, []);

	if (isMobile) return null;

	const handleLayoutSelect = (preset: LayoutPreset) => {
		onLayoutChange(preset);
		setShowLayoutSelector(false);
	};

	const handleSyncToggle = (key: keyof typeof syncSettings) => {
		onSyncChange({ [key]: !syncSettings[key] });
	};

	const syncItems: { key: keyof typeof syncSettings; label: string; icon: React.ReactNode }[] = [
		{ key: 'visibleRange', label: t('header.sync.visibleRange') ?? 'Range', icon: <IconExpand size={13} /> },
		{ key: 'crosshair', label: t('header.sync.crosshair') ?? 'Crosshair', icon: <ToolGlyph id="crosshair" /> },
		{ key: 'timeframe', label: t('header.sync.timeframe') ?? 'TF', icon: <IconClock size={13} /> },
		{ key: 'symbolLinks', label: t('header.sync.symbolLinks') ?? 'Symbol', icon: <IconLink size={13} /> },
		{ key: 'drawings', label: t('header.sync.drawings') ?? 'Drawings', icon: <ToolGlyph id="brush" /> },
		{ key: 'chartType', label: t('header.sync.chartType') ?? 'Type', icon: <ToolGlyph id="trendLine" /> },
		{ key: 'replay', label: t('header.sync.replay') ?? 'Replay', icon: <IconReplay size={13} /> },
	];

	return (
		<footer className={`${styles.multiChartsFooter} ${className} ${chartCount <= 1 ? styles.singleChart : ""}`} role="contentinfo" style={{ height: "100%", width: "100%", background: "transparent", border: "none", pointerEvents: "auto", overflow: "visible", display: "flex", alignItems: "center", justifyContent: "center" }}>
			{/* Desktop content — hidden on mobile via CSS */}
			<div className={styles.desktopContent}>
				<div className={styles.footerSection}>
					<div className={styles.layoutSelectorContainer}>
						<button
							className={`${styles.layoutBtn} ${showLayoutSelector ? styles.layoutBtnActive : ''}`}
							onClick={() => setShowLayoutSelector(!showLayoutSelector)}
							aria-expanded={showLayoutSelector}
							aria-haspopup="true"
						>
							{currentLayout.name}
							<span className={styles.chevron} aria-hidden="true">{showLayoutSelector ? '▲' : '▼'}</span>
						</button>

						{showLayoutSelector && (
							<div className={styles.layoutDropdown} role="menu">
								{layoutRows.map((row) => (
									<div key={row.id} className={styles.layoutRow}>
										<div className={styles.layoutRowLabel}>{row.label}</div>
										<div className={styles.layoutRowOptions}>
											{row.presets.map(({ preset, label }) => (
												<button
													key={preset.id}
													className={`${styles.layoutOption} ${currentLayout.id === preset.id ? styles.layoutOptionSelected : ''}`}
													onClick={() => handleLayoutSelect(preset)}
													role="menuitem"
													title={label}
												>
													<div className={styles.miniGrid} style={{
														gridTemplateColumns: `repeat(${preset.layout.cols}, 1fr)`,
														gridTemplateRows: `repeat(${preset.layout.rows}, 1fr)`,
													}}>
														{Array.from({ length: preset.layout.rows * preset.layout.cols }).map((_, i) => (
															<div key={i} className={styles.miniCell} />
														))}
													</div>
												</button>
											))}
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					<div ref={syncPopoverRef} className={styles.layoutSelectorContainer} style={{ position: "relative" }}>
						<button
							className={`${styles.layoutBtn} ${showSyncPopover ? styles.layoutBtnActive : ''}`}
							onClick={() => {
								setShowSyncPopover(!showSyncPopover);
								setShowLayoutSelector(false);
							}}
							title={t('systemMenu.sync.title')}
							style={{ gap: "4px" }}
						>
							<span style={{ fontSize: "11px" }}>🔄</span>
							<span>{t('systemMenu.sync.title')}</span>
							<span className={styles.chevron} aria-hidden="true">{showSyncPopover ? '▲' : '▼'}</span>
						</button>

						{showSyncPopover && (
							<div className={styles.layoutDropdown} style={{ minWidth: "190px", padding: "6px" }} role="menu">
								<div style={{ fontSize: "11px", fontWeight: 600, color: "var(--vnsc-text-secondary, #787b86)", padding: "2px 6px 4px", borderBottom: "1px solid var(--vnsc-border, rgba(148, 163, 184, 0.12))" }}>
									{t('systemMenu.sync.dropdownLabel')}
								</div>
								{syncItems.map(item => (
									<label
										key={item.key}
										style={{
											display: "flex",
											alignItems: "center",
											gap: "8px",
											padding: "4px 6px",
											borderRadius: "4px",
											cursor: "pointer",
											fontSize: "11px",
											color: syncSettings[item.key] ? "var(--vnsc-text-primary, #d1d4dc)" : "var(--vnsc-text-secondary, #787b86)",
											background: syncSettings[item.key] ? "rgba(41, 98, 255, 0.12)" : "transparent"
										}}
									>
										<input
											type="checkbox"
											checked={!!syncSettings[item.key]}
											onChange={() => handleSyncToggle(item.key)}
											style={{ accentColor: "var(--vnsc-accent, #2962ff)", cursor: "pointer" }}
										/>
										<span className={styles.btnIcon}>{item.icon}</span>
										<span className={styles.btnText}>{item.label}</span>
									</label>
								))}
							</div>
						)}
					</div>

					{onTabChange && (
						<div className={styles.tabGroup}>
							<button
								className={`${styles.tabBtn} ${activeTab === 'pine_editor' ? styles.tabBtnActive : ''}`}
								onClick={() => onTabChange(activeTab === 'pine_editor' ? null : 'pine_editor')}
								disabled={!isChartFocused}
								title={t('ui.bottomTab.pineEditor')}
							>
								<span className={styles.btnIcon}><IconCode size={13} /></span>
								<span className={styles.btnText}>{t('ui.bottomTab.pineEditor')}</span>
							</button>
							<button
								className={`${styles.tabBtn} ${activeTab === 'strategy_tester' ? styles.tabBtnActive : ''}`}
								onClick={() => onTabChange(activeTab === 'strategy_tester' ? null : 'strategy_tester')}
								disabled={!isChartFocused}
								title={t('ui.bottomTab.strategyTester')}
							>
								<span className={styles.btnIcon}><IconFlask size={13} /></span>
								<span className={styles.btnText}>{t('ui.bottomTab.strategyTester')}</span>
							</button>
							<button
								className={`${styles.tabBtn} ${activeTab === 'paper_trade' ? styles.tabBtnActive : ''}`}
								onClick={() => onTabChange(activeTab === 'paper_trade' ? null : 'paper_trade')}
								disabled={!isChartFocused}
								title={t('ui.bottomTab.paperTrade') ?? 'Paper Trading'}
							>
								<span className={styles.btnIcon}><IconList size={13} /></span>
								<span className={styles.btnText}>{t('ui.bottomTab.paperTrade') ?? 'Paper Trading'}</span>
							</button>
							{onToggleMaximize && (activeTab === 'pine_editor' || activeTab === 'strategy_tester') && (
								<button
									className={`${styles.tabBtn} ${isMaximized ? styles.tabBtnActive : ''}`}
									onClick={onToggleMaximize}
									disabled={!isChartFocused}
									title={t(isMaximized ? "header.exitFullscreen" : "header.fullscreen")}
									aria-pressed={isMaximized}
									aria-label={t(isMaximized ? "header.exitFullscreen" : "header.fullscreen")}
									data-testid="footer-solo-toggle"
								>
									<span className={styles.btnIcon}><IconExpand size={13} /></span>
								</button>
							)}
						</div>
					)}
				</div>

				<div className={`${styles.footerSection} ${styles.footerRight}`}>
					<button
						className={styles.layoutBtn}
						onClick={() => {
							if (window.confirm(t("footer.resetConfirm"))) {
								try {
									localStorage.removeItem("rsc-pane-layout-v1");
									localStorage.removeItem("rsc-pane-layout-v2");
								} catch {}
								window.location.reload();
							}
						}}
						title={t("footer.resetLayout")}
						aria-label={t("footer.resetLayout")}
						style={{ padding: "2px 6px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "2px" }}
					>
						<span>↺</span>
						<span>{t("footer.resetLayout")}</span>
					</button>
					<span className={styles.chartInfo}>
						{chartCount}
					</span>
					<span className={styles.statusItem}>
						<span className={styles.liveDot} />
					</span>
					<span className={styles.timeText}>
						{timestamp}
					</span>
				</div>
			</div>{/* end desktopContent */}
		</footer>
	);
};

export default MultiChartsFooter;
