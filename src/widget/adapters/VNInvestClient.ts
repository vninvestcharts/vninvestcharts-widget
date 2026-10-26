/**
 * WP-02: VNInvestClient — moved from src/demo/dataSources/
 * HTTP client for the VNInvest REST API with PAT Bearer authentication.
 * No React dependency — safe to use in non-component contexts.
 */

import type {
	ChartPoint,
	ChartResponse,
	StockItem,
	WhaleFeedResponse,
	RawOHLCVBar,
	OrderFlowResponse,
	AdvisorySessionResponse,
	AdvisorySessionV2,
	TapeResponse,
} from "../../lib/types/vninvest";
import { parseLicenseKey } from "@vninvestcharts/engine-core";
import { normalizeBarsPagingMeta } from "./barsPagingPolicy";
import { BARS_LIMIT_MAX, clampBarsLimit, mapNativeOrderFlow, mapNativeTape, mapNativeWhaleFeed } from "./nativeShapes";
import type { TenantMetadata, AdCampaign } from "../types/saas";
import { getCacheTTL } from "../../lib/cache/cacheDebug";
import { resolveTimeframeMs } from "../history/historyDataUtils";
import { normalizeBar, toNum, toTimestampMs } from "../data/DataEnvelope";
import { PAT_STORAGE_KEY, readPat, readSessionPat, writePat, clearPat } from "../../lib/credentials/credentialStore";

const API_BASE_STORAGE_KEY = "vni_api_base";
// Production: override via localStorage key "vni_api_base" or VNInvestClient.setBase()
// Must use HTTPS in production to prevent MITM attacks.
const DEFAULT_API_BASE = "https://127.0.0.1";
// No bundled credential: the client must never ship a live PAT. Operators
// inject one via setPAT()/constructor arg/env; otherwise fail closed (free).
const DEFAULT_PAT = "";

function normalizeApiBase(value: string): string {
	const trimmed = value.trim();
	return trimmed.replace(/\/+$/, "");
}

function resolveBrowserOrigin(): string | null {
	try {
		if (typeof location === "undefined" || typeof location.origin !== "string") {
			return null;
		}

		const normalizedOrigin = normalizeApiBase(location.origin);
		if (!/^https?:\/\//i.test(normalizedOrigin)) {
			return null;
		}

		return normalizedOrigin;
	} catch {
		return null;
	}
}

/** Resolve API base URL (priority: global override → localStorage → current origin → default). */
export function resolveApiBase(): string {
	try {
		const globalScope = globalThis as typeof globalThis & { __VNI_API_BASE__?: string };
		if (typeof globalScope.__VNI_API_BASE__ === "string") {
			return normalizeApiBase(globalScope.__VNI_API_BASE__);
		}
	} catch { /* ignore */ }

	try {
		if (typeof localStorage !== "undefined") {
			const stored = localStorage.getItem(API_BASE_STORAGE_KEY);
			if (stored) return normalizeApiBase(stored);
		}
	} catch { /* ignore */ }

	const browserOrigin = resolveBrowserOrigin();
	if (browserOrigin) {
		return browserOrigin;
	}

	return DEFAULT_API_BASE;
}

/** Map of common timeframe aliases to VNInvest canonical formats. */
export const TIMEFRAME_MAP: Record<string, string> = {
	"1m": "1m",
	"5m": "5m",
	"15m": "15m",
	"1h": "1H",
	"1H": "1H",
	"2H": "2H",
	"4H": "4H",
	"1d": "D",
	"1D": "D",
	"d": "D",
	"D": "D",
	"W": "W",
	"M": "M",
	"Y": "Y",
};

function normalizeTimeframe(tf: string): string {
	const result = TIMEFRAME_MAP[tf] ?? tf;
	return result;
}

/**
 * Returns true if the response's last bar is the "current candle" — i.e., its
 * timestamp is within 1 timeframe of `Date.now()`. Current candles are mutable
 * and must never be served from cache.
 */
function isCurrentCandleResponse(response: VNIBarsPageResponse, timeframe: string): boolean {
	const bars = response.bars;
	if (bars.length === 0) return false;
	const lastBar = bars[bars.length - 1];
	const tfMs = resolveTimeframeMs(timeframe as any); // ARC-1-keep: legacy bridge
	return Date.now() - lastBar.date.getTime() < tfMs;
}

function asObject(value: unknown): Record<string, unknown> | null {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
}

/**
 * W0.3: chuyển sang `DataEnvelope` — lớp chịu trách nhiệm duy nhất cho parse số.
 * `asNumber` cũ chấp nhận `""` và `" "` (Number("") === 0) ⇒ âm thầm biến dữ liệu
 * rác thành **0**. `toNum` trả `null` cho chuỗi rỗng (đúng mong muốn).
 */
function asNumber(value: unknown): number | null {
	return toNum(value);
}

/**
 * W0.3: parse timestamp về Date. Ngưỡng cũ là `1e12` (⇒ ms timestamp ~1970 bị coi là giây).
 * `toTimestampMs` dùng ngưỡng `1e11` (≈1973) và xử lý ISO không offset như UTC —
 * `new Date("2026-09-18T00:00:00")` cũ lệch theo timezone máy.
 */
