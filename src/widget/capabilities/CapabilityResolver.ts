import { capabilitiesFor, hasCapability, minTierFor, type Capability, type PatTier } from "@vninvestcharts/engine-core";

/**
 * CapabilityResolver — nơi DUY NHẤT quyết định tính năng nào được bật.
 *
 * Trước W0.4 có 5 nơi hardcode ngưỡng `"pro"` rải rác. Nay:
 *   tier (PAT / license offline) ─┐
 *   backend probe ─────────────────┼─▶ ResolvedCapabilities ─┬─▶ UI gate
 *   device caps ────────────────────┘                        ├─▶ Engine gate
 *                                                           └─▶ Upsell CTA
 *
 * Ba trạng thái phân biệt rõ (PLAN_FRONTEND_PROPLUS_TRACKA §4.1):
 *   granted   — đủ quyền VÀ dữ liệu khả dụng ⇒ render thật
 *   degraded  — đủ quyền nhưng backend chưa sẵn sàng / thiết bị yếu / hết quota
 *               ⇒ `UnavailableState` (trung thực, KHÔNG upsell)
 *   locked    — chưa đủ quyền ⇒ `LockedFeature` (upsell)
 *
 * Nguyên tắc: **KHÔNG** giả lập dữ liệu (AGENTS.md Rule 15). `degraded` không
 * bao giờ biến thành dữ liệu 0/skeleton.
 */

export type DegradeReason =
	| "backend_missing"
	| "device_limited"
	| "perf_budget"
	| "quota_local"
	| "data_unavailable";

export type ResolvedState =
	| { state: "granted" }
	| { state: "degraded"; reason: DegradeReason }
	| { state: "locked"; requires: PatTier };

/** Kết quả probe backend. `null` = chưa biết (probe chưa chạy / lỗi mạng). */
export interface BackendAvailability {
	/** Endpoint health có sống không. */
	healthOk: boolean;
	/** Có dữ liệu whale-feed (fallback khi whale-campaigns chưa mount). */
	whaleFeedOk: boolean;
	/** Đã probe xong chưa (phân biệt "chưa biết" với "biết là không có"). */
	probed: boolean;
	probedAt: number;
}

export const UNKNOWN_AVAILABILITY: BackendAvailability = {
	healthOk: false,
	whaleFeedOk: false,
	probed: false,
	probedAt: 0,
};

export interface DeviceCaps {
	/** Mobile / màn hình hẹp ⇒ tắt footprint, auto pattern, deep backtest. */
	narrow: boolean;
	/** Số core logic — dùng để quyết định có bật tác vụ nặng. */
	concurrency: number;
}

export const UNKNOWN_DEVICE: DeviceCaps = { narrow: false, concurrency: 0 };

/** Capability nào cần backend nào — nguồn sự thật cho `degraded`. */
type BackendRequirement = "none" | "health" | "whale_feed";

const BACKEND_REQUIREMENT: Readonly<Record<Capability, BackendRequirement>> = {
	// Community + starter: chạy được với dữ liệu offline cache ⇒ không cần backend.
	basic_chart: "none",
	common_indicators: "none",
	basic_drawing: "none",
	watchlist: "none",
	paper_market_limit: "none",
	data_window: "none",
	i18n: "none",
	theme: "none",
	multi_chart: "none",
	layout_preset: "none",
	chart_compare: "none",
	// Track A: 100% client-side.
	smart_drawing_pro: "none",
	dock_pro: "health",
	no_ads: "none",
	pro_plugin: "none",
	indicator_full: "none",
	indicator_histogram: "none",
	indicator_advanced: "none",
	chart_baseline: "none",
	chart_exotic: "none",
	volume_profile: "none",
	volume_footprint: "none",
	pine_editor: "none",
	pine_functional: "none",
	strategy_tester: "none",
	replay: "none",
	replay_trading: "none",
	paper_advanced: "none",
	alert_local: "none",
	alert_drawing: "none",
	export_png: "none",
	export_csv: "none",
	auto_pattern: "none",
	layout_user: "none",
	share_local: "none",
	session_hours: "none",
	gap_compression: "none",
	measure_pane: "none",
	shortcut_map: "none",
	scale_sync: "none",
	// Track B: cần backend.
	whale_campaign: "whale_feed",
	portfolio_analytics: "health",
	adjusted_bars: "health",
	cloud_alert: "health",
	webhook: "health",
	orderbook_dom: "health",
	fundamentals_full: "health",
	index_constituents: "health",
	deep_history: "health",
	server_pine: "health",
	server_workspace: "health",
	realtime_tick: "health",
};

