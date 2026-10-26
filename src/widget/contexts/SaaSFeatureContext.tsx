import React, { createContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
	SaaSFeatureFlags,
	TenantMetadata,
	SaaSFeatureContextValue,
	AdCampaign,
	LicenseDiagnosticInfo,
} from '../types/saas';
import type { VNInvestClient, AuthMeResponse } from '../adapters/VNInvestClient';
import { getCacheTTL } from '../../lib/cache/cacheDebug';
import { parseLicenseKey, verifyLicenseKey, planToTier, setLicensePublicKey } from '@vninvestcharts/engine-core';
import { readPat, writePat, readLicenseKey } from '../../lib/credentials/credentialStore';
import {
	resolveEntitlement,
	type ResolvedEntitlement,
} from '../hooks/resolveEntitlement';
import { detectLicenseEnvironment } from '../hooks/useLicenseDiagnostics';

export const SaaSFeatureContext = createContext<SaaSFeatureContextValue | null>(null);

const DEFAULT_FLAGS: SaaSFeatureFlags = {
	isWhalePanelEnabled: false,
	isReplayEnabled: false,
	isAdvisoryEnabled: false,
	hideTrademark: false,
	showWidgetAds: false,
};

const CACHE_KEY = 'vninvest_saas_features';
const DEFAULT_CACHE_TTL = 20 * 60 * 1000; // 20 minutes

/** Activation date for widget ad dialog. Before this date, ads are always suppressed.
 * Overridable via VNI_ADS_ACTIVATION env (ISO string) without code change. */
const ADV_ACTIVATION_DATE = new Date(
	typeof process !== "undefined" && process.env?.VNI_ADS_ACTIVATION
		? process.env.VNI_ADS_ACTIVATION
		: "2027-01-01T00:00:00Z",
).getTime();

// S29 (audit 2026-10-06): mock entitlements (debugFeatures) reached production.
//
// It used to sit behind `isProduction()`, which asked `NODE_ENV === "production"`.
// That is FAIL-OPEN: in a browser there is no `process`, so the answer is always
// false and the mock flags were applied. Measured on the shipped bundle:
//   dist/index.js -> function dw(){return typeof process<"u"&&!0}
// i.e. always false in every browser, in a production build. One of the three call
// sites (the session-expired reset) had no production guard at all.
//
// The helper is deleted rather than fixed. Two constraints, both load-bearing,
// matching the established locks at VNInvestCharts.tsx:734 and below:
//  1. INLINE. A bundler folds an inline conditional away when `define` can resolve
//     the member; behind a helper call the branch survives into shipped bytes.
//  2. Fail CLOSED. Ask "provably development", never "not production". Absent a
//     replaceable `process`, the answer is false and DEFAULT_FLAGS stands - which
//     is the safe direction for an entitlement bypass.
//
// Shape lock: __tests__/debugFeatures.production.test.ts
// Full rationale: AUDIT_LEDGER S29.

/**
 * DEV-ONLY LICENSE HOOK. Lets a browser harness register a public key so it can
 * mint a genuinely signed `vni1.*` license and grade the offline entitlement
 * path for real (scripts/verify-offline-license.cjs). Without it the only
 * license a test can produce is a structural forgery the verifier rejects, which
 * is why "an offline license opens Pro" stayed unprovable for nine sessions.
 *
 * THIS MUST NOT REACH A PRODUCTION BUNDLE. It hands over the one function that
 * decides which signature is trusted, so anyone able to call it can mint a Pro
 * license for themselves. Two constraints keep it out; both are load-bearing and
 * both are easy to "tidy away" by accident:
 *
 *  1. The test is INLINE. A bundler folds an inline `if` away only when it can
 *     resolve the condition at build time; the same test behind a function call
 *     survives into the shipped bytes even after the branch is provably dead.
 *     So: not `!isProduction()`, and not a helper.
 *  2. It reads a BARE `process.env.NODE_ENV` — the exact member expression
 *     tsup's `define` (tsup.config.ts:207) and webpack's DefinePlugin substitute.
 *
 * Proof it holds: `npm run build` then grep the shipped bundles; the symbol is
 * absent from `dist/vninvestchart.iife.js` and `dist/iframe/vninvestchart.iframe.js`
 * (minified, NODE_ENV baked to "production"). Locked by
 * `src/widget/contexts/__tests__/devLicenseHook.production.test.ts`, which
 * bundles this file and fails if either constraint ever regresses.
 */
