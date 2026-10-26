/**
 * S3: usePaperRuntimeConfig — per-profile config with per-chart override,
 * localStorage persistence and cross-chart sync via CustomEvent (§7.3 audit).
 * Validation shared with the modal (S1); engine cascade via S2 APIs.
 */
import { useCallback, useEffect, useState } from "react";
import type { MarketRules } from "../../../lib/core/trading/MarketRules";
import type { ExecutionSimulatorOptions } from "../../../lib/core/trading/ExecutionSimulator";
import {
	resolvePaperRuntimeConfig,
	validatePaperRuntimeConfig,
	type PaperRuntimeConfig,
} from "../config/paperRuntimeConfig";

export const PAPER_CONFIG_EVENT = "vnsc_paper_config_changed";

export interface PaperConfigChangedDetail {
	profile: string;
	chartId?: string;
	config: PaperRuntimeConfig;
}

export function paperConfigKey(profile: string, chartId?: string | null): string {
	return chartId ? `vnsc_paper_cfg_${profile}_${chartId}` : `vnsc_paper_cfg_${profile}`;
}

function readStored(key: string): Partial<PaperRuntimeConfig> | null {
	try {
		if (typeof window === "undefined" || !window.localStorage) return null;
		const raw = window.localStorage.getItem(key);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object") return null;
		return parsed as Partial<PaperRuntimeConfig>;
	} catch {
		return null;
	}
}

/**
 * Merge user config over base market rules. Pure, never mutates inputs —
 * method refs (validateOrder/getTickSize) ride along by reference, so merged
 * copies keep working (S2 this-fix).
 */
export function mergeMarketRules(
	base: MarketRules,
	user: Partial<PaperRuntimeConfig>,
): MarketRules {
	const merged: MarketRules = { ...base };
	if (user.settlementDays !== undefined) merged.settlementDays = user.settlementDays;
	if (user.allowShortSelling !== undefined) merged.allowShortSelling = user.allowShortSelling;
	if (user.maxLeverage !== undefined) merged.maxLeverage = user.maxLeverage;
	return merged;
}

/** Split user config into engine-shaped pieces (rules vs simulator knobs). */
export function splitEnginePatch(user: Partial<PaperRuntimeConfig>): {
	rulesPatch: Partial<MarketRules>;
	simulatorOptions: ExecutionSimulatorOptions;
} {
	return {
		rulesPatch: {
			...(user.settlementDays !== undefined ? { settlementDays: user.settlementDays } : {}),
			...(user.allowShortSelling !== undefined ? { allowShortSelling: user.allowShortSelling } : {}),
			...(user.maxLeverage !== undefined ? { maxLeverage: user.maxLeverage } : {}),
		},
		simulatorOptions: {
			...(user.brokerFeeRate !== undefined ? { brokerFeeRate: user.brokerFeeRate } : {}),
			...(user.commissionPerContract !== undefined ? { commissionPerContract: user.commissionPerContract } : {}),
			...(user.taxRate !== undefined ? { taxRate: user.taxRate } : {}),
			...(user.slippageTicks !== undefined ? { slippageTicks: user.slippageTicks } : {}),
		},
	};
}

export interface UsePaperRuntimeConfigOptions {
	profile: string;
	chartId?: string | null;
	baseRules: MarketRules;
}

export interface UsePaperRuntimeConfigReturn {
	config: PaperRuntimeConfig;
	perChartOverride: boolean;
	setPerChartOverride: (override: boolean) => void;
	save: (partial: Partial<PaperRuntimeConfig>) => PaperRuntimeConfig | null;
	mergedRules: MarketRules;
	simulatorOptions: ExecutionSimulatorOptions;
	version: number;
}

export function usePaperRuntimeConfig({
	profile,
	chartId,
	baseRules,
}: UsePaperRuntimeConfigOptions): UsePaperRuntimeConfigReturn {
	const [perChartOverride, setPerChartOverride] = useState(false);
	const [version, setVersion] = useState(0);
	const [overrides, setOverrides] = useState<{
		profileCfg: Partial<PaperRuntimeConfig> | null;
		chartCfg: Partial<PaperRuntimeConfig> | null;
	}>(() => ({
		profileCfg: readStored(paperConfigKey(profile)),
		chartCfg: chartId ? readStored(paperConfigKey(profile, chartId)) : null,
	}));

	const activePartial = perChartOverride ? (overrides.chartCfg ?? overrides.profileCfg) : overrides.profileCfg;
	const config = resolvePaperRuntimeConfig(activePartial);
	const { simulatorOptions } = splitEnginePatch(activePartial ?? {});
	const mergedRules = mergeMarketRules(baseRules, activePartial ?? {});

	// Cross-chart sync: same profile (or broadcast) → re-read + bump version.
	// Local override charts ignore profile broadcasts not addressed to them.
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent<PaperConfigChangedDetail>).detail;
			if (!detail || detail.profile !== profile) return;
			if (detail.chartId && detail.chartId !== chartId) return;
			if (!detail.chartId && perChartOverride) return;
			setOverrides({
				profileCfg: readStored(paperConfigKey(profile)),
				chartCfg: chartId ? readStored(paperConfigKey(profile, chartId)) : null,
			});
			setVersion((v) => v + 1);
		};
		window.addEventListener(PAPER_CONFIG_EVENT, handler);
		return () => window.removeEventListener(PAPER_CONFIG_EVENT, handler);
	}, [profile, chartId, perChartOverride]);

	const save = useCallback((partial: Partial<PaperRuntimeConfig>): PaperRuntimeConfig | null => {
		const errors = validatePaperRuntimeConfig(partial);
		if (errors.length > 0) return null;
		const key = paperConfigKey(profile, perChartOverride ? (chartId ?? undefined) : undefined);
		// F-UX-7 (A8): merge-on-write — modal chỉ gửi draft các field user đã chạm;
		// REPLACE toàn bộ sẽ xoá các override đã lưu trước đó. Reset-full vẫn đúng
		// vì draft reset chứa đủ mọi khoá DEFAULT (merge = ghi đè toàn bộ).
		const existing = readStored(key) ?? {};
		const next = { ...existing, ...partial };
		try {
			window.localStorage?.setItem(key, JSON.stringify({ ...next, effectiveFrom: Date.now() }));
		} catch {
			return null;
		}
		setOverrides({
			profileCfg: readStored(paperConfigKey(profile)),
			chartCfg: chartId ? readStored(paperConfigKey(profile, chartId)) : null,
		});
		setVersion((v) => v + 1);
		try {
			window.dispatchEvent(new CustomEvent<PaperConfigChangedDetail>(PAPER_CONFIG_EVENT, {
				detail: {
					profile,
					chartId: perChartOverride ? (chartId ?? undefined) : undefined,
					config: resolvePaperRuntimeConfig(next),
				},
			}));
		} catch {
			// ignore event errors
		}
		return resolvePaperRuntimeConfig(next);
	}, [profile, chartId, perChartOverride]);

	return { config, perChartOverride, setPerChartOverride, save, mergedRules, simulatorOptions, version };
}
