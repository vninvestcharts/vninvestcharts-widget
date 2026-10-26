import { describe, expect, it } from "vitest";
import { resolveOverflowHistoryQueueState } from "./visibleRangePolicies";

describe("visibleRangePolicies", () => {
	it("forces one left-overflow history queue when the viewport saturates at the loaded head", () => {
		const queueState = resolveOverflowHistoryQueueState(
			{ from: -120, to: 880 },
			1000,
			false,
			false,
			null,
		);

		expect(queueState).toEqual({
			overflowKey: "left:1000:-120:880",
			shouldForceQueue: true,
		});
	});

	it("does not requeue the same left-overflow request until the loaded window grows", () => {
		const queueState = resolveOverflowHistoryQueueState(
			{ from: -240, to: 760 },
			1000,
			false,
			false,
			"left:1000:-240:760",
		);

		expect(queueState).toEqual({
			overflowKey: "left:1000:-240:760",
			shouldForceQueue: false,
		});
	});

	it("allows another left-overflow queue after prepend grows the loaded window", () => {
		const queueState = resolveOverflowHistoryQueueState(
			{ from: -240, to: 1760 },
			2000,
			false,
			false,
			"left:1000:-240:760",
		);

		expect(queueState).toEqual({
			overflowKey: "left:2000:-240:1760",
			shouldForceQueue: true,
		});
	});

	it("does not force an overflow queue after the historical left boundary is exhausted", () => {
		const queueState = resolveOverflowHistoryQueueState(
			{ from: -240, to: 760 },
			1000,
			true,
			false,
			null,
		);

		expect(queueState).toEqual({
			overflowKey: null,
			shouldForceQueue: false,
		});
	});

	it("does not force overflow queue when dataLength <= 0", () => {
		const queueState = resolveOverflowHistoryQueueState(
			{ from: -120, to: 880 },
			0,
			false,
			false,
			null,
		);

		expect(queueState).toEqual({
			overflowKey: null,
			shouldForceQueue: false,
		});
	});
});
