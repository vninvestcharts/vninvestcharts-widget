/**
 * Settings Context & State Management
 * SSOT for Chart Settings across all 8 modular tabs
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import type { ChartSettingsState, SettingsTabId } from "./model/chartSettingsSchema";
import { createDefaultSettings } from "./model/defaultSettings";
import type { StorageAdapter } from "@vninvestcharts/engine-react";
import {
	LEGACY_COMPOSITE_KEY,
	normalizeChartId,
	readScopedSetting,
	removeScopedSetting,
	settingsCompositeKey,
	writeScopedSetting,
} from "./storageKeys";

export interface SettingsContextValue {
	settings: ChartSettingsState;
	activeTab: SettingsTabId;
	setActiveTab: (tab: SettingsTabId) => void;
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	updateSection: <K extends keyof Omit<ChartSettingsState, "version">>(
		section: K,
		patch: Partial<ChartSettingsState[K]>
	) => void;
	resetSection: <K extends keyof Omit<ChartSettingsState, "version">>(section: K) => void;
	resetAll: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettingsContext(): SettingsContextValue {
	const ctx = useContext(SettingsContext);
	if (!ctx) {
		throw new Error("useSettingsContext must be used within SettingsProvider");
	}
	return ctx;
}

export interface SettingsProviderProps {
	children: ReactNode;
	isDark?: boolean;
	themePreset?: string;
	storageAdapter?: StorageAdapter;
	initialTab?: SettingsTabId;
	// Callbacks for live sync with widget
	onOverlayTimeframeChange?: (next: string | undefined) => void;
	onOverlayStyleChange?: (next: "hollow" | "step" | "area" | "candle") => void;
	onMaxVisiblePanesChange?: (next: number) => void;
	onShowNonTradingDaysChange?: (next: boolean) => void;
	onTimezoneChange?: (timezone: string) => void;
	onAlertAudioEnabledChange?: (next: boolean) => void;
	onEnableWhaleChange?: (next: boolean) => void;
	onWhaleThresholdChange?: (next: number) => void;
	onEnableCVDChange?: (next: boolean) => void;
	onCVDModeChange?: (next: "oscillator" | "histogram") => void;
	onDataAdapterChange?: (name: string) => void;
	onShowTimeScrollbarChange?: (next: boolean) => void;
	toggleTheme?: () => void;
	onReset?: () => void;
	// Initial overrides from props
	overlayTimeframe?: string;
	overlayStyle?: "hollow" | "step" | "area" | "candle";
	maxVisiblePanes?: number;
	showNonTradingDays?: boolean;
	showTimeScrollbar?: boolean;
	timezone?: string;
	alertAudioEnabled?: boolean;
	enableWhale?: boolean;
	whaleThreshold?: number;
	enableCVD?: boolean;
	cvdMode?: "oscillator" | "histogram";
	dataAdapterName?: string;
	/**
	 * Chart-centric isolation (S1). Multi-chart cell passes its chartId ->
	 * storage + events are namespaced to that chart. Single-chart omits it
	 * -> legacy global key (backward compatible).
	 */
	chartId?: string | null;
}

const STORAGE_COMPOSITE_KEY = LEGACY_COMPOSITE_KEY;

function readStorage(adapter: StorageAdapter | undefined, key: string): string | null {
	try {
		if (adapter) return adapter.getItem(key);
		if (typeof window !== "undefined" && window.localStorage) {
			return window.localStorage.getItem(key);
		}
	} catch {
		// Private browsing or quota errors
	}
	return null;
}

function writeStorage(adapter: StorageAdapter | undefined, key: string, value: string): void {
	try {
		if (adapter) adapter.setItem(key, value);
		if (typeof window !== "undefined" && window.localStorage) {
			window.localStorage.setItem(key, value);
		}
	} catch {
		// Private browsing or quota errors
	}
}