/** Capability nặng về CPU — tắt trên thiết bị yếu. */
const DEVICE_HEAVY: ReadonlySet<Capability> = new Set<Capability>([
	"volume_footprint",
	"auto_pattern",
	"server_pine",
]);

export interface ResolverInput {
	tier: PatTier | null | undefined;
	backend?: BackendAvailability;
	device?: DeviceCaps;
	/** Ghi đè thủ công (ví dụ user đã đọc cảnh báo, hoặc quota đã đo được). */
	forcedReason?: Partial<Record<Capability, DegradeReason>>;
	/**
	 * Allowlist do license ký số thu hẹp (payload `caps`). `undefined` = không giới
	 * hạn. CHỈ được thu hẹp, không bao giờ nâng: kết quả luôn là tập con của
	 * `capabilitiesFor(tier)`. Cùng ngữ nghĩa với `TierGateOptions.narrowing` — giữ hai
	 * hệ gate cùng một quy tắc, thay vì một thu hẹp còn một thì không.
	 */
	narrowing?: readonly Capability[];
}

export type ResolvedCapabilities = Readonly<Record<Capability, ResolvedState>>;

export function resolveCapabilities(input: ResolverInput): ResolvedCapabilities {
	const { tier, backend, device, forcedReason, narrowing } = input;
	const granted = new Set(capabilitiesFor(tier));
	// Allowlist chỉ thu hẹp: giao với `granted` nên không bao giờ thêm capability.
	const allowList = narrowing && narrowing.length > 0 ? new Set(narrowing) : null;
	const probed = backend?.probed === true;
	const healthOk = backend?.healthOk === true;
	const whaleOk = backend?.whaleFeedOk === true;
	const narrow = device?.narrow === true;

	const out = {} as Record<Capability, ResolvedState>;
	for (const cap of Object.keys(BACKEND_REQUIREMENT) as Capability[]) {
		// 1. Chưa đủ quyền ⇒ khoá (fail-closed, kể cả tier null).
		if (!granted.has(cap)) {
			out[cap] = { state: "locked", requires: minTierFor(cap) };
			continue;
		}
		// 1b. Đủ quyền theo tier, nhưng license ký số thu hẹp `caps` ⇒ vẫn khoá.
		// `requires` giữ nguyên vì đó là ngưỡng thật của capability; upsell không được
		// hứa rằng nâng gói sẽ mở được khi license chủ động thu hẹp.
		if (allowList && !allowList.has(cap)) {
			out[cap] = { state: "locked", requires: minTierFor(cap) };
			continue;
		}
		// 2. Đủ quyền nhưng lý do ưu tiên cao: thiết bị yếu / quota đo được.
		const forced = forcedReason?.[cap];
		if (forced) {
			out[cap] = { state: "degraded", reason: forced };
			continue;
		}
		if (narrow && DEVICE_HEAVY.has(cap)) {
			out[cap] = { state: "degraded", reason: "device_limited" };
			continue;
		}
		// 3. Phụ thuộc backend.
		const req = BACKEND_REQUIREMENT[cap];
		if (req === "health" && probed && !healthOk) {
			out[cap] = { state: "degraded", reason: "backend_missing" };
			continue;
		}
		if (req === "whale_feed" && probed && !whaleOk) {
			out[cap] = { state: "degraded", reason: "backend_missing" };
			continue;
		}
		// 4. Mặc định: chưa biết backend ⇒ cho chạy (client-only hoạt động offline).
		out[cap] = { state: "granted" };
	}
	return out;
}

/** Tiện ích: capability có dùng được (granted) không. */
export function isUsable(state: ResolvedState | undefined): boolean {
	return state?.state === "granted";
}

/** Tiện ích: có cần hiện upsell không (chỉ `locked`). */
export function isLocked(state: ResolvedState | undefined): boolean {
	return state?.state === "locked";
}

/** Tiện ích: có phải degraded do backend chưa sẵn sàng không. */
export function isBackendMissing(state: ResolvedState | undefined): boolean {
	return state?.state === "degraded" && state.reason === "backend_missing";
}

export { hasCapability, minTierFor };
export type { Capability, PatTier };
