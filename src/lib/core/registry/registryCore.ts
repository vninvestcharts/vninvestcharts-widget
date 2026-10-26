import type { ComponentType } from "react";
import type { SeriesRenderMode } from "@vninvestcharts/engine-core";
import type { EnrichedDatum } from "../calculators/types";
import type { SeriesSettingField } from "../types/indicator-catalog";
import type { SeriesConfig, SeriesTypeId, YAxisSide } from "../types/pane-descriptor";
import { normalizeSeriesTypeId } from "../types/pane-descriptor";

/**
 * Lõi của SeriesRegistry: map đăng ký, các kiểu entry, override style và
 * helper tier. KHÔNG chứa bất kỳ `register*Series(...)` nào — các đăng ký
 * nằm ở `registerPhaseOne.ts` + 8 module theo nhóm chỉ báo.
 *
 * Lưu ý kiến trúc: map là singleton ở cấp module. Các module đăng ký import
 * *xuông* vào đây (một chiều), nên không có import cycle.
 */
export interface SeriesStyleOverride {
	color?: string;
	lineWidth?: number;
	visible?: boolean;
	opacity?: number;
	dashPattern?: number[];
}

export interface TooltipEntryDef {
	label: string;
	color?: string;
	format: (value: number) => string;
	accessor: (datum: EnrichedDatum) => number | undefined;
}

/** S3b: tối thiểu tier được thêm series (mặc định "free" khi vắng). */
export type SeriesTier = "free" | "pro" | "enterprise";

export interface RegistryEntry {
	component: ComponentType<any>;
	defaultParams: Record<string, unknown>;
	defaultYAxis: YAxisSide;
	tooltipEntry: (config: SeriesConfig) => TooltipEntryDef;
	settingsFields?: readonly SeriesSettingField[];
	tier?: SeriesTier;
	/**
	 * Render mode mà engine sẽ dùng cho series này. Khai báo ở đây để registry là
	 * SSOT phía widget và có thể đối chiếu với `resolveSeriesRenderMode` của
	 * engine (`registry/__tests__/priceChartRenderMode.test.ts`) — hai bảng độc
	 * lập cùng ghi "chế độ vẽ" là cách chắc chắn trôi lệch.
	 */
	renderMode?: SeriesRenderMode;
}

const registry = new Map<SeriesTypeId, RegistryEntry>();
const seriesStyleOverrides = new Map<string, Partial<SeriesStyleOverride>>();
const seriesStyleListeners = new Map<string, Set<() => void>>();
const seriesStyleChangeListeners = new Set<() => void>();

/** Đọc `params.period` nếu hợp lệ, ngược lại dùng fallback của chỉ báo. */
export function periodFromConfig(config: SeriesConfig, fallback: number) {
	const period = config.params?.period;
	return typeof period === "number" && Number.isFinite(period) ? period : fallback;
}

function colorFromConfig(config: SeriesConfig, fallback: string) {
	return typeof config.color === "string" && config.color.length > 0 ? config.color : fallback;
}

function normalizeSeriesStyleOverride(partialStyle: Partial<SeriesStyleOverride>): Partial<SeriesStyleOverride> {
	const normalized: Partial<SeriesStyleOverride> = {};
	if (typeof partialStyle.color === "string" && partialStyle.color.length > 0) {
		normalized.color = partialStyle.color;
	}
	if (typeof partialStyle.lineWidth === "number" && Number.isFinite(partialStyle.lineWidth)) {
		normalized.lineWidth = partialStyle.lineWidth;
	}
	if (typeof partialStyle.visible === "boolean") {
		normalized.visible = partialStyle.visible;
	}
	if (typeof partialStyle.opacity === "number" && Number.isFinite(partialStyle.opacity)) {
		normalized.opacity = Math.min(1, Math.max(0, partialStyle.opacity));
	}
	if (Array.isArray(partialStyle.dashPattern)) {
		const dashPattern = partialStyle.dashPattern.filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
		if (dashPattern.length > 0) {
			normalized.dashPattern = dashPattern;
		}
	}
	return normalized;
}

function cloneSeriesStyleOverride(style?: Partial<SeriesStyleOverride>): Partial<SeriesStyleOverride> | undefined {
	if (!style) {
		return undefined;
	}
	return {
		...style,
		dashPattern: style.dashPattern ? [...style.dashPattern] : undefined,
	};
}

function notifySeriesStyleChange(instanceId: string) {
	seriesStyleListeners.get(instanceId)?.forEach((callback) => callback());
	seriesStyleChangeListeners.forEach((callback) => callback());
}

function notifyAllSeriesStyleChanges() {
	for (const [instanceId, listeners] of seriesStyleListeners) {
		listeners.forEach((callback) => callback());
	}
	seriesStyleChangeListeners.forEach((callback) => callback());
}

