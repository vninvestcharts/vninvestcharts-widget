/**
 * Workspace settings distribution (Settings S4/S5).
 * Provided by the multi-chart grid only. Single-chart has no provider
 * (legacy global behavior). Zero-delta for VNInvestMultiCharts/VNInvestCharts:
 * GridContainer wraps its slots with this provider.
 */
import React, { createContext, useContext, useEffect, useMemo } from "react";
import type { StorageAdapter } from "@vninvestcharts/engine-react";
import { LEGACY_COMPOSITE_KEY, settingsCompositeKey } from "../settings/storageKeys";
import {
	APPLY_APPEARANCE_EVENT,
	APPLIED_APPEARANCE_EVENT,
	applyAppearancePayload,
	type ApplyAppearanceDetail,
} from "../settings/model/appearancePayload";
import type { ChartSettingsState } from "../settings/model/chartSettingsSchema";
import { createDefaultSettings } from "../settings/model/defaultSettings";
import { useOptionalWorkspacePaperVisibility } from "../../context/WorkspacePaperVisibilityContext";

export interface WorkspaceSettingsValue {
	/** True when inside a multi-chart grid (badge + Apply to All visible). */
	isMultiChart: boolean;
}

const WorkspaceSettingsContext = createContext<WorkspaceSettingsValue>({ isMultiChart: false });

export function useWorkspaceSettings(): WorkspaceSettingsValue {
	return useContext(WorkspaceSettingsContext);
}

function readComposite(adapter: StorageAdapter | undefined, key: string): ChartSettingsState | null {
	try {
		const raw = adapter?.getItem(key) ?? (typeof window !== "undefined" ? window.localStorage.getItem(key) : null);
		if (!raw) return null;
		return JSON.parse(raw) as ChartSettingsState;
	} catch {
		return null;
	}
}

function writeComposite(adapter: StorageAdapter | undefined, key: string, state: ChartSettingsState): void {
	try {
		const raw = JSON.stringify(state);
		try {
			adapter?.setItem(key, raw);
		} catch {
			// Adapter failure -> still try localStorage.
		}
		if (typeof window !== "undefined" && window.localStorage) {
			window.localStorage.setItem(key, raw);
		}
	} catch {
		// Private browsing -> session-only.
	}
}

export interface WorkspaceSettingsProviderProps {
	children: React.ReactNode;
	/** All chartIds in the grid (fan-out targets). */
	chartIds: readonly string[];
	/** Shared storage adapter (same instance as grid cells). */
	storageAdapter?: StorageAdapter;
}

/**
 * Marks the subtree as multi-chart and fans out Apply-to-All payloads:
 * merges the appearance slice into EVERY chart's scoped composite and
 * dispatches a targeted `vnsc-settings-sync` envelope per chart so cells
 * repaint immediately without reload. Never touches symbol/panes/scale.
 */
export function WorkspaceSettingsProvider(props: WorkspaceSettingsProviderProps) {
	const { children, chartIds, storageAdapter } = props;
	const value = useMemo<WorkspaceSettingsValue>(() => ({ isMultiChart: true }), []);
	// Paper store lives above the grid (Multi provides it); fan-out writes the
	// source chart's visibility into every chart when the event carries it.
	const paperVisibility = useOptionalWorkspacePaperVisibility();

	useEffect(() => {
		if (typeof window === "undefined") return;
		const handler = (e: Event) => {
			const detail = (e as CustomEvent<ApplyAppearanceDetail>).detail;
			if (!detail || typeof detail.sourceChartId !== "string" || !detail.payload) return;
			let applied = 0;
			for (const targetId of chartIds) {
				if (targetId === detail.sourceChartId) continue;
				const key = settingsCompositeKey(targetId);
				let current = readComposite(storageAdapter, key);
				if (!current) {
					// Target never opened Settings (no scoped key yet): seed from
					// legacy once (grid scrollbar forced OFF, R4), else from
					// theme-matched defaults — never skip, never copy identity.
					const legacy = readComposite(storageAdapter, LEGACY_COMPOSITE_KEY);
					current = legacy
						? { ...legacy, scales: { ...legacy.scales, showTimeScrollbar: false } }
						: createDefaultSettings(
							detail.payload.theme.mode === "dark",
							detail.payload.theme.presetName,
							false
						);
				}
				const next = applyAppearancePayload(current, detail.payload);
				writeComposite(storageAdapter, key, next);
				applied += 1;
				try {
					window.dispatchEvent(
						new CustomEvent("vnsc-settings-sync", { detail: { chartId: targetId, state: next } })
					);
					document.dispatchEvent(
						new CustomEvent("vnsc-theme-change", { detail: { chartId: targetId, theme: next.theme } })
					);
				} catch {
					// Listener failure on one chart must not block the rest.
				}
				if (detail.paperEnabled !== undefined) {
					try {
						paperVisibility?.setChart(targetId, detail.paperEnabled);
					} catch {
						// Visibility fan-out is best-effort.
					}
				}
			}
			try {
				window.dispatchEvent(
					new CustomEvent(APPLIED_APPEARANCE_EVENT, {
						detail: { sourceChartId: detail.sourceChartId, applied },
					})
				);
			} catch {
				// Feedback is best-effort.
			}
		};
		window.addEventListener(APPLY_APPEARANCE_EVENT, handler);
		return () => window.removeEventListener(APPLY_APPEARANCE_EVENT, handler);
	}, [chartIds, storageAdapter, paperVisibility]);

	return <WorkspaceSettingsContext.Provider value={value}>{children}</WorkspaceSettingsContext.Provider>;
}
