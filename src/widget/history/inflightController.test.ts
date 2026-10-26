import { describe, expect, it } from "vitest";

import { computeAdaptiveInflightControllerState, type AdaptiveInflightControllerState } from "./inflightController";

function makeState(overrides: Partial<AdaptiveInflightControllerState> = {}): AdaptiveInflightControllerState {
	return {
		maxInflight: 2,
		debounceMs: 120,
		chunkBars: 3000,
		retentionFactor: 3.0,
		highFrameTimeCount: 0,
		lowFrameTimeCount: 0,
		highOverfetchCount: 0,
		...overrides,
	};
}

describe("computeAdaptiveInflightControllerState", () => {
	it("enters degrade mode after two consecutive high frame windows", () => {
		const first = computeAdaptiveInflightControllerState(
			makeState(),
			{ frameP95Ms: 35, queueDepth: 2, overfetchRatio: 1.2 },
			2.0,
		);
		const second = computeAdaptiveInflightControllerState(
			first,
			{ frameP95Ms: 32, queueDepth: 2, overfetchRatio: 1.2 },
			2.0,
		);

		expect(second.highFrameTimeCount).toBe(2);
		expect(second.maxInflight).toBe(1);
		expect(second.debounceMs).toBe(160);
		expect(second.chunkBars).toBe(2500);
	});

	it("does not keep shrinking chunk size on every later high-frame sample", () => {
		const degraded = computeAdaptiveInflightControllerState(
			makeState({
				maxInflight: 1,
				debounceMs: 160,
				chunkBars: 2500,
				highFrameTimeCount: 2,
			}),
			{ frameP95Ms: 31, queueDepth: 2, overfetchRatio: 1.2 },
			2.0,
		);

		expect(degraded.highFrameTimeCount).toBe(3);
		expect(degraded.maxInflight).toBe(1);
		expect(degraded.debounceMs).toBe(160);
		expect(degraded.chunkBars).toBe(2500);
	});

	it("recovers throughput after two low frame windows when queue is non-empty", () => {
		const state = makeState({
			maxInflight: 1,
			debounceMs: 200,
			chunkBars: 2000,
			highFrameTimeCount: 1,
		});
		const first = computeAdaptiveInflightControllerState(
			state,
			{ frameP95Ms: 12, queueDepth: 3, overfetchRatio: 1.2 },
			2.0,
		);
		const second = computeAdaptiveInflightControllerState(
			first,
			{ frameP95Ms: 11, queueDepth: 3, overfetchRatio: 1.2 },
			2.0,
		);

		expect(second.lowFrameTimeCount).toBe(2);
		expect(second.maxInflight).toBe(2);
		expect(second.debounceMs).toBe(180);
		expect(second.chunkBars).toBe(2500);
	});

	it("does not recover inflight when queue depth is zero", () => {
		const state = makeState({ maxInflight: 1, lowFrameTimeCount: 1 });
		const next = computeAdaptiveInflightControllerState(
			state,
			{ frameP95Ms: 10, queueDepth: 0, overfetchRatio: 1.0 },
			2.0,
		);

		expect(next.lowFrameTimeCount).toBe(2);
		expect(next.maxInflight).toBe(1);
	});

	it("applies overfetch protection after two consecutive high overfetch windows", () => {
		const first = computeAdaptiveInflightControllerState(
			makeState({ maxInflight: 3, retentionFactor: 2.4 }),
			{ frameP95Ms: 20, queueDepth: 2, overfetchRatio: 2.0 },
			2.0,
		);
		const second = computeAdaptiveInflightControllerState(
			first,
			{ frameP95Ms: 20, queueDepth: 2, overfetchRatio: 2.1 },
			2.0,
		);

		expect(second.highOverfetchCount).toBe(2);
		expect(second.maxInflight).toBe(2);
		expect(second.retentionFactor).toBeCloseTo(2.25, 6);
	});

	it("does not keep lowering retention on every later high-overfetch sample", () => {
		const degraded = computeAdaptiveInflightControllerState(
			makeState({ retentionFactor: 2.25, highOverfetchCount: 2, maxInflight: 2 }),
			{ frameP95Ms: 20, queueDepth: 2, overfetchRatio: 2.0 },
			2.0,
		);

		expect(degraded.highOverfetchCount).toBe(3);
		expect(degraded.maxInflight).toBe(2);
		expect(degraded.retentionFactor).toBeCloseTo(2.25, 6);
	});

	it("resets retention factor to base when overfetch is normal", () => {
		const state = makeState({ retentionFactor: 1.6, highOverfetchCount: 3 });
		const next = computeAdaptiveInflightControllerState(
			state,
			{ frameP95Ms: 18, queueDepth: 1, overfetchRatio: 1.4 },
			2.15,
		);

		expect(next.highOverfetchCount).toBe(0);
		expect(next.retentionFactor).toBe(2.15);
	});

	it("never reduces retention below the hard floor", () => {
		const state = makeState({ retentionFactor: 1.2, highOverfetchCount: 1 });
		const next = computeAdaptiveInflightControllerState(
			state,
			{ frameP95Ms: 20, queueDepth: 1, overfetchRatio: 2.0 },
			2.0,
		);

		expect(next.retentionFactor).toBe(1.15);
	});
});
