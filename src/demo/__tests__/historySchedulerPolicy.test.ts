import { describe, expect, it } from "vitest";

import { canRunHistoryScheduler } from "../historySchedulerPolicy";

describe("canRunHistoryScheduler", () => {
	it("blocks scheduling while warmup is in flight", () => {
		expect(
			canRunHistoryScheduler({
				activeSource: "binance",
				warmupInFlight: true,
				backfillInFlight: false,
				liveBarsLength: 200,
			}),
		).toBe(false);
	});

	it("allows scheduling for live online sources with no in-flight work", () => {
		expect(
			canRunHistoryScheduler({
				activeSource: "binance",
				warmupInFlight: false,
				backfillInFlight: false,
				liveBarsLength: 200,
			}),
		).toBe(true);

		expect(
			canRunHistoryScheduler({
				activeSource: "vninvest",
				warmupInFlight: false,
				backfillInFlight: false,
				liveBarsLength: 200,
			}),
		).toBe(true);
	});

	it("blocks offline source", () => {
		expect(
			canRunHistoryScheduler({
				activeSource: "offline",
				warmupInFlight: false,
				backfillInFlight: false,
				liveBarsLength: 200,
			}),
		).toBe(false);
	});
});
