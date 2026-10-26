/**
 * WE2 P2-05: SettingsModal (Lean Shell Architecture)
 * Modular 2-column TradingView-parity Chart Settings Modal
 */
import React, { useEffect, useRef, useState, useMemo, useCallback, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { usePortalAdapter } from "../../hooks/usePortalAdapter";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { SaaSFeatureContext } from "../../contexts/SaaSFeatureContext";
import type { PortalAdapter, StorageAdapter } from "@vninvestcharts/engine-react";
import { SettingsProvider, useSettingsContext } from "./SettingsContext";
import { useWorkspaceSettings } from "./WorkspaceSettingsContext";
import { useOptionalWorkspacePaperVisibility } from "../../context/WorkspacePaperVisibilityContext";
import {
	APPLIED_APPEARANCE_EVENT,
	APPLY_APPEARANCE_EVENT,
	extractAppearancePayload,
} from "./model/appearancePayload";
import type { SettingsTabId, ThemePresetName } from "./model/chartSettingsSchema";
import { settingsTabKeywords } from "./model/settingsTabKeywords";
import { useSettingsRollback } from "./model/useSettingsRollback";
import type { SeriesTier } from "../../../lib/core";
import styles from "./SettingsModal.module.css";

export interface SettingsModalProps {
	open: boolean;
	onClose?: () => void;
	children?: ReactNode;
	comparisonOverlays?: ReadonlyArray<{
		symbolId: string;
		visible: boolean;
		color: string;
		yAxis: "left" | "right";
		lineWidth: number;
		lineStyle: "solid" | "dashed" | "dotted";
		fillArea: boolean;
		normalizeToBaseline: boolean;
	}>;
	onComparisonRemove?: (symbolId: string) => void;
	onComparisonUpdate?: (symbolId: string, updates: Partial<{
		visible: boolean;
		color: string;
		yAxis: "left" | "right";
		lineWidth: number;
		lineStyle: "solid" | "dashed" | "dotted";
		fillArea: boolean;
		normalizeToBaseline: boolean;
	}>) => void;
	selectedPaneId?: string;
	onSelectedPaneIdChange?: (paneId: string) => void;
	maxVisiblePanes?: number;
	onMaxVisiblePanesChange?: (next: number) => void;
	maxVisibleBars?: number;
	onMaxVisibleBarsChange?: (next: number) => void;
	showNonTradingDays?: boolean;
	onShowNonTradingDaysChange?: (next: boolean) => void;
	showTimeScrollbar?: boolean;
	onShowTimeScrollbarChange?: (next: boolean) => void;
	showDrawingPriceMarkers?: boolean;
	onShowDrawingPriceMarkersChange?: (next: boolean) => void;
	enableWhale?: boolean;
	onEnableWhaleChange?: (next: boolean) => void;
	whaleThreshold?: number;
	onWhaleThresholdChange?: (next: number) => void;
	enableCVD?: boolean;
	onEnableCVDChange?: (next: boolean) => void;
	cvdMode?: "oscillator" | "histogram";
	onCVDModeChange?: (next: "oscillator" | "histogram") => void;
	onReset?: () => void;
	isDark?: boolean;
	toggleTheme?: () => void;
	onThemePresetChange?: (theme: ThemePresetName) => void;
	timezone?: string;
	onTimezoneChange?: (timezone: string) => void;
	alertAudioEnabled?: boolean;
	onAlertAudioEnabledChange?: (next: boolean) => void;
	dataAdapterName?: string;
	onDataAdapterChange?: (name: string) => void;
	overlayTimeframe?: string;
	onOverlayTimeframeChange?: (next: string | undefined) => void;
	overlayStyle?: "hollow" | "step" | "area" | "candle";
	onOverlayStyleChange?: (next: "hollow" | "step" | "area" | "candle") => void;
	onExportLayout?: () => void;
	onImportLayout?: (layoutJson: string) => void;
	portalAdapter?: PortalAdapter;
	storageAdapter?: StorageAdapter;
	themePreset?: string;
	chartId?: string;
	/** Displayed in the header when set (locked at open; never read from ambient active). */
	symbol?: string;
	/** Displayed in the header when set (locked at open). */
	timeframe?: string;
	/** S3b-2: tier gate cho composer thêm series (undefined = không gate, legacy). */
	seriesTier?: SeriesTier;
}

import { SymbolSettingsTab } from "./tabs/SymbolSettingsTab";
import { StatusLineSettingsTab } from "./tabs/StatusLineSettingsTab";
import { ScalesSettingsTab } from "./tabs/ScalesSettingsTab";
import { AppearanceSettingsTab } from "./tabs/AppearanceSettingsTab";
import { PanesLayoutSettingsTab } from "./tabs/PanesLayoutSettingsTab";
import { IndicatorsSettingsTab } from "./tabs/IndicatorsSettingsTab";
import { TradingEventsSettingsTab } from "./tabs/TradingEventsSettingsTab";
import { ThemePaletteSettingsTab } from "./tabs/ThemePaletteSettingsTab";
import { LicensingSettingsTab } from "./tabs/LicensingSettingsTab";
import { ResetSettingsTab } from "./tabs/ResetSettingsTab";

interface TabItemDef {
	id: SettingsTabId;
	labelKey: string;
	defaultLabel: string;
	icon: string;
}

const TABS: TabItemDef[] = [
	{ id: "symbol", labelKey: "settings.tab.symbol", defaultLabel: "Symbol & Candles", icon: "📊" },
	{ id: "statusLine", labelKey: "settings.tab.statusLine", defaultLabel: "Status Line", icon: "📈" },
	{ id: "scales", labelKey: "settings.tab.scales", defaultLabel: "Scales & Coordinates", icon: "📐" },
	{ id: "appearance", labelKey: "settings.tab.appearance", defaultLabel: "Appearance & Canvas", icon: "🎨" },
	{ id: "panes", labelKey: "settings.tab.panes", defaultLabel: "Panes Layout", icon: "🔲" },
	{ id: "indicators", labelKey: "settings.tab.indicators", defaultLabel: "Indicators", icon: "⚡" },
	{ id: "trading", labelKey: "settings.tab.trading", defaultLabel: "Trading & Events", icon: "💼" },
	{ id: "theme", labelKey: "settings.tab.theme", defaultLabel: "Theme & Colors", icon: "🌓" },
	{ id: "licensing", labelKey: "settings.tab.licensing", defaultLabel: "Licensing", icon: "🔑" },
	{ id: "reset", labelKey: "settings.tab.reset", defaultLabel: "Reset Defaults", icon: "🔄" },
];

function SettingsModalShell(props: SettingsModalProps) {
	const {
		onClose,
		children,
		selectedPaneId,
		onSelectedPaneIdChange,
		comparisonOverlays,
		onComparisonRemove,
		onComparisonUpdate,
		onExportLayout,
		onImportLayout,
		toggleTheme,
		onThemePresetChange,
		isDark,
		onReset,
		chartId,
		symbol,
		timeframe,
		seriesTier,
	} = props;

	const { activeTab, setActiveTab, searchQuery, setSearchQuery, resetAll, settings, updateSection } = useSettingsContext();
	// P1-1 (C1a): Cancel phải HOÀN TÁC thật (settings áp live) — xem useSettingsRollback.
	const handleCancel = useSettingsRollback(settings, updateSection as never, () => onClose?.());
	const { t } = useWidgetI18n();
	const saasContext = useContext(SaaSFeatureContext);
	const { isMultiChart } = useWorkspaceSettings();
	const paperVisibility = useOptionalWorkspacePaperVisibility();
	const [applyFeedback, setApplyFeedback] = useState<string | null>(null);

	const safeT = useCallback(
		(key: string, fallback: string) => {
			const val = t(key);
			return !val || val === key ? fallback : val;
		},
		[t]
	);

	// Apply-to-All feedback: provider fans out, then fires the done event.
	useEffect(() => {
		if (typeof window === "undefined") return;
		const handler = (e: Event) => {
			const detail = (e as CustomEvent<{ sourceChartId?: string; applied?: number }>).detail;
			const mine = chartId ?? null;
			if (!detail || detail.sourceChartId == null || detail.sourceChartId !== mine) return;
			setApplyFeedback(
				safeT("settings.applyToAllDone", `Applied appearance to ${detail.applied ?? 0} chart(s)`).replace(
					"{count}",
					String(detail.applied ?? 0)
				)
			);
		};
		window.addEventListener(APPLIED_APPEARANCE_EVENT, handler);
		return () => window.removeEventListener(APPLIED_APPEARANCE_EVENT, handler);
	}, [chartId, safeT]);

	useEffect(() => {
		if (!applyFeedback) return;
		const timer = setTimeout(() => setApplyFeedback(null), 2600);
		return () => clearTimeout(timer);
	}, [applyFeedback]);

	const handleApplyToAll = useCallback(() => {
		if (!chartId) return;
		try {
			const payload = extractAppearancePayload(settings);
			// Chart-centric visibility rides along: source chart's paper state
			// fans out to every chart (user's "apply to all" expectation).
			const paperEnabled =
				paperVisibility != null ? (paperVisibility.perChart[chartId] ?? paperVisibility.master) : undefined;
			if (typeof window !== "undefined") {
				window.dispatchEvent(
					new CustomEvent(APPLY_APPEARANCE_EVENT, { detail: { sourceChartId: chartId, payload, paperEnabled } })
				);
			}
		} catch {
			// Best-effort: source chart already persists its own edits live.
		}
	}, [chartId, settings, paperVisibility]);

	const headerTitle = useMemo(() => {
		if (isMultiChart && (symbol || timeframe)) {
			const ctx = [symbol, timeframe].filter(Boolean).join(" · ");
			return safeT("settings.headerTitleActive", `Chart Settings — ${ctx}`).replace("{symbol}", symbol ?? "").replace(
				"{timeframe}",
				timeframe ?? ""
			);
		}
		return safeT("settings.dialogKicker", "Chart Settings");
	}, [isMultiChart, symbol, timeframe, safeT]);

	const visibleTabs = useMemo(() => {
		let list = TABS;
		if (!saasContext) {
			list = list.filter((tab) => tab.id !== "licensing");
		}
		if (!searchQuery.trim()) return list;
		const q = searchQuery.toLowerCase();
		return list.filter((tab) => {
			const label = safeT(tab.labelKey, tab.defaultLabel).toLowerCase();
			if (label.includes(q) || tab.id.toLowerCase().includes(q) || tab.defaultLabel.toLowerCase().includes(q)) return true;
			// P1-1: lọc cả theo TỪ KHOÁ NỘI DUNG (C1b) — gõ "volume"/"crosshair" phải ra tab.
			return settingsTabKeywords(tab.id).some((kw) => kw.includes(q));
		});
	}, [saasContext, searchQuery, safeT]);

	// Keyboard arrow navigation
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			onClose?.();
			return;
		}
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const currentIndex = visibleTabs.findIndex((t) => t.id === activeTab);
			if (currentIndex === -1) return;
			const nextIndex =
				e.key === "ArrowDown"
					? (currentIndex + 1) % visibleTabs.length
					: (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
			setActiveTab(visibleTabs[nextIndex].id);
		}
	};

	const renderActiveTabContent = () => {
		if (children) return children;
		switch (activeTab) {
			case "symbol":
				return <SymbolSettingsTab />;
			case "statusLine":
				return <StatusLineSettingsTab />;
			case "scales":
				return <ScalesSettingsTab />;
			case "appearance":
				return <AppearanceSettingsTab />;
			case "panes":
				return (
					<PanesLayoutSettingsTab
						selectedPaneId={selectedPaneId}
						onSelectedPaneIdChange={onSelectedPaneIdChange}
						onExportLayout={onExportLayout}
						onImportLayout={onImportLayout}
					/>
				);
			case "indicators":
			case "indicatorSets":
				return (
					<IndicatorsSettingsTab
						chartId={chartId}
						selectedPaneId={selectedPaneId}
						onSelectedPaneIdChange={onSelectedPaneIdChange}
						comparisonOverlays={comparisonOverlays}
						onComparisonRemove={onComparisonRemove}
						onComparisonUpdate={onComparisonUpdate}
						seriesTier={seriesTier}
					/>
				);
			case "trading":
				return <TradingEventsSettingsTab chartId={chartId} symbol={symbol} />;
			case "theme":
				return (
					<ThemePaletteSettingsTab
						toggleTheme={toggleTheme}
						isDark={isDark}
						onThemePresetChange={onThemePresetChange}
					/>
				);
			case "licensing":
				return <LicensingSettingsTab />;
			case "reset":
				return <ResetSettingsTab onReset={onReset} />;
			default:
				return <SymbolSettingsTab />;
		}
	};

	return (
		<div className={styles.modalShell} data-testid="settings-modal" onKeyDown={handleKeyDown} tabIndex={-1}>
			{/* Header */}
			<div className={styles.header}>
				<h2 className={styles.headerTitle}>
					{headerTitle}
					{isMultiChart && (symbol || timeframe) && (
						<span className={styles.activeBadge}>{safeT("settings.activeBadge", "Active chart")}</span>
					)}
				</h2>
				<button
					type="button"
					className={styles.closeBtn}
					onClick={onClose}
					title={safeT("settings.dialogClose", "Close")}
					data-testid="settings-close-btn"
				>
					×
				</button>
			</div>

			{/* 2-Column Body */}
			<div className={styles.body}>
				{/* Left Sidebar */}
				<div className={styles.sidebar}>
					<div className={styles.searchWrapper}>
						<input
							type="text"
							className={styles.searchInput}
							placeholder={safeT("settings.searchPlaceholder", "Search settings...")}
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>

					<ul className={styles.tabList} role="tablist">
						{visibleTabs.map((tab) => {
							const isActive = activeTab === tab.id;
							return (
								<li key={tab.id} role="presentation">
									<button
										type="button"
										role="tab"
										aria-selected={isActive}
										className={`${styles.tabItem} ${isActive ? styles.tabItemActive : ""}`}
										onClick={() => setActiveTab(tab.id)}
									>
										<span className={styles.tabIcon}>{tab.icon}</span>
										<span>{safeT(tab.labelKey, tab.defaultLabel)}</span>
									</button>
								</li>
							);
						})}
					</ul>
				</div>

				{/* Right Content Panel */}
				<div className={styles.contentPanel} role="tabpanel">
					{renderActiveTabContent()}
				</div>
			</div>

			{/* Footer */}
			<div className={styles.footer}>
				<div className={styles.footerLeft}>
					<button
						type="button"
						className={styles.btnReset}
						data-testid="settings-reset-defaults-btn"
						onClick={() => {
							resetAll();
							onReset?.();
						}}
					>
						{safeT("settings.restoreDefaults", "Restore Defaults")}
					</button>
					{isMultiChart && chartId && (
						<button
							type="button"
							className={styles.btnApplyAll}
							data-testid="settings-apply-to-all-btn"
							title={safeT(
								"settings.applyToAllNote",
								"Copy appearance & style to all charts (symbol, panes and scale modes are kept)"
							)}
							onClick={handleApplyToAll}
						>
							{applyFeedback || safeT("settings.applyToAll", "Apply to All")}
						</button>
					)}
				</div>
				<div className={styles.footerRight}>
					<button type="button" className={styles.btnCancel} onClick={handleCancel}>
						{safeT("settings.cancel", "Cancel")}
					</button>
					<button type="button" className={styles.btnApply} onClick={onClose}>
						{safeT("settings.apply", "Apply")}
					</button>
				</div>
			</div>
		</div>
	);
}

