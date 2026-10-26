import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type WidgetLocale, type WidgetMessages } from "../i18n/types";
import { type ChartTheme, type PaneDescriptor, useChartTheme, useDynamicPanes } from "../../lib/core";
import type { DrawingDockTab } from "@vninvestcharts/engine-react";
import type { DrawingStorageAdapter } from "@vninvestcharts/engine-drawing";
import type { MagnetSensitivity } from "@vninvestcharts/engine-drawing";
import { type Timeframe } from "../../lib/types/adapter";
import { type OHLCVBar } from "../../lib/types/ohlcv";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import { type WidgetAuthHandler } from "../VNInvestCharts";
import { isWidgetTestEnvironment } from "../utils/widgetHelpers";
import type { StorageAdapter } from "@vninvestcharts/engine-react";
import { LEGACY_COMPOSITE_KEY, normalizeChartId, readScopedSetting, removeScopedSetting, shouldAcceptSettingsEvent, writeScopedSetting } from "../components/settings/storageKeys";
import type { CrosshairMode } from "@vninvestcharts/engine-core";
import { resolveChartRangeExtents, type ChartRange } from "../utils/chartRange";
import { type EnrichedDatum } from "../../lib/core/calculators/types";
import { type WidgetTimezone } from "../../lib/utils/timezoneFormatter";
import { hydrateAlertAudioEnabled, hydrateCvdMode, hydrateTimezone } from "../components/settings/settingsHydration";
import { useVNInvestChartsState, useShadowRoot } from "../context/VNInvestChartsContext";
import { useWidgetI18n } from "../context/WidgetI18nContext";
import { type RequestedWidgetRuntime } from "../runtimePolicy";
import SaveChartAsImage from "../../lib/helper/SaveChartAsImage";

