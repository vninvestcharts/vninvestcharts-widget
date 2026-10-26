/**
 * Uncaught-(in-promise) regression: RequestCoordinator rethrows fetch errors so
 * late joiners still observe the rejection — the derived promise must never
 * surface as an unhandled rejection when nobody joins.
 */
import { describe, expect, it, vi } from "vitest";
import { RequestCoordinator } from "../RequestCoordinator";

function params(from: number, to: number) {
	return { symbol: "VCB", timeframe: "D", from: new Date(from), to: new Date(to) };
}

describe("RequestCoordinator rejection propagation", () => {
	it("delivers the error to the caller without an unhandled rejection", async () => {
		const coordinator = new RequestCoordinator();
		const failure = new Error("HTTP_504");
		const failing = vi.fn().mockRejectedValue(failure);
		await expect(coordinator.enqueue(failing, params(1, 2), 10, "c1")).rejects.toBe(failure);
		// Flush microtasks — a stray derived rejection would fail the run.
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(failing).toHaveBeenCalledTimes(1);
	});

	it("late joiners observe the same rejection", async () => {
		const coordinator = new RequestCoordinator();
		const failure = new Error("HTTP_504");
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		const failing = vi.fn().mockImplementation(() => gate.then(() => { throw failure; }));
		const first = coordinator.enqueue(failing, params(10, 20), 10, "c1");
		const second = coordinator.enqueue(failing, params(10, 20), 10, "c2");
		release();
		await expect(first).rejects.toBe(failure);
		await expect(second).rejects.toBe(failure);
		expect(failing).toHaveBeenCalledTimes(1);
	});
});
