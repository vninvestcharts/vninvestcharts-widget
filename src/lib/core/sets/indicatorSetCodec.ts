import type { PaneDescriptor, SeriesConfig, SeriesTypeId, TooltipMode, YAxisSide } from "../types/pane-descriptor";
import { normalizeSeriesTypeId } from "../types/pane-descriptor";
import type { IndicatorSet, IndicatorSetStorageLike, IndicatorSetsStorage } from "../types/indicator-set";
import { INDICATOR_SETS_STORAGE_KEY } from "../types/indicator-set";

function createId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `indicator-set-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSeriesId(type: SeriesTypeId): string {
	return `${type.toLowerCase()}-${createId()}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneSeries(series: readonly SeriesConfig[]): SeriesConfig[] {
	return series.map((item) => ({
		...item,
		type: normalizeSeriesTypeId(item.type),
		id: item.id ?? createSeriesId(normalizeSeriesTypeId(item.type)),
		params: item.params ? { ...item.params } : undefined,
	}));
}

function clonePane(pane: PaneDescriptor): PaneDescriptor {
	return {
		...pane,
		series: cloneSeries(pane.series),
	};
}

export function cloneIndicatorSet(set: IndicatorSet): IndicatorSet {
	return {
		...set,
		panes: set.panes.map(clonePane),
	};
}

export function createIndicatorSet(name: string, panes: readonly PaneDescriptor[], now = Date.now()): IndicatorSet {
	return {
		id: createId(),
		name: name.trim(),
		createdAt: now,
		updatedAt: now,
		panes: panes.map(clonePane),
		isBuiltin: false,
	};
}

function isYAxisSide(value: unknown): value is YAxisSide {
	return value === "left" || value === "right";
}

function isTooltipMode(value: unknown): value is TooltipMode {
	return value === "ohlc" || value === "value" || value === "none";
}

function isSeriesTypeId(value: unknown): value is SeriesTypeId {
	return typeof value === "string" && value.length > 0;
}

function isSeriesConfig(candidate: unknown): candidate is SeriesConfig {
	if (!isPlainObject(candidate)) {
		return false;
	}
	if (candidate.id !== undefined && typeof candidate.id !== "string") {
		return false;
	}
	if (!isSeriesTypeId(candidate.type) || !isYAxisSide(candidate.yAxis)) {
		return false;
	}
	if (candidate.params !== undefined && !isPlainObject(candidate.params)) {
		return false;
	}
	if (candidate.overlay !== undefined && typeof candidate.overlay !== "boolean") {
		return false;
	}
	if (candidate.color !== undefined && typeof candidate.color !== "string") {
		return false;
	}
	if (candidate.visible !== undefined && typeof candidate.visible !== "boolean") {
		return false;
	}
	return true;
}

function isPaneDescriptor(candidate: unknown): candidate is PaneDescriptor {
	if (!isPlainObject(candidate)) {
		return false;
	}
	return typeof candidate.id === "string"
		&& typeof candidate.label === "string"
		&& typeof candidate.pinned === "boolean"
		&& typeof candidate.visible === "boolean"
		&& typeof candidate.heightRatio === "number"
		&& Array.isArray(candidate.series)
		&& candidate.series.every(isSeriesConfig)
		&& typeof candidate.splitScale === "boolean"
		&& isTooltipMode(candidate.tooltip);
}

export interface IndicatorSetValidationOptions {
	allowedSeriesTypes?: readonly SeriesTypeId[];
	preserveBuiltin?: boolean;
}

export function sanitizeIndicatorSet(candidate: unknown, options: IndicatorSetValidationOptions = {}): IndicatorSet | null {
	if (!isPlainObject(candidate)) {
		return null;
	}

	if (typeof candidate.id !== "string" || typeof candidate.name !== "string") {
		return null;
	}
	if (typeof candidate.createdAt !== "number" || !Number.isFinite(candidate.createdAt)) {
		return null;
	}
	if (typeof candidate.updatedAt !== "number" || !Number.isFinite(candidate.updatedAt)) {
		return null;
	}
	if (!Array.isArray(candidate.panes) || candidate.panes.length === 0 || !candidate.panes.every(isPaneDescriptor)) {
		return null;
	}
	if (candidate.isBuiltin !== undefined && typeof candidate.isBuiltin !== "boolean") {
		return null;
	}

	if (options.allowedSeriesTypes && options.allowedSeriesTypes.length > 0) {
		const allowed = new Set(options.allowedSeriesTypes);
		for (const pane of candidate.panes) {
			for (const series of pane.series) {
				if (!allowed.has(series.type)) {
					return null;
				}
			}
		}
	}

	return {
		id: candidate.id,
		name: candidate.name.trim(),
		createdAt: candidate.createdAt,
		updatedAt: candidate.updatedAt,
		panes: candidate.panes.map(clonePane),
		isBuiltin: options.preserveBuiltin ? candidate.isBuiltin === true : false,
	};
}

export function sanitizeIndicatorSetsStorage(candidate: unknown, options: IndicatorSetValidationOptions = {}): IndicatorSet[] | null {
	if (!isPlainObject(candidate)) {
		return null;
	}

	if (candidate.version !== 1 || !Array.isArray(candidate.sets)) {
		return null;
	}

	const sanitized = candidate.sets
		.map((set) => sanitizeIndicatorSet(set, options))
		.filter((set): set is IndicatorSet => set !== null && set.name.length > 0);

	if (sanitized.length === 0) {
		return [];
	}

	const byId = new Map<string, IndicatorSet>();
	for (const set of sanitized) {
		byId.set(set.id, set);
	}
	return [...byId.values()];
}

export function loadIndicatorSets(storage?: IndicatorSetStorageLike, options: IndicatorSetValidationOptions = {}): IndicatorSet[] {
	if (!storage) {
		return [];
	}

	try {
		const raw = storage.getItem(INDICATOR_SETS_STORAGE_KEY);
		if (!raw) {
			return [];
		}
		const parsed = JSON.parse(raw) as unknown;
		return sanitizeIndicatorSetsStorage(parsed, options) ?? [];
	} catch {
		return [];
	}
}

export function saveIndicatorSets(storage: IndicatorSetStorageLike | undefined, sets: readonly IndicatorSet[]): void {
	if (!storage) {
		return;
	}
	try {
		const payload: IndicatorSetsStorage = {
			version: 1,
			sets: sets.map((set) => cloneIndicatorSet({ ...set, isBuiltin: false })),
		};
		storage.setItem(INDICATOR_SETS_STORAGE_KEY, JSON.stringify(payload));
	} catch {
		// ignore storage quota / sandbox errors
	}
}

export function indicatorSetToPaneLayout(set: IndicatorSet): PaneDescriptor[] {
	return set.panes.map(clonePane);
}

export function buildIndicatorSetFileName(name: string, createdAt: number): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\-\s]+/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "") || "indicator-set";
	const stamp = new Date(createdAt).toISOString().slice(0, 10).replace(/-/g, "");
	return `${slug}-${stamp}.vnsc-set`;
}

export function stringifyIndicatorSet(set: IndicatorSet): string {
	return JSON.stringify(cloneIndicatorSet(set), null, 2);
}