function dashPatternToStrokeDasharray(dashPattern?: number[]) {
	if (!dashPattern || dashPattern.length === 0) {
		return "Solid";
	}
	if (dashPattern.length === 1) {
		return dashPattern[0] <= 2 ? "Dot" : "Dash";
	}
	return dashPattern[0] <= 2 ? "Dot" : "Dash";
}

export function registerLineSeries(type: SeriesTypeId, options: Omit<RegistryEntry, "component" | "defaultParams" | "defaultYAxis" | "tooltipEntry"> & {
	component: ComponentType<any>;
	defaultYAxis?: YAxisSide;
	defaultParams?: Record<string, unknown>;
	tooltipEntry: (config: SeriesConfig) => TooltipEntryDef;
	settingsFields?: readonly SeriesSettingField[];
}) {
	registerSeries(type, {
		component: options.component,
		defaultParams: options.defaultParams ?? {},
		defaultYAxis: options.defaultYAxis ?? "right",
		tooltipEntry: options.tooltipEntry,
		settingsFields: options.settingsFields,
	});
}

export function clearRegistry() {
	registry.clear();
}

export function clearSeriesStyleOverrides() {
	seriesStyleOverrides.clear();
	notifyAllSeriesStyleChanges();
}

export function listSeriesStyleOverrides(): Record<string, Partial<SeriesStyleOverride>> {
	return Object.fromEntries([...seriesStyleOverrides.entries()].map(([instanceId, style]) => [instanceId, cloneSeriesStyleOverride(style) ?? {}]));
}

export function overrideSeriesStyle(instanceId: string, partialStyle: Partial<SeriesStyleOverride>): void {
	const normalized = normalizeSeriesStyleOverride(partialStyle);
	const current = seriesStyleOverrides.get(instanceId) ?? {};
	const next = { ...current, ...normalized };
	seriesStyleOverrides.set(instanceId, next);
	notifySeriesStyleChange(instanceId);
}

export function getSeriesStyleOverride(instanceId: string): Partial<SeriesStyleOverride> | undefined {
	return cloneSeriesStyleOverride(seriesStyleOverrides.get(instanceId));
}

export function clearSeriesStyleOverride(instanceId: string): void {
	seriesStyleOverrides.delete(instanceId);
	notifySeriesStyleChange(instanceId);
}

export function subscribeSeriesStyle(instanceId: string, callback: () => void): () => void {
	if (!seriesStyleListeners.has(instanceId)) {
		seriesStyleListeners.set(instanceId, new Set());
	}
	seriesStyleListeners.get(instanceId)!.add(callback);
	return () => {
		const listeners = seriesStyleListeners.get(instanceId);
		if (!listeners) {
			return;
		}
		listeners.delete(callback);
		if (listeners.size === 0) {
			seriesStyleListeners.delete(instanceId);
		}
	};
}

export function subscribeSeriesStyleChanges(callback: () => void): () => void {
	seriesStyleChangeListeners.add(callback);
	return () => {
		seriesStyleChangeListeners.delete(callback);
	};
}

export function registerSeries(type: SeriesTypeId, entry: RegistryEntry): void {
	registry.set(type, entry);
}

export function getSeries(type: SeriesTypeId): RegistryEntry {
	const entry = registry.get(type);
	if (!entry) {
		throw new Error(`SeriesRegistry: unknown type "${type}"`);
	}
	return entry;
}

export function listRegistered(): SeriesTypeId[] {
	return [...registry.keys()];
}

const SERIES_TIER_ORDER: readonly SeriesTier[] = ["free", "pro", "enterprise"];

/** S3b: tier của series (vắng entry.tier = "free"). Ném lỗi như getSeries nếu type lạ. */
export function getSeriesTier(type: SeriesTypeId): SeriesTier {
	return getSeries(type).tier ?? "free";
}

/** S3b: tier hiện tại có được thêm series này không (pure, fail-closed về free). */
export function isSeriesAvailableForTier(type: SeriesTypeId, currentTier: SeriesTier): boolean {
	return SERIES_TIER_ORDER.indexOf(currentTier) >= SERIES_TIER_ORDER.indexOf(getSeriesTier(type));
}

/**
 * S5b: map tier thô (PAT 7 mức / plan server / null) về SeriesTier 3 mức.
 * starter/none/khuyết → free; custom/internal → enterprise (full).
 */
export function toSeriesTier(tier: string | null | undefined): SeriesTier {
	if (tier === "pro") return "pro";
	if (tier === "enterprise" || tier === "custom" || tier === "internal") return "enterprise";
	return "free";
}

/**
 * S3b-1: lọc series theo tier (dùng cho render-gate tập trung ở DynamicChart).
 * Chuẩn hóa alias trước khi tra tier; type lạ → loại (fail-closed, không render).
 */
export function filterAvailableSeries(
	series: readonly SeriesConfig[],
	currentTier: SeriesTier,
): SeriesConfig[] {
	return series.filter((s) => {
		try {
			return isSeriesAvailableForTier(normalizeSeriesTypeId(s.type), currentTier);
		} catch {
			return false;
		}
	});
}
