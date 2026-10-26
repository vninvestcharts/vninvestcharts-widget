import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { hasCapability, type PatTier } from "@vninvestcharts/engine-core";
import { canUsePaperTrading, filterOrderTypesByTier } from "../paperVisibility";
import { useTierGatedFeatures } from "../../../capabilities/useTierGatedFeatures";
import { SaaSFeatureContext } from "../../../contexts/SaaSFeatureContext";
import type { SaaSFeatureContextValue, SaaSFeatureFlags, TenantMetadata } from "../../../types/saas";

/**
 * Regression lock W0.5: các cờ "có trong context nhưng KHÔNG ai gate" phải thật sự
 * được gate (audit F5 replay, F11 SaaSFeatureFlags, F12 paper, F13 pine/strategy).
 */

const ALL_TIERS: PatTier[] = ["none", "free", "starter", "pro", "enterprise", "custom", "internal"];

const DEFAULT_FLAGS: SaaSFeatureFlags = {
	isWhalePanelEnabled: true,
	isReplayEnabled: true,
	isAdvisoryEnabled: true,
	hideTrademark: true,
	showWidgetAds: false,
};

const TENANT: TenantMetadata = {
	tenantCode: "T",
	tenantName: "T",
	plan: "pro",
	status: "active",
	features: DEFAULT_FLAGS,
	domainWhitelist: [],
};

function makeContext(flags: Partial<SaaSFeatureFlags> = {}): SaaSFeatureContextValue {
	const merged = { ...DEFAULT_FLAGS, ...flags };
	return {
		isLoading: false,
		isValid: true,
		tenantMetadata: { ...TENANT, features: merged },
		flags: merged,
		error: null,
		invalidateCache: vi.fn(),
		adCampaign: null,
		isAdLoading: false,
		adError: null,
		refetchAd: vi.fn(),
		isSaaSConfigAvailable: true,
		userPat: "",
		setUserPat: () => true,
		effectivePat: "",
		effectiveLicense: "",
		sources: ["license"],
		degradedReason: null,
	} as unknown as SaaSFeatureContextValue;
}

function wrapperFor(value: SaaSFeatureContextValue) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return createElement(SaaSFeatureContext.Provider, { value }, children);
	};
}

describe("useTierGatedFeatures: gate = capability AND cờ SaaS", () => {
	it("free bị chặn replay dù cờ isReplayEnabled=true", () => {
		const { result } = renderHook(
			() => useTierGatedFeatures("free"),
			{ wrapper: wrapperFor(makeContext({ isReplayEnabled: true })) },
		);
		expect(result.current.canUseReplay).toBe(false);
	});

	it("pro được phép replay khi cờ bật", () => {
		const { result } = renderHook(
			() => useTierGatedFeatures("pro"),
			{ wrapper: wrapperFor(makeContext({ isReplayEnabled: true })) },
		);
		expect(result.current.canUseReplay).toBe(true);
	});

	it("pro vẫn bị chặn replay nếu tenant TẮT cờ (AND, không phải OR)", () => {
		const { result } = renderHook(
			() => useTierGatedFeatures("pro"),
			{ wrapper: wrapperFor(makeContext({ isReplayEnabled: false })) },
		);
		expect(result.current.canUseReplay).toBe(false);
	});

	it("tier null/undefined ⇒ Pro+ đóng, Community vẫn mở (Rule 15)", () => {
		for (const tier of [null, undefined]) {
			const { result } = renderHook(
				() => useTierGatedFeatures(tier as PatTier | null | undefined),
				{ wrapper: wrapperFor(makeContext()) },
			);
			expect(result.current.canUseReplay).toBe(false);
			expect(result.current.canUsePineEditor).toBe(false);
			expect(result.current.canUseStrategyTester).toBe(false);
			expect(result.current.canUsePaperAdvanced).toBe(false);
			// Community — user phải xem được chart của chính mình.
			expect(result.current.canUsePaperMarketLimit).toBe(true);
		}
	});

	it("enterprise mở hết Track A", () => {
		const { result } = renderHook(
			() => useTierGatedFeatures("enterprise"),
			{ wrapper: wrapperFor(makeContext()) },
		);
		expect(result.current.canUseReplay).toBe(true);
		expect(result.current.canUsePineEditor).toBe(true);
		expect(result.current.canUseStrategyTester).toBe(true);
		expect(result.current.canUsePaperAdvanced).toBe(true);
	});

	it("mọi tier: Pro+ chưa bao giờ mở khi tier không đủ", () => {
		for (const tier of ALL_TIERS) {
			const { result } = renderHook(
				() => useTierGatedFeatures(tier),
				{ wrapper: wrapperFor(makeContext()) },
			);
			const expectedReplay = hasCapability(tier, "replay");
			expect(result.current.canUseReplay, tier).toBe(expectedReplay);
			expect(result.current.canUsePineEditor, tier).toBe(hasCapability(tier, "pine_editor"));
			expect(result.current.canUseStrategyTester, tier).toBe(
				hasCapability(tier, "strategy_tester"),
			);
			expect(result.current.canUsePaperAdvanced, tier).toBe(
				hasCapability(tier, "paper_advanced"),
			);
			// Community mọi tier.
			expect(result.current.canUsePaperMarketLimit, tier).toBe(true);
		}
	});
});

