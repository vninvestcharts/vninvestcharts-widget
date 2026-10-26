/**
 * Regression lock — `frequency: "continuous"`.
 *
 * THE DEFECT, MEASURED
 * ====================
 * `checkAlerts` runs on every `enrichedData` change, which with a live feed is every few
 * seconds. `continuous` fired on every EVALUATION, so a plain `close > 0` alert produced a
 * native dialog plus an alert sound on every single tick. Measured before the fix: 10 fires
 * over 10 same-bar ticks, and 3 fires over "same bar twice, then a new bar" — while
 * `once` correctly produced 1 and `once_per_bar` correctly produced 2.
 *
 * WHAT IT IS NOW
 * ==============
 * A false → true TRANSITION. "Tell me each time it crosses", not "tell me whenever the
 * chart re-renders". The state is persisted (`lastConditionMet`) so a reload while the
 * condition happens to be true does not re-fire either.
 *
 * The storm assertion below is deliberately written as a COUNT rather than as a spot check,
 * because a spot check on "does it fire" would still pass against the old code on the very
 * first evaluation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertManager } from "../AlertManager";

const BAR_A = new Date("2026-09-30T10:00:00Z");
const BAR_B = new Date("2026-09-30T11:00:00Z");

/** A harness that records every persisted write, so save frequency is observable. */
function harness(frequency: string, over: Record<string, unknown> = {}) {
	const writes: string[] = [];
	vi.stubGlobal("localStorage", {
		getItem: () => null,
		setItem: (_k: string, v: string) => writes.push(v),
		removeItem: () => {},
		clear: () => {},
	} as any);
	const m = new AlertManager();
	m.addAlert({
		id: "c1", symbol: "BTCUSDT", timeframe: "1h",
		sourceA: { type: "price", key: "close" },
		condition: "greater_than",
		// Threshold 10, so `close` above and below it are both reachable. With a threshold of
		// 0 every positive close is "met" and the not-met branch is untestable.
		sourceB: { type: "value", value: 10 },
		frequency,
		actions: { popup: true, sound: true, email: false },
		message: "c", createdAt: 1, isTriggered: false,
		...over,
	} as any);
	const fired: any[] = [];
	m.onAlertTriggered((a) => fired.push(a));
	// close above 10 => condition met; close below 10 => not met
	const tick = (close: number, date = BAR_A) =>
		m.checkAlerts("BTCUSDT", "1h", { date, close }, { date, close: close - 1 }, []);
	return { m, fired, tick, writes };
}

describe("continuous: fires on a crossing, not on every evaluation", () => {
	beforeEach(() => { vi.restoreAllMocks(); });

	it("fires once when the condition becomes true, then STAYS quiet while it stays true", () => {
		const { fired, tick } = harness("continuous");
		tick(20); // false -> true: the crossing
		tick(21);
		tick(22);
		tick(23);
		expect(fired).toHaveLength(1);
	});

	it("THE STORM: 25 evaluations with the condition unchanged produce exactly 1 fire", () => {
		// The old code fired 25 times. Written as a count, not a spot check, so it would have
		// passed against the old code on the first evaluation.
		const { fired, tick } = harness("continuous");
		for (let i = 0; i < 25; i++) tick(20 + i);
		expect(fired).toHaveLength(1);
	});

	it("fires again when the condition is met again after dropping below", () => {
		const { fired, tick } = harness("continuous");
		tick(20); // crossing up   -> fire 1
		tick(21); // still up      -> quiet
		tick(1); //  down         -> quiet
		tick(20); // crossing up   -> fire 2
		tick(21); // still up      -> quiet
		expect(fired).toHaveLength(2);
	});

	it("does not fire when the condition is never met", () => {
		const { fired, tick } = harness("continuous");
		for (let i = 0; i < 5; i++) tick(1);
		expect(fired).toHaveLength(0);
	});

	it("a new bar does not by itself produce a crossing", () => {
		// The distinction from once_per_bar: this alert fires on the CONDITION crossing, so a
		// new bar that leaves the condition true must stay quiet.
		const { fired, tick } = harness("continuous");
		tick(20, BAR_A);
		tick(30, BAR_B);
		tick(40, BAR_B);
		expect(fired).toHaveLength(1);
	});

	it("persists lastConditionMet so a reload cannot re-fire an already-true crossing", () => {
		const { m, tick, writes } = harness("continuous");
		tick(20);
		expect(m.getAlerts()[0].lastConditionMet).toBe(true);
		expect(writes.some((w) => JSON.parse(w)[0].lastConditionMet === true)).toBe(true);
	});

	it("does not write localStorage on every tick while the state is unchanged", () => {
		// The transition state is written on change only; a live feed re-evaluating an
		// unchanged condition must not hammer storage.
		const { tick, writes } = harness("continuous");
		tick(20); // crossing -> writes
		const after = writes.length;
		for (let i = 0; i < 20; i++) tick(21);
		expect(writes.length).toBe(after);
	});

	it("never acks itself — a continuous alert stays armed for the next crossing", () => {
		const { m, tick } = harness("continuous");
		tick(20);
		expect(m.getAlerts()[0].isTriggered).toBe(false);
	});

	it("the other three frequencies are untouched by this change", () => {
		const once = harness("once");
		once.tick(20);
		once.tick(20);
		expect(once.fired).toHaveLength(1); // and isTriggered true -> arms off

		// once_per_bar: one fire per BAR, so two distinct bars fire twice and the repeat of
		// the first bar is suppressed. That is what distinguishes it from `continuous`.
		const perBar = harness("once_per_bar");
		perBar.tick(20, BAR_A); // fires
		perBar.tick(20, BAR_A); // same bar -> suppressed
		perBar.tick(20, BAR_B); // new bar -> fires
		expect(perBar.fired).toHaveLength(2);

		// once_per_bar_close still behaves exactly like once_per_bar: the bar-close flag it
		// would need does not exist on the datum, which is tracked as an open product decision.
		const perBarClose = harness("once_per_bar_close");
		perBarClose.tick(20, BAR_A);
		perBarClose.tick(20, BAR_A);
		perBarClose.tick(20, BAR_B);
		expect(perBarClose.fired).toHaveLength(2);
	});
});
