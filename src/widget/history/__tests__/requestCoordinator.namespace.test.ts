// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { RequestCoordinator } from "../RequestCoordinator";

/**
 * DATA-03 — request cache isolation + real cancellation.
 *
 * The cache/dedup key used to be `symbol|timeframe|from|to`, so two widgets
 * pointing at DIFFERENT adapters (two tenants, or live vs demo) in the same
 * browser shared one cache entry and could serve each other's bars. Separately,
 * the coordinator's AbortSignal never reached the adapter, so a cancelled
 * fetch kept paging the backend until it finished.
 */
const FROM = new Date("2024-01-01T00:00:00Z");
// Historical range (well outside the 1h "near now" window) so it is cacheable.
const TO = new Date("2024-01-10T00:00:00Z");

function params(scope?: string) {
	return { symbol: "BTC", timeframe: "1h", from: FROM, to: TO, scope };
}

function makeBars(tag: string) {
	return [{ date: FROM, open: 1, high: 1, low: 1, close: 1, volume: 1, __tag: tag }];
}

describe("DATA-03 coordinator cache namespace", () => {
	// AC-DATA-03-1
	it("does not share a cache entry between two data sources", async () => {
		const coordinator = new RequestCoordinator();
		const fetchA = vi.fn(async () => makeBars("A"));
		const fetchB = vi.fn(async () => makeBars("B"));

		const a = await coordinator.enqueue(fetchA, params("tenantA::prod"), 10, "chart-1");
		const b = await coordinator.enqueue(fetchB, params("tenantB::prod"), 10, "chart-1");

		expect(fetchA).toHaveBeenCalledTimes(1);
		expect(fetchB).toHaveBeenCalledTimes(1);
		expect((a[0] as { __tag: string }).__tag).toBe("A");
		expect((b[0] as { __tag: string }).__tag).toBe("B");
	});

	it("still dedupes within the same data source", async () => {
		const coordinator = new RequestCoordinator();
		const fetchFn = vi.fn(async () => makeBars("A"));

		const p1 = coordinator.enqueue(fetchFn, params("tenantA::prod"), 10, "chart-1");
		const p2 = coordinator.enqueue(fetchFn, params("tenantA::prod"), 10, "chart-2");
		const [a, b] = await Promise.all([p1, p2]);

		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(a).toEqual(b);
	});

	it("keeps legacy callers (no scope) working", async () => {
		const coordinator = new RequestCoordinator();
		const fetchFn = vi.fn(async () => makeBars("A"));
		const [a, b] = await Promise.all([
			coordinator.enqueue(fetchFn, params(), 10, "chart-1"),
			coordinator.enqueue(fetchFn, params(), 10, "chart-2"),
		]);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(a).toEqual(b);
	});
});

describe("DATA-03 abort propagation", () => {
	// AC-DATA-03-2
	it("passes a non-aborted signal into the fetch function", async () => {
		const coordinator = new RequestCoordinator();
		let seen: AbortSignal | undefined;
		await coordinator.enqueue(
			async (signal) => {
				seen = signal;
				return makeBars("A");
			},
			params("tenantA::prod"),
			10,
			"chart-1",
		);
		expect(seen).toBeInstanceOf(AbortSignal);
		expect(seen?.aborted).toBe(false);
	});

	it("rejects immediately when the caller signal is already aborted", async () => {
		const coordinator = new RequestCoordinator();
		const fetchFn = vi.fn(async () => makeBars("A"));
		const controller = new AbortController();
		controller.abort();

		await expect(
			coordinator.enqueue(fetchFn, params("tenantA::prod"), 10, "chart-1", controller.signal)
		).rejects.toBeInstanceOf(DOMException);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it("aborts the in-flight signal when the only subscriber cancels", async () => {
		const coordinator = new RequestCoordinator();
		const controller = new AbortController();
		let innerSignal: AbortSignal | undefined;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});

		const promise = coordinator.enqueue(
			async (signal) => {
				innerSignal = signal;
				await gate;
				return makeBars("A");
			},
			params("tenantA::prod"),
			10,
			"chart-1",
			controller.signal,
		);
		// Let the queue start the fetch.
		await Promise.resolve();
		await Promise.resolve();

		controller.abort();
		expect(innerSignal?.aborted).toBe(true);

		release();
		await expect(promise).rejects.toBeInstanceOf(DOMException);
	});
});
