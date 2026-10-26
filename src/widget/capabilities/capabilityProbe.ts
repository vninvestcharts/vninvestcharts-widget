import { UNKNOWN_AVAILABILITY, type BackendAvailability, type DeviceCaps } from "./CapabilityResolver";

/**
 * capabilityProbe — phát hiện backend có sẵn sàng không, mà **không** phụ thuộc
 * endpoint của các EP chưa có (tiết kiệm hàng trăm request 404 vô nghĩa).
 *
 * Nguyên tắc (PLAN_FRONTEND_PROPLUS_TRACKA §2.2):
 *  - Dùng **sentinel request rẻ**: `/core/v1/health` rồi `/core/v1/realtime/tickers/?symbols=…`
 *    (1 mã) để biết API thực sự sống, thay vì đoán qua OpenAPI.
 *  - Cache 5 phút. Hết cache ⇒ tự chạy lại (không chặn render).
 *  - **Không bao giờ** ném lỗi ra ngoài: probe lỗi ⇒ coi như "chưa biết"
 *    (`probed:false`), để Track A vẫn chạy offline.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface ProbeOptions {
	/** Base URL backend, ví dụ `http://localhost:8080`. `null` = chưa cấu hình. */
	baseUrl: string | null | undefined;
	/** Bearer PAT (nếu có). Không bắt buộc cho health. */
	token?: string | null;
	/** Mã dùng cho sentinel quote. */
	probeSymbol?: string;
	/** Timeout mỗi request (ms). */
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
	now?: () => number;
}

export interface ProbeResult extends BackendAvailability {
	/** Lý do cụ thể, để log/diagnostics — không hiển thị cho user. */
	detail?: string;
}

const OK_AVAILABILITY: BackendAvailability = {
	healthOk: true,
	whaleFeedOk: true,
	probed: true,
	probedAt: 0,
};

function joinUrl(base: string, path: string): string {
	return `${base.replace(/\/+$/, "")}${path}`;
}

async function fetchWithTimeout(
	url: string,
	opts: { token?: string | null; timeoutMs: number },
	fetchImpl: typeof fetch,
): Promise<{ ok: boolean; status: number }> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
	try {
		const res = await fetchImpl(url, {
			method: "GET",
			signal: controller.signal,
			headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : undefined,
		});
		return { ok: res.ok, status: res.status };
	} catch {
		return { ok: false, status: 0 };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Probe backend. Trả về cache nếu còn hạn.
 * - `healthOk=false` + `probed=true` ⇒ backend chắc chắn không sống.
 * - `probed=false` ⇒ **chưa biết** (chưa probe, không có baseUrl, hoặc lỗi mạng) —
 *   Track A phải vẫn chạy được (client-side).
 */
export async function probeBackend(options: ProbeOptions): Promise<ProbeResult> {
	const now = options.now ?? Date.now;
	const cached = readCache(options.baseUrl, now());
	if (cached) return cached;

	if (!options.baseUrl) {
		return { ...UNKNOWN_AVAILABILITY, detail: "no baseUrl" };
	}

	// Injected fetch wins; the ambient one is only the default when the caller
	// supplied none. Same rationale as detectDeviceCaps below - this is a probe,
	// not a rendering path.
	/* eslint-disable-next-line no-restricted-globals */
	const fetchImpl = options.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
	if (!fetchImpl) {
		return { ...UNKNOWN_AVAILABILITY, detail: "no fetch" };
	}

	const timeoutMs = options.timeoutMs ?? 4000;
	const health = await fetchWithTimeout(
		joinUrl(options.baseUrl, "/core/v1/health"),
		{ token: options.token, timeoutMs },
		fetchImpl,
	);
	if (!health.ok) {
		// Phân biệt "CHẮC CHẮN backend chết" với "CHƯA BIẾT":
		//   status === 0 ⇒ lỗi mạng / timeout / abort ⇒ không kết luận, để Track A chạy offline.
		//   status >  0 ⇒ server có trả lời (503/404/…) ⇒ biết là không sống.
		if (health.status === 0) {
			return { ...UNKNOWN_AVAILABILITY, detail: "network unreachable" };
		}
		const result: ProbeResult = {
			healthOk: false,
			whaleFeedOk: false,
			probed: true,
			probedAt: now(),
			detail: `health ${health.status}`,
		};
		writeCache(options.baseUrl, result);
		return result;
	}

	// Sentinel quote: 1 mã, xác nhận namespace `/core/v1` thực sự phục vụ dữ liệu.
	const symbol = options.probeSymbol ?? "VNM";
	const quotes = await fetchWithTimeout(
		joinUrl(options.baseUrl, `/core/v1/realtime/tickers/?symbols=${encodeURIComponent(symbol)}`),
		{ token: options.token, timeoutMs },
		fetchImpl,
	);

	const result: ProbeResult = {
		healthOk: true,
		// `whaleFeedOk` dùng chung kết quả sentinel: nếu namespace data sống thì
		// các endpoint signals dưới cùng namespace cũng sống. Endpoint cụ thể
		// (`whale-campaigns`) được xử lý riêng ở tầng adapter với fallback.
		whaleFeedOk: quotes.ok,
		probed: true,
		probedAt: now(),
		detail: quotes.ok ? "ok" : `quotes ${quotes.status}`,
	};
	writeCache(options.baseUrl, result);
	return result;
}

interface CacheEntry {
	at: number;
	result: ProbeResult;
}

let cache: CacheEntry | null = null;

function readCache(baseUrl: string | null | undefined, nowMs: number): ProbeResult | null {
	if (!cache || cache.at + CACHE_TTL_MS <= nowMs) return null;
	if ((cache.result as unknown as { baseUrl?: string }).baseUrl !== baseUrl) return null;
	return cache.result;
}

function writeCache(baseUrl: string | null | undefined, result: ProbeResult): void {
	cache = { at: result.probedAt, result: { ...result, baseUrl } as ProbeResult };
}

/** Xoá cache — dùng trong test và khi người dùng đổi PAT. */
export function resetProbeCache(): void {
	cache = null;
}

/** Phát hiện giới hạn thiết bị. Không bao giờ đoán quá mức (thiếu ⇒ coi như desktop). */
export function detectDeviceCaps(): DeviceCaps {
	// Reading the host environment IS this function's entire purpose - it is the
	// probe. There is no adapter to inject: the value being asked for is a
	// property of the host, not of the widget. `no-restricted-globals` exists to
	// stop ambient access leaking into rendering paths; a capability probe is the
	// one place that has to touch the ambient scope, guarded by typeof checks so
	// SSR / sandboxed iframe degrade to "desktop" rather than throwing.
	/* eslint-disable no-restricted-globals */
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return { narrow: false, concurrency: 0 };
	}
	const narrow = window.matchMedia("(max-width: 768px)").matches;
	const nav = typeof navigator === "undefined" ? undefined : navigator;
	/* eslint-enable no-restricted-globals */
	return {
		narrow,
		concurrency: typeof nav?.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 0,
	};
}
