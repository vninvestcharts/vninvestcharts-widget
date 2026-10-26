import { useMemo } from "react";
import { hasCapability, type Capability, type PatTier } from "@vninvestcharts/engine-core";
import { useFeatureGate } from "../hooks/useFeatureGate";
import type { SaaSFeatureFlags } from "../types/saas";

/**
 * useTierGatedFeatures — W0.5: ép thực thi capability gate cho các cờ
 * "có trong context nhưng KHÔNG ai gate" (audit F5/F11/F12/F13).
 *
 * Vấn đề gốc: `SaaSFeatureFlags` có `isReplayEnabled` nhưng `useReplayState`
 * không hề hỏi ⇒ replay miễn phí. Tương tự `paperVisibility`, `PineEditorPanel`,
 * `StrategyTesterPanel` đều không gate tier.
 *
 * Nguyên tắc: capability là **điều kiện cần**, cờ SaaS là **điều kiện đủ** (vẫn
 * phải tôn trọng tenant tắt tính năng). ⇒ `granted = hasCapability(tier, cap) && flag`.
 * Không dùng `||` — đó là lỗi kinh điển làm lộ Pro.
 */

export interface TierGatedFeatures {
	/** Replay: cần `replay` + cờ `isReplayEnabled`. */
	canUseReplay: boolean;
	/**
	 * Paper trading mức thấp (market/limit) — Community, luôn mở.
	 * S1: dùng ở `paperVisibility.filterOrderTypesByTier` để lọc loại lệnh.
	 */
	canUsePaperMarketLimit: boolean;
	/**
	 * Paper trading nâng cao (stop/trailing/plo + risk) — cần `paper_advanced`.
	 * S1: nguồn sự thật duy nhất cho gate lệnh nâng cao (thay `toSeriesTier(tier)`).
	 */
	canUsePaperAdvanced: boolean;
	/** Trình soạn thảo Pine. */
	canUsePineEditor: boolean;
	/** Bộ kiểm thử chiến lược. */
	canUseStrategyTester: boolean;
	/**
	 * `allows` là API dùng thật. Trước S1 có thêm `canUseAdvisory` / `canUseWhalePanel`
	 * — **không consumer nào** (grep toàn repo: chỉ 2 hit, đều là chính dòng định
	 * nghĩa). Xoá vì hàm chết ở đây là bẫy cho người sau: tưởng đã gate.
	 * Cần thì gọi `allows("pro_plugin")` kèm cờ SaaS, đúng như `canUseReplay` làm.
	 */
	allows: (capability: Capability) => boolean;
}

export interface TierGateOptions {
	/**
	 * W0.6 — allowlist do license ký số thu hẹp (payload `caps`).
	 * `undefined` = không giới hạn (mọi license cũ). Danh sách này **chỉ được
	 * thu hẹp**, không bao giờ nâng: kết quả luôn là tập con của `MIN_TIER(tier)`.
	 * Nhờ vậy khách offline gate được Track A mà không cần gọi backend.
	 */
	narrowing?: readonly Capability[];
}

export function useTierGatedFeatures(
	tier: PatTier | null | undefined,
	options?: TierGateOptions,
): TierGatedFeatures {
	const { checkFeature } = useFeatureGate();
	const narrowing = options?.narrowing;
	const flags: SaaSFeatureFlags = useMemo(
		() => ({
			isWhalePanelEnabled: checkFeature("isWhalePanelEnabled"),
			isReplayEnabled: checkFeature("isReplayEnabled"),
			isAdvisoryEnabled: checkFeature("isAdvisoryEnabled"),
			hideTrademark: checkFeature("hideTrademark"),
			showWidgetAds: checkFeature("showWidgetAds"),
		}),
		[checkFeature],
	);

	return useMemo<TierGatedFeatures>(() => {
		const allowList = narrowing && narrowing.length > 0 ? new Set(narrowing) : null;
		// Ba điều kiện: tier đủ + không bị license thu hẹp.
		const allows = (capability: Capability) =>
			hasCapability(tier, capability) && (!allowList || allowList.has(capability));
		return {
			canUseReplay: allows("replay") && flags.isReplayEnabled,
			// Community: paper market/limit luôn mở (Rule 15) — nhưng vẫn tôn trọng
			// `caps` của license nếu license cố ý thu hẹp.
			canUsePaperMarketLimit: allows("paper_market_limit"),
			canUsePaperAdvanced: allows("paper_advanced"),
			canUsePineEditor: allows("pine_editor"),
			canUseStrategyTester: allows("strategy_tester"),
			allows,
		};
	}, [tier, flags, narrowing]);
}
