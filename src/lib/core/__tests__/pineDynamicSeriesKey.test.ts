/**
 * G-PINE-KEY — a dynamically registered Pine series must survive the key chain.
 *
 * WHY THIS GATE EXISTS
 * A Pine series is compiled, registered via `registerPinePlugin`, and dispatched into a pane as
 * `type: "pine_<scriptId>"`. It then went through this chain:
 *
 *   buildIndicatorSeriesKey(series)
 *     -> buildIndicatorBaseKey(series)          // switch over the KNOWN type ids
 *        -> `default: return undefined`         // <- "pine_..." is not a known id
 *   computeIndicatorComputationResult()
 *     -> `if (!key) continue`                   // <- and this guard sits BEFORE getPinePlugin
 *     -> `getPinePlugin(series.type)`           // <- therefore never reached
 *
 * Net effect, observed by a paying customer: the script compiled with zero errors, the series
 * was added to the pane, and nothing was drawn. No error, no warning — a silent no-op. The
 * plugin bridge was fully wired the whole time; one lookup table simply could not name a type
 * that does not exist at compile time.
 *
 * This gate asserts the chain, not the symptom, so a future change that reintroduces the
 * ordering bug fails here instead of in a chart.
 *
 * See docs/upgrade-standard/plans/PLAN_PINE_PARITY_2026-10-08.md §2.1 (Stage 1).
 */
import { describe, expect, it } from "vitest";
import { buildIndicatorComputationPlan } from "../calculators/buildIndicatorComputationPlan";
import { computeIndicatorComputationResult } from "../calculators/computeIndicatorComputationResult";
import { buildIndicatorSeriesKey } from "../seriesValueResolver";
import { registerPinePlugin } from "../../../../packages/vn-kline-widget-pro/src/pinescript/PineCompiler";
// Side-effect: registers the real pinescript module into the public adapter
// registry, mirroring what a Pro host does at startup. Production reads Pine
// exclusively via getPineScriptAdapter(), so without this the plugin compute
// is never invoked and these tests fail closed.
import "../../../../packages/vn-kline-widget-pro/src/register";
import type { RawOHLCV } from "../calculators/types";
import type { SeriesConfig } from "../types/pane-descriptor";

const BARS: RawOHLCV[] = Array.from({ length: 12 }, (_, i) => ({
	date: new Date(Date.UTC(2026, 0, 1 + i)),
	open: 100 + i,
	high: 101 + i,
	low: 99 + i,
	close: 100 + i,
	volume: 1000 + i,
}));

function pineSeries(id: string, scriptId: string): SeriesConfig {
	return { id, type: `pine_${scriptId}` as SeriesConfig["type"], yAxis: "right" };
}

/** Register a plugin whose output is trivially distinguishable from close. */
function registerFakePine(type: string) {
	let calls = 0;
	registerPinePlugin({
		id: type,
		name: "gate probe",
		version: "1.0.0",
		compute: ({ bars }) => {
			calls += 1;
			// 1000+i cannot be confused with close (100+i).
			return { value: bars.map((_: unknown, i: number) => 1000 + i) };
		},
		outputSchema: null,
		defaultParams: {},
		paramSchema: null,
	});
	return () => calls;
}

describe("G-PINE-KEY: dynamic Pine series gets a key and reaches its plugin", () => {
	it("CONTROL: a built-in type still resolves to a key (proves this file is not vacuous)", () => {
		const key = buildIndicatorSeriesKey({
			id: "rsi-1",
			type: "RSI",
			params: { period: 14 },
			yAxis: "right",
		} as SeriesConfig);
		expect(key).toBeTruthy();
	});

	it("CONTROL: an unknown non-Pine type still resolves to no key (fail-closed is intentional)", () => {
		const key = buildIndicatorSeriesKey({
			id: "x",
			type: "TotallyMadeUpType" as SeriesConfig["type"],
			yAxis: "right",
		} as SeriesConfig);
		expect(key).toBeUndefined();
	});

	it("PINE-01: a pine_* type resolves to a structured PINE:<scriptId> key", () => {
		const key = buildIndicatorSeriesKey(pineSeries("pine-1", "abc123"));
		expect(key).toBe("PINE:abc123");
	});

	it("PINE-02: the key must not collide across two different scripts", () => {
		const a = buildIndicatorSeriesKey(pineSeries("pine-1", "aaa"));
		const b = buildIndicatorSeriesKey(pineSeries("pine-2", "bbb"));
		expect(a).toBeTruthy();
		expect(b).toBeTruthy();
		expect(a).not.toBe(b);
	});

	it("PINE-03: the plugin's compute is actually invoked for a Pine series", () => {
		const type = "pine_gate_probe";
		const calls = registerFakePine(type);
		// Build the plan with the REAL builder, so the fixture cannot drift from production.
		const plan = buildIndicatorComputationPlan([pineSeries("s1", "gate_probe")], 100000);

		computeIndicatorComputationResult(BARS, plan);

		expect(calls()).toBeGreaterThan(0);
	});

	it("PINE-04: the computed value lands in valuesByKey and is NOT the close price", () => {
		registerFakePine("pine_gate_probe_values");
		const plan = buildIndicatorComputationPlan(
			[pineSeries("s1", "gate_probe_values")],
			100000,
		);

		const result = computeIndicatorComputationResult(BARS, plan);

		const values = result.valuesByKey.get("PINE:gate_probe_values");
		expect(values).toBeDefined();
		expect(values).toHaveLength(BARS.length);
		// If this were the close fallback, index 5 would be 105.
		expect(values![5]).toBe(1005);
	});
});
