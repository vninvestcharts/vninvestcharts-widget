/**
 * S4 regression lock — the sub-keys must be DERIVED FROM the declared value shapes.
 *
 * WHAT THIS LOCKS
 * ===============
 * The sub-key map was hand-written, twice, and had already drifted
 * (`StrengthElder: ["bull","bear"]` against a `{bullPower,bearPower}` value). Its
 * fallback `|| [""]` produced an option that could never be read
 * (`getValue` does `val[src.key || ""]`), so 8 multi-output types were permanently
 * dead while looking selectable — `Whale`, enabled in the demo, among them.
 *
 * WHAT IS CHECKED HERE, AND WHERE
 * ===============================
 * The map is no longer written by hand at all; `INDICATOR_OUTPUT_KEYS` is derived from
 * `INDICATOR_VALUE_SHAPES`. So these cases no longer compare a map to a hand-written
 * table — they check that the DERIVATION keeps its promises:
 *
 *   - a required field added to a shape breaks `tsc` until the sample carries it, and
 *     the sample is what the map is built from, so drift is a compile error;
 *   - a non-numeric member can never become a sub-key (arrays, booleans, strings);
 *   - nothing can fall back to a blank sub-key;
 *   - scalars stay absent, because `getValue` ignores the key for them.
 *
 * The shape samples live in `indicatorValueShapes.ts` at runtime precisely so they can be
 * checked. `IndicatorDatumValue` is a TYPE and is erased at runtime, so it cannot be
 * introspected from a test; and re-deriving the map from the type would make the test
 * agree with itself and catch nothing.
 */
import { describe, expect, it } from "vitest";
import {
	INDICATOR_OUTPUT_KEYS,
	INDICATOR_VALUE_SHAPES,
	outputKeysFor,
	hasReadableOutputs,
} from "../outputKeys";
import { indicatorValueShapeKeys } from "../indicatorValueShapes";

/** Every scalar the charts actually compute — none may appear in the map. */
const SCALARS = [
	"RSI", "MA", "EMA", "SMA", "WMA", "VWMA", "HMA", "DEMA", "TEMA",
	"CCI", "MFI", "CMF", "OBV", "AO", "PVT", "BBI", "SMFI", "BIAS",
	"WR", "VR", "ROC", "SAR", "StdDev", "ChaikinVol", "CI", "HV",
	"CVDApprox", "CVDRealtime", "StrengthRelative",
];

describe("S4: the sub-key map is derived from the declared shapes", () => {
	it("every declared type yields at least one readable sub-key", () => {
		for (const type of Object.keys(INDICATOR_VALUE_SHAPES)) {
			expect(outputKeysFor(type).length).toBeGreaterThan(0);
			expect(hasReadableOutputs(type)).toBe(true);
		}
	});

	it("C5: no sub-key is ever blank", () => {
		for (const [type, keys] of Object.entries(INDICATOR_OUTPUT_KEYS)) {
			for (const k of keys) {
				expect(k).not.toBe("");
				expect(k.trim()).toBe(k);
			}
			expect(type.trim()).toBe(type);
		}
		// And the fallback for an unknown type is empty, not [""].
		expect(outputKeysFor("TotallyUnknownType")).toEqual([]);
		expect(outputKeysFor("MARibbon")).toEqual([]);
	});

	it("a sub-key is always numeric — arrays, booleans and strings can never leak in", () => {
		// The invariant that kills the silent-death class outright. `AlertEvaluator`
		// compares with `>`: an array coerces to NaN so the alert is false on every bar and
		// never says why, a boolean compares by coercion so `true > 0` "works" while
		// meaning nothing, and a string never compares numerically.
		const offenders: string[] = [];
		for (const [type, sample] of Object.entries(INDICATOR_VALUE_SHAPES)) {
			for (const key of outputKeysFor(type)) {
				const v = (sample as Record<string, unknown>)[key];
				if (typeof v !== "number" || !Number.isFinite(v)) offenders.push(`${type}.${key}=${typeof v}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("every sub-key exists on the declared shape", () => {
		for (const [type, keys] of Object.entries(INDICATOR_OUTPUT_KEYS)) {
			const sample = INDICATOR_VALUE_SHAPES[type] as Record<string, unknown>;
			for (const key of keys) expect(Object.hasOwn(sample, key)).toBe(true);
		}
	});

	it("scalars are absent, which is correct — getValue ignores the key for them", () => {
		for (const scalar of SCALARS) {
			expect(INDICATOR_OUTPUT_KEYS[scalar]).toBeUndefined();
			expect(hasReadableOutputs(scalar)).toBe(false);
		}
	});

	it("C4: StrengthElder offers the names the value has", () => {
		expect(outputKeysFor("StrengthElder")).toEqual(["bullPower", "bearPower"]);
		expect(outputKeysFor("StrengthElder")).not.toContain("bull");
		expect(outputKeysFor("StrengthElder")).not.toContain("bear");
	});

	it("non-series members are excluded even though the derivation alone would keep them", () => {
		// Named, so turning one back on is a visible edit rather than a silent widening.
		expect(outputKeysFor("DeltaProfile")).not.toContain("divergence");
		expect(outputKeysFor("WyckoffWave")).not.toContain("isPivot");
		expect(outputKeysFor("AC")).not.toContain("color");
		expect(outputKeysFor("Footprint")).not.toContain("timestamp");
		for (const arrayKey of ["tpoBlocks", "priceLevels", "highVolumeNodes", "lowVolumeNodes"]) {
			expect(outputKeysFor("MarketProfile")).not.toContain(arrayKey);
			expect(outputKeysFor("VolumeProfile")).not.toContain(arrayKey);
			expect(outputKeysFor("Footprint")).not.toContain(arrayKey);
		}
	});

	it("the derivation is exactly: numeric members of the declared shapes", () => {
		// Pins the rule itself, so a future edit to `deriveOutputKeys` cannot quietly
		// change what counts as a sub-key without this turning red.
		const derived = indicatorValueShapeKeys();
		expect(outputKeysFor("Footprint")).toEqual(derived.Footprint.filter((k) => k !== "timestamp"));
		expect(outputKeysFor("AC")).toEqual(derived.AC);
		expect(outputKeysFor("WyckoffWave")).toEqual(derived.WyckoffWave);
		expect(outputKeysFor("DeltaProfile")).toEqual(derived.DeltaProfile);
	});

	it("no duplicate sub-keys within a type", () => {
		for (const keys of Object.values(INDICATOR_OUTPUT_KEYS)) {
			expect(new Set(keys).size).toBe(keys.length);
		}
	});
});
