import { describe, it, expect } from "vitest";
import { AlertEvaluator } from "../AlertEvaluator";
import type { AlertCondition } from "../types";

describe("AlertEvaluator", () => {
	const mockAlert: AlertCondition = {
		id: "alert-1",
		symbol: "AAPL",
		timeframe: "1h",
		sourceA: { type: "price", key: "close" },
		condition: "crossing_up",
		sourceB: { type: "value", value: 100 },
		frequency: "once",
		actions: { popup: true, sound: true, email: false },
		message: "Price crossed up 100",
		createdAt: Date.now(),
		isTriggered: false,
	};

	it("should detect crossing_up condition correctly", () => {
		const prev = { close: 99 };
		const curr = { close: 101 };

		const result = AlertEvaluator.evaluate(curr, prev, mockAlert);
		expect(result).toBe(true);

		const resultNoCross = AlertEvaluator.evaluate({ close: 99 }, prev, mockAlert);
		expect(resultNoCross).toBe(false);
	});

	it("should detect crossing_down condition correctly", () => {
		const prev = { close: 101 };
		const curr = { close: 99 };
		const downAlert = { ...mockAlert, condition: "crossing_down" as const };

		const result = AlertEvaluator.evaluate(curr, prev, downAlert);
		expect(result).toBe(true);

		const resultNoCross = AlertEvaluator.evaluate({ close: 102 }, prev, downAlert);
		expect(resultNoCross).toBe(false);
	});

	it("should detect threshold comparison conditions (greater_than / less_than)", () => {
		const curr = { close: 105 };
		const prev = { close: 102 };

		const gtAlert = { ...mockAlert, condition: "greater_than" as const };
		const ltAlert = { ...mockAlert, condition: "less_than" as const };

		expect(AlertEvaluator.evaluate(curr, prev, gtAlert)).toBe(true);
		expect(AlertEvaluator.evaluate(curr, prev, ltAlert)).toBe(false);
	});
});
