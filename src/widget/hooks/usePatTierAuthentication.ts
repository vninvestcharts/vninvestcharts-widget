/**
 * usePatTierAuthentication — SSOT for widget-side PAT tier authentication.
 *
 * Replaces the inline `validatePat` + `clientPatTier`/`serverPatTier` logic that used to
 * live in VNInvestCharts.tsx. Security posture (fail-closed):
 *
 * - Token prefixes are NEVER trusted. A `vni_pro_*` / `vni_enterprise_*` string grants
 *   nothing by itself (SEC-01 bypass fix).
 * - Signed offline license keys (`vni1.*`) are ALWAYS verified offline first
 *   (`verifyLicenseKey`, ECDSA P-256, zero network) — regardless of backend config.
 *   A valid signature is authoritative entitlement; a backend `/auth/me` would 401 a
 *   license key, so it must never be routed there. Resolves `"free"` only when the
 *   key is missing/invalid/expired.
 * - Account PATs (non-license) are validated against `GET <base>/core/v1/auth/me`
 *   when a backend is configured; the tier comes from the server `plan` field only.
 *   When NO backend is configured, a non-license PAT resolves `"free"` without any
 *   fetch — no console spam, no connection-refused errors on partner pages.
 * - The raw PAT is forwarded to the engine (`enginePat`) ONLY after the server confirmed
 *   a pro+ tier. Otherwise the engine receives `""`, so the engine-side prefix
 *   self-assignment (`KernelEngine._validatePat`) can never escalate an unvalidated token
 *   and report it back via `onTierValidated`.
 *
 * Dev/QA Pro testing without a backend goes through `debugFeatures` on
 * SaaSFeatureProvider (non-production only) — never through token prefixes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { hasMinTier, planToTier, parseLicenseKey, verifyLicenseKey, type Capability } from "@vninvestcharts/engine-core";
import type { VNInvestClient } from "../adapters/VNInvestClient";
import { resolveApiBase } from "../adapters/VNInvestClient";
import { useFeatureGate } from "./useFeatureGate";

export type WidgetPatTier = ReturnType<typeof planToTier>;

// SSOT references: key names mirror VNInvestClient.ts module-privates
// (API_BASE_STORAGE_KEY) and resolveApiBase() (global override key).
// Duplicated here intentionally — VNInvestClient.ts has no budget headroom left
// for an exported helper, and this hook must not import client internals.
const API_BASE_STORAGE_KEY = "vni_api_base";
const GLOBAL_API_BASE_KEY = "__VNI_API_BASE__";

/**
 * Whether an auth backend is explicitly configured. Explicit signals only:
 * operator-injected client, global base override, or stored base override.
 * The resolved-default base (page origin / placeholder) does NOT count — otherwise
 * every standalone embed would fire doomed requests at its own origin.
 */
export function hasExplicitBackend(client?: VNInvestClient | null): boolean {
	if (client) return true;
	try {
		const scope = globalThis as typeof globalThis & { __VNI_API_BASE__?: unknown };
		if (typeof scope[GLOBAL_API_BASE_KEY] === "string" && (scope[GLOBAL_API_BASE_KEY] as string).trim() !== "") return true;
	} catch { /* ignore */ }
	try {
		if (typeof localStorage !== "undefined") {
			const stored = localStorage.getItem(API_BASE_STORAGE_KEY);
			if (stored && stored.trim() !== "") return true;
		}
	} catch { /* ignore */ }
	return false;
}

export interface PatTierAuthInput {
	client?: VNInvestClient | null;
}

export interface PatTierAuth {
	/** Fail-closed validator for EngineHost `validatePat` (+ independent widget checks). */
	validatePat: (pat: string) => Promise<WidgetPatTier | null>;
	/** Widget's own server-derived tier for the current effective PAT (null = none/unknown). */
	widgetServerTier: WidgetPatTier | null;
	/** Last tier reported back by the engine via `onTierValidated`. */
	serverPatTier: WidgetPatTier | null;
	/** Tier driving toolbar gating, trademark, ads and premium overlays. Never prefix-derived. */
	effectiveToolbarTier: WidgetPatTier;
	/** PAT forwarded to the engine: real token only when server confirmed pro+, else "". */
	enginePat: string;
	/** Last server rejection detail (verbatim from /auth/me), or null. Never shown raw without mapping. */
	serverRejectReason: string | null;
	/** True when no auth backend is configured (pure-free standalone mode). */
	isStandalone: boolean;
	/**
	 * W0.6 — allowlist capability do **license ký số** thu hẹp (payload `caps`).
	 * `undefined` = license không giới hạn ⇒ dùng đầy đủ `MIN_TIER`.
	 * CHỈ có giá trị khi entitlement đến từ license, không phải từ PAT server.
	 * Dùng để gate Track A **hoàn toàn offline** (không cần `/access/capabilities`).
	 */
	licenseCapabilities: readonly Capability[] | undefined;
	/** Downgrade banner state (pro → free transition). */
	showDowngradeBanner: boolean;
	/** Engine `onTierValidated` handler. */
	handleTierValidated: (tier: string) => void;
	handleDismissDowngrade: () => void;
}

