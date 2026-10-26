/**
 * Runtime SSOT for what each indicator's value looks like, from which
 * `outputKeys.ts` DERIVES the sub-keys an alert may reference.
 *
 * WHY THIS REPLACES A HAND-WRITTEN MAP
 * =====================================
 * The sub-key map was written by hand in two places and had already drifted once
 * (`StrengthElder: ["bull","bear"]` against a `{bullPower,bearPower}` value), and its
 * fallback `|| [""]` produced an alert that could never fire while looking selectable.
 * A hand-maintained duplicate of a shape cannot be made safe by being careful; it can
 * only be made safe by being checked. So the shapes moved here — as VALUES, at runtime —
 * and the map stopped being written at all: it is derived from these by
 * `deriveOutputKeys` in `outputKeys.ts`.
 *
 * WHY THE SAMPLES ARE TYPED, AND THAT IS THE POINT
 * =================================================
 * Every sample below carries its real interface type. That is not decoration — it is the
 * lock. Adding a REQUIRED field to, say, `IndicatorMacdValue` stops `tsc` until a sample
 * carries it, and adding one to `outputKeys.ts` without it is then a compile error rather
 * than a silent drift. TypeScript erases these types at runtime, which is exactly why the
 * shapes had to be re-expressed as values to be reachable from a UI at all.
 *
 * WHAT DERIVATION EXCLUDDS, AND WHY
 * =================================
 * Only NUMERIC fields become sub-keys, because `AlertEvaluator` compares a source with
 * `>`:
 *   - arrays coerce to NaN, so the alert is false on every bar and never reports why
 *     (`MarketProfileData.tpoBlocks`, `VolumeProfileData.priceLevels`);
 *   - booleans compare by coercion, so `true > 0` "works" while meaning nothing
 *     (`IndicatorWyckoffValue.isPivot`).
 *
 * Fields a value does not CARRY ON EVERY BAR are excluded too, and the sample is the place
 * that says so. `IndicatorDeltaProfileValue.divergence` is optional and the materializer's
 * fallback branch (`materializeIndicatorValues.ts:139-143`) writes only three fields, so
 * the sample omits it — and because the derivation is numeric-over-sample, an omitted
 * field cannot become a sub-key.
 *
 * DYNAMIC SHAPES
 * ==============
 * `IndicatorMARibbonValue` is `Record<string, number>`: its field names come from the
 * ribbon configuration, so there is nothing to declare here and MARibbon is simply not
 * offered as an alert source. Inventing a key for it would recreate the exact defect this
 * file removes.
 *
 * SCALARS
 * =======
 * Absent from this table on purpose. RSI, MA, EMA and the rest have no members to
 * declare, and `AlertEvaluator.getValue` ignores the sub-key entirely when the stored
 * value is not an object. Absence is the correct statement, not a gap.
 */
import type {
	IndicatorAcValue,
	IndicatorAlligatorValue,
	IndicatorBandValue,
	IndicatorBrarValue,
	IndicatorCrValue,
	IndicatorDmiValue,
	IndicatorDeltaProfileValue,
	IndicatorDonchianValue,
	IndicatorDmaValue,
	IndicatorEmvValue,
	IndicatorFractalValue,
	IndicatorGatorValue,
	IndicatorIchimokuValue,
	IndicatorKdjValue,
	IndicatorKeltnerValue,
	IndicatorMacdValue,
	IndicatorMtmValue,
	IndicatorPivotValue,
	IndicatorPsyValue,
	IndicatorStrengthElderValue,
	IndicatorSupertrendValue,
	IndicatorTrixValue,
	IndicatorVwapValue,
	IndicatorWhaleValue,
	IndicatorWyckoffValue,
	FootprintBar,
	MarketProfileData,
	VolumeProfileData,
} from "../core/calculators/types";

/**
 * One value per multi-output series type, keyed by SERIES TYPE (not by interface name —
 * `MACD` produces `IndicatorMacdValue`).
 *
 * The values are dummies; only the field NAMES carry meaning. They are typed, so they
 * cannot drift from the shapes they mirror.
 */
