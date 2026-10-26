// Task M4: resolution matrix hiển thị paper trading (pure, test ma trận).
import { hasCapability, type PatTier } from "@vninvestcharts/engine-core";

export interface PaperVisibilityInput {
	/** Toggle runtime trong session (mắt/CTA) — thắng cả prop (hợp đồng TVP-A0). */
	localOverride?: boolean;
	defaultEnabled?: boolean;
	chartId?: string;
	perChart?: Record<string, boolean>;
	master?: boolean;
	legacyEnabled?: boolean;
}

/**
 * Thứ tự ưu tiên: toggle runtime > prop tường minh > override riêng chart
 * > master workspace > localStorage cũ > mặc định bật.
 */
export function resolvePaperEnabled(input: PaperVisibilityInput): boolean {
	if (input.localOverride !== undefined) return input.localOverride;
	if (input.defaultEnabled !== undefined) return input.defaultEnabled;
	if (input.chartId !== undefined && input.perChart?.[input.chartId] !== undefined) {
		return input.perChart[input.chartId];
	}
	if (input.master !== undefined) return input.master;
	if (input.legacyEnabled !== undefined) return input.legacyEnabled;
	return true;
}

/** Đọc legacy key `vnsc.paper.enabled` ("1"/"0") — single-chart + fallback. */
export function readLegacyPaperEnabled(): boolean | undefined {
	try {
		if (typeof window === "undefined" || !window.localStorage) return undefined;
		const raw = window.localStorage.getItem("vnsc.paper.enabled");
		if (raw === "0") return false;
		if (raw === "1") return true;
	} catch {
		// Storage bị chặn — coi như chưa đặt.
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// W0.5: gate tier cho paper trading (audit F12 — trước đó KHÔNG gate gì cả)
// ---------------------------------------------------------------------------

/**
 * Paper trading có 2 mức (AGENTS.md Rule 15 + quy tắc phân gói):
 *  - `paper_market_limit` (Community): market + limit. **Luôn mở**, kể cả `none`.
 *  - `paper_advanced` (pro): stop, stop-limit, trailing, PLO + panel quản trị rủi ro.
 *
 * Gọi ở UI khi render, KHÔNG gọi trong `resolvePaperEnabled` (hàm đó thuần và
 * đã có test ma trận cũ — giữ nguyên hợp đồng).
 *
 * S1: `capabilityGated` là kết quả `tierGated.allows(...)` (đã tính cả tier VÀ
 * allowlist `caps` của license). `hasCapability(tier, cap)` chỉ biết tier, **không biết**
 * license caps — nên nếu gate lệnh nâng cao chỉ suy ra từ tier thì license thu hẹp gói
 * bị bỏ qua đúng ở tầng UI. Truyền `undefined` giữ hành vi cũ (chỉ theo tier).
 */
export function canUsePaperTrading(
	tier: PatTier | null | undefined,
	advanced: boolean,
	capabilityGated?: boolean,
): boolean {
	if (capabilityGated !== undefined) return capabilityGated;
	return advanced ? hasCapability(tier, "paper_advanced") : hasCapability(tier, "paper_market_limit");
}

/** Lọc danh sách loại lệnh theo capability. Community chỉ thấy market/limit. */
export function filterOrderTypesByTier<T extends { type: string }>(
	types: readonly T[],
	tier: PatTier | null | undefined,
	capabilityGated?: { paperAdvanced: boolean; paperMarketLimit: boolean },
): T[] {
	const advanced = new Set(["STOP", "STOP_LIMIT", "TRAILING", "PLO"]);
	return types.filter((t) => {
		const isAdvanced = advanced.has(t.type.toUpperCase());
		return canUsePaperTrading(
			tier,
			isAdvanced,
			capabilityGated
				? isAdvanced
					? capabilityGated.paperAdvanced
					: capabilityGated.paperMarketLimit
				: undefined,
		);
	});
}