export function SettingsModal(props: SettingsModalProps) {
	const {
		open,
		onClose,
		isDark = true,
		themePreset,
		portalAdapter,
		chartId,
		storageAdapter,
		onOverlayTimeframeChange,
		onOverlayStyleChange,
		onMaxVisiblePanesChange,
		onShowNonTradingDaysChange,
		onTimezoneChange,
		onAlertAudioEnabledChange,
		onEnableWhaleChange,
		onWhaleThresholdChange,
		onEnableCVDChange,
		onCVDModeChange,
		onDataAdapterChange,
		toggleTheme,
		onReset,
		overlayTimeframe,
		overlayStyle,
		maxVisiblePanes,
		showNonTradingDays,
		showTimeScrollbar,
		onShowTimeScrollbarChange,
		timezone,
		alertAudioEnabled,
		enableWhale,
		whaleThreshold,
		enableCVD,
		cvdMode,
		dataAdapterName,
	} = props;

	const { portalTarget } = usePortalAdapter({ portalAdapter: portalAdapter! });
	const backdropRef = useRef<HTMLDivElement>(null);

	// UX-02: shared dialog focus contract — initial focus, Tab loop, Escape and
	// focus restore. Replaces the ad-hoc window-level Escape listener, which
	// also fired when focus was still outside the modal.
	useDialogFocus(backdropRef, { open, onEscape: () => onClose?.() });

	if (!open) return null;

	const activeChartMode = isDark ? "dark" : "light";
	const activeChartTheme = themePreset || (isDark ? "classic-dark" : "modern-light");

	return createPortal(
		<div
			ref={backdropRef}
			className={`vnsc-root vnsc-settings-backdrop ${styles.backdrop}`}
			data-chart-mode={activeChartMode}
			data-chart-theme={activeChartTheme}
			data-chart-id={chartId}
			data-testid="settings-backdrop"
			onClick={(e) => {
				if (e.target === backdropRef.current) onClose?.();
			}}
		>
			<SettingsProvider
				isDark={isDark}
				themePreset={themePreset}
				storageAdapter={storageAdapter}
				chartId={chartId}
				onOverlayTimeframeChange={onOverlayTimeframeChange}
				onOverlayStyleChange={onOverlayStyleChange}
				onMaxVisiblePanesChange={onMaxVisiblePanesChange}
				onShowNonTradingDaysChange={onShowNonTradingDaysChange}
				onTimezoneChange={onTimezoneChange}
				onAlertAudioEnabledChange={onAlertAudioEnabledChange}
				onEnableWhaleChange={onEnableWhaleChange}
				onWhaleThresholdChange={onWhaleThresholdChange}
				onEnableCVDChange={onEnableCVDChange}
				onCVDModeChange={onCVDModeChange}
				onDataAdapterChange={onDataAdapterChange}
				toggleTheme={toggleTheme}
				onReset={onReset}
				overlayTimeframe={overlayTimeframe}
				overlayStyle={overlayStyle}
				maxVisiblePanes={maxVisiblePanes}
				showNonTradingDays={showNonTradingDays}
				showTimeScrollbar={showTimeScrollbar}
				onShowTimeScrollbarChange={onShowTimeScrollbarChange}
				timezone={timezone}
				alertAudioEnabled={alertAudioEnabled}
				enableWhale={enableWhale}
				whaleThreshold={whaleThreshold}
				enableCVD={enableCVD}
				cvdMode={cvdMode}
				dataAdapterName={dataAdapterName}
			>
				<SettingsModalShell {...props} />
			</SettingsProvider>
		</div>,
		portalTarget || (typeof document !== "undefined" ? document.body : null)!
	);
}

