export interface SaaSFeatureFlags {
  isWhalePanelEnabled: boolean;
  isReplayEnabled: boolean;
  isAdvisoryEnabled: boolean;
  // Free tier controls
  hideTrademark: boolean;      // true = Premium/Enterprise (ẩn trademark)
  showWidgetAds: boolean;      // true = Free tier (hiện ads)
}

export interface TenantMetadata {
  tenantCode: string;
  tenantName: string;
  plan: 'free' | 'starter' | 'pro' | 'enterprise' | 'custom' | 'internal';
  status: 'active' | 'suspended' | 'expired';
  features: SaaSFeatureFlags;
  domainWhitelist: string[];
}

// Ad Server Types
export interface AdImageSource {
  default: string;
  retina?: string;
  svg?: string;
}

export interface AdCampaign {
  campaign_id: string;
  image_source: AdImageSource;
  video_url?: string;
  click_url: string;
  click_tracking_url: string;
  impression_tracking_url: string;
  width: number;
  height: number;
}

export interface AdServerResponse {
  show_ads: boolean;
  hide_trademark: boolean;
  ad?: AdCampaign;
}

export interface SaaSFeatureContextValue {
  isLoading: boolean;
  isValid: boolean;
  tenantMetadata: TenantMetadata | null;
  flags: SaaSFeatureFlags;
  error: string | null;
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
  /** Returns false when the credential was REFUSED and nothing was persisted. Callers
   *  must not report a save in that case. */
  setUserPat: (pat: string) => boolean;
  effectivePat: string;
  /**
   * The offline license channel (host-pinned key, local slot, or host PAT that
   * parses as a license). Never shadowed by tenantPat. Empty when no license.
   * The toolbar auth hook reads this alongside effectivePat so a license-only
   * customer is not reported free.
   */
  effectiveLicense: string;
  /**
   * Last server rejection detail (verbatim from /auth/me error body), or null.
   * Optional because it lives in dedicated state outside the main setState
   * objects; the provider memo always supplies the live value.
   */
  serverRejectReason?: string | null;
  /**
   * CS-3 — which grants produced the current tier. Used by support ("why Pro?")
   * and by the CS-6 degraded banner. Never empty; ["none"] when free.
   */
  sources: ("license" | "server" | "server-cache" | "host" | "none")[];
  /**
   * CS-3 — why data features are degraded, or null when fully usable.
   * Never reports a valid token as rejected; low plan is "plan-limited".
   */
  degradedReason: "no-pat" | "plan-limited" | "offline" | "grace-expired" | null;
}

/** CS-6: payload for the host licensing observer. */
export interface LicenseDiagnosticInfo {
  sources: ("license" | "server" | "server-cache" | "host" | "none")[];
  degradedReason: "no-pat" | "plan-limited" | "offline" | "grace-expired" | null;
  diagnosticReason: "insecure-context" | "subtle-unavailable" | null;
}