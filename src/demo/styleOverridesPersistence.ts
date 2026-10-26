import {
	clearSeriesStyleOverrides,
	listSeriesStyleOverrides,
	overrideSeriesStyle,
	type SeriesStyleOverride,
} from "../lib/core";
import { clearDrawingStyleOverrides, listDrawingStyleOverrides, overrideDrawingStyle, type DrawingStyleOverride } from "@vninvestcharts/engine-drawing";

export const STYLE_OVERRIDES_STORAGE_KEY = "rsc-demo-style-overrides-v1";

export interface PersistedStyleOverrides {
	series: Record<string, Partial<SeriesStyleOverride>>;
	drawings: Record<string, Partial<DrawingStyleOverride>>;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(storage?: StorageLike | null) {
	if (storage) {
		return storage;
	}
	if (typeof localStorage === "undefined") {
		return null;
	}
	return localStorage;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStyleMap<T>(value: unknown): Record<string, Partial<T>> {
	if (!isPlainRecord(value)) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(value)
			.filter(([id, style]) => typeof id === "string" && id.length > 0 && isPlainRecord(style))
			.map(([id, style]) => [id, { ...(style as Record<string, unknown>) } as Partial<T>]),
	);
}

function isEmptyOverrides(overrides: PersistedStyleOverrides) {
	return Object.keys(overrides.series).length === 0 && Object.keys(overrides.drawings).length === 0;
}

export function snapshotStyleOverrides(): PersistedStyleOverrides {
	return {
		series: listSeriesStyleOverrides(),
		drawings: listDrawingStyleOverrides(),
	};
}

export function loadPersistedStyleOverrides(storage?: StorageLike | null): PersistedStyleOverrides | null {
	const resolvedStorage = getStorage(storage);
	if (!resolvedStorage) {
		return null;
	}

	try {
		const raw = resolvedStorage.getItem(STYLE_OVERRIDES_STORAGE_KEY);
		if (!raw) {
			return null;
		}

		const parsed = JSON.parse(raw);
		if (!isPlainRecord(parsed)) {
			return null;
		}

		return {
			series: normalizeStyleMap<SeriesStyleOverride>(parsed.series),
			drawings: normalizeStyleMap<DrawingStyleOverride>(parsed.drawings),
		};
	} catch {
		return null;
	}
}

export function saveCurrentStyleOverrides(storage?: StorageLike | null): void {
	const resolvedStorage = getStorage(storage);
	if (!resolvedStorage) {
		return;
	}

	const overrides = snapshotStyleOverrides();
	try {
		if (isEmptyOverrides(overrides)) {
			resolvedStorage.removeItem(STYLE_OVERRIDES_STORAGE_KEY);
			return;
		}

		resolvedStorage.setItem(STYLE_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
	} catch {
		// ignore storage failures
	}
}

export function restorePersistedStyleOverrides(storage?: StorageLike | null): void {
	clearSeriesStyleOverrides();
	clearDrawingStyleOverrides();

	const overrides = loadPersistedStyleOverrides(storage);
	if (!overrides) {
		return;
	}

	Object.entries(overrides.series).forEach(([instanceId, style]) => {
		overrideSeriesStyle(instanceId, style);
	});
	Object.entries(overrides.drawings).forEach(([drawingId, style]) => {
		overrideDrawingStyle(drawingId, style);
	});
}