export interface UseWidgetSettingsOptions {
	locale?: WidgetLocale;
	messages?: Partial<WidgetMessages>;
	theme?: ChartTheme;
	timezone?: WidgetTimezone;
	defaultTimezone?: WidgetTimezone;
	onTimezoneChange?: (timezone: WidgetTimezone) => void;
	panes?: readonly any[];
	drawingUiEnabled?: boolean;
	drawingActiveTool?: string;
	drawings?: readonly DrawingObject[];
	defaultDrawings?: readonly DrawingObject[];
	drawingStorageKey?: string;
	drawingStorageAdapter?: DrawingStorageAdapter;
	defaultDrawingDockTab?: DrawingDockTab;
	engineRuntime?: RequestedWidgetRuntime;
	useWebGL?: boolean;
	measurementEnabled?: boolean;
	selectedDrawing?: DrawingObject | null;
	showDrawingPriceMarkers?: boolean;
	showNonTradingDays?: boolean;
	showTimeScrollbar?: boolean;
	enableWhale?: boolean;
	whaleThreshold?: number;
	whaleOrders?: readonly any[];
	enableCVD?: boolean;
	cvdMode?: "oscillator" | "histogram";
	externalCvdSeries?: readonly any[];
	darkFlowStrength?: number | null;
	darkFlowSignalType?: any;
	suppressForkCanvasFallback?: boolean;
	showAdvisoryPanel?: boolean;
	advisoryResult?: any;
	isAdvisoryLoading?: boolean;
	onAdvisoryRefresh?: (() => void) | undefined;
	showTapePanel?: boolean;
	tapeEntries?: readonly any[];
	isTapeLoading?: boolean;
	tapeFilterBillions?: number;
	onTapeFilterChange?: ((billions: number) => void) | undefined;
	showToolbar?: boolean;
	showHeader?: boolean;
	showFooter?: boolean;
	renderToolbar?: any;
	renderHeader?: any;
	renderFooter?: any;
	showDrawingDock?: boolean;
	settingsOpen?: boolean;
	onSettingsClose?: (() => void) | undefined;
	onPaperTradePanelClose?: (() => void) | undefined;
	renderReplayBar?: any;
	renderPaperTradePanel?: any;
	renderSettings?: any;
	renderDrawingDock?: any;
	historyMinResidentBars?: number;
	maxVisibleBars?: number;
	maxVisiblePanes?: number;
	localCacheRoot?: string;
	backfillWorkerFlags?: any;
	canaryLevel?: 10 | 30 | 100;
	onCanaryGateDecision?: any;
	onCanaryRollbackEvent?: any;
	dataAdapterName?: string;
	onDataAdapterChange?: any;
	range?: string;
	onRangeChange?: any;
	onTimeframeChange?: any;
	defaultPeriod?: string;
	authHandler?: WidgetAuthHandler;
	onSymbolChange?: any;
	symbol?: string;
	timeframe?: Timeframe;
	data?: readonly OHLCVBar[];
	adapter?: any;
	onClick?: any;
	onContextMenu?: any;
	onDrawingsChange?: any;
	onSelectedDrawingChange?: any;
	onDrawingWorkspaceChange?: any;
	onVisibleDomainChange?: any;
	onVisibleRangeChange?: any;
	syncOverrides?: Record<string, boolean>;
	onHistorySyncBusyChange?: any;
	onBarsChange?: any;
	onPaneSnapshotsChange?: any;
	onPaneHover?: any;
	onPaneToggleVisibleRequest?: any;
	onPaneRemoveRequest?: any;
	onPaneAddSeriesRequest?: any;
	onPaneToggleSeriesRequest?: any;
	onPaneRemoveSeriesRequest?: any;
	onRuntimeCapabilitiesChange?: any;
	// AC-9(b) DECISION: stays `any`, deliberately. This bag holds 41 `?: any` members out of
	// 108 total, and this one sits inside the longest consecutive run of them (17 members).
	// Narrowing only this one member would buy no safety while the rest of the block stays
	// untyped, and it would be inconsistent with its neighbours. Typing this bag properly is a
	// separate slice; `ResolvedWidgetRuntime` is the correct type when that happens. Note this
	// `any` does NOT mask a type error here - `tsc --noEmit` passes - it only forgoes checking.
	//
	// COUNTED, NOT ASSUMED (2026-10-05, MINOR-6). This comment used to say "~19 consecutive
	// callback props". Three different numbers have since been reported for it: ~19 here, "24"
	// in REPORT_FINAL.md:49, and 17/41 in the G3 deferral plan. Ten definitions were computed
	// and **none yields 24**, so that figure is recorded as unreconciled rather than silently
	// adopted or deleted. The figures above are the ones the script supports, and no line
	// numbers are quoted: editing this comment moves them, and a self-referential line number
	// is a lie waiting to happen. Reproduce by locating the interface through its declaration
	// and closing brace rather than by line number. Two sessions running at once each measured
	// a different total for unrelated reasons, which is why the definition is stated here and
	// not just the number.
	onRuntimeResolved?: any;
	onCoordinateBridgeChange?: any;
	onError?: any;
	onDrawingAlert?: any;
	renderPaneToolbar?: any;
	renderPaneSplitter?: any;
	renderDrawingChrome?: any;
	resetKey?: number;
	className?: string;
	style?: React.CSSProperties;
	children?: React.ReactNode;
	storageAdapter?: StorageAdapter;
	/** Chart id (flows via ...props spread as `id`); absent = single-chart legacy. */
	id?: string;

	containerRef: React.RefObject<HTMLDivElement | null>;
	size: { width: number; height: number };
	plotData: readonly EnrichedDatum[];

	/**
	 * Tier for the PNG watermark (A4). A **ref**, not a value, and that is not a style
	 * choice: this hook is constructed at VNInvestCharts.tsx:288 while the tier is only
	 * resolved at :678, so passing the value directly would read it in its temporal dead
	 * zone. The ref is read lazily at export time, long after both are mounted.
	 */
	tierRef?: React.MutableRefObject<string | undefined>;
}