function parseDateValue(value: string | number): Date {
	const ms = toTimestampMs(value);
	return ms === null ? new Date(NaN) : new Date(ms);
}

function normalizeChartPoint(value: unknown): ChartPoint | null {
	// W0.3: đi qua `DataEnvelope` để hấp thụ cả shape `/bars/` (timestamp) và
	// `/chart/` (date ISO), đồng thời loại giá trị rác thay vì biến thành 0.
	const bar = normalizeBar(value);
	if (!bar) return null;
	if (bar.open === null || bar.high === null || bar.low === null || bar.close === null) {
		return null;
	}
	return {
		date: new Date(bar.timestamp).toISOString(),
		open: bar.open,
		high: bar.high,
		low: bar.low,
		close: bar.close,
		volume: bar.volume,
	};
}

function extractChartPoints(data: unknown): ChartPoint[] {
	if (Array.isArray(data)) {
		return data.map(normalizeChartPoint).filter((point): point is ChartPoint => point !== null);
	}

	const payload = asObject(data);
	if (!payload) {
		return [];
	}

	const nestedData = asObject(payload.data);
	const candidates: unknown[] = [
		payload.points,
		nestedData?.points,
		payload.candles,
		nestedData?.candles,
		payload.ohlcv,
		nestedData?.ohlcv,
		payload.results,
		nestedData?.results,
		payload.data,
	];

	for (const candidate of candidates) {
		if (!Array.isArray(candidate)) {
			continue;
		}
		const normalized = candidate
			.map(normalizeChartPoint)
			.filter((point): point is ChartPoint => point !== null);
		if (normalized.length > 0 || candidate.length === 0) {
			return normalized;
		}
	}

	return [];
}

function resolveTechnical(data: unknown): ChartResponse["technical"] | undefined {
	if (Array.isArray(data)) {
		return undefined;
	}
	const payload = asObject(data);
	if (!payload) {
		return undefined;
	}
	const nestedData = asObject(payload.data);
	const technical = (payload.technical ?? nestedData?.technical) as ChartResponse["technical"] | undefined;
	return technical;
}

function normalizeChartBars(data: unknown): RawOHLCVBar[] {
	const points = extractChartPoints(data);
	const technical = resolveTechnical(data);

	return points
		.map((point) => ({
			date: new Date(point.date),
			open: point.open,
			high: point.high,
			low: point.low,
			close: point.close,
			volume: point.volume,
			technical,
		}))
		.filter((bar) => Number.isFinite(bar.date.valueOf()));
}

function isWhaleFeedResponse(data: unknown): data is WhaleFeedResponse {
	if (!data || Array.isArray(data) || typeof data !== "object") {
		return false;
	}

	return "summary" in data && "whale_orders" in data;
}

function buildEndpoints(base: string) {
	return {
		CHART: (symbol: string) => `${base}/core/v1/stock-management/stocks/${encodeURIComponent(symbol)}/chart/`,
		BARS: (symbol: string) => `${base}/core/v1/stock-management/stocks/${encodeURIComponent(symbol)}/bars/`,
		ORDER_FLOW: (symbol: string) => `${base}/core/v1/stock-management/stocks/${encodeURIComponent(symbol)}/order-flow/`,
		STOCKS_LIST: `${base}/core/v1/stock-management/stocks/`,
		AUTH_TOKEN: `${base}/core/v1/auth/token/`,
		AUTH_ME: `${base}/core/v1/auth/me`,
		TICKER: (symbol: string) => `${base}/core/v1/realtime/ticker/${encodeURIComponent(symbol)}/`,
		WHALE_FEED: (symbol: string) => `${base}/core/v1/realtime/whale-feed/${encodeURIComponent(symbol)}/`,
		AI_ADVISORY: `${base}/core/v1/stock_ai_advisory_session/`,
		// Decision A (follow-up): native advisory session — GET reads, POST triggers refresh.
		AI_ADVISORY_V2: (symbol: string) => `${base}/core/v1/stock-management/stocks/${encodeURIComponent(symbol)}/ai-advisory-session/`,
		// BE-03: backend serves path-param style only: /intraday-tape/{symbol}/
		// (verified live 2026-09-21; the old ?symbol= style 404s).
		INTRADAY_TAPE: (symbol: string) => `${base}/core/v1/market-data/intraday-tape/${encodeURIComponent(symbol)}/`,
		WIDGET_AD: `${base}/core/v1/widget/ad`,
	};
}

/** Response of GET /core/v1/widget/ad — array of eligible campaigns. */
export interface WidgetAdResponse {
	campaigns: AdCampaign[];
}

