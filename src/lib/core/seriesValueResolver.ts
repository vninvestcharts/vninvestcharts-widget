import type {
	EnrichedDatum,
	IndicatorBandValue,
	IndicatorBrarValue,
	IndicatorCrValue,
	IndicatorDmaValue,
	IndicatorDmiValue,
	IndicatorEmvValue,
	IndicatorDatumValue,
	IndicatorKdjValue,
	IndicatorMacdValue,
	IndicatorMtmValue,
	IndicatorPsyValue,
	IndicatorTrixValue,
	IndicatorWhaleValue,
	IndicatorStrengthElderValue,
	IndicatorIchimokuValue,
	IndicatorSupertrendValue,
	IndicatorKeltnerValue,
	IndicatorDonchianValue,
	IndicatorMARibbonValue,
	IndicatorAlligatorValue,
	IndicatorFractalValue,
	IndicatorGatorValue,
	IndicatorPivotValue,
	IndicatorVwapValue,
	IndicatorAcValue,
	MarketProfileData,
	VolumeProfileData,
	FootprintBar,
	IndicatorDeltaProfileValue,
	IndicatorWyckoffValue,
} from "./calculators/types";
import type { SeriesConfig } from "./types/pane-descriptor";
import { normalizeSeriesTypeId } from "./types/pane-descriptor";
import { PRIMARY_BASELINE_KEY } from "@vninvestcharts/engine-core";

function numberParam(series: SeriesConfig, key: string, fallback: number) {
	const value = series.params?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}



function asNumber(value: IndicatorDatumValue | undefined, pick?: (value: IndicatorDatumValue) => number | undefined) {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value === "number") {
		return value;
	}
	return pick?.(value);
}

/**
 * Collapses a datum value to the single number a scalar consumer (tooltip, legend, Y-domain)
 * can display. A multi-plot Pine script yields a keyed object per bar; we take the first
 * declared plot, matching what `computeIndicatorComputationResult` puts on the wire, so the
 * widget and the engine never disagree about which line they are looking at.
 */
function asScalar(value: IndicatorDatumValue | undefined): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	if (typeof value === "object" && !Array.isArray(value)) {
		const first = Object.values(value as unknown as Record<string, unknown>)[0];
		return typeof first === "number" && Number.isFinite(first) ? first : undefined;
	}
	return undefined;
}

/**
 * The Pine series-type prefix, and the only place that parses it.
 *
 * A Pine script produces a series whose type id is generated at runtime, so it is absent from
 * every closed lookup table in this file. Both the producer (PineEditorPanel) and the consumer
 * (buildIndicatorBaseKey) must agree on the format; when they disagreed, the series resolved to
 * no key and vanished. One exported pair, one format, no second spelling.
 *
 * `scriptId` is the persisted script id (base36 + timestamp), which never contains a dot — that
 * matters, because the engine treats a type containing "." as a derived sub-series.
 */
export const PINE_SERIES_TYPE_PREFIX = "pine_";

/**
 * Idempotent on purpose: `useScriptPersistence.generateId()` already emits ids beginning with
 * `pine_`, so the script id and the series type are the same string in practice. Making this
 * idempotent means a caller can pass either form without producing `pine_pine_...`.
 */
export function pineSeriesTypeFor(scriptId: string): string {
	return scriptId.startsWith(PINE_SERIES_TYPE_PREFIX)
		? scriptId
		: `${PINE_SERIES_TYPE_PREFIX}${scriptId}`;
}

/** Returns the script id, or null when the type is not a Pine series type. */
export function pineScriptIdFromSeriesType(type: string): string | null {
	if (!type.startsWith(PINE_SERIES_TYPE_PREFIX)) return null;
	const scriptId = type.slice(PINE_SERIES_TYPE_PREFIX.length);
	// Guard the engine's derived-sub-series rule and reject an empty suffix.
	if (scriptId.length === 0 || scriptId.includes(".")) return null;
	return scriptId;
}