export function SettingsProvider(props: SettingsProviderProps) {
	const {
		children,
		isDark = true,
		themePreset,
		storageAdapter,
		initialTab = "symbol",
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
		onShowTimeScrollbarChange,
		onReset,
		overlayTimeframe,
		overlayStyle,
		maxVisiblePanes,
		showNonTradingDays,
		showTimeScrollbar,
		timezone,
		alertAudioEnabled,
		enableWhale,
		whaleThreshold,
		enableCVD,
		cvdMode,
		dataAdapterName,
		chartId,
	} = props;

	const myChartId = normalizeChartId(chartId);
	const compositeKey = settingsCompositeKey(myChartId);
	// Multi cell defaults scrollbar OFF (grid owns the navigator); single defaults ON.
	const defaultShowScrollbar = showTimeScrollbar !== undefined ? showTimeScrollbar : !myChartId;
	const writeScoped = (key: string, value: string) => writeScopedSetting(storageAdapter, key, value, myChartId);
	const removeScoped = (key: string) => removeScopedSetting(storageAdapter, key, myChartId);

	const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
	const [searchQuery, setSearchQuery] = useState("");

	const [settings, setSettings] = useState<ChartSettingsState>(() => {
		const defaults = createDefaultSettings(isDark, themePreset, defaultShowScrollbar);

		// Hydrate from own scoped composite. Multi-chart cell with empty scoped
		// key adopts legacy once (migration), forcing scrollbar OFF so a grid
		// cell never inherits the single-chart scrollbar illegally (R4).
		let storedJson = readStorage(storageAdapter, compositeKey);
		let clonedFromLegacy = false;
		if (!storedJson && myChartId) {
			const legacyJson = readStorage(storageAdapter, STORAGE_COMPOSITE_KEY);
			if (legacyJson) {
				try {
					JSON.parse(legacyJson);
					storedJson = legacyJson;
					clonedFromLegacy = true;
				} catch {
					// Corrupted legacy -> fall through to defaults.
				}
			}
		}
		let loaded: Partial<ChartSettingsState> = {};
		if (storedJson) {
			try {
				loaded = JSON.parse(storedJson);
			} catch {
				// Corrupted JSON fallback
			}
		}
		if (clonedFromLegacy) {
			// Grid cell must never inherit the single-chart scrollbar: persist
			// the clone with scrollbar OFF and reflect it in memory (R4).
			loaded = { ...loaded, scales: { ...loaded.scales, showTimeScrollbar: false } as ChartSettingsState["scales"] };
			writeStorage(storageAdapter, compositeKey, JSON.stringify({ ...loaded, version: 1 }));
		}

		// Check standalone scrollbar storage override (scoped-first)
		const storedScrollbarVal = readScopedSetting(storageAdapter, "vnsc_settings_showTimeScrollbar", myChartId);
		const storedScrollbar = storedScrollbarVal !== null ? storedScrollbarVal === "true" : undefined;

		// Apply props overrides if provided
		const panesLayout = {
			...defaults.panesLayout,
			...loaded.panesLayout,
			...(maxVisiblePanes !== undefined ? { maxVisiblePanes } : {}),
			...(showNonTradingDays !== undefined ? { showNonTradingDays } : {}),
			...(overlayTimeframe !== undefined ? { overlayTimeframe } : {}),
			...(overlayStyle !== undefined ? { overlayStyle } : {}),
		};

		const tradingEvents = {
			...defaults.tradingEvents,
			...loaded.tradingEvents,
			...(enableWhale !== undefined ? { showWhaleFlow: enableWhale } : {}),
			...(whaleThreshold !== undefined ? { whaleThreshold } : {}),
			...(enableCVD !== undefined ? { showCVD: enableCVD } : {}),
			...(cvdMode !== undefined ? { cvdMode } : {}),
			...(alertAudioEnabled !== undefined ? { alertAudioEnabled } : {}),
			...(dataAdapterName !== undefined ? { dataAdapterName } : {}),
		};

		const symbol = {
			...defaults.symbol,
			...loaded.symbol,
			...(timezone !== undefined ? { timezone } : {}),
		};

		const scales = {
			...defaults.scales,
			...loaded.scales,
			...(storedScrollbar !== undefined
				? { showTimeScrollbar: storedScrollbar }
				: (showTimeScrollbar !== undefined && loaded.scales?.showTimeScrollbar === undefined
					? { showTimeScrollbar }
					: {})),
		};

		return {
			version: 1,
			symbol,
			statusLine: { ...defaults.statusLine, ...loaded.statusLine },
			scales,
			appearance: { ...defaults.appearance, ...loaded.appearance },
			panesLayout,
			tradingEvents,
			theme: {
				mode: isDark ? "dark" : "light",
				presetName: (themePreset as any) || defaults.theme.presetName,
				...loaded.theme,
			},
		};
	});

	const updateSection = useCallback(
		<K extends keyof Omit<ChartSettingsState, "version">>(section: K, patch: Partial<ChartSettingsState[K]>) => {
			setSettings((prev) => {
				const nextSection = { ...prev[section], ...patch };
				const nextState: ChartSettingsState = {
					...prev,
					[section]: nextSection,
				};

				// Persist composite (own scoped namespace only)
				writeStorage(storageAdapter, compositeKey, JSON.stringify(nextState));

				// Persist single keys & trigger callbacks for live sync
				if (section === "panesLayout") {
					const p = patch as Partial<ChartSettingsState["panesLayout"]>;
					if (p.maxVisiblePanes !== undefined) {
						writeScoped("vnsc_settings_maxVisiblePanes", String(p.maxVisiblePanes));
						writeScoped("vnsc_maxVisiblePanes", String(p.maxVisiblePanes));
						onMaxVisiblePanesChange?.(p.maxVisiblePanes);
					}
					if (p.showNonTradingDays !== undefined) {
						writeScoped("vnsc_settings_showNonTradingDays", String(p.showNonTradingDays));
						writeScoped("vnsc_showNonTradingDays", String(p.showNonTradingDays));
						onShowNonTradingDaysChange?.(p.showNonTradingDays);
					}
					if (p.overlayTimeframe !== undefined) {
						writeScoped("vnsc_settings_overlayTimeframe", p.overlayTimeframe || "");
						writeScoped("vnsc_overlayTimeframe", p.overlayTimeframe || "");
						onOverlayTimeframeChange?.(p.overlayTimeframe);
					}
					if (p.overlayStyle !== undefined) {
						writeScoped("vnsc_settings_overlayStyle", p.overlayStyle);
						writeScoped("vnsc_overlayStyle", p.overlayStyle);
						onOverlayStyleChange?.(p.overlayStyle);
					}
				}

				if (section === "tradingEvents") {
					const t = patch as Partial<ChartSettingsState["tradingEvents"]>;
					if (t.showWhaleFlow !== undefined) {
						writeScoped("vnsc_settings_enableWhale", String(t.showWhaleFlow));
						writeScoped("vnsc_enableWhale", String(t.showWhaleFlow));
						onEnableWhaleChange?.(t.showWhaleFlow);
					}
					if (t.whaleThreshold !== undefined) {
						writeScoped("vnsc_settings_whaleThreshold", String(t.whaleThreshold));
						writeScoped("vnsc_whaleThreshold", String(t.whaleThreshold));
						onWhaleThresholdChange?.(t.whaleThreshold);
					}
					if (t.showCVD !== undefined) {
						writeScoped("vnsc_settings_enableCVD", String(t.showCVD));
						writeScoped("vnsc_enableCVD", String(t.showCVD));
						onEnableCVDChange?.(t.showCVD);
					}
					if (t.cvdMode !== undefined) {
						writeScoped("vnsc_settings_cvdMode", t.cvdMode);
						writeScoped("vnsc_cvdMode", t.cvdMode);
						onCVDModeChange?.(t.cvdMode);
					}
					if (t.alertAudioEnabled !== undefined) {
						writeScoped("vnsc_settings_alertAudioEnabled", String(t.alertAudioEnabled));
						writeScoped("vnsc_alertAudioEnabled", String(t.alertAudioEnabled));
						onAlertAudioEnabledChange?.(t.alertAudioEnabled);
					}
					if (t.dataAdapterName !== undefined) {
						onDataAdapterChange?.(t.dataAdapterName);
					}
				}

				if (section === "symbol") {
					const s = patch as Partial<ChartSettingsState["symbol"]>;
					if (s.timezone !== undefined) {
						writeScoped("vnsc_settings_timezone", s.timezone);
						writeScoped("vnsc_timezone", s.timezone);
						onTimezoneChange?.(s.timezone);
					}
				}

				if (section === "scales") {
					const sc = patch as Partial<ChartSettingsState["scales"]>;
					if (sc.priceScaleMode !== undefined) {
						const mapped = sc.priceScaleMode === "logarithmic" ? "log" : sc.priceScaleMode === "percentage" ? "percent" : "linear";
						writeScoped("vnsc_priceScaleMode:price", mapped);
					}
					if (sc.invertScale !== undefined) {
						writeScoped("vnsc_priceScaleInverted:price", String(sc.invertScale));
					}
					if (sc.showTimeScrollbar !== undefined) {
						writeScoped("vnsc_settings_showTimeScrollbar", String(sc.showTimeScrollbar));
						onShowTimeScrollbarChange?.(sc.showTimeScrollbar);
					}
				}

				try {
				// Enveloped broadcast (S2): receivers filter by chartId.
				// Legacy listeners reading detail.statusLine/scales directly keep
				// working because the envelope nests the full state.
					if (typeof window !== "undefined") {
						window.dispatchEvent(
							new CustomEvent("vnsc-settings-sync", {
								detail: { chartId: myChartId ?? null, state: nextState },
							})
						);
					}
					if (typeof document !== "undefined") {
						document.dispatchEvent(
							new CustomEvent("vnsc-theme-change", {
								detail: { chartId: myChartId ?? null, theme: nextState.theme },
							})
						);
					}
				} catch {}

				return nextState;
			});
		},
		[
			storageAdapter,
			myChartId,
			compositeKey,
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
		]
	);

	const resetSection = useCallback(
		<K extends keyof Omit<ChartSettingsState, "version">>(section: K) => {
			const defaults = createDefaultSettings(isDark, themePreset, defaultShowScrollbar);
			updateSection(section, defaults[section]);
		},
		[isDark, themePreset, defaultShowScrollbar, updateSection]
	);

	const resetAll = useCallback(() => {
		const defaults = createDefaultSettings(isDark, themePreset, defaultShowScrollbar);
		setSettings(defaults);
		writeStorage(storageAdapter, compositeKey, JSON.stringify(defaults));
		// Clear scoped single-key overrides so they cannot shadow the reset composite.
		for (const base of [
			"vnsc_settings_maxVisiblePanes",
			"vnsc_maxVisiblePanes",
			"vnsc_settings_showNonTradingDays",
			"vnsc_showNonTradingDays",
			"vnsc_settings_overlayTimeframe",
			"vnsc_overlayTimeframe",
			"vnsc_settings_overlayStyle",
			"vnsc_overlayStyle",
			"vnsc_settings_enableWhale",
			"vnsc_enableWhale",
			"vnsc_settings_whaleThreshold",
			"vnsc_whaleThreshold",
			"vnsc_settings_enableCVD",
			"vnsc_enableCVD",
			"vnsc_settings_cvdMode",
			"vnsc_cvdMode",
			"vnsc_settings_alertAudioEnabled",
			"vnsc_alertAudioEnabled",
			"vnsc_settings_timezone",
			"vnsc_timezone",
			"vnsc_settings_showTimeScrollbar",
			"vnsc_priceScaleMode:price",
		]) {
			removeScoped(base);
		}
		const scalePrefix = "vnsc_priceScaleMode:";
		try {
			const ls = globalThis.localStorage;
			if (ls) {
				const doomed: string[] = [];
				for (let i = 0; i < ls.length; i += 1) {
					const key = ls.key(i);
					if (!key || !key.startsWith(scalePrefix)) continue;
					if (!myChartId || key.endsWith(`_${myChartId}`)) doomed.push(key);
				}
				for (const key of doomed) {
					ls.removeItem(key);
				}
			}
		} catch {}
		try {
			globalThis.dispatchEvent?.(
				new CustomEvent("vnsc-settings-sync", {
					detail: { chartId: myChartId ?? null, state: defaults },
				})
			);
			globalThis.document?.dispatchEvent(
				new CustomEvent("vnsc-theme-change", {
					detail: { chartId: myChartId ?? null, theme: defaults.theme },
				})
			);
		} catch {}
		onReset?.();
	}, [isDark, themePreset, defaultShowScrollbar, storageAdapter, compositeKey, myChartId, onReset]);

	const value = useMemo<SettingsContextValue>(
		() => ({
			settings,
			activeTab,
			setActiveTab,
			searchQuery,
			setSearchQuery,
			updateSection,
			resetSection,
			resetAll,
		}),
		[settings, activeTab, searchQuery, updateSection, resetSection, resetAll]
	);

	return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

