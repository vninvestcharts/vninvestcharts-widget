import { useContext } from 'react';
import { SaaSFeatureContext } from '../contexts/SaaSFeatureContext';
import { SaaSFeatureFlags, TenantMetadata, AdCampaign } from '../types/saas';

export interface UseFeatureGateReturn {
  isLoading: boolean;
  isValid: boolean;
  flags: SaaSFeatureFlags;
  tenantMetadata: TenantMetadata | null;
  error: string | null;
  checkFeature: (feature: keyof SaaSFeatureFlags) => boolean;
  invalidateCache: () => void;
  // Ad system
  adCampaign: AdCampaign | null;
  isAdLoading: boolean;
  adError: string | null;
  refetchAd: () => Promise<void>;
  /** Whether SaaS config was successfully fetched from server. */
  isSaaSConfigAvailable: boolean;
  // User PAT configuration
  userPat: string;
  setUserPat: (pat: string) => boolean;
  effectivePat: string;
  /** The offline license channel. Never shadowed by tenantPat. Empty when none. */
  effectiveLicense: string;
  /** CS-3: attribution for the current tier. Never empty. */
  sources: ("license" | "server" | "server-cache" | "host" | "none")[];
  /** CS-3: why data features are degraded, or null when fully usable. */
  degradedReason: "no-pat" | "plan-limited" | "offline" | "grace-expired" | null;
  /** Last server rejection detail, or null. See SaaSFeatureContextValue. */
  serverRejectReason?: string | null;
}

export function useFeatureGate(): UseFeatureGateReturn {
	const context = useContext(SaaSFeatureContext);

	if (!context) {
		throw new Error('useFeatureGate must be used within SaaSFeatureProvider');
	}

	const checkFeature = (feature: keyof SaaSFeatureFlags): boolean => {
		return context.flags[feature];
	};

	return {
		...context,
		checkFeature,
		invalidateCache: context.invalidateCache,
		isSaaSConfigAvailable: context.isSaaSConfigAvailable,
		userPat: context.userPat,
		setUserPat: context.setUserPat,
		effectivePat: context.effectivePat,
		effectiveLicense: context.effectiveLicense,
		serverRejectReason: context.serverRejectReason ?? null,
	};
}