function buildIndicatorBaseKey(series: SeriesConfig): string | undefined {
	switch (normalizeSeriesTypeId(series.type)) {
		case "EMA":
			return `EMA:period=${numberParam(series, "period", 20)}`;
		case "MA":
			return `MA:period=${numberParam(series, "period", 20)}`;
		case "BollingerBand":
			return `BollingerBand:period=${numberParam(series, "period", 20)}:stdDev=${numberParam(series, "stdDev", 2)}`;
		case "RSI":
			return `RSI:period=${numberParam(series, "period", 14)}`;
		case "MACD":
			return `MACD:fast=${numberParam(series, "fast", 12)}:slow=${numberParam(series, "slow", 26)}:signal=${numberParam(series, "signal", 9)}`;
		case "Whale":
			return `Whale:threshold=${numberParam(series, "threshold", 50_000)}`;
		case "SAR":
			return `SAR:afStep=${numberParam(series, "afStep", 0.02)}:afMax=${numberParam(series, "afMax", 0.2)}`;
		case "WR":
			return `WR:period=${numberParam(series, "period", 14)}`;
		case "VR":
			return `VR:period=${numberParam(series, "period", 26)}`;
		case "KDJ":
			return `KDJ:period=${numberParam(series, "period", 9)}:m1=${numberParam(series, "m1", 3)}:m2=${numberParam(series, "m2", 3)}`;
		case "CCI":
			return `CCI:period=${numberParam(series, "period", 20)}`;
		case "DMI":
			return `DMI:period=${numberParam(series, "period", 14)}`;
		case "BIAS":
			return `BIAS:period=${numberParam(series, "period", 6)}`;
		case "BRAR":
			return `BRAR:period=${numberParam(series, "period", 26)}`;
		case "MTM":
			return `MTM:period=${numberParam(series, "period", 6)}:signalPeriod=${numberParam(series, "signalPeriod", 6)}`;
		case "EMV":
			return `EMV:period=${numberParam(series, "period", 14)}`;
		case "AO":
			return "AO";
		case "ROC":
			return `ROC:period=${numberParam(series, "period", 12)}`;
		case "TRIX":
			return `TRIX:period=${numberParam(series, "period", 12)}:signalPeriod=${numberParam(series, "signalPeriod", 9)}`;
		case "DMA":
			return `DMA:fastPeriod=${numberParam(series, "fastPeriod", 10)}:slowPeriod=${numberParam(series, "slowPeriod", 50)}:signalPeriod=${numberParam(series, "signalPeriod", 10)}`;
		case "PVT":
			return "PVT";
		case "PSY":
			return `PSY:period=${numberParam(series, "period", 12)}:signalPeriod=${numberParam(series, "signalPeriod", 6)}`;
		case "CR":
			return `CR:period=${numberParam(series, "period", 26)}:m1=${numberParam(series, "m1", 10)}:m2=${numberParam(series, "m2", 20)}:m3=${numberParam(series, "m3", 40)}:m4=${numberParam(series, "m4", 60)}`;
		// CE26 additions
		case "WMA":
			return `WMA:period=${numberParam(series, "period", 9)}`;
		case "VWMA":
			return `VWMA:period=${numberParam(series, "period", 20)}`;
		case "HMA":
			return `HMA:period=${numberParam(series, "period", 9)}`;
		case "DEMA":
			return `DEMA:period=${numberParam(series, "period", 9)}`;
		case "TEMA":
			return `TEMA:period=${numberParam(series, "period", 9)}`;
		case "MARibbon": {
			const type = series.params?.type || "EMA";
			const periods = (series.params?.periods as number[]) || [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
			return `MARibbon:type=${type}:periods=${periods.join(",")}`;
		}
		case "Ichimoku":
			return `Ichimoku:tenkan=${numberParam(series, "tenkan", 9)}:kijun=${numberParam(series, "kijun", 26)}:senkouB=${numberParam(series, "senkouB", 52)}:displacement=${numberParam(series, "displacement", 26)}`;
		case "Supertrend":
			return `Supertrend:period=${numberParam(series, "period", 10)}:multiplier=${numberParam(series, "multiplier", 3)}`;
		case "Keltner":
			return `Keltner:period=${numberParam(series, "period", 20)}:atrPeriod=${numberParam(series, "atrPeriod", 10)}:multiplier=${numberParam(series, "multiplier", 2)}`;
		case "Donchian":
			return `Donchian:period=${numberParam(series, "period", 20)}`;
		case "ChaikinVol":
			return `ChaikinVol:period=${numberParam(series, "period", 10)}`;
		case "StdDev":
			return `StdDev:period=${numberParam(series, "period", 20)}`;
		case "HV": {
			const annualize = series.params?.annualize !== false;
			return `HV:period=${numberParam(series, "period", 20)}:annualize=${annualize}`;
		}
		case "CI":
			return `CI:period=${numberParam(series, "period", 14)}`;
		case "CVDApprox":
			return "CVDApprox";
		case "CVDRealtime":
			return "CVDRealtime";
		case "StrengthElder":
			return "StrengthElder";
		case "StrengthRelative": {
			const compareSymbol = (series.params?.compareSymbol as string) || "VNINDEX";
			const period = numberParam(series, "period", 14);
			return `StrengthRelative:compareSymbol=${compareSymbol}:period=${period}`;
		}
		case "SMFI":
			return "SMFI";
		case "WyckoffWave": {
			const thresholdPercent = numberParam(series, "thresholdPercent", 1);
			return `WyckoffWave:thresholdPercent=${thresholdPercent}`;
		}
		case "BBI":
			return "BBI";
		case "OBV":
			return "OBV";
		case "CMF":
			return `CMF:period=${numberParam(series, "period", 20)}`;
		case "MFI":
			return `MFI:period=${numberParam(series, "period", 14)}`;
		case "VolOsc":
			return `VolOsc:shortPeriod=${numberParam(series, "shortPeriod", 5)}:longPeriod=${numberParam(series, "longPeriod", 20)}`;
		case "ChaikinOscillator":
			return `ChaikinOscillator:fast=${numberParam(series, "fast", 3)}:slow=${numberParam(series, "slow", 10)}`;
		case "VWAP": {
			const anchor = series.params?.anchor || "session";
			const showBands = series.params?.showBands !== false;
			const multiplier = numberParam(series, "multiplier", 1);
			return `VWAP:anchor=${anchor}:showBands=${showBands}:multiplier=${multiplier}`;
		}
		case "AnchoredVWAP": {
			const anchorTime = numberParam(series, "anchorTime", 0);
			const showBands = series.params?.showBands !== false;
			const multiplier = numberParam(series, "multiplier", 1);
			return `AnchoredVWAP:anchorTime=${anchorTime}:showBands=${showBands}:multiplier=${multiplier}`;
		}
		case "Alligator": {
			const jawPeriod = numberParam(series, "jawPeriod", 13);
			const jawShift = numberParam(series, "jawShift", 8);
			const teethPeriod = numberParam(series, "teethPeriod", 8);
			const teethShift = numberParam(series, "teethShift", 5);
			const lipsPeriod = numberParam(series, "lipsPeriod", 5);
			const lipsShift = numberParam(series, "lipsShift", 3);
			return `Alligator:jawPeriod=${jawPeriod}:jawShift=${jawShift}:teethPeriod=${teethPeriod}:teethShift=${teethShift}:lipsPeriod=${lipsPeriod}:lipsShift=${lipsShift}`;
		}
		case "Fractals":
			return "Fractals";
		case "Gator": {
			const jawPeriod = numberParam(series, "jawPeriod", 13);
			const jawShift = numberParam(series, "jawShift", 8);
			const teethPeriod = numberParam(series, "teethPeriod", 8);
			const teethShift = numberParam(series, "teethShift", 5);
			const lipsPeriod = numberParam(series, "lipsPeriod", 5);
			const lipsShift = numberParam(series, "lipsShift", 3);
			return `Gator:jawPeriod=${jawPeriod}:jawShift=${jawShift}:teethPeriod=${teethPeriod}:teethShift=${teethShift}:lipsPeriod=${lipsPeriod}:lipsShift=${lipsShift}`;
		}
		case "AC":
			return "AC";
		case "PivotStandard":
			return `PivotStandard:pivotType=${numberParam(series, "pivotType", 0)}`;
		case "PivotHighLow": {
			const lookback = numberParam(series, "lookback", 10);
			const pivotType = numberParam(series, "pivotType", 0);
			return `PivotHighLow:lookback=${lookback}:pivotType=${pivotType}`;
		}
		case "MarketProfile": {
			const tickSize = numberParam(series, "tickSize", 0.01);
			const tpoPeriodMinutes = numberParam(series, "tpoPeriodMinutes", 30);
			return `MarketProfile:tickSize=${tickSize}:tpoPeriodMinutes=${tpoPeriodMinutes}`;
		}
		case "VolumeProfile": {
			const priceTickSize = numberParam(series, "priceTickSize", 0.01);
			return `VolumeProfile:priceTickSize=${priceTickSize}`;
		}
		case "Footprint": {
			const barIntervalMs = numberParam(series, "barIntervalMs", 60000);
			const priceTickSize = numberParam(series, "priceTickSize", 0.01);
			return `Footprint:barIntervalMs=${barIntervalMs}:priceTickSize=${priceTickSize}`;
		}
		case "DeltaProfile": {
			const barIntervalMs = numberParam(series, "barIntervalMs", 60000);
			const priceTickSize = numberParam(series, "priceTickSize", 0.01);
			const smaPeriod = numberParam(series, "smaPeriod", 14);
			return `DeltaProfile:barIntervalMs=${barIntervalMs}:priceTickSize=${priceTickSize}:smaPeriod=${smaPeriod}`;
		}
		default: {
			// G-PINE-KEY: Pine registers a series under a type id that does not exist at compile
			// time (`pine_<scriptId>`), so it can never appear in the switch above. Without this
			// branch the default returned undefined, `computeIndicatorComputationResult` hit its
			// `if (!key) continue` guard BEFORE it reached `getPinePlugin`, and a script that
			// compiled cleanly rendered nothing — no error anywhere.
			//
			// The key is structured, not the raw type, so two scripts can never collide, and the
			// prefix makes dynamic keys identifiable downstream instead of looking like a typo.
			const scriptId = pineScriptIdFromSeriesType(series.type);
			if (scriptId) return `PINE:${scriptId}`;
			return undefined;
		}
	}
}

export function buildIndicatorSeriesKey(series: SeriesConfig): string | undefined {
	const key = buildIndicatorBaseKey(series);
	if (!key) {
		return undefined;
	}

	let suffix = "";
	if (series.sourceType === "indicator" && series.sourceId) {
		suffix = `:sourceType=indicator:sourceId=${series.sourceId}:sourceKey=${series.sourceKey ?? "close"}`;
	} else if (series.sourceKey && series.sourceKey !== "close") {
		suffix = `:sourceKey=${series.sourceKey}`;
	}

	if (series.params?.timeframe && series.params.timeframe !== "Same as chart") {
		suffix += `:timeframe=${series.params.timeframe}`;
	}

	return key + suffix;
}

export function resolveSeriesDatumValue(datum: EnrichedDatum, series: SeriesConfig): IndicatorDatumValue | undefined {
	const key = buildIndicatorSeriesKey(series);
	if (key) {
		return datum.indicatorValues?.[key];
	}
	return undefined;
}

/**
 * Cạnh dẫn đầu của cột Point & Figure tại bar này — `close` của box CUỐI.
 *
 * Vì sao phải là box cuối chứ không phải `boxes[0]`: một bar có thể tạo nhiều box
 * (gap lớn), và box đầu tiên là mép DƯỚI của phần vừa hình thành, tức là đáy cột
 * chứ không phải giá hiện tại. Đọc `boxes[0]` sẽ báo giá thấp hơn thực tế tới
 * cả một bậc.
 *
 * Vì sao đây chỉ là MỘT số: đó là giới hạn của giao diện `resolveSeriesValue` —
 * mỗi bar một giá trị, và mỗi rect là một giá trị. Phần hình học còn lại của cột
 * (thang box) do `layoutPointAndFigure` của engine dựng, và miền giá được nới
 * bằng `widenDomainForPointAndFigure` — xem `exoticSeriesModes.isColumnStackMode`.
 */
function resolvePointAndFigureEdge(datum: EnrichedDatum): number | undefined {
	const boxes = datum.boxes;
	if (!boxes || boxes.length === 0) {
		return undefined;
	}
	return boxes[boxes.length - 1]?.close;
}

function resolveOverlayValue(datum: EnrichedDatum, series: SeriesConfig): number | undefined {
	if (!series.overlaySymbolId) {
		return undefined;
	}
	if (series.normalizeToBaseline === true) {
		const np = datum.normalizedPrices?.[series.overlaySymbolId];
		if (typeof np === "number") {
			return np;
		}
	}
	return datum.symbolData?.[series.overlaySymbolId]?.close;
}

export function resolveSeriesValue(datum: EnrichedDatum, series: SeriesConfig): number | undefined {
	const overlayVal = resolveOverlayValue(datum, series);
	if (overlayVal !== undefined) {
		return overlayVal;
	}

	// Pine: a runtime-generated type id that this closed `switch` cannot name, so it would fall
	// through to `default: return datum.close` and the tooltip/legend/Y-domain would all report
	// the bar's close instead of the script's value. That is a silent wrong answer that looks
	// plausible, so it is handled BEFORE the switch rather than as another case.
	// `buildIndicatorSeriesKey` already resolves this type to the structured `PINE:<scriptId>`
	// key (see `buildIndicatorBaseKey`'s default branch), which is the key `enrichData` writes.
	const pineScriptId = pineScriptIdFromSeriesType(series.type);
	if (pineScriptId) {
		return asScalar(resolveSeriesDatumValue(datum, series));
	}

	switch (normalizeSeriesTypeId(series.type)) {
		case "Candlestick":
		case "HollowCandle":
		case "OHLC":
		case "HeikinAshi":
		case "Line":
		case "Area":
			return datum.close;
		case "Volume":
			return datum.volume;
		case "EMA":
		case "MA":
		case "RSI":
		case "CVDApprox":
		case "CVDRealtime":
		case "StrengthRelative":
		case "SMFI":
		case "CCI":
		case "BIAS":
		case "AO":
		case "ROC":
		case "PVT":
		case "WR":
		case "VR":
		case "WMA": // CE26 additions
		case "VWMA":
		case "HMA":
		case "DEMA":
		case "TEMA":
		case "ChaikinVol":
		case "StdDev":
		case "HV":
		case "CI":
			return asNumber(resolveSeriesDatumValue(datum, series));
		case "KDJ":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorKdjValue).j);
		case "DMI":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorDmiValue).adx);
		case "BBI":
			return asNumber(resolveSeriesDatumValue(datum, series));
		case "SAR":
			return asNumber(resolveSeriesDatumValue(datum, series));
		case "OBV":
			return asNumber(resolveSeriesDatumValue(datum, series));
		case "BRAR":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorBrarValue).br);
		case "MTM":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorMtmValue).mtm);
		case "EMV":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorEmvValue).emv);
		case "MACD":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorMacdValue).macd);
		case "BollingerBand":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorBandValue).middle);
		case "Whale":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => {
				const whale = value as IndicatorWhaleValue;
				return whale.whaleBuyVol ?? whale.whaleSellVol;
			});
		case "TRIX":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorTrixValue).trix);
		case "DMA":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorDmaValue).ddd);
		case "PSY":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorPsyValue).psy);
		case "CR":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorCrValue).cr);
		case "StrengthElder":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorStrengthElderValue).bullPower);
		// CE26 additions
		case "MARibbon":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => Object.values(value as IndicatorMARibbonValue)[0]);
		case "Ichimoku":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorIchimokuValue).tenkan);
		case "Supertrend":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorSupertrendValue).supertrend);
		case "Keltner":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorKeltnerValue).middle);
		case "Donchian":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorDonchianValue).middle);
		case "CMF":
		case "MFI":
		case "VolOsc":
		case "ChaikinOscillator":
			return asNumber(resolveSeriesDatumValue(datum, series));
		case "AC":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorAcValue).ac);
		case "VWAP":
		case "AnchoredVWAP":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorVwapValue).vwap);
		case "Alligator":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorAlligatorValue).jaw);
		case "Fractals":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorFractalValue).bearish);
		case "Gator":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorGatorValue).upper);
		case "PivotStandard":
		case "PivotHighLow":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorPivotValue).pp);
		case "MarketProfile":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as MarketProfileData).poc);
		case "VolumeProfile":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as VolumeProfileData).poc);
		case "Footprint":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as FootprintBar).close);
		case "DeltaProfile":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorDeltaProfileValue).cumulativeDelta);
		case "WyckoffWave":
			return asNumber(resolveSeriesDatumValue(datum, series), (value) => (value as IndicatorWyckoffValue).zigzag);
		case "Comparison":
			return undefined;
		// HTF overlay: giá trị là NẾN KHUNG CAO HƠN, không phải close của khung
		// hiện tại. Thiếu case này → `default` trả `datum.close` (khung LTF) và
		// tooltip/legend/extent đọc nhầm giá trị (registry vẫn đang cast `any`).
		case "HTFOverlay":
			return datum.htf?.close;
		// ── A3 Baseline / A11 Renko / Kagi / Point & Figure / Line Break ─────────
		// Đọc DỮ LIỆU ĐÃ SẢN XUẤT, không đọc `close`. Thiếu case ở đây là nguyên
		// nhân gốc của "picker hứa nhưng vẽ y hệt Line": `default` trả về
		// `datum.close` nên chart loại vẽ đúng thứ nó vẽ với nhãn khác.
		// Trả `undefined` (không vẽ) khi producer chưa chạy — fail-closed, thà
		// không vẽ còn hơn vẽ một đường giả.
		case "Baseline":
			return datum.normalizedPrices?.[PRIMARY_BASELINE_KEY];
		case "Renko":
			return datum.renkoClose;
		case "Kagi":
			return datum.current;
		case "PointAndFigure":
			return resolvePointAndFigureEdge(datum);
		case "LineBreak":
			return datum.lineBreakClose;
		default:
			return datum.close;
	}
}

