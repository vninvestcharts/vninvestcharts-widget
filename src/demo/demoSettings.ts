import type { WidgetTimezone } from "../lib/utils/timezoneFormatter";

// G4 2026-10-03: the legacy lane was removed with DynamicChart, so "legacy" is no longer
// selectable. Kept "auto" because it is still accepted by the widget and resolves to fork.
export type DemoRuntimeLane = "auto" | "fork";

export const MAX_VISIBLE_BARS_OPTIONS = [
	1_000,
	2_000,
	5_000,
	10_000,
	15_000,
	20_000,
	30_000,
	40_000,
] as const;

export interface DemoSettings {
	maxVisiblePanes: number;
	maxVisibleBars: number;
	// Phase 2 (ZOOM_SPEED_REDUCTION_PLAN): per-step zoom multiplier (1.05-1.3).
	zoomSpeed?: number;
	showNonTradingDays: boolean;
	showDrawingPriceMarkers: boolean;
	enableWhale?: boolean;
	whaleThreshold?: number;
	enableCVD?: boolean;
	cvdMode?: "oscillator" | "histogram";
	timezone?: WidgetTimezone;
	alertAudioEnabled?: boolean;
	runtimeLane?: DemoRuntimeLane;
	// CE25: Multi-timeframe persistence and visibility controls
	syncTimeframesEnabled?: boolean;
	visibilityControlsEnabled?: boolean;
}

export const DEMO_SETTINGS_STORAGE_KEY = "rsc-demo-settings-v3";
const PREVIOUS_DEMO_SETTINGS_STORAGE_KEY = "rsc-demo-settings-v2";
const LEGACY_DEMO_SETTINGS_STORAGE_KEY = "rsc-demo-settings-v1";
const DEFAULT_MAX_VISIBLE_PANES = 5;
const DEFAULT_MAX_VISIBLE_BARS = 20_000;
const DEFAULT_ZOOM_SPEED = 1.15;
const MIN_ZOOM_SPEED = 1.05;
const MAX_ZOOM_SPEED = 1.3;
const VALID_WIDGET_TIMEZONES = ["Asia/Ho_Chi_Minh", "UTC", "America/New_York", "Europe/London"] as const;

function normalizeMaxVisibleBars(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_MAX_VISIBLE_BARS;
	}

	const floored = Math.floor(value);
	if ((MAX_VISIBLE_BARS_OPTIONS as readonly number[]).includes(floored)) {
		return floored;
	}

	return DEFAULT_MAX_VISIBLE_BARS;
}

function normalizeZoomSpeed(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_ZOOM_SPEED;
	}
	return Math.min(MAX_ZOOM_SPEED, Math.max(MIN_ZOOM_SPEED, value));
}

function isValidWidgetTimezone(value: unknown): value is WidgetTimezone {
	return typeof value === "string" && (VALID_WIDGET_TIMEZONES as readonly string[]).includes(value);
}

function isDemoRuntimeLane(value: unknown): value is DemoRuntimeLane {
	return value === "auto" || value === "fork";
}

export const DEFAULT_DEMO_SETTINGS: DemoSettings = {
	maxVisiblePanes: DEFAULT_MAX_VISIBLE_PANES,
	maxVisibleBars: DEFAULT_MAX_VISIBLE_BARS,
	zoomSpeed: DEFAULT_ZOOM_SPEED,
	showNonTradingDays: false,
	showDrawingPriceMarkers: true,
	enableWhale: true,
	whaleThreshold: 1_000_000,
	enableCVD: false,
	cvdMode: "oscillator",
	timezone: "Asia/Ho_Chi_Minh",
	alertAudioEnabled: false,
	runtimeLane: "fork",
	// CE25: Multi-timeframe persistence and visibility controls
	syncTimeframesEnabled: false,
	visibilityControlsEnabled: false,
};

function migrateRuntimeLaneToFork(settings: DemoSettings): DemoSettings {
	if (settings.runtimeLane === "auto") {
		return {
			...settings,
			runtimeLane: "fork",
		};
	}

	return settings;
}

