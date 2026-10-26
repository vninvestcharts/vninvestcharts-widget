import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
	mergeMarketRules,
	paperConfigKey,
	splitEnginePatch,
	usePaperRuntimeConfig,
} from "../usePaperRuntimeConfig";
import type { PaperRuntimeConfig } from "../../config/paperRuntimeConfig";
import { DEFAULT_PAPER_RUNTIME_CONFIG } from "../../config/paperRuntimeConfig";
import { VN_SPOT_RULES } from "../../../../lib/core/trading/MarketRules";

beforeEach(() => {
	for (let i = window.localStorage.length - 1; i >= 0; i--) {
		const key = window.localStorage.key(i);
		if (key?.startsWith("vnsc_paper_cfg_")) window.localStorage.removeItem(key);
	}
});

describe("paper config keys + merge (S3)", () => {
	it("key format follows the M1 namespace convention", () => {
		expect(paperConfigKey("VN_SPOT")).toBe("vnsc_paper_cfg_VN_SPOT");
		expect(paperConfigKey("VN_SPOT", "chart-a")).toBe("vnsc_paper_cfg_VN_SPOT_chart-a");
	});

	it("mergeMarketRules is pure and keeps method refs working", () => {
		const merged = mergeMarketRules(VN_SPOT_RULES, { settlementDays: 0, maxLeverage: 10 });
		expect(merged.settlementDays).toBe(0);
		expect(merged.maxLeverage).toBe(10);
		expect(VN_SPOT_RULES.settlementDays).toBe(2);
		expect(merged.validateOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 } as never).valid).toBe(true);
	});

	it("splitEnginePatch separates rules from simulator knobs", () => {
		const { rulesPatch, simulatorOptions } = splitEnginePatch({ brokerFeeRate: 0, settlementDays: 0 });
		expect(simulatorOptions).toEqual({ brokerFeeRate: 0 });
		expect(rulesPatch).toEqual({ settlementDays: 0 });
	});

	it("save persists, validates, and syncs same-profile charts only", () => {
		const base = { profile: "VN_SPOT", baseRules: VN_SPOT_RULES };
		const a = renderHook(() => usePaperRuntimeConfig({ ...base, chartId: "a" }));
		const b = renderHook(() => usePaperRuntimeConfig({ ...base, chartId: "b" }));
		const c = renderHook(() => usePaperRuntimeConfig({ profile: "GLOBAL_MARGIN", baseRules: VN_SPOT_RULES, chartId: "c" }));

		const holder: { saved: PaperRuntimeConfig | null } = { saved: null };
		act(() => {
			holder.saved = a.result.current.save({ brokerFeeRate: 0.0005 });
		});
		expect(holder.saved?.brokerFeeRate).toBe(0.0005);
		expect(b.result.current.config.brokerFeeRate).toBe(0.0005);
		expect(b.result.current.version).toBe(1);
		expect(c.result.current.config.brokerFeeRate).toBe(0.001);

		// Invalid partial rejected, storage untouched.
		let bad: unknown = "unset";
		act(() => {
			bad = b.result.current.save({ taxRate: 9 });
		});
		expect(bad).toBeNull();
	});

	it("per-chart override isolates from profile broadcasts", () => {
		const base = { profile: "VN_SPOT", baseRules: VN_SPOT_RULES };
		const a = renderHook(() => usePaperRuntimeConfig({ ...base, chartId: "a" }));
		act(() => {
			a.result.current.setPerChartOverride(true);
		});
		act(() => {
			a.result.current.save({ brokerFeeRate: 0.0003 });
		});
		expect(a.result.current.config.brokerFeeRate).toBe(0.0003);

		const b = renderHook(() => usePaperRuntimeConfig({ ...base, chartId: "b" }));
		let saved: unknown = null;
		act(() => {
			saved = (b.result.current.save({ brokerFeeRate: 0.0009 }) as unknown) ?? null;
		});
		expect(saved).not.toBeNull();
		// Override chart keeps its own value despite the profile broadcast.
		expect(a.result.current.config.brokerFeeRate).toBe(0.0003);
		expect(b.result.current.config.brokerFeeRate).toBe(0.0009);
	});

	it("F-UX-7: save merges over existing stored fields (no wipe)", () => {
		const base = { profile: "VN_SPOT", baseRules: VN_SPOT_RULES };
		const { result } = renderHook(() => usePaperRuntimeConfig(base));
		act(() => {
			result.current.save({ slippageTicks: 5 });
		});
		act(() => {
			result.current.save({ oneClickTrading: true });
		});
		expect(result.current.config.slippageTicks).toBe(5);
		expect(result.current.config.oneClickTrading).toBe(true);
		expect(result.current.config.brokerFeeRate).toBe(0.001);
	});

	it("F-UX-7: reset-full still overwrites everything", () => {
		const base = { profile: "VN_SPOT", baseRules: VN_SPOT_RULES };
		const { result } = renderHook(() => usePaperRuntimeConfig(base));
		act(() => {
			result.current.save({ slippageTicks: 5, oneClickTrading: true });
		});
		act(() => {
			result.current.save({ ...DEFAULT_PAPER_RUNTIME_CONFIG });
		});
		expect(result.current.config.slippageTicks).toBe(0);
		expect(result.current.config.oneClickTrading).toBe(false);
	});

	it("corrupt JSON falls back to defaults", () => {
		window.localStorage.setItem("vnsc_paper_cfg_VN_SPOT", "{broken");
		const { result } = renderHook(() => usePaperRuntimeConfig({ profile: "VN_SPOT", baseRules: VN_SPOT_RULES }));
		expect(result.current.config.brokerFeeRate).toBe(0.001);
	});
});