export interface UseWidgetSettingsReturn {
	localTimeframe: Timeframe;
	setLocalTimeframe: React.Dispatch<React.SetStateAction<Timeframe>>;
	localRange: string | undefined;
	setLocalRange: React.Dispatch<React.SetStateAction<string | undefined>>;
	internalXExtents: readonly [Date | number, Date | number] | undefined;
	setInternalXExtents: React.Dispatch<React.SetStateAction<readonly [Date | number, Date | number] | undefined>>;
	localSelectedPaneId: string;
	setLocalSelectedPaneId: React.Dispatch<React.SetStateAction<string>>;
	toolbarLocked: boolean;
	setToolbarLocked: React.Dispatch<React.SetStateAction<boolean>>;
	localMaxVisiblePanes: number;
	setLocalMaxVisiblePanes: React.Dispatch<React.SetStateAction<number>>;
	activeMaxVisiblePanes: number;
	localMaxVisibleBars: number;
	setLocalMaxVisibleBars: React.Dispatch<React.SetStateAction<number>>;
	activeMaxVisibleBars: number;
	localShowNonTradingDays: boolean;
	setLocalShowNonTradingDays: React.Dispatch<React.SetStateAction<boolean>>;
	activeShowNonTradingDays: boolean;
	localShowDrawingPriceMarkers: boolean;
	setLocalShowDrawingPriceMarkers: React.Dispatch<React.SetStateAction<boolean>>;
	activeShowDrawingPriceMarkers: boolean;
	localEnableWhale: boolean;
	setLocalEnableWhale: React.Dispatch<React.SetStateAction<boolean>>;
	activeEnableWhale: boolean;
	localWhaleThreshold: number;
	setLocalWhaleThreshold: React.Dispatch<React.SetStateAction<number>>;
	activeWhaleThreshold: number;
	localEnableCVD: boolean;
	setLocalEnableCVD: React.Dispatch<React.SetStateAction<boolean>>;
	activeEnableCVD: boolean;
	localCvdMode: "oscillator" | "histogram";
	setLocalCvdMode: React.Dispatch<React.SetStateAction<"oscillator" | "histogram">>;
	activeCvdMode: "oscillator" | "histogram";
	localTimezone: WidgetTimezone;
	setLocalTimezone: React.Dispatch<React.SetStateAction<WidgetTimezone>>;
	activeTimezone: WidgetTimezone;
	localAlertAudioEnabled: boolean;
	setLocalAlertAudioEnabled: React.Dispatch<React.SetStateAction<boolean>>;
	activeAlertAudioEnabled: boolean;
	localSettingsOpen: boolean;
	setLocalSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
	activeSettingsOpen: boolean;
	activeOnSettingsClose: () => void;
	isFullscreen: boolean;
	setIsFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
	searchOpen: boolean;
	setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
	isEditingText: boolean;
	setIsEditingText: React.Dispatch<React.SetStateAction<boolean>>;
	drawingTextDraft: string;
	setDrawingTextDraft: React.Dispatch<React.SetStateAction<string>>;
	handleStartTextEdit: (draft: string) => void;
	handleCommitTextEdit: (commitCallback: (draft: string) => void) => void;
	handleCancelTextEdit: () => void;
	handleFullscreenToggle: () => void;
	handleSnapshot: () => void;
	handleTimeframeChange: (tf: Timeframe) => void;
	handleRangeChange: (r: string) => void;
	getPaneLabel: (id: string, label: string) => string;
	localizePane: (pane: PaneDescriptor) => PaneDescriptor;
	handlePaneToggleVisible: (paneId: string) => void;
	handlePaneRemove: (paneId: string) => void;
	handlePaneAddSeries: (paneId: string) => void;
	handlePaneEditSeries: (paneId: string) => void;
	handlePaneToggleSeries: (paneId: string, seriesType: any, seriesIndex?: number) => void;
	handlePaneRemoveSeries: (paneId: string, seriesType: any, seriesIndex?: number) => void;
	visiblePanes: readonly PaneDescriptor[];
	activeHeights: number[];
	themeState: any;
	resolvedTheme: ChartTheme;
	isDark: boolean;
	previewImageDataUrl: string | null;
	setPreviewImageDataUrl: React.Dispatch<React.SetStateAction<string | null>>;
	activeLocale: WidgetLocale;
	t: (key: string) => string;
	localAvailable: number;
	localApplyDelta: (splitterIndex: number, delta: number) => void;
	localEqualizePair: (splitterIndex: number) => void;
	localResetToDefault: () => void;
	magnetSensitivity: MagnetSensitivity;
	setMagnetSensitivity: React.Dispatch<React.SetStateAction<MagnetSensitivity>>;
	// Crosshair mode lives in `useChartSettingsSections` (Batch B / B2).
	overlayTimeframe: string | undefined;
	setOverlayTimeframe: React.Dispatch<React.SetStateAction<string | undefined>>;
	overlayStyle: "hollow" | "step" | "area" | "candle";
	setOverlayStyle: React.Dispatch<React.SetStateAction<"hollow" | "step" | "area" | "candle">>;
	statusLineSettings: {
		showLogo: boolean;
		showTicker: boolean;
		showOHLC: boolean;
		showBarChange: boolean;
		showVolume: boolean;
		showIndicatorTitles: boolean;
		showIndicatorArguments: boolean;
		showIndicatorValues: boolean;
		backgroundOpacity: number;
	};
	scalesSettings: {
		priceScaleMode: "normal" | "logarithmic" | "percentage";
		invertScale: boolean;
		countdownToBarClose: boolean;
		showTimeScrollbar: boolean;
		dateFormat?: "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy";
	};
}