describe("paper trading 2 mức (audit F12)", () => {
	it("Community chỉ thấy market/limit ở mọi tier kể cả none", () => {
		for (const tier of ALL_TIERS) {
			expect(canUsePaperTrading(tier, false), `${tier} market/limit`).toBe(true);
		}
	});

	it("lệnh nâng cao chỉ mở từ pro trở lên", () => {
		for (const tier of ["none", "free", "starter"] as PatTier[]) {
			expect(canUsePaperTrading(tier, true), `${tier} advanced`).toBe(false);
		}
		for (const tier of ["pro", "enterprise", "custom", "internal"] as PatTier[]) {
			expect(canUsePaperTrading(tier, true), `${tier} advanced`).toBe(true);
		}
	});

	it("filterOrderTypesByTier chỉ trả market/limit cho free", () => {
		const all = [
			{ type: "MARKET" }, { type: "LIMIT" }, { type: "STOP" },
			{ type: "STOP_LIMIT" }, { type: "TRAILING" }, { type: "PLO" },
		];
		expect(filterOrderTypesByTier(all, "free").map((t) => t.type)).toEqual(["MARKET", "LIMIT"]);
		expect(filterOrderTypesByTier(all, "pro")).toHaveLength(6);
		expect(filterOrderTypesByTier(all, null).map((t) => t.type)).toEqual(["MARKET", "LIMIT"]);
	});

	it("type không nhận diện được ⇒ coi như lệnh cơ bản, không mất oan quyền", () => {
		const weird = [{ type: "ICEBERG" }];
		expect(filterOrderTypesByTier(weird, "free")).toHaveLength(1);
	});
});

describe("W0.6: narrowing từ license ký số gate được OFFLINE", () => {
	it("license không giới hạn (narrowing=undefined) ⇒ mở hết Track A của tier", () => {
		const { result } = renderHook(
			() => useTierGatedFeatures("pro"),
			{ wrapper: wrapperFor(makeContext()) },
		);
		expect(result.current.allows("export_png")).toBe(true);
		expect(result.current.allows("auto_pattern")).toBe(true);
		expect(result.current.canUseReplay).toBe(true);
	});

	it("narrowing chỉ giữ lại capability được cấp", () => {
		const { result } = renderHook(
			() => useTierGatedFeatures("pro", { narrowing: ["export_png", "export_csv"] }),
			{ wrapper: wrapperFor(makeContext()) },
		);
		expect(result.current.allows("export_png")).toBe(true);
		expect(result.current.allows("export_csv")).toBe(true);
		// Bị loại dù tier pro đủ.
		expect(result.current.allows("auto_pattern")).toBe(false);
		expect(result.current.allows("replay")).toBe(false);
		expect(result.current.canUseReplay).toBe(false);
	});

	it("narrowing KHÔNG BAO GIỜ nâng quyền vượt tier", () => {
		const { result } = renderHook(
			() => useTierGatedFeatures("free", { narrowing: ["export_png", "cloud_alert"] }),
			{ wrapper: wrapperFor(makeContext()) },
		);
		expect(result.current.allows("export_png")).toBe(false);
		expect(result.current.allows("cloud_alert")).toBe(false);
	});

	it("narrowing rỗng ⇒ KHÔNG thu hẹp (tránh khoá nhầm khách đã mua)", () => {
		const { result } = renderHook(
			() => useTierGatedFeatures("pro", { narrowing: [] }),
			{ wrapper: wrapperFor(makeContext()) },
		);
		expect(result.current.allows("auto_pattern")).toBe(true);
		expect(result.current.canUseReplay).toBe(true);
	});

	it("narrowing loại cả Community nếu license cố ý thu hẹp", () => {
		const { result } = renderHook(
			() => useTierGatedFeatures("pro", { narrowing: ["export_png"] }),
			{ wrapper: wrapperFor(makeContext()) },
		);
		expect(result.current.canUsePaperMarketLimit).toBe(false);
	});
});