function normalizeDemoSettings(parsed: Partial<DemoSettings>): DemoSettings {
	return {
		maxVisiblePanes: typeof parsed.maxVisiblePanes === "number" && Number.isFinite(parsed.maxVisiblePanes)
			? Math.max(1, Math.floor(parsed.maxVisiblePanes))
			: DEFAULT_MAX_VISIBLE_PANES,
		maxVisibleBars: normalizeMaxVisibleBars(parsed.maxVisibleBars),
		zoomSpeed: normalizeZoomSpeed(parsed.zoomSpeed),
		showNonTradingDays: typeof parsed.showNonTradingDays === "boolean"
			? parsed.showNonTradingDays
			: DEFAULT_DEMO_SETTINGS.showNonTradingDays,
		showDrawingPriceMarkers: typeof parsed.showDrawingPriceMarkers === "boolean"
			? parsed.showDrawingPriceMarkers
			: DEFAULT_DEMO_SETTINGS.showDrawingPriceMarkers,
		enableWhale: typeof parsed.enableWhale === "boolean" ? parsed.enableWhale : DEFAULT_DEMO_SETTINGS.enableWhale,
		whaleThreshold: typeof parsed.whaleThreshold === "number" && Number.isFinite(parsed.whaleThreshold)
			? parsed.whaleThreshold
			: DEFAULT_DEMO_SETTINGS.whaleThreshold,
		enableCVD: typeof parsed.enableCVD === "boolean" ? parsed.enableCVD : DEFAULT_DEMO_SETTINGS.enableCVD,
		cvdMode: parsed.cvdMode === "oscillator" || parsed.cvdMode === "histogram"
			? parsed.cvdMode
			: DEFAULT_DEMO_SETTINGS.cvdMode,
		timezone: isValidWidgetTimezone(parsed.timezone) ? parsed.timezone : DEFAULT_DEMO_SETTINGS.timezone,
		alertAudioEnabled: typeof parsed.alertAudioEnabled === "boolean"
			? parsed.alertAudioEnabled
			: DEFAULT_DEMO_SETTINGS.alertAudioEnabled,
		runtimeLane: isDemoRuntimeLane(parsed.runtimeLane) ? parsed.runtimeLane : DEFAULT_DEMO_SETTINGS.runtimeLane,
		// CE25: Multi-timeframe persistence and visibility controls
		syncTimeframesEnabled: typeof parsed.syncTimeframesEnabled === "boolean" ? parsed.syncTimeframesEnabled : DEFAULT_DEMO_SETTINGS.syncTimeframesEnabled,
		visibilityControlsEnabled: typeof parsed.visibilityControlsEnabled === "boolean" ? parsed.visibilityControlsEnabled : DEFAULT_DEMO_SETTINGS.visibilityControlsEnabled,
	};
}

export function loadDemoSettings(): DemoSettings {
	if (typeof localStorage === "undefined") {
		return DEFAULT_DEMO_SETTINGS;
	}

	try {
		const raw = localStorage.getItem(DEMO_SETTINGS_STORAGE_KEY);
		if (raw) {
			return normalizeDemoSettings(JSON.parse(raw) as Partial<DemoSettings>);
		}

		const previousRaw = localStorage.getItem(PREVIOUS_DEMO_SETTINGS_STORAGE_KEY);
		if (previousRaw) {
			const migratedSettings = migrateRuntimeLaneToFork(normalizeDemoSettings(JSON.parse(previousRaw) as Partial<DemoSettings>));
			return migratedSettings;
		}

		const legacyRaw = localStorage.getItem(LEGACY_DEMO_SETTINGS_STORAGE_KEY);
		if (!legacyRaw) {
			return DEFAULT_DEMO_SETTINGS;
		}

		const migratedSettings = normalizeDemoSettings(JSON.parse(legacyRaw) as Partial<DemoSettings>);
		return {
			...migrateRuntimeLaneToFork(migratedSettings),
			enableCVD: DEFAULT_DEMO_SETTINGS.enableCVD,
		};
	} catch {
		return DEFAULT_DEMO_SETTINGS;
	}
}

export function saveDemoSettings(settings: DemoSettings) {
	if (typeof localStorage === "undefined") {
		return;
	}

	try {
		localStorage.setItem(DEMO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
		localStorage.removeItem(PREVIOUS_DEMO_SETTINGS_STORAGE_KEY);
		localStorage.removeItem(LEGACY_DEMO_SETTINGS_STORAGE_KEY);
	} catch {
		// ignore storage errors
	}
}