function isProTier(tier: WidgetPatTier | null): boolean {
	return tier !== null && hasMinTier(tier, "pro");
}

/**
 * Union with attribution semantics: null means "no info from this channel", never
 * a vote for free. A null server answer (unreachable) must not drag a verified
 * license down, and vice versa.
 */
function maxTier(a: WidgetPatTier | null, b: WidgetPatTier | null): WidgetPatTier | null {
	if (a === null) return b;
	if (b === null) return a;
	return hasMinTier(a, b) ? a : b;
}

export function usePatTierAuthentication(input: PatTierAuthInput): PatTierAuth {
	const { effectivePat, effectiveLicense } = useFeatureGate();
	const clientRef = useRef(input.client);
	clientRef.current = input.client;

	const [widgetServerTier, setWidgetServerTier] = useState<WidgetPatTier | null>(null);
	const [serverPatTier, setServerPatTier] = useState<WidgetPatTier | null>(null);
	// W0.6: allowlist `caps` từ license (nếu có). Tách khỏi state tier vì phải đặt
	// cùng lúc với `verified` — xem nhánh license trong `validatePat`.
	const [licenseCaps, setLicenseCaps] = useState<readonly Capability[] | undefined>(undefined);
	// The validated credential that produced widgetServerTier. Forwarded to the
	// engine so premium drawings actually unlock; empty when nothing validated.
	const [gatedCredential, setGatedCredential] = useState<string>("");
	// Last server rejection reason (e.g. "Invalid or revoked PAT."). Ref so that
	// recording it never triggers a re-render by itself; surfaced via state below.
	const lastRejectReason = useRef<string | null>(null);
	const [serverRejectReason, setServerRejectReason] = useState<string | null>(null);

	const validatePat = useCallback(async (pat: string): Promise<WidgetPatTier | null> => {
		if (!pat) return null;
		// LIC-FIRST: key ký số `vni1.*` là entitlement tự chứa (ECDSA P-256, zero
		// network) — verify offline BẤT KỂ backend có cấu hình hay không. Một chữ ký
		// hợp lệ là bằng chứng quyết định; `/core/v1/auth/me` sẽ 401 với license key
		// (không phải account token) — KHÔNG được để nhánh server hạ license đã kích
		// hoạt xuống free chỉ vì `vni_api_base`/`__VNI_API_BASE__` đang tồn tại.
		// (SaaSFeatureContext settings fallback vẫn verify offline license → "PRO",
		//  nên divergence "settings PRO nhưng toolbar free" chỉ đến từ nhánh này.)
		if (parseLicenseKey(pat)) {
			try {
				const verified = await verifyLicenseKey(pat, {
					host: typeof window !== "undefined" ? window.location.hostname : undefined,
				});
				if (verified && (verified.tier === "pro" || verified.tier === "enterprise")) {
					// W0.6: giữ allowlist `caps` (nếu có) để gate Track A offline.
					// Đặt `undefined` khi license không giới hạn để không khoá nhầm.
					setLicenseCaps(verified.capabilities);
					return verified.tier;
				}
			} catch {
				// fail-closed: về free bên dưới
			}
			setLicenseCaps(undefined);
			return "free";
		}
		// Account PAT (không phải license): chỉ server mới xác nhận được. Chế độ
		// standalone không backend → free (không fetch, zero network).
		if (!hasExplicitBackend(clientRef.current)) return "free";
		try {
			const base = clientRef.current?.getBase?.() ?? resolveApiBase();
			const response = await fetch(`${base}/core/v1/auth/me`, {
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${pat}` },
			});
			if (!response.ok) {
			// Preserve the server's reason instead of collapsing every failure to
			// null. The backend distinguishes unknown/revoked, expired/suspended
			// status, disabled service account, and CIDR mismatch — each demands a
			// different user action, and "old format" describes none of them.
				try {
					const body = (await response.json()) as { detail?: unknown; code?: unknown };
					if (typeof body?.detail === "string" && body.detail) {
						lastRejectReason.current = body.detail;
					} else {
						lastRejectReason.current = `HTTP ${response.status}`;
					}
				} catch {
					lastRejectReason.current = `HTTP ${response.status}`;
				}
				return null;
			}
			lastRejectReason.current = null;
			const data = await response.json() as { plan: string };
			return planToTier(data.plan);
		} catch {
			return null;
		}
	}, []);

	// Independent widget-side validation on every credential change. Never trusts the prefix.
	// Also resets the engine-reported tier: the engine only ever sees the gated PAT,
	// so a stale pro report must not survive a credential change (engine emits nothing for "").
	// CS-6b: validates BOTH channels and takes the max. effectivePat can never hold a
	// license (CS-1 split), so validating it alone reported free for license-only
	// customers while settings showed PRO. Null means "no info", never a vote for free.
	useEffect(() => {
		let cancelled = false;
		setServerPatTier(null);
		if (!effectivePat && !effectiveLicense) {
			setWidgetServerTier(null);
			setGatedCredential("");
			return;
		}
		Promise.all([
			effectivePat ? validatePat(effectivePat) : Promise.resolve(null),
			effectiveLicense ? validatePat(effectiveLicense) : Promise.resolve(null),
		]).then(([patTier, licenseTier]) => {
			if (cancelled) return;
			const top = maxTier(patTier, licenseTier);
			setWidgetServerTier(top);
			setServerRejectReason(lastRejectReason.current);
			// Forward the winning credential; license wins ties (offline-verified,
			// deterministic). Without this, toolbar says pro while the engine —
			// which enforces premium drawings — still receives "".
			const winner =
				top !== null && isProTier(top)
					? (licenseTier !== null && (patTier === null || hasMinTier(licenseTier, patTier))
						? effectiveLicense
						: effectivePat)
					: "";
			setGatedCredential(winner ?? "");
		});
		// LIC-ACTIVATION heartbeat: server thu hồi/quá hạn → downgrade trong ≤6h.
		// Offline license có exp riêng nên không cần heartbeat (verify ở mỗi lần validate).
		const heartbeat = window.setInterval(() => {
			if (!hasExplicitBackend(clientRef.current)) return;
			Promise.all([
				effectivePat ? validatePat(effectivePat) : Promise.resolve(null),
				effectiveLicense ? validatePat(effectiveLicense) : Promise.resolve(null),
			]).then(([patTier, licenseTier]) => {
				if (cancelled) return;
				const top = maxTier(patTier, licenseTier);
				setWidgetServerTier(top);
				setServerRejectReason(lastRejectReason.current);
				const winner =
					top !== null && isProTier(top)
						? (licenseTier !== null && (patTier === null || hasMinTier(licenseTier, patTier))
							? effectiveLicense
							: effectivePat)
						: "";
				setGatedCredential(winner ?? "");
			});
		}, 6 * 60 * 60 * 1000);
		return () => { cancelled = true; window.clearInterval(heartbeat); };
	}, [effectivePat, effectiveLicense, validatePat]);

	const handleTierValidated = useCallback((tier: string) => {
		setServerPatTier(tier as WidgetPatTier);
	}, []);

	const effectiveToolbarTier: WidgetPatTier = serverPatTier ?? widgetServerTier ?? "free";
	// Gate the credential forwarded to the engine: an unvalidated token must never
	// reach KernelEngine, otherwise its prefix self-assignment reports pro right
	// back. gatedCredential is the validated winner (license or PAT), set alongside
	// widgetServerTier; empty when nothing validated.
	const enginePat = gatedCredential;

	const [showDowngradeBanner, setShowDowngradeBanner] = useState(false);
	const prevTierRef = useRef(effectiveToolbarTier);
	useEffect(() => {
		const prev = prevTierRef.current;
		const curr = effectiveToolbarTier;
		prevTierRef.current = curr;
		const wasPro = prev === "pro" || prev === "enterprise" || prev === "custom" || prev === "internal";
		const isFree = curr === "free" || curr === "starter" || curr === "none";
		if (wasPro && isFree) {
			setShowDowngradeBanner(true);
		}
	}, [effectiveToolbarTier]);
	const handleDismissDowngrade = useCallback(() => setShowDowngradeBanner(false), []);

	return {
		validatePat,
		widgetServerTier,
		serverPatTier,
		effectiveToolbarTier,
		enginePat,
		/** Last server rejection reason (e.g. "Invalid or revoked PAT."). Null when untested/accepted. */
		serverRejectReason,
		isStandalone: !hasExplicitBackend(clientRef.current),
		licenseCapabilities: licenseCaps,
		showDowngradeBanner,
		handleTierValidated,
		handleDismissDowngrade,
	};
}