export interface AuthMeResponse {
	// BE-07: GET /auth/me (profile_view) never returns token material — those fields
	// only exist on the login payload. Optional so the profile shape typechecks.
	access?: string;
	refresh?: string;
	token?: string;
	token_prefix?: string;
	plan: string;
	active_pat_count: number;
	max_active_pats: number;
	tenant: {
		tenant_id: string;
		tenant_code: string;
		display_name: string;
		plan: string;
		max_active_pats: number;
		status: string;
		features?: string[];
	};
	user: {
		id: number;
		username: string;
		email: string;
		first_name: string;
		last_name: string;
		is_staff: boolean;
	};
	abilities: string[];
	entitlements: Record<string, unknown>;
}

/** Parameters for the cursor-paged /bars/ endpoint. */
export type VNIBarsParams =
	| { type: "init"; symbol: string; timeframe: string; from?: number; to?: number; limit?: number }
	| { type: "backward"; symbol: string; timeframe: string; before: number; limit: number; snapshotId?: string };

/** Response from the cursor-paged /bars/ endpoint. */
export interface VNIBarsPageResponse {
	bars: RawOHLCVBar[];
	hasMoreBefore: boolean;
	hasMoreAfter: boolean;
	nextBefore: number | null;
	nextAfter: number | null;
	snapshotId: string | null;
}

const BARS_HOT_WINDOW_TTL_MS = 15_000;
const BARS_HOT_WINDOW_STALE_MS = 60_000;
// BE-01: limit clamp lives in ./nativeShapes (keeps this fat-file within budget).
export { BARS_LIMIT_MAX } from "./nativeShapes";

type BarsHotWindowCacheEntry = {
	response: VNIBarsPageResponse;
	expiresAt: number;
	fetchedAt: number;
};

export type BarsHotWindowTelemetry = {
	cacheHits: number;
	inFlightCollapses: number;
	networkRequests: number;
	lastUpdatedAt: number | null;
};

export type BarsHotWindowLoadGateStatus = "healthy" | "warning" | "rollback";

export type BarsHotWindowLoadGateThresholds = {
	minimumObservedRequests: number;
	healthySavedRequestRatio: number;
	rollbackSavedRequestRatio: number;
	healthyNetworkRequestRatio: number;
	rollbackNetworkRequestRatio: number;
};

export type BarsHotWindowLoadGateReport = {
	status: BarsHotWindowLoadGateStatus;
	reasons: readonly string[];
	telemetry: BarsHotWindowTelemetry;
	totalRequests: number;
	cacheHitRatio: number;
	collapseRatio: number;
	networkRequestRatio: number;
	savedRequestRatio: number;
	thresholds: BarsHotWindowLoadGateThresholds;
};

export const DEFAULT_BARS_HOT_WINDOW_LOAD_GATE_THRESHOLDS: BarsHotWindowLoadGateThresholds = {
	minimumObservedRequests: 100,
	healthySavedRequestRatio: 0.95,
	rollbackSavedRequestRatio: 0.75,
	healthyNetworkRequestRatio: 0.05,
	rollbackNetworkRequestRatio: 0.25,
};

const barsHotWindowCache = new Map<string, BarsHotWindowCacheEntry>();
const barsHotWindowInFlight = new Map<string, Promise<VNIBarsPageResponse>>();
const barsHotWindowTelemetry: BarsHotWindowTelemetry = {
	cacheHits: 0,
	inFlightCollapses: 0,
	networkRequests: 0,
	lastUpdatedAt: null,
};

function markBarsHotWindowTelemetry(
	metric: "cacheHits" | "inFlightCollapses" | "networkRequests",
) {
	barsHotWindowTelemetry[metric] += 1;
	barsHotWindowTelemetry.lastUpdatedAt = Date.now();
}

function cloneBarsHotWindowTelemetry(telemetry: BarsHotWindowTelemetry): BarsHotWindowTelemetry {
	return {
		cacheHits: telemetry.cacheHits,
		inFlightCollapses: telemetry.inFlightCollapses,
		networkRequests: telemetry.networkRequests,
		lastUpdatedAt: telemetry.lastUpdatedAt,
	};
}

export function diffBarsHotWindowTelemetry(
	before: BarsHotWindowTelemetry,
	after: BarsHotWindowTelemetry,
): BarsHotWindowTelemetry {
	return {
		cacheHits: Math.max(0, after.cacheHits - before.cacheHits),
		inFlightCollapses: Math.max(0, after.inFlightCollapses - before.inFlightCollapses),
		networkRequests: Math.max(0, after.networkRequests - before.networkRequests),
		lastUpdatedAt: after.lastUpdatedAt,
	};
}

