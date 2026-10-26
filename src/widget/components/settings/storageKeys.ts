/**
 * Chart-centric storage keys (Settings S1).
 * SSOT for namespacing per-chart settings. Pattern follows M1 paper-trading
 * namespace (`liveNamespace`: suffix chartId, legacy fallback when absent).
 */
import type { StorageAdapter } from "@vninvestcharts/engine-react";

export const LEGACY_COMPOSITE_KEY = "vnsc_chart_settings_v1";

/** Normalize empty chartId to undefined (single-chart legacy mode). */
export function normalizeChartId(chartId?: string | null): string | undefined {
	return chartId && chartId.length > 0 ? chartId : undefined;
}

/**
 * Composite settings key. Multi-chart cell -> `vnsc_chart_settings_<chartId>`;
 * single-chart (no chartId) -> legacy global key (backward compatible).
 */
export function settingsCompositeKey(chartId?: string | null): string {
	const id = normalizeChartId(chartId);
	return id ? `${LEGACY_COMPOSITE_KEY}_${id}` : LEGACY_COMPOSITE_KEY;
}

/** Scoped single-setting key: `<base>_<chartId>` in multi, `<base>` in single. */
export function scopedSingleKey(base: string, chartId?: string | null): string {
	const id = normalizeChartId(chartId);
	return id ? `${base}_${id}` : base;
}

/** Read scoped-first, fall back to legacy global (one-time migration path). */
export function readScopedSetting(
	adapter: StorageAdapter | undefined,
	base: string,
	chartId?: string | null
): string | null {
	const id = normalizeChartId(chartId);
	try {
		if (id) {
			const scoped = adapter?.getItem(`${base}_${id}`);
			if (scoped !== null && scoped !== undefined) return scoped;
			if (typeof window !== "undefined" && window.localStorage) {
				const ls = window.localStorage.getItem(`${base}_${id}`);
				if (ls !== null) return ls;
			}
		}
		const legacy = adapter?.getItem(base);
		if (legacy !== null && legacy !== undefined) return legacy;
		if (typeof window !== "undefined" && window.localStorage) {
			return window.localStorage.getItem(base);
		}
	} catch {
		// Private browsing or quota errors -> treat as empty.
	}
	return null;
}

/** Write to scoped key in multi, legacy key in single (never both). */
export function writeScopedSetting(
	adapter: StorageAdapter | undefined,
	base: string,
	value: string,
	chartId?: string | null
): void {
	const key = scopedSingleKey(base, chartId);
	try {
		adapter?.setItem(key, value);
	} catch {
		// Adapter failure -> still try localStorage below.
	}
	try {
		if (typeof window !== "undefined" && window.localStorage) {
			window.localStorage.setItem(key, value);
		}
	} catch {
		// Private browsing -> session-only.
	}
}

/** Remove scoped key (reset scope = own chart only). */
export function removeScopedSetting(
	adapter: StorageAdapter | undefined,
	base: string,
	chartId?: string | null
): void {
	const key = scopedSingleKey(base, chartId);
	try {
		adapter?.removeItem?.(key);
	} catch {
		// Ignore.
	}
	try {
		if (typeof window !== "undefined" && window.localStorage) {
			window.localStorage.removeItem(key);
		}
	} catch {
		// Ignore.
	}
}

/**
 * Two-way envelope guard (S2). Multi-chart receiver (`myChartId` set) only
 * accepts events carrying exactly its chartId — legacy/global events are
 * ignored so one chart can never be overwritten by another. Single-chart
 * receiver (no id) only accepts global events and ignores foreign envelopes.
 */
export function shouldAcceptSettingsEvent(
	myChartId?: string | null,
	incomingChartId?: string | null
): boolean {
	const mine = normalizeChartId(myChartId) ?? null;
	const incoming = normalizeChartId(incomingChartId) ?? null;
	if (mine) return incoming === mine;
	return incoming === null;
}