export function useWidgetSettings({
	locale,
	theme,
	timezone,
	defaultTimezone,
	onTimezoneChange,
	panes,
	maxVisiblePanes,
	maxVisibleBars,
	showNonTradingDays,
	showTimeScrollbar,
	showDrawingPriceMarkers,
	enableWhale,
	whaleThreshold,
	enableCVD,
	cvdMode,
	containerRef,
	size,
	tierRef,
	settingsOpen,
	onSettingsClose,
	timeframe,
	range,
	symbol,
	plotData,
	onTimeframeChange,
	onRangeChange,
	onPaneToggleVisibleRequest,
	onPaneRemoveRequest,
	onPaneAddSeriesRequest,
	onPaneToggleSeriesRequest,
	onPaneRemoveSeriesRequest,
	storageAdapter,
	syncOverrides,
	id,
}: UseWidgetSettingsOptions): UseWidgetSettingsReturn {
	const myChartId = normalizeChartId(id);
	const readSetting = (base: string) => readScopedSetting(storageAdapter, base, myChartId);
	const shadowRoot = useShadowRoot();
	const { t: rawT } = useWidgetI18n();
	const t = useCallback((key: string) => rawT(key) ?? key, [rawT]);
	const [previewImageDataUrl, setPreviewImageDataUrl] = useState<string | null>(null);
	const [localTimeframe, setLocalTimeframe] = useState<Timeframe>(timeframe || "1h");
	useEffect(() => {
		if (timeframe) {
			if (syncOverrides?.timeframe === false) {
				return;
			}
			setLocalTimeframe(timeframe);
		}
	}, [timeframe, syncOverrides?.timeframe]);

	const [localRange, setLocalRange] = useState<string | undefined>(range);
	useEffect(() => {
		if (range) {
			setLocalRange(range);
		}
	}, [range]);

	const [internalXExtents, setInternalXExtents] = useState<readonly [Date | number, Date | number] | undefined>(undefined);
	const [localSelectedPaneId, setLocalSelectedPaneId] = useState("price");
	// Pinned (docked) drawing toolbar — shared persistence key with
	// VNInvestMultiCharts so the preference is global across modes.
	const [toolbarLocked, setToolbarLockedState] = useState<boolean>(() => {
		try {
			return typeof localStorage !== "undefined" && localStorage.getItem("vnsc_toolbar_docked") === "true";
		} catch {
			return false;
		}
	});
	const setToolbarLocked: React.Dispatch<React.SetStateAction<boolean>> = useCallback((action) => {
		setToolbarLockedState((prev) => {
			const next = typeof action === "function" ? (action as (p: boolean) => boolean)(prev) : action;
			try {
				if (typeof localStorage !== "undefined") localStorage.setItem("vnsc_toolbar_docked", String(next));
			} catch { /* private-mode: session-only */ }
			return next;
		});
	}, []);

	const [localMaxVisiblePanes, setLocalMaxVisiblePanes] = useState(() => {
		const val = readSetting("vnsc_settings_maxVisiblePanes") || readSetting("vnsc_maxVisiblePanes");
		return val ? parseInt(val, 10) : 6;
	});
	const activeMaxVisiblePanes = maxVisiblePanes !== undefined ? maxVisiblePanes : localMaxVisiblePanes;

	const [localMaxVisibleBars, setLocalMaxVisibleBars] = useState(() => {
		const val = readSetting("vnsc_settings_maxVisibleBars") || readSetting("vnsc_maxVisibleBars");
		return val ? parseInt(val, 10) : 40000;
	});
	const activeMaxVisibleBars = maxVisibleBars !== undefined ? maxVisibleBars : localMaxVisibleBars;

	const [localShowNonTradingDays, setLocalShowNonTradingDays] = useState(() => {
		const val = readSetting("vnsc_settings_showNonTradingDays") || readSetting("vnsc_showNonTradingDays");
		return val ? val === "true" : false;
	});
	const activeShowNonTradingDays = showNonTradingDays !== undefined ? showNonTradingDays : localShowNonTradingDays;

	const [localShowDrawingPriceMarkers, setLocalShowDrawingPriceMarkers] = useState(() => {
		const val = readSetting("vnsc_settings_showDrawingPriceMarkers") || readSetting("vnsc_showDrawingPriceMarkers");
		return val ? val === "true" : true;
	});
	const activeShowDrawingPriceMarkers = showDrawingPriceMarkers !== undefined ? showDrawingPriceMarkers : localShowDrawingPriceMarkers;

	const [overlayTimeframe, setOverlayTimeframe] = useState<string | undefined>(() => {
		return readSetting("vnsc_settings_overlayTimeframe") || readSetting("vnsc_overlayTimeframe") || undefined;
	});

	const [overlayStyle, setOverlayStyle] = useState<"hollow" | "step" | "area" | "candle">(() => {
		return (readSetting("vnsc_settings_overlayStyle") as any) || (readSetting("vnsc_overlayStyle") as any) || "candle"; // ARC-1-keep: legacy bridge
	});

	useEffect(() => {
		try {
			if (overlayTimeframe) {
				writeScopedSetting(storageAdapter, "vnsc_settings_overlayTimeframe", overlayTimeframe, myChartId);
				writeScopedSetting(storageAdapter, "vnsc_overlayTimeframe", overlayTimeframe, myChartId);
			} else {
				removeScopedSetting(storageAdapter, "vnsc_settings_overlayTimeframe", myChartId);
				removeScopedSetting(storageAdapter, "vnsc_overlayTimeframe", myChartId);
			}
		} catch {}
	}, [overlayTimeframe, myChartId]);

	useEffect(() => {
		writeScopedSetting(storageAdapter, "vnsc_settings_overlayStyle", overlayStyle, myChartId);
		writeScopedSetting(storageAdapter, "vnsc_overlayStyle", overlayStyle, myChartId);
	}, [overlayStyle, myChartId]);

	const [localEnableWhale, setLocalEnableWhale] = useState(() => {
		const val = readSetting("vnsc_settings_enableWhale") || readSetting("vnsc_enableWhale");
		return val ? val === "true" : true;
	});
	const activeEnableWhale = enableWhale !== undefined ? enableWhale : localEnableWhale;

	const [localWhaleThreshold, setLocalWhaleThreshold] = useState(() => {
		const val = readSetting("vnsc_settings_whaleThreshold") || readSetting("vnsc_whaleThreshold");
		return val ? parseInt(val, 10) : 1000000;
	});
	const activeWhaleThreshold = whaleThreshold ?? localWhaleThreshold;

	const [localEnableCVD, setLocalEnableCVD] = useState(() => {
		const val = readSetting("vnsc_settings_enableCVD") || readSetting("vnsc_enableCVD");
		return val ? val === "true" : false;
	});
	const activeEnableCVD = enableCVD !== undefined ? enableCVD : localEnableCVD;

	const [localCvdMode, setLocalCvdMode] = useState<"oscillator" | "histogram">(() => hydrateCvdMode(readSetting));
	const activeCvdMode = cvdMode !== undefined ? cvdMode : localCvdMode;

	const [localTimezone, setLocalTimezone] = useState<WidgetTimezone>(() => hydrateTimezone(readSetting));
	const activeTimezone = timezone || localTimezone;

	const [localAlertAudioEnabled, setLocalAlertAudioEnabled] = useState(() => hydrateAlertAudioEnabled(readSetting));
	const activeAlertAudioEnabled = localAlertAudioEnabled;

	const [localSettingsOpen, setLocalSettingsOpen] = useState(false);
	const activeSettingsOpen = settingsOpen !== undefined ? settingsOpen : localSettingsOpen;

	const themeState = useChartTheme("modern-light");
	const resolvedTheme = theme ?? themeState.theme;
	const isDark = resolvedTheme !== "modern-light" && resolvedTheme !== "neutral-pro";

	const [isFullscreen, setIsFullscreen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);

	const [statusLineSettings, setStatusLineSettings] = useState(() => {
		const raw = readSetting(LEGACY_COMPOSITE_KEY);
		if (raw) {
			try {
				const parsed = JSON.parse(raw);
				if (parsed.statusLine) return { ...parsed.statusLine, showOHLC: parsed.statusLine.showOHLC ?? parsed.statusLine.showOhlc ?? true };
			} catch {
				// Corrupted JSON fallback
			}
		}
		return {
			showLogo: false,
			showTicker: true,
			showOHLC: true,
			showBarChange: true,
			showVolume: true,
			showIndicatorTitles: true,
			showIndicatorArguments: true,
			showIndicatorValues: true,
			backgroundOpacity: 0.8,
		};
	});

	const [scalesSettings, setScalesSettings] = useState(() => {
		const defaultShowScrollbar = showTimeScrollbar !== undefined ? showTimeScrollbar : !myChartId;
		const val = readSetting("vnsc_settings_showTimeScrollbar");
		const storedScrollbar = val !== null && val !== undefined ? val === "true" : undefined;
		const raw = readSetting(LEGACY_COMPOSITE_KEY);
		if (raw) {
			try {
				const parsed = JSON.parse(raw);
				if (parsed.scales) {
					return {
						...parsed.scales,
						showTimeScrollbar: storedScrollbar !== undefined ? storedScrollbar : (parsed.scales.showTimeScrollbar ?? defaultShowScrollbar),
						dateFormat: parsed.scales.dateFormat ?? "yyyy-mm-dd",
					};
				}
			} catch {
				// Corrupted JSON fallback
			}
		}
		if (storedScrollbar !== undefined) {
			return {
				priceScaleMode: "normal" as const,
				invertScale: false,
				countdownToBarClose: true,
				showTimeScrollbar: storedScrollbar,
				dateFormat: "yyyy-mm-dd" as const,
			};
		}
		return {
			priceScaleMode: "normal" as const,
			invertScale: false,
			countdownToBarClose: true,
			showTimeScrollbar: defaultShowScrollbar,
			dateFormat: "yyyy-mm-dd" as const,
		};
	});

	useEffect(() => {
		const handleSync = (e: Event) => {
			const custom = e as CustomEvent<any>;
			if (!shouldAcceptSettingsEvent(myChartId, custom.detail?.chartId ?? null)) return;
			// Enveloped (detail.state) and legacy (detail directly) shapes.
			const state = custom.detail?.state ?? custom.detail;
			if (state?.statusLine) setStatusLineSettings({ ...state.statusLine, showOHLC: state.statusLine.showOHLC ?? state.statusLine.showOhlc ?? true });
			if (state?.scales) {
				setScalesSettings(state.scales);
			}
		};
		if (typeof window !== "undefined") {
			window.addEventListener("vnsc-settings-sync", handleSync);
			return () => window.removeEventListener("vnsc-settings-sync", handleSync);
		}
	}, [myChartId]);

	useEffect(() => {
		if (typeof document === "undefined") return;
		const handleFullscreenChange = () => {
			setIsFullscreen(document.fullscreenElement === containerRef.current);
		};
		// Use shadowRoot for capture-phase listeners in Shadow DOM mode
		const target = shadowRoot ?? document;
		target.addEventListener("fullscreenchange", handleFullscreenChange, { capture: true });
		return () => {
			target.removeEventListener("fullscreenchange", handleFullscreenChange, { capture: true });
		};
	}, [containerRef, shadowRoot]);

	const handleFullscreenToggle = useCallback(() => {
		if (!containerRef.current) return;
		if (!document.fullscreenElement) {
			containerRef.current.requestFullscreen().catch((err) => {
				console.debug(`Error entering fullscreen: ${err.message}`);
			});
		} else {
			document.exitFullscreen();
		}
	}, [containerRef]);

	useEffect(() => {
		if (typeof document === "undefined") return;
		if ((activeSettingsOpen || !!previewImageDataUrl) && document.fullscreenElement) {
			document.exitFullscreen().catch((err) => {
				console.debug(`Error exiting fullscreen: ${err.message}`);
			});
		}
	}, [activeSettingsOpen, previewImageDataUrl]);

	// W1.4: KHÔNG gate ở đây. `useWidgetSettings` được tạo ở dòng ~288, **trước**
	// `useTierGatedFeatures` (~693) nên hook này không thấy tier. Gate nằm ở
	// `handleGatedSnapshot` trong `VNInvestCharts` — đặt sau `handleUpgradeFromBanner`
	// để dùng được cho cả nút header lẫn public API `saveAsImage`.
	const handleSnapshot = useCallback(() => {
		if (containerRef.current) {
			const bg = isDark ? "#0a0e14" : "#ffffff";
			SaveChartAsImage.save(document, containerRef.current, bg, isDark, (dataUrl) => {
				setPreviewImageDataUrl(dataUrl);
			}, { tier: tierRef?.current });
		}
	}, [containerRef, isDark]);

	const activeOnSettingsClose = useCallback(() => {
		if (onSettingsClose) {
			onSettingsClose();
		} else {
			setLocalSettingsOpen(false);
		}
	}, [onSettingsClose]);

	// Text edit state
	const [isEditingText, setIsEditingText] = useState(false);
	const [drawingTextDraft, setDrawingTextDraft] = useState("");

	const handleStartTextEdit = useCallback((draft: string) => {
		setDrawingTextDraft(draft);
		setIsEditingText(true);
	}, []);

	const handleCommitTextEdit = useCallback((commitCallback: (draft: string) => void) => {
		commitCallback(drawingTextDraft);
		setIsEditingText(false);
	}, [drawingTextDraft]);

	const handleCancelTextEdit = useCallback(() => {
		setIsEditingText(false);
	}, []);

	// Consuming context paneState to synchronize settings/toolbar actions
	const { paneState } = useVNInvestChartsState();

	// Local panes state fallback
	const {
		panes: localPanes,
		visiblePanes: localVisiblePanes,
		heights: localHeights,
		available: localAvailable,
		toggleVisible: localToggleVisible,
		addPane: localAddPane,
		removePane: localRemovePane,
		addSeries: localAddSeries,
		removeSeries: localRemoveSeries,
		toggleSeriesVisible: localToggleSeriesVisible,
		applyDelta: localApplyDelta,
		equalizePair: localEqualizePair,
		replaceLayout: localReplaceLayout,
		resetToDefault: localResetToDefault,
	} = useDynamicPanes(size.height, {
		maxVisiblePanes: activeMaxVisiblePanes,
		panesOverride: paneState.panes,
		dispatchOverride: paneState.dispatch,
		storageScopeId: myChartId ?? null,
	});

	useEffect(() => {
		if (panes) {
			localReplaceLayout(panes);
		}
	}, [panes, localReplaceLayout]);

	const onTimeframeChangeRef = useRef(onTimeframeChange);
	onTimeframeChangeRef.current = onTimeframeChange;
	const onRangeChangeRef = useRef(onRangeChange);
	onRangeChangeRef.current = onRangeChange;

	const handleTimeframeChange = useCallback((tf: Timeframe) => {
		setLocalTimeframe(tf);
		onTimeframeChangeRef.current?.(tf);
	}, []);

	const handleRangeChange = useCallback((r: string) => {
		setLocalRange(r);
		onRangeChangeRef.current?.(r);
	}, []);

	// Series Display Translation Helper
	const getPaneLabel = useCallback((id: string, label: string): string => {
		if (id === "price") return t("pane.price") || label;
		if (id === "volume") return t("pane.volume") || label;
		const val = t(`pane.${id}`);
		if (val == null || val === `pane.${id}`) return label;
		return val;
	}, [t]);

	const localizePane = useCallback((pane: PaneDescriptor): PaneDescriptor => {
		const nextLabel = getPaneLabel(pane.id, pane.label);
		return nextLabel === pane.label ? pane : { ...pane, label: nextLabel };
	}, [getPaneLabel]);

	const handlePaneToggleVisible = useCallback((paneId: string) => {
		if (onPaneToggleVisibleRequest) {
			onPaneToggleVisibleRequest(paneId);
		} else {
			localToggleVisible(paneId);
		}
	}, [localToggleVisible, onPaneToggleVisibleRequest]);

	const handlePaneRemove = useCallback((paneId: string) => {
		if (onPaneRemoveRequest) {
			onPaneRemoveRequest(paneId);
		} else {
			localRemovePane(paneId);
		}
	}, [localRemovePane, onPaneRemoveRequest]);

	const handlePaneAddSeries = useCallback((paneId: string) => {
		if (onPaneAddSeriesRequest) {
			onPaneAddSeriesRequest(paneId);
		} else {
			setLocalSelectedPaneId(paneId);
			setLocalSettingsOpen(true);
		}
	}, [onPaneAddSeriesRequest]);

	// P3-a: legend gear button — open SettingsModal focused on the series' pane.
	const handlePaneEditSeries = useCallback((paneId: string) => {
		setLocalSelectedPaneId(paneId);
		setLocalSettingsOpen(true);
	}, []);

	const handlePaneToggleSeries = useCallback((paneId: string, seriesType: any, seriesIndex?: number) => {
		if (onPaneToggleSeriesRequest) {
			onPaneToggleSeriesRequest(paneId, seriesType, seriesIndex);
		} else {
			localToggleSeriesVisible(paneId, seriesType, seriesIndex);
		}
	}, [localToggleSeriesVisible, onPaneToggleSeriesRequest]);

	const handlePaneRemoveSeries = useCallback((paneId: string, seriesType: any, seriesIndex?: number) => {
		if (onPaneRemoveSeriesRequest) {
			onPaneRemoveSeriesRequest(paneId, seriesType, seriesIndex);
		} else {
			localRemoveSeries(paneId, seriesType, seriesIndex);
		}
	}, [localRemoveSeries, onPaneRemoveSeriesRequest]);

	const activeLocale = locale ?? "vi";
	const [magnetSensitivity, setMagnetSensitivity] = useState<MagnetSensitivity>("normal");

	// The crosshair mode is owned by `useChartSettingsSections` (Batch B / B2):
	// the top bar and the appearance tab must never disagree, and the tab
	// writes the composite while the top bar writes the scoped key.

	return {
		localTimeframe,
		setLocalTimeframe,
		localRange,
		setLocalRange,
		internalXExtents,
		setInternalXExtents,
		localSelectedPaneId,
		setLocalSelectedPaneId,
		toolbarLocked,
		setToolbarLocked,
		localMaxVisiblePanes,
		setLocalMaxVisiblePanes,
		activeMaxVisiblePanes,
		localMaxVisibleBars,
		setLocalMaxVisibleBars,
		activeMaxVisibleBars,
		localShowNonTradingDays,
		setLocalShowNonTradingDays,
		activeShowNonTradingDays,
		localShowDrawingPriceMarkers,
		setLocalShowDrawingPriceMarkers,
		activeShowDrawingPriceMarkers,
		localEnableWhale,
		setLocalEnableWhale,
		activeEnableWhale,
		localWhaleThreshold,
		setLocalWhaleThreshold,
		activeWhaleThreshold,
		localEnableCVD,
		setLocalEnableCVD,
		activeEnableCVD,
		localCvdMode,
		setLocalCvdMode,
		activeCvdMode,
		localTimezone,
		setLocalTimezone,
		activeTimezone,
		localAlertAudioEnabled,
		setLocalAlertAudioEnabled,
		activeAlertAudioEnabled,
		localSettingsOpen,
		setLocalSettingsOpen,
		activeSettingsOpen,
		activeOnSettingsClose,
		isFullscreen,
		setIsFullscreen,
		searchOpen,
		setSearchOpen,
		isEditingText,
		setIsEditingText,
		drawingTextDraft,
		setDrawingTextDraft,
		handleStartTextEdit,
		handleCommitTextEdit,
		handleCancelTextEdit,
		handleFullscreenToggle,
		handleSnapshot,
		handleTimeframeChange,
		handleRangeChange,
		getPaneLabel,
		localizePane,
		handlePaneToggleVisible,
		handlePaneRemove,
		handlePaneAddSeries,
		handlePaneEditSeries,
		handlePaneToggleSeries,
		handlePaneRemoveSeries,
		visiblePanes: localVisiblePanes,
		activeHeights: localHeights,
		themeState,
		resolvedTheme,
		isDark,
		previewImageDataUrl,
		setPreviewImageDataUrl,
		activeLocale,
		magnetSensitivity,
		setMagnetSensitivity,
		localAvailable,
		localApplyDelta,
		localEqualizePair,
		localResetToDefault,
		t: (key: string) => t(key) ?? key,
		overlayTimeframe,
		setOverlayTimeframe,
		overlayStyle,
		setOverlayStyle,
		statusLineSettings,
		scalesSettings,
	};
}