export function evaluateBarsHotWindowLoadGate(
	telemetry: BarsHotWindowTelemetry,
	thresholds: BarsHotWindowLoadGateThresholds = DEFAULT_BARS_HOT_WINDOW_LOAD_GATE_THRESHOLDS,
): BarsHotWindowLoadGateReport {
	const totalRequests = telemetry.cacheHits + telemetry.inFlightCollapses + telemetry.networkRequests;
	const cacheHitRatio = totalRequests > 0 ? telemetry.cacheHits / totalRequests : 0;
	const collapseRatio = totalRequests > 0 ? telemetry.inFlightCollapses / totalRequests : 0;
	const networkRequestRatio = totalRequests > 0 ? telemetry.networkRequests / totalRequests : 0;
	const savedRequestRatio = totalRequests > 0 ? (telemetry.cacheHits + telemetry.inFlightCollapses) / totalRequests : 0;
	const reasons: string[] = [];

	if (totalRequests < thresholds.minimumObservedRequests) {
		reasons.push("insufficient-sample");
		if (totalRequests > 0 && savedRequestRatio < thresholds.healthySavedRequestRatio) {
			reasons.push("warning-saved-request-ratio");
		}
		if (totalRequests > 0 && networkRequestRatio > thresholds.healthyNetworkRequestRatio) {
			reasons.push("warning-network-request-ratio");
		}

		return {
			status: "warning",
			reasons,
			telemetry: cloneBarsHotWindowTelemetry(telemetry),
			totalRequests,
			cacheHitRatio,
			collapseRatio,
			networkRequestRatio,
			savedRequestRatio,
			thresholds: { ...thresholds },
		};
	}

	if (
		savedRequestRatio < thresholds.rollbackSavedRequestRatio
		|| networkRequestRatio > thresholds.rollbackNetworkRequestRatio
	) {
		if (savedRequestRatio < thresholds.rollbackSavedRequestRatio) {
			reasons.push("rollback-saved-request-ratio");
		}
		if (networkRequestRatio > thresholds.rollbackNetworkRequestRatio) {
			reasons.push("rollback-network-request-ratio");
		}

		return {
			status: "rollback",
			reasons,
			telemetry: cloneBarsHotWindowTelemetry(telemetry),
			totalRequests,
			cacheHitRatio,
			collapseRatio,
			networkRequestRatio,
			savedRequestRatio,
			thresholds: { ...thresholds },
		};
	}

	if (savedRequestRatio < thresholds.healthySavedRequestRatio) {
		reasons.push("warning-saved-request-ratio");
	}
	if (networkRequestRatio > thresholds.healthyNetworkRequestRatio) {
		reasons.push("warning-network-request-ratio");
	}

	return {
		status: reasons.length > 0 ? "warning" : "healthy",
		reasons,
		telemetry: cloneBarsHotWindowTelemetry(telemetry),
		totalRequests,
		cacheHitRatio,
		collapseRatio,
		networkRequestRatio,
		savedRequestRatio,
		thresholds: { ...thresholds },
	};
}

function createBarsHotWindowKey(base: string, pat: string, params: VNIBarsParams): string {
	const scope = [base, pat, params.symbol.trim().toUpperCase(), normalizeTimeframe(params.timeframe)].join("|");
	if (params.type === "backward") {
		return `${scope}|backward|${params.before}|${params.limit}|${params.snapshotId ?? ""}`;
	}

	return `${scope}|init|${params.from ?? ""}|${params.to ?? ""}|${params.limit ?? ""}`;
}

function cloneBarsPageResponse(response: VNIBarsPageResponse): VNIBarsPageResponse {
	return {
		bars: response.bars.map((bar) => ({
			date: new Date(bar.date),
			open: bar.open,
			high: bar.high,
			low: bar.low,
			close: bar.close,
			volume: bar.volume,
			technical: bar.technical,
		})),
		hasMoreBefore: response.hasMoreBefore,
		hasMoreAfter: response.hasMoreAfter,
		nextBefore: response.nextBefore,
		nextAfter: response.nextAfter,
		snapshotId: response.snapshotId,
	};
}

function pruneExpiredBarsHotWindowEntries(now: number) {
	for (const [key, entry] of barsHotWindowCache.entries()) {
		if (entry.expiresAt <= now) {
			barsHotWindowCache.delete(key);
		}
	}
}

async function revalidateBarsHotWindow(base: string, pat: string, cacheKey: string, params: VNIBarsParams): Promise<void> {
	const endpoints = buildEndpoints(base);
	const urlParams = new URLSearchParams();
	urlParams.set("timeframe", normalizeTimeframe(params.timeframe));
	if (params.type === "backward") {
		urlParams.set("before", String(params.before));
		urlParams.set("limit", String(params.limit));
		if (params.snapshotId) urlParams.set("snapshot_id", params.snapshotId);
	} else {
		if (params.from != null) urlParams.set("from", String(params.from));
		if (params.to != null) urlParams.set("to", String(params.to));
		if (params.limit != null) urlParams.set("limit", String(params.limit));
	}
	try {
		markBarsHotWindowTelemetry("networkRequests");
		const url = `${endpoints.BARS(params.symbol)}?${urlParams.toString()}`;
		const authHeaders: Record<string, string> = {};
		if (pat) authHeaders["Authorization"] = `Bearer ${pat}`;
		const response = await globalThis.fetch(url, { headers: authHeaders });
		if (!response.ok) return;
		const data = (await response.json()) as Record<string, unknown>;
		const rawBars = Array.isArray(data?.bars) ? (data.bars as unknown[]) : [];
		const bars: RawOHLCVBar[] = rawBars
			.map(normalizeChartPoint)
			.filter((p): p is ChartPoint => p !== null)
			.map((point) => ({
				date: new Date(point.date),
				open: point.open,
				high: point.high,
				low: point.low,
				close: point.close,
				volume: point.volume,
			}))
			.filter((bar) => Number.isFinite(bar.date.valueOf()));
		const pagingMeta = normalizeBarsPagingMeta(data, bars);
		const swrResponse: VNIBarsPageResponse = {
			bars,
			hasMoreBefore: pagingMeta.hasMoreBefore,
			hasMoreAfter: pagingMeta.hasMoreAfter,
			nextBefore: pagingMeta.nextBefore,
			nextAfter: pagingMeta.nextAfter,
			snapshotId: pagingMeta.snapshotId,
		};
		const ttl = getCacheTTL(BARS_HOT_WINDOW_TTL_MS);
		const now = Date.now();
		// Don't cache revalidated responses containing the current candle — it is mutable.
		if (!isCurrentCandleResponse(swrResponse, params.timeframe)) {
			barsHotWindowCache.set(cacheKey, {
				response: cloneBarsPageResponse(swrResponse),
				expiresAt: now + ttl,
				fetchedAt: now,
			});
		}
	} catch {
		// SWR revalidation failure is non-fatal — stale entry remains valid
	}
}

