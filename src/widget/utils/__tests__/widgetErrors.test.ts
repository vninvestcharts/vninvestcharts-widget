import { describe, expect, it, vi } from "vitest";
import {
	isRetryableCode,
	toWidgetError,
	withRetry,
	WidgetError,
	ERROR_MESSAGE_KEYS,
} from "../widgetErrors";

describe("widgetErrors taxonomy (BL-10)", () => {
	it("classifies retryable vs terminal codes", () => {
		expect(isRetryableCode("DATA_FETCH")).toBe(true);
		expect(isRetryableCode("DATA_TIMEOUT")).toBe(true);
		expect(isRetryableCode("ADAPTER_AUTH")).toBe(false);
		expect(isRetryableCode("VALIDATION")).toBe(false);
		expect(isRetryableCode("UNKNOWN")).toBe(false);
	});

	it("maps every code to an i18n key", () => {
		for (const code of ["DATA_FETCH", "DATA_TIMEOUT", "ADAPTER_AUTH", "CACHE", "VALIDATION", "STORAGE", "UNKNOWN"] as const) {
			expect(typeof ERROR_MESSAGE_KEYS[code]).toBe("string");
		}
	});

	it("detects timeout/auth from raw messages", () => {
		expect(toWidgetError(new Error("request timed out")).code).toBe("DATA_TIMEOUT");
		expect(toWidgetError(new Error("401 unauthorized")).code).toBe("ADAPTER_AUTH");
		expect(toWidgetError(new Error("boom"), "DATA_FETCH").code).toBe("DATA_FETCH");
		expect(toWidgetError(new WidgetError("CACHE", "x")).code).toBe("CACHE");
	});

	it("retries retryable failures then succeeds", async () => {
		const fn = vi.fn()
			.mockRejectedValueOnce(new WidgetError("DATA_FETCH", "flaky"))
			.mockRejectedValueOnce(new WidgetError("DATA_FETCH", "flaky"))
			.mockResolvedValue("ok");
		await expect(withRetry(fn, { baseMs: 1, maxMs: 2 })).resolves.toBe("ok");
		expect(fn).toHaveBeenCalledTimes(3);
	});

	it("fails fast on non-retryable codes", async () => {
		const fn = vi.fn().mockRejectedValue(new WidgetError("ADAPTER_AUTH", "nope"));
		await expect(withRetry(fn, { baseMs: 1 })).rejects.toThrow("nope");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("resolves zero-delay backoff on the microtask queue (contract-test compat)", async () => {
		const fn = vi.fn()
			.mockRejectedValueOnce(new WidgetError("DATA_FETCH", "flaky"))
			.mockResolvedValue("ok");
		const flushMicrotasks = async () => {
			for (let i = 0; i < 10; i++) await Promise.resolve();
		};
		const pending = withRetry(fn, { baseMs: 0, maxMs: 0 });
		await flushMicrotasks();
		await expect(pending).resolves.toBe("ok");
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("does not retry after abort", async () => {
		const controller = new AbortController();
		const fn = vi.fn().mockImplementation(() => {
			controller.abort();
			return Promise.reject(new WidgetError("DATA_FETCH", "late abort"));
		});
		await expect(withRetry(fn, { baseMs: 1, signal: controller.signal })).rejects.toThrow();
		expect(fn).toHaveBeenCalledTimes(1);
	});
});
