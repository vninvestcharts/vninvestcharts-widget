import { createContext, useContext, useMemo, type ReactNode } from "react";
import { hasCapability, type Capability, type PatTier } from "@vninvestcharts/engine-core";
import {
	UNKNOWN_AVAILABILITY,
	UNKNOWN_DEVICE,
	isUsable,
	resolveCapabilities,
	type BackendAvailability,
	type DegradeReason,
	type DeviceCaps,
	type ResolvedCapabilities,
	type ResolvedState,
} from "../capabilities/CapabilityResolver";
import { useWidgetI18n } from "../context/WidgetI18nContext";

/**
 * CapabilityGate — cổng UI cho 3 trạng thái (W0.4).
 *
 *   granted   ⇒ render `children` thật
 *   locked    ⇒ `LockedFeature` (upsell, có tên + lợi ích từ i18n)
 *   degraded  ⇒ `UnavailableState` (trung thực, KHÔNG upsell, KHÔNG giả dữ liệu)
 *
 * Dùng:
 *   <CapabilityGate capability="indicator_full">{…}</CapabilityGate>
 * hoặc kiểm tra thủ công:
 *   const caps = useResolvedCapabilities();
 *   if (!isUsable(caps.indicator_full)) …
 */

export interface CapabilityContextValue {
	tier: PatTier | null;
	backend: BackendAvailability;
	device: DeviceCaps;
	caps: ResolvedCapabilities;
	/** Nguồn quyết định tier, để hiển thị/báo cáo (không dùng để cấp quyền). */
	tierSource: "license" | "pat" | "none";
}

const CapabilityContext = createContext<CapabilityContextValue | null>(null);

export interface CapabilityProviderProps {
	tier: PatTier | null | undefined;
	tierSource?: CapabilityContextValue["tierSource"];
	backend?: BackendAvailability;
	device?: DeviceCaps;
	forcedReason?: Partial<Record<Capability, DegradeReason>>;
	/** Allowlist license thu hẹp (payload `caps`). Chỉ thu hẹp, không bao giờ nâng. */
	narrowing?: readonly Capability[];
	children: ReactNode;
}

export function CapabilityProvider({
	tier,
	tierSource = "none",
	backend = UNKNOWN_AVAILABILITY,
	device = UNKNOWN_DEVICE,
	forcedReason,
	narrowing,
	children,
}: CapabilityProviderProps) {
	const value = useMemo<CapabilityContextValue>(
		() => ({
			tier: tier ?? null,
			backend,
			device,
			caps: resolveCapabilities({ tier, backend, device, forcedReason, narrowing }),
			tierSource,
		}),
		[tier, tierSource, backend, device, forcedReason, narrowing],
	);
	return <CapabilityContext.Provider value={value}>{children}</CapabilityContext.Provider>;
}

export function useResolvedCapabilities(): CapabilityContextValue {
	const ctx = useContext(CapabilityContext);
	if (ctx) return ctx;
	// Ngoài provider: coi như CHƯA xác minh ⇒ chỉ Community (fail-closed).
	const caps = resolveCapabilities({ tier: null });
	return { tier: null, backend: UNKNOWN_AVAILABILITY, device: UNKNOWN_DEVICE, caps, tierSource: "none" };
}

/** Hook gate rút gọn: `const can = useCapabilityGate("export_png")`. */
export function useCapabilityGate(capability: Capability): ResolvedState {
	const { caps } = useResolvedCapabilities();
	return caps[capability] ?? { state: "locked", requires: "enterprise" };
}

/** `true` khi capability dùng được (granted). */
export function useHasCapability(capability: Capability): boolean {
	return isUsable(useCapabilityGate(capability));
}

/** Tương đương `hasCapability` nhưng đọc tier từ context. */
export function useTierAllows(capability: Capability): boolean {
	const { tier } = useResolvedCapabilities();
	return hasCapability(tier, capability);
}

const REASON_KEY: Readonly<Record<DegradeReason, string>> = {
	backend_missing: "capability.unavailable.backend",
	device_limited: "capability.unavailable.device",
	perf_budget: "capability.unavailable.perf",
	quota_local: "capability.unavailable.quota",
	data_unavailable: "capability.unavailable.data",
};

const TIER_LABEL_KEY: Readonly<Record<PatTier, string>> = {
	none: "free",
	free: "free",
	starter: "starter",
	pro: "pro",
	enterprise: "enterprise",
	custom: "custom",
	internal: "internal",
};

