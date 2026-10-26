/**
 * Batch B — reactive access to the chart-settings SECTIONS that no runtime
 * consumer read before (Appearance, Symbol, Trading) plus the two fields the
 * runtime already needs (`scales.timeFormat`, `appearance.crosshairMode`).
 *
 * Why a new hook instead of extending `useWidgetSettings`:
 * that file sits at 798/800 lines (fat-file budget) and its `scalesSettings`
 * state is typed by inference, so it cannot carry `timeFormat` without a
 * type-only rewrite. The sections live in the composite
 * (`vnsc_chart_settings_v1[_<chartId>]`), which the Settings modal writes and
 * broadcasts through the `vnsc-settings-sync` event.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrosshairMode } from "@vninvestcharts/engine-core";
import type { StorageAdapter } from "@vninvestcharts/engine-react";
import type { ChartSettingsState } from "../components/settings/model/chartSettingsSchema";
import { createDefaultSettings } from "../components/settings/model/defaultSettings";
import {
	LEGACY_COMPOSITE_KEY,
	normalizeChartId,
	readScopedSetting,
	settingsCompositeKey,
	shouldAcceptSettingsEvent,
	writeScopedSetting,
} from "../components/settings/storageKeys";

export interface ChartSettingsSections {
	appearance: ChartSettingsState["appearance"];
	symbol: ChartSettingsState["symbol"];
	scales: ChartSettingsState["scales"];
	tradingEvents: ChartSettingsState["tradingEvents"];
}

export interface UseChartSettingsSectionsOptions {
	chartId?: string | null;
	storageAdapter?: StorageAdapter;
	isDark?: boolean;
}

export interface UseChartSettingsSectionsResult {
	sections: ChartSettingsSections;
	/** Single source of truth for the crosshair mode (settings tab + top bar). */
	crosshairMode: CrosshairMode;
	setCrosshairMode: (mode: CrosshairMode) => void;
}

const CROSSHAIR_MODES: readonly CrosshairMode[] = ["cross", "dot", "magnet"];

/** Envelope carried by the `vnsc-settings-sync` event. */
interface SettingsSyncDetail {
	chartId?: string | null;
	state?: Partial<ChartSettingsState>;
}

function readCompositeState(
	storageAdapter: StorageAdapter | undefined,
	chartId: string | null,
): Partial<ChartSettingsState> {
	const raw = readScopedSetting(storageAdapter, LEGACY_COMPOSITE_KEY, chartId);
	if (!raw) return {};
	try {
		return JSON.parse(raw) as Partial<ChartSettingsState>;
	} catch {
		return {};
	}
}

export function useChartSettingsSections(options: UseChartSettingsSectionsOptions): UseChartSettingsSectionsResult {
	const { storageAdapter, isDark } = options;
	const myChartId = normalizeChartId(options.chartId) ?? null;

	const defaults = useMemo(() => createDefaultSettings(isDark ?? true), [isDark]);

	const [state, setState] = useState<Partial<ChartSettingsState>>(() => readCompositeState(storageAdapter, myChartId));

	const sections = useMemo<ChartSettingsSections>(
		() => ({
			appearance: { ...defaults.appearance, ...(state.appearance ?? {}) },
			symbol: { ...defaults.symbol, ...(state.symbol ?? {}) },
			scales: { ...defaults.scales, ...(state.scales ?? {}) },
			tradingEvents: { ...defaults.tradingEvents, ...(state.tradingEvents ?? {}) },
		}),
		[defaults, state],
	);

	// The crosshair mode is mirrored into a scoped single key so the top bar
	// and the settings modal always agree (the modal only knows the composite).
	const crosshairMode = useMemo<CrosshairMode>(() => {
		const scoped = readScopedSetting(storageAdapter, "vnsc_crosshairMode", myChartId);
		if (scoped && CROSSHAIR_MODES.includes(scoped as CrosshairMode)) return scoped as CrosshairMode;
		return state.appearance?.crosshairMode ?? "cross";
	}, [storageAdapter, myChartId, state.appearance?.crosshairMode]);

	useEffect(() => {
		/* eslint-disable-next-line no-restricted-globals */
		if (typeof window === "undefined") return;
		const handleSync = (e: Event) => {
			const detail = (e as CustomEvent<SettingsSyncDetail>).detail;
			if (!detail) return;
			if (!shouldAcceptSettingsEvent(myChartId, detail.chartId ?? null)) return;
			// Enveloped (detail.state) and legacy (detail directly) shapes.
			const next = detail.state ?? (detail as unknown as Partial<ChartSettingsState>);
			if (!next) return;
			const incomingMode = next.appearance?.crosshairMode as CrosshairMode | undefined;
			if (incomingMode && CROSSHAIR_MODES.includes(incomingMode)) {
				writeScopedSetting(storageAdapter, "vnsc_crosshairMode", incomingMode, myChartId);
			}
			setState((prev) => ({ ...prev, ...next }));
		};
		/* eslint-disable-next-line no-restricted-globals */
		window.addEventListener("vnsc-settings-sync", handleSync);
		return () => {
			/* eslint-disable-next-line no-restricted-globals */
			window.removeEventListener("vnsc-settings-sync", handleSync);
		};
	}, [myChartId, storageAdapter]);

	const setCrosshairMode = useCallback(
		(mode: CrosshairMode) => {
			const current = readCompositeState(storageAdapter, myChartId);
			const next: Partial<ChartSettingsState> = {
				...current,
				appearance: {
					...defaults.appearance,
					...(current.appearance ?? {}),
					crosshairMode: mode,
				},
			};
			writeScopedSetting(storageAdapter, settingsCompositeKey(myChartId), JSON.stringify(next), myChartId);
			writeScopedSetting(storageAdapter, "vnsc_crosshairMode", mode, myChartId);
			setState(next);
			/* eslint-disable-next-line no-restricted-globals */
			if (typeof window !== "undefined") {
				/* eslint-disable-next-line no-restricted-globals */
				window.dispatchEvent(
					new CustomEvent("vnsc-settings-sync", { detail: { chartId: myChartId, state: next } }),
				);
			}
		},
		[storageAdapter, myChartId, defaults.appearance],
	);

	return { sections, crosshairMode, setCrosshairMode };
}
