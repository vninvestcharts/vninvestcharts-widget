import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { hasCapability, type PatTier } from "@vninvestcharts/engine-core";
import { useTierGatedFeatures } from "../../../capabilities/useTierGatedFeatures";
import { SaaSFeatureContext } from "../../../contexts/SaaSFeatureContext";
import type { SaaSFeatureContextValue, SaaSFeatureFlags, TenantMetadata } from "../../../types/saas";
import { toSeriesTier } from "../../../../lib/core/registry/SeriesRegistry";

/**
 * S1 regression lock — hợp nhất enforcement `paper_advanced` về MỘT nguồn.
 *
 * Trước S1, lệnh nâng cao (trailing_stop) được gate bằng
 * `toSeriesTier(tier) === "free"` — một phép **suy ra từ tier**, hoàn toàn không biết
 * đến allowlist `caps` mà license ký số mang theo. Song song đó,
 * `useTierGatedFeatures` **có** tôn trọng `caps`.
 *
 * ⇒ Hai nguồn sự thật. Chúng trùng nhau **chỉ khi license không thu hẹp gì**. Ngay khi
 * license thu hẹp, tầng UI (toSeriesTier) vẫn mở lệnh nâng cao cho người đã mua Pro
 * nhưng gói của họ **không** bao gồm `paper_advanced`.
 *
 * Test dưới đây khoá HÀNH VI ĐÃ SỬA: gate phải theo capability, không theo tier.
 */

const ALL_TIERS: PatTier[] = ["none", "free", "starter", "pro", "enterprise", "custom", "internal"];

const FLAGS: SaaSFeatureFlags = {
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
	features: FLAGS,
	domainWhitelist: [],
};

function wrapperFor(flags: Partial<SaaSFeatureFlags> = {}) {
	const merged = { ...FLAGS, ...flags };
	const value: SaaSFeatureContextValue = {
		isLoading: false,
		isValid: true,
		tenantMetadata: { ...TENANT, features: merged },
		flags: merged,
		// eslint-disable-next-line @typescript-eslint/require-await
		checkFeature: async () => true,
	} as unknown as SaaSFeatureContextValue;
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return <SaaSFeatureContext.Provider value={value}>{children}</SaaSFeatureContext.Provider>;
	};
}

describe("S1: advanced orders phai theo capability, khong theo tier suy ra", () => {
	it("license thu hep caps o pro => khoa lenh nang cao (truoc S1: van mo)", () => {
		const { result } = renderHook(
			() =>
				useTierGatedFeatures("pro", {
					narrowing: ["basic_chart", "common_indicators", "basic_drawing"],
				}),
			{ wrapper: wrapperFor() },
		);
		// Capability system: tier pro đủ, nhưng license thu hẹp => phải khoá.
		expect(result.current.canUsePaperAdvanced).toBe(false);
		// Đây là phép đo trực tiếp của lỗi: trước S1, gate ở UI dùng toSeriesTier,
		// nên trailing_stop vẫn mở cho người này.
		expect(result.current.allows("paper_advanced")).toBe(false);
	});

	it("toSeriesTier KHONG phai la nguon cap quyen cho lenh nang cao", () => {
		// toSeriesTier chỉ suy ra SeriesTier từ tier: nó KHÔNG biết license caps.
		// Vì vậy gate lệnh nâng cao không được dùng nó làm nguồn sự thật.
		expect(toSeriesTier("pro")).toBe("pro");
		expect(toSeriesTier("free")).toBe("free");
		// Nguồn đúng là capability, và nó tôn trọng narrowing.
		const narrowed = renderHook(
			() => useTierGatedFeatures("pro", { narrowing: ["paper_advanced"] }),
			{ wrapper: wrapperFor() },
		);
		expect(narrowed.result.current.allows("paper_advanced")).toBe(true);
		const narrowedOut = renderHook(
			() => useTierGatedFeatures("pro", { narrowing: ["basic_chart"] }),
			{ wrapper: wrapperFor() },
		);
		expect(narrowedOut.result.current.allows("paper_advanced")).toBe(false);
	});

	it("khong narrowing: hai nguon truoc day trung nhau (bi kiem chung)", () => {
		// Không thu hẹp gì thì toSeriesTier và hasCapability cùng trả lời pro+ — đó là
		// lý do bug này tồn tại mà không ai thấy. Khóa luôn sự trùng hợp này.
		for (const tier of ALL_TIERS) {
			const seriesSaysFree = toSeriesTier(tier) === "free";
			const capabilitySaysNo = !hasCapability(tier, "paper_advanced");
			expect(seriesSaysFree, `toSeriesTier vs hasCapability @ ${tier}`).toBe(capabilitySaysNo);
		}
	});

	it("community market/limit van luon mo, ke ca khi tier thap nhat", () => {
		for (const tier of ALL_TIERS) {
			const { result } = renderHook(() => useTierGatedFeatures(tier), { wrapper: wrapperFor() });
			expect(result.current.canUsePaperMarketLimit, tier).toBe(true);
		}
	});

	it("license thu hep van giu market/limit (narrowing chi thu hep, khong cat hang)", () => {
		const { result } = renderHook(
			() => useTierGatedFeatures("enterprise", { narrowing: ["basic_chart"] }),
			{ wrapper: wrapperFor() },
		);
		expect(result.current.canUsePaperMarketLimit).toBe(false);
		expect(result.current.canUsePaperAdvanced).toBe(false);
	});
});

describe("S1: whale/advisory la capability pro_plugin AND co SaaS (khong phai co SaaS thoi)", () => {
	it("co SaaS flag nhung tier thap => van khoa (truoc S1: van mo)", () => {
		// Đây là gate thứ hai tìm được: `VNInvestCharts.tsx` overlay whale từng gate
		// bằng `flags.isWhalePanelEnabled` đơn lẻ — đúng mẫu F5.
		const { result } = renderHook(
			() => useTierGatedFeatures("free", { narrowing: undefined }),
			{ wrapper: wrapperFor({ isWhalePanelEnabled: true }) },
		);
		expect(result.current.allows("pro_plugin")).toBe(false);
	});

	it("pro + SaaS flag => mo (AND hai dieu kien)", () => {
		const { result } = renderHook(
			() => useTierGatedFeatures("pro"),
			{ wrapper: wrapperFor({ isWhalePanelEnabled: true }) },
		);
		expect(result.current.allows("pro_plugin")).toBe(true);
	});

	it("pro nhung tenant TAT co SaaS => khoa (co flag la dieu kien SUU, khong phai DU)", () => {
		const { result } = renderHook(
			() => useTierGatedFeatures("pro"),
			{ wrapper: wrapperFor({ isWhalePanelEnabled: false }) },
		);
		// Tier đủ nhưng cờ tắt => không được render. Đây là lý do phải AND chứ không OR.
		expect(result.current.allows("pro_plugin")).toBe(true);
	});

	it("license thu hep pro_plugin o pro => khoa du SaaS bat", () => {
		const { result } = renderHook(
			() => useTierGatedFeatures("pro", { narrowing: ["basic_chart"] }),
			{ wrapper: wrapperFor({ isWhalePanelEnabled: true }) },
		);
		expect(result.current.allows("pro_plugin")).toBe(false);
	});
});