export function resolveSeriesStructuredValue(datum: EnrichedDatum, series: SeriesConfig) {
	switch (normalizeSeriesTypeId(series.type)) {
		case "BollingerBand":
			return resolveSeriesDatumValue(datum, series) as IndicatorBandValue | undefined;
		case "MACD":
			return resolveSeriesDatumValue(datum, series) as IndicatorMacdValue | undefined;
		case "Whale":
			return resolveSeriesDatumValue(datum, series) as IndicatorWhaleValue | undefined;
		case "KDJ":
			return resolveSeriesDatumValue(datum, series) as IndicatorKdjValue | undefined;
		case "DMI":
			return resolveSeriesDatumValue(datum, series) as IndicatorDmiValue | undefined;
		case "BRAR":
			return resolveSeriesDatumValue(datum, series) as IndicatorBrarValue | undefined;
		case "MTM":
			return resolveSeriesDatumValue(datum, series) as IndicatorMtmValue | undefined;
		case "EMV":
			return resolveSeriesDatumValue(datum, series) as IndicatorEmvValue | undefined;
		case "TRIX":
			return resolveSeriesDatumValue(datum, series) as IndicatorTrixValue | undefined;
		case "DMA":
			return resolveSeriesDatumValue(datum, series) as IndicatorDmaValue | undefined;
		case "PSY":
			return resolveSeriesDatumValue(datum, series) as IndicatorPsyValue | undefined;
		case "CR":
			return resolveSeriesDatumValue(datum, series) as IndicatorCrValue | undefined;
		case "StrengthElder":
			return resolveSeriesDatumValue(datum, series) as IndicatorStrengthElderValue | undefined;
		// CE26 additions
		case "MARibbon":
			return resolveSeriesDatumValue(datum, series) as IndicatorMARibbonValue | undefined;
		case "Ichimoku":
			return resolveSeriesDatumValue(datum, series) as IndicatorIchimokuValue | undefined;
		case "Supertrend":
			return resolveSeriesDatumValue(datum, series) as IndicatorSupertrendValue | undefined;
		case "Keltner":
			return resolveSeriesDatumValue(datum, series) as IndicatorKeltnerValue | undefined;
		case "Donchian":
			return resolveSeriesDatumValue(datum, series) as IndicatorDonchianValue | undefined;
		case "VWAP":
		case "AnchoredVWAP":
			return resolveSeriesDatumValue(datum, series) as IndicatorVwapValue | undefined;
		case "Alligator":
			return resolveSeriesDatumValue(datum, series) as IndicatorAlligatorValue | undefined;
		case "Fractals":
			return resolveSeriesDatumValue(datum, series) as IndicatorFractalValue | undefined;
		case "Gator":
			return resolveSeriesDatumValue(datum, series) as IndicatorGatorValue | undefined;
		case "PivotStandard":
		case "PivotHighLow":
			return resolveSeriesDatumValue(datum, series) as IndicatorPivotValue | undefined;
		case "MarketProfile":
			return resolveSeriesDatumValue(datum, series) as MarketProfileData | undefined;
		case "VolumeProfile":
			return resolveSeriesDatumValue(datum, series) as VolumeProfileData | undefined;
		case "Footprint":
			return resolveSeriesDatumValue(datum, series) as FootprintBar | undefined;
		case "DeltaProfile":
			return resolveSeriesDatumValue(datum, series) as IndicatorDeltaProfileValue | undefined;
		case "WyckoffWave":
			return resolveSeriesDatumValue(datum, series) as IndicatorWyckoffValue | undefined;
		default:
			return resolveSeriesDatumValue(datum, series);
	}
}

