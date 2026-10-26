/**
 * BL-10: central error taxonomy for widget data/runtime failures.
 * Every surfaced error carries a machine-readable `code`; UI layers map
 * codes to i18n messages (see ERROR_MESSAGE_KEYS) instead of interpolating
 * raw exception text.
 */
export type WidgetErrorCode =
	| "DATA_FETCH"
	| "DATA_TIMEOUT"
	| "ADAPTER_AUTH"
	| "CACHE"
	| "VALIDATION"
	| "STORAGE"
	| "UNKNOWN";

export const RETRYABLE_CODES: ReadonlySet<WidgetErrorCode> = new Set([
	"DATA_FETCH",
	"DATA_TIMEOUT",
	"CACHE",
]);

export function isRetryableCode(code: WidgetErrorCode): boolean {
	return RETRYABLE_CODES.has(code);
}

/** i18n keys for user-facing messages (both locales must define them). */
export const ERROR_MESSAGE_KEYS: Record<WidgetErrorCode, string> = {
	DATA_FETCH: "error.dataFetch",
	DATA_TIMEOUT: "error.timeout",
	ADAPTER_AUTH: "error.unknown",
	CACHE: "error.dataFetch",
	VALIDATION: "error.unknown",
	STORAGE: "error.unknown",
	UNKNOWN: "error.unknown",
};

export class WidgetError extends Error {
	readonly code: WidgetErrorCode;
	readonly context?: Record<string, unknown>;

	constructor(code: WidgetErrorCode, message: string, context?: Record<string, unknown>) {
		super(message);
		this.name = "WidgetError";
		this.code = code;
		this.context = context;
	}
}

export function toWidgetError(error: unknown, fallback: WidgetErrorCode = "UNKNOWN"): WidgetError {
	if (error instanceof WidgetError) return error;
	if (error instanceof DOMException && error.name === "AbortError") {
		return new WidgetError("DATA_TIMEOUT", "Request aborted", { abort: true });
	}
	const message = error instanceof Error ? error.message : String(error);
	const code: WidgetErrorCode = /timeout|timed out|abort/i.test(message)
		? "DATA_TIMEOUT"
		: /401|403|unauthorized|forbidden|auth/i.test(message)
			? "ADAPTER_AUTH"
			: fallback;
	return new WidgetError(code, message);
}

export interface RetryOptions {
	attempts?: number;
	baseMs?: number;
	maxMs?: number;
	signal?: AbortSignal;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) {
		return Promise.reject(new DOMException("Aborted", "AbortError"));
	}
	if (ms <= 0) {
		// Zero-delay path resolves on the microtask queue so contract tests
		// (which flush microtasks only) still observe every retry attempt.
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(new DOMException("Aborted", "AbortError"));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

/**
 * Retry wrapper with exponential backoff + jitter. Aborts immediately when
 * `signal` fires (no retry on user cancellation). Non-retryable WidgetError
 * codes (auth/validation) fail fast on the first attempt.
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
	const attempts = Math.max(1, options?.attempts ?? 3);
	const baseMs = options?.baseMs ?? 400;
	const maxMs = options?.maxMs ?? 4000;
	const signal = options?.signal;
	let lastError: unknown = null;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			const widgetError = toWidgetError(error);
			const aborted = signal?.aborted
				|| (error instanceof DOMException && error.name === "AbortError");
			const retryable = !aborted && isRetryableCode(widgetError.code);
			if (!retryable || attempt === attempts) {
				throw error;
			}
			const backoff = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
			const jitter = Math.random() * baseMs * 0.25;
			await sleep(backoff + jitter, signal);
		}
	}
	throw lastError;
}