/** Tên hiển thị của gói cần để mở capability (dùng trong upsell). */
function planLabelKey(tier: PatTier): string {
	return `plan.${TIER_LABEL_KEY[tier]}`;
}

/**
 * Giá của từng gói, theo key i18n (PRICING 2026-10-22).
 *
 * Nguồn sự thật: `PLAN_DEV_PHASE_OFFICIAL_2026-10-22.md` §1.1 (D1) — Pro 199.000đ/tháng.
 * Chỉ gói **có giá niêm yết** mới có mục ở đây:
 *   - `pro`        → 199.000đ/tháng (gói trả phí duy nhất hiện có)
 *   - `enterprise` → "Liên hệ" (12 capability Track B **chưa giao** ⇒ không bán được,
 *                    nên chỉ mời liên hệ chứ không niêm yết giá)
 *
 * `starter` không có mục: nó là bậc miễn phí (cổng `audit:paid-capability` xếp
 * `starter` vào `FREE_TIERS`) — giới hạn duy nhất của nó là multi-chart 2 cột mặc
 * định (`src/widget/multiChartDefaults.ts:17`), Pro là 4 cột.
 */
const PLAN_PRICE_KEY: Partial<Record<PatTier, string>> = {
	pro: "plan.pro.price",
	enterprise: "plan.enterprise.price",
};

export interface LockedFeatureProps {
	capability: Capability;
	/** Nội dung thật, chỉ render khi granted. */
	children: ReactNode;
	/** Hiển thị nút khoá thay vì render (cho toolbar item). */
	asLockBadge?: boolean;
	onLockedClick?: () => void;
}

export function CapabilityGate({ capability, children }: Omit<LockedFeatureProps, "asLockBadge" | "onLockedClick">) {
	const state = useCapabilityGate(capability);
	// Narrow trực tiếp theo discriminant (isUsable trả boolean, không phải type guard).
	if (state.state === "granted") return <>{children}</>;
	if (state.state === "degraded") {
		return <UnavailableState reason={state.reason} capability={capability} />;
	}
	return <LockedFeature capability={capability} requiredTier={state.requires} />;
}

export function LockedFeature({
	capability,
	requiredTier,
	onLockedClick,
}: {
	capability: Capability;
	requiredTier: PatTier;
	onLockedClick?: () => void;
}) {
	const { t } = useWidgetI18n();
	const title = tOrKey(t, `capability.upsell.${capability}.title`);
	const benefit = tOrKey(t, `capability.upsell.${capability}.benefit`);
	// Gói nào mở được + giá gói đó (PRICING 2026-10-22). Trước đây upsell chỉ
	// hiện tên tính năng ⇒ người dùng không biết cần mua gói nào, giá bao nhiêu.
	const plan = tOrKey(t, planLabelKey(requiredTier));
	const priceKey = PLAN_PRICE_KEY[requiredTier];
	const price = priceKey ? tOrKey(t, priceKey) : null;
	return (
		<button
			type="button"
			className="vnsc-locked-feature"
			aria-label={price ? `${t("capability.locked.icon")} — ${plan}, ${price}` : t("capability.locked.icon")}
			title={`${title} — ${benefit}`}
			onClick={onLockedClick}
			data-capability={capability}
			data-required-tier={requiredTier}
		>
			<span className="vnsc-locked-feature__icon" aria-hidden="true">
				🔒
			</span>
			<span className="vnsc-locked-feature__label">{title}</span>
			<span className="vnsc-locked-feature__plan">{plan}</span>
			{price ? <span className="vnsc-locked-feature__price">{price}</span> : null}
		</button>
	);
}

export function UnavailableState({
	reason,
	capability,
	compact = false,
}: {
	reason: DegradeReason;
	capability?: Capability;
	compact?: boolean;
}) {
	const { t } = useWidgetI18n();
	const message = tOrKey(t, REASON_KEY[reason]);
	return (
		<div
			className={compact ? "vnsc-unavailable vnsc-unavailable--compact" : "vnsc-unavailable"}
			role="status"
			data-reason={reason}
			data-capability={capability ?? ""}
		>
			<strong className="vnsc-unavailable__title">{t("capability.unavailable.title")}</strong>
			<span className="vnsc-unavailable__body">{message}</span>
		</div>
	);
}

/** Chỉ dùng trong test/headless: tương đương `t()` nhưng có fallback rõ ràng. */
function tOrKey(t: (key: string) => string, key: string): string {
	const res = t(key);
	return res === key ? key : res;
}

export { REASON_KEY, planLabelKey };