if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
	(globalThis as unknown as Record<string, unknown>).__VNI_DEV_LICENSE__ = { setLicensePublicKey };
}

interface CachedData {
  timestamp: number;
  metadata: TenantMetadata;
  flags: SaaSFeatureFlags;
  /** CS-3: attribution stored alongside the grant so cache hits restore it faithfully. */
  sources?: ResolvedEntitlement["sources"];
  degradedReason?: ResolvedEntitlement["degradedReason"];
}

/**
 * LIC-FIX: chuẩn hóa key khi lưu/đọc mà KHÔNG làm hỏng key ký số `vni1.*`
 * (trước đây prepend `vni_` mù quáng → `vni_vni1.*` → parse fail → FREE vĩnh viễn).
 * Đồng thời tự chữa key đã bị hỏng trước đây. Bare prefix vẫn giữ hành vi cũ.
 */
export function normalizeStoredPat(pat: string): string {
	if (!pat) return pat;
	if (pat.startsWith("vni_vni1.")) return pat.slice("vni_".length);
	if (pat.startsWith("vni_") || pat.startsWith("vni1.")) return pat;
	// Only bare words get the legacy prefix (e.g. "pro" -> "vni_pro" for hand-typed
	// convenience). Anything structured — JWT segments, dashes, opaque alphabets —
	// passes through VERBATIM. Prefixing those corrupts the token before it ever
	// reaches the backend, which then 401s a key the user entered correctly and the
	// UI misreports as "old format".
	if (/^[A-Za-z0-9]+$/.test(pat)) return `vni_${pat}`;
	return pat;
}

/**
 * CS-3 D1: the cache key covers BOTH channels. Before this, the key was the PAT
 * alone, so rotating or removing the license while keeping the same PAT walked
 * into the same cache hit and served a stale tier for up to 20 minutes. A
 * license blob is hashed, never stored in the key — the key itself lives in
 * sessionStorage and must not become a credential oracle.
 */
function cacheKeyFor(pat: string, license: string): string {
	let h = 0;
	const s = `${pat}|${license}`;
	for (let i = 0; i < s.length; i++) {
		h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
	}
	return `${CACHE_KEY}_${(h >>> 0).toString(36)}`;
}

function getCachedData(pat: string, license: string): CachedData | null {
	if (typeof window === 'undefined') return null;
	try {
		const cached = sessionStorage.getItem(cacheKeyFor(pat, license));
		if (!cached) return null;
		const data: CachedData = JSON.parse(cached);
		if (Date.now() - data.timestamp > getCacheTTL(DEFAULT_CACHE_TTL)) {
			sessionStorage.removeItem(cacheKeyFor(pat, license));
			return null;
		}
		return data;
	} catch {
		return null;
	}
}

function setCachedData(
	pat: string,
	license: string,
	metadata: TenantMetadata,
	flags: SaaSFeatureFlags,
	resolution?: Pick<ResolvedEntitlement, "sources" | "degradedReason">,
): void {
	if (typeof window === 'undefined') return;
	try {
		const data: CachedData = {
			timestamp: Date.now(),
			metadata,
			flags,
			...(resolution ? { sources: resolution.sources, degradedReason: resolution.degradedReason } : {}),
		};
		sessionStorage.setItem(cacheKeyFor(pat, license), JSON.stringify(data));
	} catch {
		// Ignore storage errors
	}
}