export const INDICATOR_VALUE_SHAPES: Readonly<Record<string, object>> = {
	MACD: { macd: 0, signal: 0, divergence: 0 } satisfies IndicatorMacdValue,
	BollingerBand: { top: 0, middle: 0, bottom: 0 } satisfies IndicatorBandValue,
	Whale: { whaleBuyVol: 0, whaleSellVol: 0 } satisfies IndicatorWhaleValue,
	KDJ: { k: 0, d: 0, j: 0 } satisfies IndicatorKdjValue,
	DMI: { plusDI: 0, minusDI: 0, adx: 0 } satisfies IndicatorDmiValue,
	BRAR: { ar: 0, br: 0 } satisfies IndicatorBrarValue,
	MTM: { mtm: 0, signal: 0 } satisfies IndicatorMtmValue,
	EMV: { emv: 0, signal: 0 } satisfies IndicatorEmvValue,
	TRIX: { trix: 0, signal: 0 } satisfies IndicatorTrixValue,
	DMA: { ddd: 0, ama: 0 } satisfies IndicatorDmaValue,
	PSY: { psy: 0, signal: 0 } satisfies IndicatorPsyValue,
	CR: { cr: 0, ma1: 0, ma2: 0, ma3: 0, ma4: 0 } satisfies IndicatorCrValue,
	// The shape says bullPower/bearPower. The hand-written map said bull/bear.
	StrengthElder: { bullPower: 0, bearPower: 0 } satisfies IndicatorStrengthElderValue,
	Ichimoku: { tenkan: 0, kijun: 0, senkouA: 0, senkouB: 0, chikou: 0 } satisfies IndicatorIchimokuValue,
	Supertrend: { supertrend: 0, direction: 0, upperBand: 0, lowerBand: 0 } satisfies IndicatorSupertrendValue,
	Keltner: { upper: 0, middle: 0, lower: 0 } satisfies IndicatorKeltnerValue,
	Donchian: { upper: 0, middle: 0, lower: 0 } satisfies IndicatorDonchianValue,
	VWAP: { vwap: 0, upper1: 0, lower1: 0, upper2: 0, lower2: 0, upper3: 0, lower3: 0 } satisfies IndicatorVwapValue,
	AnchoredVWAP: { vwap: 0, upper1: 0, lower1: 0, upper2: 0, lower2: 0, upper3: 0, lower3: 0 } satisfies IndicatorVwapValue,
	Alligator: { jaw: 0, teeth: 0, lips: 0 } satisfies IndicatorAlligatorValue,
	Gator: { upper: 0, lower: 0 } satisfies IndicatorGatorValue,
	Fractals: { bearish: 0, bullish: 0 } satisfies IndicatorFractalValue,
	// `color` is a string, so the numeric derivation excludes it without help.
	AC: { ac: 0, color: "" } satisfies IndicatorAcValue,
	PivotStandard: { pp: 0, r1: 0, s1: 0, r2: 0, s2: 0, r3: 0, s3: 0 } satisfies IndicatorPivotValue,
	PivotHighLow: { pp: 0, r1: 0, s1: 0, r2: 0, s2: 0, r3: 0, s3: 0 } satisfies IndicatorPivotValue,
	// `divergence` deliberately omitted: optional, and absent from the fallback branch.
	DeltaProfile: { cumulativeDelta: 0, barDelta: 0, deltaSMA: 0 } satisfies IndicatorDeltaProfileValue,
	// `isPivot` is a boolean, so the numeric derivation excludes it without help.
	WyckoffWave: { direction: 0, zigzag: 0, waveVolume: 0, waveDuration: 0, isPivot: false } satisfies IndicatorWyckoffValue,
	// The array members are declared but left out by the numeric derivation; see the header.
	MarketProfile: {
		tpoBlocks: [],
		poc: 0,
		valueAreaHigh: 0,
		valueAreaLow: 0,
		initialBalanceHigh: 0,
		initialBalanceLow: 0,
		profileHigh: 0,
		profileLow: 0,
	} satisfies MarketProfileData,
	VolumeProfile: { priceLevels: [], poc: 0, valueAreaHigh: 0, valueAreaLow: 0, highVolumeNodes: [], lowVolumeNodes: [] } satisfies VolumeProfileData,
	Footprint: { timestamp: 0, open: 0, high: 0, low: 0, close: 0, priceLevels: [] } satisfies FootprintBar,
};

/**
 * The numeric field names of every declared shape.
 *
 * Derived, never hand-written — see `deriveOutputKeys` in `outputKeys.ts`, which filters
 * to numbers and is what keeps arrays and booleans out of the sub-key list.
 */
export function indicatorValueShapeKeys(): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const [type, sample] of Object.entries(INDICATOR_VALUE_SHAPES)) {
		out[type] = Object.keys(sample).filter((k) => typeof (sample as Record<string, unknown>)[k] === "number");
	}
	return out;
}