export interface WidgetAuthHandler {
	getToken: () => string | Promise<string>;
	getRefreshToken?: () => string | Promise<string>;
	onTokensUpdated?: (tokens: { patToken: string; refreshToken?: string }) => void | Promise<void>;
	onAuthError?: (error: Error) => void;
}

export class VNInvestClient {
	private _pat: string = "";
	private _base: string;
	private _authHandler?: WidgetAuthHandler;

	constructor(patToken?: string) {
		this._base = resolveApiBase();
		try {
			if (typeof globalThis !== "undefined") {
				const globalPat = (globalThis as typeof globalThis & { __VNI_PAT_TOKEN__?: string }).__VNI_PAT_TOKEN__;
				if (typeof globalPat === "string" && globalPat.trim()) {
					this._pat = globalPat.trim();
					writePat(this._pat);
					return;
				}
			}
		} catch { /* ignore */ }
		try {
			if (typeof localStorage !== "undefined") {
				const stored = localStorage.getItem(PAT_STORAGE_KEY);
				if (stored) {
					// LIC-ACTIVATION + CS-1: a signed `vni1.*` blob is a LICENSE, not a
					// token. It is never loaded into `_pat` — readPat() returns "" for it,
					// so a blob can never become `Authorization: Bearer vni1.*`.
					// credentialStore owns migrating it to the license slot. What stays
					// here is only the one-time legacy-prefix wipe: a deliberate
					// fail-closed behaviour (SEC-01), not part of the credential split.
					const isLicenseKey = !!parseLicenseKey(stored);
					if (!DEFAULT_PAT && !isLicenseKey) {
						const migrationKey = 'vni_pat_cleared_v1';
						if (!localStorage.getItem(migrationKey)) {
							clearPat();
							localStorage.removeItem('vninvest_saas_features_vni_internal_Q3zRGQ2bpLoLjGdYx6R72E7TH50tQ2iIYRUecgSKfDnirANYBGQrM2wQlZQ12uP6');
							localStorage.setItem(migrationKey, '1');
						}
					} else {
						const token = readPat();
						if (token) {
							this._pat = token;
							return;
						}
					}
				}
			}
		} catch { /* ignore */ }
		if (patToken) {
			this.setPAT(patToken);
			return;
		}
		if (DEFAULT_PAT) {
			this._pat = DEFAULT_PAT;
			writePat(DEFAULT_PAT);
		}
		// CS-7 audit: memory-only PAT after a storage failure. If quota/private-mode
		// rejected the storage write, writePat still holds the value in session memory
		// but every branch above read storage and found nothing. Consult memory ALONE
		// here — readPat() would re-read storage and resurrect a legacy token this
		// constructor deliberately skipped two branches up.
		if (!this._pat) {
			const mem = readSessionPat();
			if (mem) this._pat = mem;
		}
	}

	setAuthHandler(handler: WidgetAuthHandler): void {
		this._authHandler = handler;
	}

	setPAT(token: string): void {
		const trimmed = (token ?? "").trim();
		const changed = trimmed !== this._pat;
		if (!trimmed) {
			this._pat = "";
			// CS-1: delegate to the single writer. clearPat() clears the PAT slot only,
			// so a license blob in vni_license_key survives the Clear button that
			// PATTokenModal.tsx:124 calls.
			clearPat();
			if (changed) this._notifyPatChanged();
			return;
		}
		// CS-7 audit: writePat can REFUSE (blob by value, or migration pending).
		// Adopting the value into _pat anyway would send the refused credential as
		// `Authorization: Bearer` on the next request. Keep the previous token.
		const result = writePat(trimmed);
		if (!result.ok) return;
		this._pat = trimmed;
		if (changed) this._notifyPatChanged();
	}

