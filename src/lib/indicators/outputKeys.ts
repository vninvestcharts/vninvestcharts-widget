/**
 * The sub-keys an indicator alert can read, DERIVED from the declared value shapes.
 *
 * WHY NOTHING HERE IS HAND-WRITTEN
 * ================================
 * The map used to be written by hand — twice, verbatim, in `AlertsModal.tsx` and
 * `tabs/IndicatorParamsForm.tsx` — and had already drifted: `StrengthElder:
 * ["bull","bear"]` against a `{bullPower,bearPower}` value, so an Elder Strength alert
 * read `val.bull`, got undefined, and could never fire while the form offered two
 * confident choices that both lied. Its fallback `|| [""]` was worse: `getValue` reads
 * `val[src.key || ""]`, so 35 of the 60 series types produced a single blank option and
 * 8 multi-output ones among them were permanently dead. `Whale`, enabled in the demo,
 * was one of the 8.
 *
 * A hand-maintained duplicate of a shape cannot be made safe by being careful. So the
 * map is derived from `INDICATOR_VALUE_SHAPES`, whose samples are TYPED against the real
 * interfaces — which is what makes drift a compile error rather than a surprise.
 *
 * THE DERIVATION RULE, AND WHY IT IS NARROW
 * =========================================
 * A member becomes a sub-key only if it is (a) numeric, and (b) comparable as a series.
 * `AlertEvaluator` compares a source with `>`:
 *   - arrays coerce to NaN ⇒ false on every bar, no report (`tpoBlocks`, `priceLevels`);
 *   - booleans compare by coercion ⇒ `true > 0` "works" while meaning nothing (`isPivot`);
 *   - strings never compare numerically (`IndicatorAcValue.color`).
 *
 * Numeric-and-present is not sufficient on its own, which is why the exclusions below
 * exist rather than a broader rule. They are the whole adjustment surface: every entry is
 * a member that IS a number on every bar and still is not something a user can set a
 * threshold against.
 */
import { INDICATOR_VALUE_SHAPES, indicatorValueShapeKeys } from "./indicatorValueShapes";

/**
 * Members that are numeric and always present, yet are not alert-comparable.
 *
 * Keep this list to one sentence per entry. It exists because "is a number" cannot know
 * the difference between a series value and a coordinate.
 */
const NOT_A_SERIES: Readonly<Record<string, readonly string[]>> = {
	// Bar time. Every bar has one and it is a number, but it is the bar's coordinate, not
	// a value the chart plots — a threshold against it has no meaning.
	Footprint: ["timestamp"],
};

/**
 * The derived map. Exported for tests and for anything that needs the whole set; callers
 * should prefer `outputKeysFor` / `hasReadableOutputs`.
 */
export const INDICATOR_OUTPUT_KEYS: Readonly<Record<string, readonly string[]>> = (() => {
	const derived = indicatorValueShapeKeys();
	for (const [type, keys] of Object.entries(derived)) {
		const drop = new Set<string>(NOT_A_SERIES[type] ?? []);
		derived[type] = keys.filter((k) => !drop.has(k));
	}
	return derived;
})();

/**
 * Sub-keys for a series type, or `[]`.
 *
 * `[]` is the honest answer for both "this is a scalar, the key is unused" and "this
 * type's outputs cannot be declared" (see `IndicatorMARibbonValue`). Callers must not turn
 * it into a single blank option: `getValue` would read `val[""]` and get undefined on
 * every bar.
 */
export function outputKeysFor(seriesType: string): readonly string[] {
	return INDICATOR_OUTPUT_KEYS[seriesType] ?? [];
}

/** True when the type has outputs a user can actually name and read. */
export function hasReadableOutputs(seriesType: string): boolean {
	return outputKeysFor(seriesType).length > 0;
}

/** The declared shapes, re-exported so consumers need one import, not two. */
export { INDICATOR_VALUE_SHAPES };