/**
 * CS-3: server-answer freshness window. The plan calls this `serverGraceDays`,
 * host-configurable, default 7. There is no host prop for it yet (adding one
 * would spend CS-6's MAX_PROPS budget early), so it lives here as a constant
 * until CS-6 exposes it. Cached answers older than this do not grant data.
 */
const SERVER_GRACE_MS = 7 * 24 * 3600 * 1000;

// --- Ad campaign cache (tenant-scoped, T-C2) ---
const AD_CACHE_PREFIX = 'vnsc_ad_campaign';
const DEFAULT_AD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function adHash(input: string): string {
	let h = 5381;
	for (let i = 0; i < input.length; i++) {
		h = (h * 33) ^ input.charCodeAt(i);
	}
	return (h >>> 0).toString(36);
}

function adCacheKey(base: string): string {
	const tenant =
		(typeof window !== 'undefined' && (window as unknown as { __VNI_TENANT_ID__?: string }).__VNI_TENANT_ID__) ||
		adHash(base || 'default');
	return `${AD_CACHE_PREFIX}__${tenant}`;
}

function readAdCache(key: string): AdCampaign | null | undefined {
	if (typeof window === 'undefined') return undefined;
	try {
		const raw = sessionStorage.getItem(key);
		if (!raw) return undefined;
		const parsed = JSON.parse(raw) as { ts: number; campaign: AdCampaign | null };
		if (Date.now() - parsed.ts > getCacheTTL(DEFAULT_AD_CACHE_TTL)) {
			sessionStorage.removeItem(key);
			return undefined;
		}
		return parsed.campaign;
	} catch {
		return undefined;
	}
}

function writeAdCache(key: string, campaign: AdCampaign | null): void {
	if (typeof window === 'undefined') return;
	try {
		sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), campaign }));
	} catch {
		// Ignore storage errors
	}
}

/**
 * CS-3 D1 companion: clears every credential cache entry, not one key. The key
 * is a hash of pat+license, so a single-channel clear cannot enumerate the
 * variants to remove — and a partial clear is how a stale grant survives. The
 * cache is per-session and small, and invalidation events (pat change, server
 * error, manual) are rare, so correctness wins over precision here.
 */
function clearCache(_pat?: string): void {
	if (typeof window === 'undefined') return;
	try {
		const doomed: string[] = [];
		for (let i = 0; i < sessionStorage.length; i++) {
			const k = sessionStorage.key(i);
			if (k && k.startsWith(CACHE_KEY)) doomed.push(k);
		}
		for (const k of doomed) sessionStorage.removeItem(k);
	} catch {
		// Ignore storage errors
	}
}

export interface SaaSFeatureProviderProps {
  tenantPat?: string;
  /** CS-3: host-pinned offline license. License channel only; never shadowed by tenantPat. */
  licenseKey?: string;
  /** CS-6: host observer for licensing state. Silent when unset. See VNInvestChartsProps. */
  onLicenseDiagnostic?: (info: LicenseDiagnosticInfo) => void;
  debugFeatures?: Partial<SaaSFeatureFlags>;
  children: ReactNode;
  client?: VNInvestClient;
  /** Override the default ad activation date (ms since epoch). Default: 2027-01-01T00:00:00Z. */
  advActivationDate?: number;
}

function parsePlanFromPrefix(token: string): string | null {
	const parts = token.split('_');
	return parts.length >= 2 ? parts[1] : null;
}

function flagsFromPlan(plan: string, serverFlags?: SaaSFeatureFlags): SaaSFeatureFlags {
	if (serverFlags) return serverFlags;
	switch (plan) {
		case 'enterprise':
		case 'custom':
		case 'internal':
			return {
				isWhalePanelEnabled: true,
				isReplayEnabled: true,
				isAdvisoryEnabled: true,
				hideTrademark: true,
				showWidgetAds: false,
			};
		case 'pro':
			return {
				isWhalePanelEnabled: true,
				isReplayEnabled: true,
				isAdvisoryEnabled: false,
				hideTrademark: true,
				showWidgetAds: false,
			};
		case 'starter':
			return {
				isWhalePanelEnabled: false,
				isReplayEnabled: false,
				isAdvisoryEnabled: false,
				hideTrademark: false,
				showWidgetAds: true,
			};
		default:
			return { ...DEFAULT_FLAGS };
	}
}