	/**
	 * Transport-only credential sync. Sets `_pat` WITHOUT touching storage —
	 * storage belongs to credentialStore alone. The SaaS context calls this before
	 * validation when its resolved credential (tenant > user > env) differs from
	 * what this transport carries; otherwise a user-pasted PAT sits in storage
	 * while requests go out with a stale or empty token, and the backend 401s with
	 * "Authentication credentials were not provided." No-op when equal.
	 */
	syncTransportPat(token: string): void {
		const trimmed = (token ?? "").trim();
		if (trimmed === this._pat) return;
		this._pat = trimmed;
		this._notifyPatChanged();
	}

	private _notifyPatChanged(): void {
		try {
			window.dispatchEvent(new CustomEvent("vni:pat-changed"));
		} catch { /* ignore */ }
	}

	getPAT(): string {
		return this._pat;
	}

	setBase(url: string): void {
		const trimmed = (url ?? "").trim().replace(/\/+$/, "");
		if (!trimmed) return;
		this._base = trimmed;
		try {
			if (typeof localStorage !== "undefined") {
				localStorage.setItem(API_BASE_STORAGE_KEY, trimmed);
			}
		} catch { /* ignore */ }
	}

	getBase(): string {
		return this._base;
	}

	hasPAT(): boolean {
		return this._pat.length > 0;
	}

	private buildHeaders(): HeadersInit {
		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (this._pat) {
			headers["Authorization"] = `Bearer ${this._pat}`;
		}
		return headers;
	}