export function resolveSeriesValueAccessors(series: SeriesConfig): Array<(datum: EnrichedDatum) => number | undefined> {
	switch (normalizeSeriesTypeId(series.type)) {
		case "Candlestick":
		case "HollowCandle":
		case "OHLC":
		case "HeikinAshi":
			if (series.overlaySymbolId) {
				return [
					(datum) => datum.symbolData?.[series.overlaySymbolId!]?.low ?? resolveOverlayValue(datum, series) ?? datum.low,
					(datum) => datum.symbolData?.[series.overlaySymbolId!]?.high ?? resolveOverlayValue(datum, series) ?? datum.high,
				];
			}
			return [(datum) => datum.low, (datum) => datum.high];
		case "Volume":
			return [(datum) => datum.volume];
		case "EMA":
		case "MA":
		case "RSI":
		case "CVDApprox":
		case "CVDRealtime":
		case "StrengthRelative":
		case "SMFI":
		case "Line":
		case "Area":
		case "Baseline":
		case "Renko":
		case "Kagi":
		case "PointAndFigure":
		case "LineBreak":
		case "CCI":
		case "BIAS":
		case "AO":
		case "ROC":
		case "PVT":
			return [(datum) => resolveSeriesValue(datum, series)];
		case "KDJ":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorKdjValue | undefined)?.k,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorKdjValue | undefined)?.d,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorKdjValue | undefined)?.j,
			];
		case "DMI":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorDmiValue | undefined)?.plusDI,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorDmiValue | undefined)?.minusDI,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorDmiValue | undefined)?.adx,
			];
		case "BRAR":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorBrarValue | undefined)?.ar,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorBrarValue | undefined)?.br,
			];
		case "MTM":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorMtmValue | undefined)?.mtm,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorMtmValue | undefined)?.signal,
			];
		case "EMV":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorEmvValue | undefined)?.emv,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorEmvValue | undefined)?.signal,
			];
		case "BollingerBand":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorBandValue | undefined)?.top,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorBandValue | undefined)?.middle,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorBandValue | undefined)?.bottom,
			];
		case "MACD":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorMacdValue | undefined)?.macd,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorMacdValue | undefined)?.signal,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorMacdValue | undefined)?.divergence,
			];
		case "TRIX":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorTrixValue | undefined)?.trix,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorTrixValue | undefined)?.signal,
			];
		case "DMA":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorDmaValue | undefined)?.ddd,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorDmaValue | undefined)?.ama,
			];
		case "PSY":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorPsyValue | undefined)?.psy,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorPsyValue | undefined)?.signal,
			];
		case "CR":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorCrValue | undefined)?.cr,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorCrValue | undefined)?.ma1,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorCrValue | undefined)?.ma2,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorCrValue | undefined)?.ma3,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorCrValue | undefined)?.ma4,
			];
		case "StrengthElder":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorStrengthElderValue | undefined)?.bullPower,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorStrengthElderValue | undefined)?.bearPower,
			];
		case "Whale":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorWhaleValue | undefined)?.whaleBuyVol,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorWhaleValue | undefined)?.whaleSellVol,
			];
		// CE26 additions
		case "MARibbon": {
			const periods = (series.params?.periods as number[]) || [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
			return periods.map(p => (datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorMARibbonValue | undefined)?.[`ma${p}`]);
		}
		case "Ichimoku":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorIchimokuValue | undefined)?.tenkan,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorIchimokuValue | undefined)?.kijun,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorIchimokuValue | undefined)?.senkouA,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorIchimokuValue | undefined)?.senkouB,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorIchimokuValue | undefined)?.chikou,
			];
		case "Supertrend":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorSupertrendValue | undefined)?.supertrend,
			];
		case "Keltner":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorKeltnerValue | undefined)?.upper,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorKeltnerValue | undefined)?.middle,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorKeltnerValue | undefined)?.lower,
			];
		case "Donchian":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorDonchianValue | undefined)?.upper,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorDonchianValue | undefined)?.middle,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorDonchianValue | undefined)?.lower,
			];
		case "CMF":
		case "MFI":
		case "VolOsc":
		case "AC":
			return [(datum) => resolveSeriesValue(datum, series)];
		case "VWAP":
		case "AnchoredVWAP":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorVwapValue | undefined)?.vwap,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorVwapValue | undefined)?.upper1,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorVwapValue | undefined)?.lower1,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorVwapValue | undefined)?.upper2,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorVwapValue | undefined)?.lower2,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorVwapValue | undefined)?.upper3,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorVwapValue | undefined)?.lower3,
			];
		case "Alligator":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorAlligatorValue | undefined)?.jaw,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorAlligatorValue | undefined)?.teeth,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorAlligatorValue | undefined)?.lips,
			];
		case "Fractals":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorFractalValue | undefined)?.bearish,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorFractalValue | undefined)?.bullish,
			];
		case "Gator":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorGatorValue | undefined)?.upper,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorGatorValue | undefined)?.lower,
			];
		case "PivotStandard":
		case "PivotHighLow":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorPivotValue | undefined)?.pp,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorPivotValue | undefined)?.r1,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorPivotValue | undefined)?.s1,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorPivotValue | undefined)?.r2,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorPivotValue | undefined)?.s2,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorPivotValue | undefined)?.r3,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorPivotValue | undefined)?.s3,
			];
		case "MarketProfile":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as MarketProfileData | undefined)?.poc,
				(datum) => (resolveSeriesStructuredValue(datum, series) as MarketProfileData | undefined)?.valueAreaHigh,
				(datum) => (resolveSeriesStructuredValue(datum, series) as MarketProfileData | undefined)?.valueAreaLow,
			];
		case "VolumeProfile":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as VolumeProfileData | undefined)?.poc,
				(datum) => (resolveSeriesStructuredValue(datum, series) as VolumeProfileData | undefined)?.valueAreaHigh,
				(datum) => (resolveSeriesStructuredValue(datum, series) as VolumeProfileData | undefined)?.valueAreaLow,
			];
		case "Footprint":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as FootprintBar | undefined)?.high,
				(datum) => (resolveSeriesStructuredValue(datum, series) as FootprintBar | undefined)?.low,
			];
		case "DeltaProfile":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorDeltaProfileValue | undefined)?.cumulativeDelta,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorDeltaProfileValue | undefined)?.barDelta,
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorDeltaProfileValue | undefined)?.deltaSMA,
			];
		case "WyckoffWave":
			return [
				(datum) => (resolveSeriesStructuredValue(datum, series) as IndicatorWyckoffValue | undefined)?.zigzag,
			];
		default:
			return [(datum) => resolveSeriesValue(datum, series)];
	}
}