/** Apply ad time guard: suppress showWidgetAds before activation date, or when SaaS config is available after activation. */
function applyAdTimeGuard(
	flags: SaaSFeatureFlags,
	isSaaSConfigAvailable: boolean,
	advActivationDateMs?: number,
): SaaSFeatureFlags {
	const activationMs = advActivationDateMs ?? ADV_ACTIVATION_DATE;
	if (Date.now() < activationMs) {
		return { ...flags, showWidgetAds: false };
	}
	return { ...flags, showWidgetAds: !isSaaSConfigAvailable };
}

export const SaaSFeatureProvider: React.FC<SaaSFeatureProviderProps> = ({
	tenantPat,
	licenseKey,
	onLicenseDiagnostic,
	debugFeatures,
	children,
	client,
	advActivationDate,
}) => {
	// Load the user-overridden PAT. CS-1: the reader is readPat(), which refuses a
	// `vni1.*` blob — a license key can no longer occupy the PAT slot that this
	// context is the tier authority for. Full tokens (vni_pro_xxx) and bare
	// prefixes (pro, free, starter) still work.
	const [userPat, setUserPatState] = useState<string>(() => {
		if (typeof window === 'undefined') return '';
		try {
			const stored = readPat();
			if (!stored) return '';
			return normalizeStoredPat(stored);
		} catch {
			return '';
		}
	});

	// Last server rejection detail (verbatim from /auth/me error body), or null when
	// untested/accepted. Set in the server-branch catch; cleared on every successful
	// validation. The licensing tab maps known reasons to copy; unknown text is
	// shown as-is because it is server data, not hardcoded UI copy.
	const [serverRejectReason, setServerRejectReason] = useState<string | null>(null);
	const [state, setState] = useState<SaaSFeatureContextValue>({
		isLoading: false,
		isValid: false,
		tenantMetadata: null,
		flags: DEFAULT_FLAGS,
		error: null,
		sources: ["none"],
		degradedReason: null,
		invalidateCache: () => {},
		// Ad system
		adCampaign: null,
		isAdLoading: false,
		adError: null,
		refetchAd: async () => {},
		// SaaS config availability
		isSaaSConfigAvailable: false,
		// User PAT
		userPat: '',
		setUserPat: () => true,
		effectivePat: '',
		effectiveLicense: '',
		serverRejectReason: null,
	});

	// AUTH-02 / DEC-2026-09-25 §D-06: authority order is
	//   host tenantPat > local override > env (dev only).
	// A stale `vni_pat` in localStorage must NOT be able to override a tenant
	// entitlement supplied by the host.
	const effectivePat =
		tenantPat ||
		userPat ||
		(typeof process !== 'undefined' ? process.env?.VNI_INVEST_DEFAULT_PAT || '' : '');

	// CS-3 — the license channel, kept SEPARATE from effectivePat.
	//
	// Order: host-pinned license first, then the local slot, then a host-supplied
	// key. A host that pins a license states intent explicitly, so it wins over a
	// stale local slot; tenantPat can never shadow any of these because it lives
	// on the PAT channel, not here.
	const effectiveLicense =
		(parseLicenseKey(licenseKey ?? '') ? (licenseKey as string) : '') ||
		readLicenseKey() ||
		(parseLicenseKey(effectivePat) ? effectivePat : '');

	const setUserPat = useCallback((pat: string): boolean => {
		const normalized = normalizeStoredPat(pat);
		// CS-1: single writer. writePat("") delegates to clearPat(), and neither
		// touches the license slot.
		const result = writePat(normalized);
		if (!result.ok) {
			// Do NOT claim a save that did not happen. The previous void signature let
			// the UI show "saved" over a refused write, which is how a user ended up
			// with a key they believed was stored and was not.
			return false;
		}
		setUserPatState(normalized);
		if (normalized) {
			clearCache(normalized);
		}
		return true;
	}, []);

	const invalidateCache = useCallback(() => {
		if (effectivePat) {
			clearCache(effectivePat);
		}
		setState(prev => ({
			...prev,
			isValid: false,
			tenantMetadata: null,
			// S29: this branch previously spread `debugFeatures` with NO production
			// guard at all, so a mock entitlement survived into a shipped build.
			// Inline + fail-closed, same two constraints as the lock above.
			flags:
				typeof process !== "undefined" && process.env?.NODE_ENV === "development" && debugFeatures
					? { ...DEFAULT_FLAGS, ...debugFeatures }
					: { ...DEFAULT_FLAGS },
			// I18N-1: store an i18n key (not a literal) — display sites resolve via t()/safeT().
			error: 'saas.sessionExpired',
			invalidateCache: prev.invalidateCache,
			adCampaign: null,
			adError: null,
		}));
	}, [effectivePat, debugFeatures]);

	// Listen for auth errors from external sources (e.g., StockDataAdapter)
	useEffect(() => {
		const handleAuthError = (event: CustomEvent) => {
			const code = event.detail?.code;
			if (code === 402 || code === 403 || code === 4002 || code === 4003) {
				invalidateCache();
			}
		};

		window.addEventListener('vnsc-saas-error', handleAuthError as EventListener);
		return () => window.removeEventListener('vnsc-saas-error', handleAuthError as EventListener);
	}, [invalidateCache]);

	// Ad system: fetch eligible campaign from backend (premium → empty)
	const fetchAd = useCallback(async (force = false) => {
		if (!client) return;
		const base = client.getBase();
		const key = adCacheKey(base);
		if (!force) {
			const cached = readAdCache(key);
			if (cached !== undefined) {
				setState(prev => ({ ...prev, adCampaign: cached, isAdLoading: false, adError: null }));
				return;
			}
		}
		setState(prev => ({ ...prev, isAdLoading: true, adError: null }));
		try {
			const res = await client.fetchAd();
			const selected = (res.campaigns && res.campaigns.length > 0) ? res.campaigns[0] : null;
			writeAdCache(key, selected);
			setState(prev => ({ ...prev, adCampaign: selected, isAdLoading: false, adError: null }));
		} catch (e) {
			setState(prev => ({ ...prev, adCampaign: null, isAdLoading: false, adError: String(e) }));
		}
	}, [client]);

	const refetchAd = useCallback(async () => {
		await fetchAd(true);
	}, [fetchAd]);

	/**
 * Resolve a signed license blob to a plan plus its expiry, or free when there is
 * none or it does not verify. Never throws. Keep-as-adapter per the CS-3 audit:
 * it mirrors the verification inside fallbackPrefixValidation so the server
 * branch and the offline branch agree on what a license grants, and the extra
 * expiresAt feeds the resolver input. Full unification is CS-2/CS-3; this is the
 * smallest correct step for the union.
 */
	async function licenseTierOf(license: string): Promise<{ tier: string; expiresAt: number | null }> {
		if (!parseLicenseKey(license)) return { tier: 'free', expiresAt: null };
		try {
			const verified = await verifyLicenseKey(license, {
				host: typeof window !== "undefined" ? window.location.hostname : undefined,
			});
			if (verified && (verified.tier === "pro" || verified.tier === "enterprise")) {
				return { tier: verified.tier, expiresAt: verified.exp ?? null };
			}
		} catch {
		// fail-closed: no grant
		}
		return { tier: 'free', expiresAt: null };
	}

	// Main tenant validation effect
	useEffect(() => {
		const activationMs = advActivationDate ?? ADV_ACTIVATION_DATE;

		// CS-1: a license-only customer has effectivePat === "" (readPat refuses a
		// blob) and lives entirely on the license channel. Gating free mode on
		// effectivePat alone therefore reported "no credential at all" for someone
		// holding a valid signed key, and the license was never verified.
		// S29: inline + fail-closed. See the constraint note at the top of this file.
		if (!effectivePat && !effectiveLicense) {
			const baseFlags =
				typeof process !== "undefined" && process.env?.NODE_ENV === "development" && debugFeatures
					? { ...DEFAULT_FLAGS, ...debugFeatures, hideTrademark: false, showWidgetAds: true }
					: { ...DEFAULT_FLAGS, hideTrademark: false, showWidgetAds: true };
			const activeFlags = applyAdTimeGuard(baseFlags, false, activationMs);

			setState({
				isLoading: false,
				isValid: true,
				tenantMetadata: null,
				flags: activeFlags,
				error: null,
				sources: ["none"],
				degradedReason: "no-pat",
				invalidateCache,
				adCampaign: null,
				isAdLoading: false,
				adError: null,
				refetchAd,
				isSaaSConfigAvailable: false,
				userPat,
				setUserPat,
				effectivePat,
				effectiveLicense,
			});

			return;
		}

		// Check cache first
		const cached = getCachedData(effectivePat, effectiveLicense);
		if (cached) {
			const flags = cached.flags;
			// Free tier shows trademark, premium hides it
			const isFreeTier = cached.metadata.plan === 'free';
			const finalFlags = applyAdTimeGuard(
				{ ...flags, hideTrademark: !isFreeTier },
				true, // cached = previously server-validated
				advActivationDate ?? ADV_ACTIVATION_DATE,
			);
			// CS-6 audit: a cache hit IS a completed validation from the host's
			// viewpoint, so the observer fires here too. Omitting it meant the
			// callback went silent for up to 20 minutes after the first answer.
			if (onLicenseDiagnostic) {
				try {
					onLicenseDiagnostic({
						sources: cached.sources ?? ["server-cache"],
						degradedReason: cached.degradedReason ?? null,
						diagnosticReason: detectLicenseEnvironment(),
					});
				} catch {
					// A host callback must never break validation.
				}
			}

			setState({
				isLoading: false,
				isValid: true,
				tenantMetadata: cached.metadata,
				flags: finalFlags,
				error: null,
				// CS-3: the v2 cache key guarantees these were stored by the new path.
				sources: cached.sources ?? ["server-cache"],
				degradedReason: cached.degradedReason ?? null,
				invalidateCache,
				adCampaign: null,
				isAdLoading: false,
				adError: null,
				refetchAd,
				isSaaSConfigAvailable: true,
				userPat,
				setUserPat,
				effectivePat,
				effectiveLicense,
			});

			return;
		}

		// Try server validation first, fall back to offline prefix parsing
		setState(prev => ({ ...prev, isLoading: true, error: null, invalidateCache }));

		let cancelled = false;

		const validate = async () => {
			// A new round supersedes any previous rejection; the catch below sets a
			// fresh one if this round fails. (Clearing inside finishValidation would
			// wipe a reason set just before the fallback runs.)
			setServerRejectReason(null);
			try {
				if (client && effectivePat) {
					// Transport must carry the resolved credential. The client was
					// constructed with whatever storage held at mount; a later paste
					// updates storage and state but never reached _pat, so requests
					// went out stale-or-empty and the backend 401d with "not
					// provided". syncTransportPat touches transport only, never storage.
					// Optional-chained: a host-bundled older client copy may lack it.
					client.syncTransportPat?.(effectivePat);
					const serverData = await client.validateMe();
					if (cancelled) return;
					const serverPlan = serverData.plan || 'free';
					// CS-3: the tier decision goes through the resolver, not an inline
					// max(). The shipped CS-2-lite max() stays behaviour-identical;
					// what changes is that the decision now carries attribution and a
					// dataUsable verdict instead of being an anonymous comparison.
					const license = await licenseTierOf(effectiveLicense);
					const nowSec = Math.floor(Date.now() / 1000);
					const resolution = resolveEntitlement({
						license: parseLicenseKey(effectiveLicense)
							? { tier: planToTier(license.tier), expiresAt: license.expiresAt }
							: null,
						server: { plan: planToTier(serverPlan) },
						dataSource: 'live',
						cachedAt: nowSec,
						graceMs: SERVER_GRACE_MS,
						now: nowSec,
					});
					const plan = resolution.renderTier;
					const planDefaults = flagsFromPlan(plan);
					const entitlements = serverData.entitlements ?? {};
					const serverFeatures: SaaSFeatureFlags = {
						isWhalePanelEnabled: (entitlements.isWhalePanelEnabled as boolean | undefined) ?? planDefaults.isWhalePanelEnabled,
						isReplayEnabled: (entitlements.isReplayEnabled as boolean | undefined) ?? planDefaults.isReplayEnabled,
						isAdvisoryEnabled: (entitlements.isAdvisoryEnabled as boolean | undefined) ?? planDefaults.isAdvisoryEnabled,
						hideTrademark: plan !== 'free' && plan !== 'starter',
						showWidgetAds: plan === 'free' || plan === 'starter',
					};
					const metadata: TenantMetadata = {
						tenantCode: serverData.tenant?.tenant_code || parsePlanFromPrefix(effectivePat) || 'unknown',
						tenantName: serverData.tenant?.display_name || effectivePat.slice(0, 12),
						plan: plan as TenantMetadata['plan'],
						status: serverData.tenant?.status === 'active' ? 'active' : 'suspended',
						features: serverFeatures,
						domainWhitelist: ['*'],
					};
					const flags = flagsFromPlan(plan, serverFeatures);
					finishValidation(true, metadata, flags, null, true, resolution);
				} else {
					fallbackPrefixValidation();
				}
			} catch (err) {
				// Server unreachable - fall back to offline prefix parsing.
				// DATA-01: the cached grant for this credential dies first. A 401 or a
				// network error must not leave a previously-cached tier in place while
				// the fallback resolves, or a revoked grant keeps rendering.
				if (!cancelled) {
					clearCache(effectivePat);
					// Preserve the server's reason instead of collapsing every failure
					// to a generic free. The backend distinguishes unknown/revoked,
					// expired/suspended status, disabled service account, and CIDR
					// mismatch — each demands a different user action.
					const detail = (err as { detail?: unknown } | null)?.detail;
					setServerRejectReason(typeof detail === "string" && detail ? detail : null);
					fallbackPrefixValidation();
				}
			}
		};

		function fallbackPrefixValidation() {
		// LIC-ACTIVATION: prefix cũ (`vni_pro_...` gõ tay, rỗng, rác) về free NGAY
		// đồng bộ như trước (giữ nguyên timing cho tests + caller cũ).
		// Chỉ key mới `vni1.*` mới đi đường async verify chữ ký ECDSA P-256.
		// CS-1: the license lives on its own channel now. effectivePat can no longer
		// carry a blob (readPat refuses one), so checking it here would report "no
		// license" for a customer who has one.
			if (!parseLicenseKey(effectiveLicense)) {
				const planFeatures = { ...DEFAULT_FLAGS };
				const metadata: TenantMetadata = {
					tenantCode: 'unknown',
					tenantName: 'Offline Unknown',
					plan: 'free',
					status: 'active',
					features: planFeatures,
					domainWhitelist: ['*'],
				};
				const nowSec0 = Math.floor(Date.now() / 1000);
				finishValidation(true, metadata, planFeatures, null, false, resolveEntitlement({
					license: null, server: null, dataSource: 'none', cachedAt: null,
					graceMs: SERVER_GRACE_MS, now: nowSec0,
				}));
				return;
			}
			void (async () => {
			// CS-3: consolidated on licenseTierOf (was an inline duplicate of its
			// verification). The resolver then attributes the grant; dataSource is
			// none because there is no server answer on this path.
				const license = await licenseTierOf(effectiveLicense);
				const nowSec = Math.floor(Date.now() / 1000);
				const resolution = resolveEntitlement({
					license: parseLicenseKey(effectiveLicense)
						? { tier: planToTier(license.tier), expiresAt: license.expiresAt }
						: null,
					server: null,
					dataSource: 'none',
					cachedAt: null,
					graceMs: SERVER_GRACE_MS,
					now: nowSec,
				});
				const plan = resolution.renderTier as TenantMetadata['plan'];
				const tenantName = plan === 'free' ? 'Offline Unknown' : `Offline License (${plan})`;
				const planFeatures = flagsFromPlan(plan);
				const metadata: TenantMetadata = {
					tenantCode: 'unknown',
					tenantName,
					plan,
					status: 'active',
					features: planFeatures,
					domainWhitelist: ['*'],
				};
				finishValidation(true, metadata, planFeatures, null, false, resolution);
			})();
		}

		function finishValidation(
			isValid: boolean,
			metadata: TenantMetadata | null,
			flags: SaaSFeatureFlags,
			error: string | null,
			serverValidated = false,
			resolution?: Pick<ResolvedEntitlement, "sources" | "degradedReason">,
		) {
			if (cancelled) return;
			// S29: inline + fail-closed. See the constraint note at the top of this file.
			if (typeof process !== "undefined" && process.env?.NODE_ENV === "development" && debugFeatures) {
				flags = { ...flags, ...debugFeatures };
			}
			if (isValid && metadata) {
				setCachedData(effectivePat, effectiveLicense, metadata, flags, resolution);
			}
			// CS-6: host observer. Called once per completed validation, never per
			// render; silent when the host did not provide it. The environment reason
			// comes from the same pure probe the diagnostics hook uses.
			if (onLicenseDiagnostic) {
				try {
					onLicenseDiagnostic({
						sources: resolution?.sources ?? ["none"],
						degradedReason: resolution?.degradedReason ?? null,
						diagnosticReason: detectLicenseEnvironment(),
					});
				} catch {
					// A host callback must never break validation.
				}
			}
			const isFreeTier = metadata?.plan === 'free' || metadata?.plan === 'starter';
			const guardedFlags = applyAdTimeGuard(
				{ ...flags, hideTrademark: !isFreeTier },
				serverValidated,
				advActivationDate ?? ADV_ACTIVATION_DATE,
			);
			setState({
				isLoading: false,
				isValid,
				tenantMetadata: metadata,
				flags: guardedFlags,
				// I18N-1: i18n key - resolved at display sites (SettingsModal safeT).
				error: error || (isValid ? null : 'saas.invalidToken'),
				sources: resolution?.sources ?? ["none"],
				degradedReason: resolution?.degradedReason ?? null,
				invalidateCache,
				adCampaign: null,
				isAdLoading: false,
				adError: null,
				refetchAd,
				isSaaSConfigAvailable: serverValidated,
				userPat,
				setUserPat,
				effectivePat,
				effectiveLicense,
			});
		}

		validate();

		return () => { cancelled = true; };
	}, [effectivePat, effectiveLicense, debugFeatures, invalidateCache, fetchAd, refetchAd, userPat, setUserPat, client, advActivationDate]);

	// Fetch ad campaign once tenant is validated and ads are enabled for the tier
	useEffect(() => {
		if (state.isValid && state.flags.showWidgetAds) {
			fetchAd();
		}
	}, [state.isValid, state.flags.showWidgetAds, fetchAd]);

	// Expose values for external use
	const value = useMemo(() => ({
		...state,
		invalidateCache,
		refetchAd,
		userPat,
		setUserPat,
		effectivePat,
		effectiveLicense,
		serverRejectReason,
	}), [state, invalidateCache, refetchAd, userPat, setUserPat, effectivePat, effectiveLicense, serverRejectReason]);

	return (
		<SaaSFeatureContext.Provider value={value}>
			{children}
		</SaaSFeatureContext.Provider>
	);
};