	private async _fetch<T>(url: string, init?: RequestInit, isRetry = false): Promise<T> {
		const response = await fetch(url, { ...init, headers: this.buildHeaders() });
		if (response.status === 401) {
			if (!isRetry && this._authHandler) {
				try {
					const currentToken = await this._authHandler.getToken();
					if (currentToken && currentToken.trim() !== this._pat) {
						this.setPAT(currentToken);
						return await this._fetch<T>(url, init, true);
					}

					if (this._authHandler.getRefreshToken) {
						const refreshToken = await this._authHandler.getRefreshToken();
						if (refreshToken) {
							const refreshUrl = `${this._base}/api/auth/token/refresh/`;
							const refreshResponse = await fetch(refreshUrl, {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ refresh: refreshToken }),
							});
							if (refreshResponse.ok) {
								const data = await refreshResponse.json() as Record<string, any>;
								const newPat = data.access || data.token || data.patToken;
								if (newPat) {
									this.setPAT(newPat);
									await this._authHandler.onTokensUpdated?.({
										patToken: newPat,
										refreshToken: data.refresh || refreshToken,
									});
									return await this._fetch<T>(url, init, true);
								}
							}
						}
					}
				} catch (refreshError) {
					console.warn("Auto-refresh token failed in VNInvestClient:", refreshError);
				}

				this._authHandler.onAuthError?.(new Error("TOKEN_EXPIRED"));
			}
			// Preserve the server's reason on the thrown error (non-enumerable side
			// channel would be cleaner, but a plain property keeps every existing
			// `catch` and `instanceof Error` check working). Callers that care read
			// `(err as { detail?: unknown }).detail`; everyone else sees the same
			// TOKEN_EXPIRED they always did.
			const err = new Error("TOKEN_EXPIRED");
			try {
				const body = (await response.clone().json()) as { detail?: unknown };
				if (typeof body?.detail === "string" && body.detail) {
					(err as Error & { detail?: string }).detail = body.detail;
				}
			} catch {
				// Body unreadable — reason stays absent, behaviour unchanged.
			}
			throw err;
		}
		if (response.status === 404) {
			throw new Error("SYMBOL_NOT_FOUND");
		}
		if (!response.ok) {
			const text = await response.text().catch(() => String(response.status));
			throw new Error(`HTTP_${response.status}: ${text.slice(0, 200)}`);
		}
		return response.json() as Promise<T>;
	}

	async getChart(
		symbol: string,
		options?: { timeframe?: string; days?: number },
	): Promise<RawOHLCVBar[]> {
		const endpoints = buildEndpoints(this._base);
		const params = new URLSearchParams();
		if (options?.timeframe) params.set("timeframe", normalizeTimeframe(options.timeframe));
		if (options?.days != null) params.set("days", String(options.days));

		const url = `${endpoints.CHART(symbol)}?${params.toString()}`;
		const data = await this._fetch<unknown>(url);

		return normalizeChartBars(data);
	}

	async validateMe(): Promise<AuthMeResponse> {
		const endpoints = buildEndpoints(this._base);
		return this._fetch<AuthMeResponse>(endpoints.AUTH_ME);
	}

	/** Fetch eligible ad campaigns. Bearer PAT auto-attached; premium → empty list. */
	async fetchAd(): Promise<WidgetAdResponse> {
		const endpoints = buildEndpoints(this._base);
		return this._fetch<WidgetAdResponse>(endpoints.WIDGET_AD);
	}

	async getBarsPage(params: VNIBarsParams): Promise<VNIBarsPageResponse> {
		const cacheKey = createBarsHotWindowKey(this._base, this._pat, params);
		const now = Date.now();
		pruneExpiredBarsHotWindowEntries(now);

		// Determine if this request likely includes the current candle.
		// For `init` type: if `to` is within 1 timeframe of "now", the response
		// will contain a mutable current candle that must not be served from cache.
		const tfMs = resolveTimeframeMs(params.timeframe as any); // ARC-1-keep: legacy bridge
		const isNearNow = params.type === "init" && params.to != null
			? now - params.to < tfMs
			: false;

		if (!isNearNow) {
			const cachedEntry = barsHotWindowCache.get(cacheKey);
			if (cachedEntry && cachedEntry.expiresAt > now) {
				markBarsHotWindowTelemetry("cacheHits");
				return cloneBarsPageResponse(cachedEntry.response);
			}

			// SWR: stale but within revalidate window → return stale + background refresh
			if (cachedEntry && now - cachedEntry.fetchedAt < BARS_HOT_WINDOW_STALE_MS) {
				markBarsHotWindowTelemetry("cacheHits");
				void this._revalidateBarsHotWindow(cacheKey, params);
				return cloneBarsPageResponse(cachedEntry.response);
			}
		}

		const inFlight = barsHotWindowInFlight.get(cacheKey);
		if (inFlight) {
			markBarsHotWindowTelemetry("inFlightCollapses");
			const sharedResponse = await inFlight;
			return cloneBarsPageResponse(sharedResponse);
		}

		const endpoints = buildEndpoints(this._base);
		const urlParams = new URLSearchParams();
		urlParams.set("timeframe", normalizeTimeframe(params.timeframe));

		// BE-01: clamp defensively (./nativeShapes) so no caller — current or future —
		// can send an over-limit request (backend 400s above BARS_LIMIT_MAX).
		const safeLimit = clampBarsLimit;

		if (params.type === "backward") {
			urlParams.set("before", String(params.before));
			urlParams.set("limit", String(safeLimit(params.limit) ?? BARS_LIMIT_MAX));
			if (params.snapshotId) urlParams.set("snapshot_id", params.snapshotId);
		} else {
			if (params.from != null) urlParams.set("from", String(params.from));
			if (params.to != null) urlParams.set("to", String(params.to));
			if (params.limit != null) urlParams.set("limit", String(safeLimit(params.limit)));
		}

		const requestPromise = (async () => {
			markBarsHotWindowTelemetry("networkRequests");
			const url = `${endpoints.BARS(params.symbol)}?${urlParams.toString()}`;
			const data = await this._fetch<unknown>(url);
			const payload = data as Record<string, unknown>;
			const rawBars = Array.isArray(payload?.bars) ? (payload.bars as unknown[]) : [];
			const bars: RawOHLCVBar[] = rawBars
				.map(normalizeChartPoint)
				.filter((p): p is ChartPoint => p !== null)
				.map((point) => ({
					date: new Date(point.date),
					open: point.open,
					high: point.high,
					low: point.low,
					close: point.close,
					volume: point.volume,
				}))
				.filter((bar) => Number.isFinite(bar.date.valueOf()));

			const pagingMeta = normalizeBarsPagingMeta(payload, bars);

			const response: VNIBarsPageResponse = {
				bars,
				hasMoreBefore: pagingMeta.hasMoreBefore,
				hasMoreAfter: pagingMeta.hasMoreAfter,
				nextBefore: pagingMeta.nextBefore,
				nextAfter: pagingMeta.nextAfter,
				snapshotId: pagingMeta.snapshotId,
			};

			const ttl = getCacheTTL(BARS_HOT_WINDOW_TTL_MS);
			const now = Date.now();
			// Don't cache responses containing the current candle — it is mutable
			// and will be updated by WS ticker_update. Caching causes stale
			// last-candle bug on next request within TTL window.
			if (!isCurrentCandleResponse(response, params.timeframe)) {
				barsHotWindowCache.set(cacheKey, {
					response: cloneBarsPageResponse(response),
					expiresAt: now + ttl,
					fetchedAt: now,
				});
			}

			return response;
		})();

		barsHotWindowInFlight.set(cacheKey, requestPromise);
		try {
			const response = await requestPromise;
			return cloneBarsPageResponse(response);
		} finally {
			barsHotWindowInFlight.delete(cacheKey);
		}
	}

	static __resetBarsHotWindowCacheForTests(): void {
		barsHotWindowCache.clear();
		barsHotWindowInFlight.clear();
		barsHotWindowTelemetry.cacheHits = 0;
		barsHotWindowTelemetry.inFlightCollapses = 0;
		barsHotWindowTelemetry.networkRequests = 0;
		barsHotWindowTelemetry.lastUpdatedAt = null;
	}

	static getBarsHotWindowTelemetry(): BarsHotWindowTelemetry {
		return cloneBarsHotWindowTelemetry(barsHotWindowTelemetry);
	}

	static __getBarsHotWindowTelemetryForTests(): BarsHotWindowTelemetry {
		return VNInvestClient.getBarsHotWindowTelemetry();
	}

	async getStocks(query?: string, exchange?: string): Promise<StockItem[]> {
		const endpoints = buildEndpoints(this._base);
		const params = new URLSearchParams();
		if (query) params.set("search", query);
		if (exchange) params.set("exchange", exchange);
		const url = `${endpoints.STOCKS_LIST}?${params.toString()}`;
		const data = await this._fetch<{ results?: StockItem[] } | StockItem[]>(url);
		if (Array.isArray(data)) return data;
		if ("results" in data && Array.isArray(data.results)) return data.results;
		return [];
	}

	async getWhaleFeed(symbol: string): Promise<WhaleFeedResponse | null> {
		const endpoints = buildEndpoints(this._base);
		const data = await this._fetch<WhaleFeedResponse | unknown[]>(endpoints.WHALE_FEED(symbol));
		if (isWhaleFeedResponse(data)) return data;
		// Native backend shape (verified live 2026-09-21): {symbol, alerts[]}.
		// Alerts carry no price/volume — passed through verbatim for the alerts list UI.
		const obj = data as unknown as Record<string, unknown>;
		if (obj && typeof obj === "object" && typeof obj["symbol"] === "string" && Array.isArray(obj["alerts"])) {
			return mapNativeWhaleFeed(obj);
		}
		return null;
	}

	async getOrderFlow(symbol: string, window: "5m" | "15m" | "30m" | "1h" = "30m"): Promise<OrderFlowResponse | null> {
		const endpoints = buildEndpoints(this._base);
		const params = new URLSearchParams({ window });
		const url = `${endpoints.ORDER_FLOW(symbol)}?${params.toString()}`;
		const data = await this._fetch<unknown>(url);
		const obj = data as Record<string, unknown>;
		if (!obj || typeof obj !== "object") {
			return null;
		}
		// Legacy ok-wrapped envelope — pass through.
		if (obj["ok"] === true) {
			return obj as unknown as OrderFlowResponse;
		}
		// BE-04b: native backend shape (verified live 2026-09-21) has no `ok` wrapper:
		// {symbol, window, dark_flow, latest_signal, signals, tick_rate, size_distribution, order_flow}.
		if (typeof obj["symbol"] === "string" && (Array.isArray(obj["signals"]) || typeof obj["dark_flow"] === "object")) {
			return mapNativeOrderFlow(obj, window);
		}
		return null;
	}

	/** Shared GET/POST fetch for the native advisory session endpoint. */
	private async fetchAdvisorySessionV2(url: string, init?: RequestInit): Promise<AdvisorySessionV2 | null> {
		const data = await this._fetch<unknown>(url, init).catch(() => null);
		const obj = data as Record<string, unknown> | null;
		if (!obj || typeof obj !== "object" || typeof obj["symbol"] !== "string") {
			return null;
		}
		return obj as unknown as AdvisorySessionV2;
	}

	/**
	 * Follow-up advisory V2: read the native AI advisory session.
	 * Returns the session in both empty (`reason: "no_advisory_data"`) and record states;
	 * null only on transport/auth failure. Never throws for empty sessions.
	 */
	async getAdvisorySessionV2(symbol: string): Promise<AdvisorySessionV2 | null> {
		return this.fetchAdvisorySessionV2(buildEndpoints(this._base).AI_ADVISORY_V2(symbol));
	}

	/**
	 * Follow-up advisory V2: trigger a manual refresh (queues generation server-side).
	 * Returns the updated session payload; null on transport/auth failure.
	 */
	async refreshAdvisorySession(symbol: string): Promise<AdvisorySessionV2 | null> {
		return this.fetchAdvisorySessionV2(buildEndpoints(this._base).AI_ADVISORY_V2(symbol), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
	}

	/** @deprecated Legacy POST path 404s on current backends — use getAdvisorySessionV2. */
	async getAdvisorySession(symbol: string): Promise<AdvisorySessionResponse | null> {
		const endpoints = buildEndpoints(this._base);
		const data = await this._fetch<unknown>(endpoints.AI_ADVISORY, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ symbol }),
		});
		const obj = data as Record<string, unknown>;
		if (!obj || obj["ok"] !== true) {
			return null;
		}
		return obj as unknown as AdvisorySessionResponse;
	}

	async getTapeEntries(symbol: string, pageSize = 100): Promise<TapeResponse | null> {
		const endpoints = buildEndpoints(this._base);
		const url = `${endpoints.INTRADAY_TAPE(symbol)}?page_size=${Math.max(1, Math.min(200, Math.floor(pageSize)))}`;
		const data = await this._fetch<unknown>(url);
		const obj = data as Record<string, unknown>;
		if (!obj || typeof obj !== "object") {
			return null;
		}
		// Legacy ok-wrapped envelope — pass through.
		if (obj["ok"] === true) {
			return obj as unknown as TapeResponse;
		}
		// BE-03: native backend shape (verified live 2026-09-21): {symbol, trades:[...]}.
		if (typeof obj["symbol"] === "string" && Array.isArray(obj["trades"])) {
			return mapNativeTape(obj);
		}
		return null;
	}

	private async _revalidateBarsHotWindow(cacheKey: string, params: VNIBarsParams): Promise<void> {
		await revalidateBarsHotWindow(this._base, this._pat, cacheKey, params);
	}
}
