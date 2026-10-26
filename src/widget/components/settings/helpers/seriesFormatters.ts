/**
 * Series formatting and labeling helpers for Settings modal
 */
import type { SeriesTypeId } from "../../../../lib/core";

export function formatSeriesSuffix(type: SeriesTypeId, params?: any): string {
	const numberParam = (p: any, key: string, fallback: number) => {
		const val = p?.[key];
		return typeof val === "number" && Number.isFinite(val) ? val : fallback;
	};
	switch (type) {
		case "EMA":
			return `(${numberParam(params, "period", 20)})`;
		case "RSI":
			return `(${numberParam(params, "period", 14)})`;
		case "BollingerBand":
		case "BollingerBands":
			return `(${numberParam(params, "period", 20)},${numberParam(params, "stdDev", 2)})`;
		case "MACD":
			return `(${numberParam(params, "fast", 12)},${numberParam(params, "slow", 26)},${numberParam(params, "signal", 9)})`;
		case "KDJ":
			return `(${numberParam(params, "period", 9)},${numberParam(params, "m1", 3)},${numberParam(params, "m2", 3)})`;
		case "CCI":
			return `(${numberParam(params, "period", 20)})`;
		case "DMI":
			return `(${numberParam(params, "period", 14)})`;
		case "BIAS":
			return `(${numberParam(params, "period", 6)})`;
		case "BRAR":
			return `(${numberParam(params, "period", 26)})`;
		case "MTM":
			return `(${numberParam(params, "period", 6)})`;
		case "EMV":
			return `(${numberParam(params, "period", 14)})`;
		case "ROC":
			return `(${numberParam(params, "period", 12)})`;
		case "TRIX":
			return `(${numberParam(params, "period", 12)})`;
		case "DMA":
			return `(${numberParam(params, "fastPeriod", 10)},${numberParam(params, "slowPeriod", 50)})`;
		case "PSY":
			return `(${numberParam(params, "period", 12)})`;
		case "CR":
			return `(${numberParam(params, "period", 26)})`;
		case "Whale":
			return `(${numberParam(params, "threshold", 50_000)})`;
		case "WMA":
		case "VWMA":
		case "HMA":
		case "DEMA":
		case "TEMA":
		case "Donchian":
		case "ChaikinVol":
		case "StdDev":
		case "HV":
		case "CI":
			return `(${numberParam(params, "period", type === "WMA" || type === "HMA" || type === "DEMA" || type === "TEMA" ? 9 : type === "CI" ? 14 : type === "ChaikinVol" ? 10 : 20)})`;
		case "MARibbon": {
			const typeStr = params?.type || "EMA";
			const periods = (params?.periods as number[]) || [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
			return `(${typeStr},${periods.join(",")})`;
		}
		case "Ichimoku":
			return `(${numberParam(params, "tenkan", 9)},${numberParam(params, "kijun", 26)},${numberParam(params, "senkouB", 52)})`;
		case "Supertrend":
			return `(${numberParam(params, "period", 10)},${numberParam(params, "multiplier", 3)})`;
		case "Keltner":
			return `(${numberParam(params, "period", 20)},${numberParam(params, "atrPeriod", 10)},${numberParam(params, "multiplier", 2)})`;
		case "CMF":
			return `(${numberParam(params, "period", 20)})`;
		case "MFI":
			return `(${numberParam(params, "period", 14)})`;
		case "VolOsc":
			return `(${numberParam(params, "shortPeriod", 5)},${numberParam(params, "longPeriod", 20)})`;
		case "VWAP": {
			const anchor = params?.anchor || "session";
			return `(${anchor})`;
		}
		case "AnchoredVWAP": {
			const anchorTime = numberParam(params, "anchorTime", 0);
			return `(${anchorTime})`;
		}
		case "Alligator":
			return `(${numberParam(params, "jawPeriod", 13)},${numberParam(params, "teethPeriod", 8)},${numberParam(params, "lipsPeriod", 5)})`;
		case "Gator":
			return `(${numberParam(params, "jawPeriod", 13)},${numberParam(params, "teethPeriod", 8)},${numberParam(params, "lipsPeriod", 5)})`;
		case "PivotStandard": {
			const pTypes = ["Standard", "Fibonacci", "Camarilla", "Woodie", "DeMark"];
			const pType = pTypes[numberParam(params, "pivotType", 0)] || "Standard";
			return `(${pType})`;
		}
		case "PivotHighLow": {
			const pTypes = ["Standard", "Fibonacci"];
			const pType = pTypes[numberParam(params, "pivotType", 0)] || "Standard";
			const lookback = numberParam(params, "lookback", 10);
			return `(${lookback},${pType})`;
		}
		case "MarketProfile":
			return `(${numberParam(params, "tpoPeriodMinutes", 30)}m)`;
		case "Footprint":
			return `(${numberParam(params, "barIntervalMs", 60000) / 1000}s)`;
		case "DeltaProfile":
			return `(${numberParam(params, "smaPeriod", 14)})`;
		default:
			return "";
	}
}

export const SERIES_LABEL_KEYS: Partial<Record<SeriesTypeId, string>> = {
	Candlestick: "indicator.candlestick",
	HollowCandle: "indicator.hollowCandle",
	OHLC: "indicator.ohlc",
	HeikinAshi: "indicator.heikinAshi",
	Line: "indicator.line",
	Area: "indicator.area",
	Bar: "indicator.bar",
	EMA: "indicator.ema",
	BollingerBand: "indicator.bollingerBand",
	// Legacy plural alias (settings composer historically listed both) — same label.
	BollingerBands: "indicator.bollingerBand",
	Volume: "indicator.volume",
	Whale: "indicator.whale",
	CVDApprox: "indicator.cvdApprox",
	CVDRealtime: "indicator.cvdRealtime",
	RSI: "indicator.rsi",
	MACD: "indicator.macd",
	StrengthElder: "indicator.strengthElder",
	StrengthRelative: "indicator.strengthRelative",
	MA: "indicator.ma",
	BBI: "indicator.bbi",
	SAR: "indicator.sar",
	OBV: "indicator.obv",
	WR: "indicator.wr",
	VR: "indicator.vr",
	KDJ: "indicator.kdj",
	CCI: "indicator.cci",
	DMI: "indicator.dmi",
	BIAS: "indicator.bias",
	BRAR: "indicator.brar",
	MTM: "indicator.mtm",
	EMV: "indicator.emv",
	AO: "indicator.ao",
	ROC: "indicator.roc",
	TRIX: "indicator.trix",
	DMA: "indicator.dma",
	PVT: "indicator.pvt",
	PSY: "indicator.psy",
	CR: "indicator.cr",
	WMA: "indicator.wma",
	VWMA: "indicator.vwma",
	HMA: "indicator.hma",
	DEMA: "indicator.dema",
	TEMA: "indicator.tema",
	MARibbon: "indicator.maRibbon",
	Ichimoku: "indicator.ichimoku",
	Supertrend: "indicator.supertrend",
	Keltner: "indicator.keltner",
	Donchian: "indicator.donchian",
	ChaikinVol: "indicator.chaikinVol",
	StdDev: "indicator.stdDev",
	HV: "indicator.hv",
	CI: "indicator.ci",
	CMF: "indicator.cmf",
	MFI: "indicator.mfi",
	VolOsc: "indicator.volOsc",
	VWAP: "indicator.vwap",
	AnchoredVWAP: "indicator.anchoredVwap",
	Alligator: "indicator.alligator",
	Fractals: "indicator.fractals",
	Gator: "indicator.gator",
	AC: "indicator.ac",
	PivotStandard: "indicator.pivotStandard",
	PivotHighLow: "indicator.pivotHighLow",
	MarketProfile: "indicator.marketProfile",
	VolumeProfile: "indicator.volumeProfile",
	Footprint: "indicator.footprint",
	DeltaProfile: "indicator.deltaProfile",
	SMFI: "indicator.smfi",
	WyckoffWave: "indicator.wyckoffWave",
};

export const SERIES_ABBREVIATIONS: Partial<Record<SeriesTypeId, string>> = {
	EMA: "EMA",
	BollingerBand: "BB",
	BollingerBands: "BB",
	RSI: "RSI",
	MACD: "MACD",
	CVDApprox: "CVD Approx",
	CVDRealtime: "CVD Realtime",
	StrengthElder: "Elder Strength",
	StrengthRelative: "RS",
	Whale: "Whale Flow",
	MA: "MA",
	BBI: "BBI",
	SAR: "SAR",
	OBV: "OBV",
	WR: "WR",
	VR: "VR",
	KDJ: "KDJ",
	CCI: "CCI",
	DMI: "DMI",
	BIAS: "BIAS",
	BRAR: "BRAR",
	MTM: "MTM",
	EMV: "EMV",
	AO: "AO",
	ROC: "ROC",
	TRIX: "TRIX",
	DMA: "DMA",
	PVT: "PVT",
	PSY: "PSY",
	CR: "CR",
	WMA: "WMA",
	VWMA: "VWMA",
	HMA: "HMA",
	DEMA: "DEMA",
	TEMA: "TEMA",
	MARibbon: "Ribbon",
	Ichimoku: "Ichimoku",
	Supertrend: "Supertrend",
	Keltner: "Keltner",
	Donchian: "Donchian",
	ChaikinVol: "Chaikin Vol",
	StdDev: "StdDev",
	HV: "HV",
	CI: "CI",
	CMF: "CMF",
	MFI: "MFI",
	VolOsc: "VolOsc",
	VWAP: "VWAP",
	AnchoredVWAP: "AVWAP",
	Alligator: "Alligator",
	Fractals: "Fractals",
	Gator: "Gator",
	AC: "AC",
	PivotStandard: "PP Std",
	PivotHighLow: "PP HL",
	MarketProfile: "TPO",
	VolumeProfile: "VP",
	Footprint: "Footprint",
	DeltaProfile: "DeltaProf",
	SMFI: "SMFI",
	WyckoffWave: "Wyckoff",
	Candlestick: "Candlestick",
	HollowCandle: "Hollow Candle",
	OHLC: "OHLC",
	HeikinAshi: "HA",
	Line: "Line",
	Area: "Area",
	Volume: "Volume",
};

export const TECHNICAL_INDICATORS = new Set<SeriesTypeId>([
	"Volume",
	"EMA",
	"BollingerBand",
	"RSI",
	"MACD",
	"CVDApprox",
	"CVDRealtime",
	"StrengthElder",
	"StrengthRelative",
	"Whale",
	"MA",
	"BBI",
	"SAR",
	"OBV",
	"WR",
	"VR",
	"KDJ",
	"CCI",
	"DMI",
	"BIAS",
	"BRAR",
	"MTM",
	"EMV",
	"AO",
	"ROC",
	"TRIX",
	"DMA",
	"PVT",
	"PSY",
	"CR",
	"WMA",
	"VWMA",
	"HMA",
	"DEMA",
	"TEMA",
	"MARibbon",
	"Ichimoku",
	"Supertrend",
	"Keltner",
	"Donchian",
	"ChaikinVol",
	"StdDev",
	"HV",
	"CI",
	"CMF",
	"MFI",
	"VolOsc",
	"VWAP",
	"AnchoredVWAP",
	"Alligator",
	"Fractals",
	"Gator",
	"AC",
	"PivotStandard",
	"PivotHighLow",
	"MarketProfile",
	"VolumeProfile",
	"Footprint",
	"DeltaProfile",
	"SMFI",
	"WyckoffWave",
]);

export const LINE_WIDTH_SERIES_TYPES = new Set<SeriesTypeId>([
	"Line", "Area", "EMA", "BollingerBand", "RSI", "MACD", "CVDApprox", "CVDRealtime", "StrengthElder", "StrengthRelative", "MA", "BBI", "SAR", "OBV", "WR", "VR", "KDJ", "CCI", "DMI", "BIAS", "BRAR", "MTM", "EMV", "ROC", "TRIX", "DMA", "PVT", "PSY", "CR"
]);

export function supportsSeriesLineWidth(seriesType: SeriesTypeId): boolean {
	return LINE_WIDTH_SERIES_TYPES.has(seriesType);
}

export function formatSeriesDisplayName(
	type: SeriesTypeId,
	params: any,
	t: (key: string, opt?: any) => string,
	index?: number
): string {

	const labelKey = SERIES_LABEL_KEYS[type] || `indicator.${type.toLowerCase()}`;
	const baseLabel = t(labelKey) || type;
	const suffix = formatSeriesSuffix(type, params);
	let withSuffix = suffix ? `${baseLabel} ${suffix}` : baseLabel;
	if (!params) {
		const abbreviation = SERIES_ABBREVIATIONS[type];
		if (abbreviation && baseLabel !== abbreviation) {
			withSuffix = `${baseLabel} (${abbreviation})`;
		}
	}
	return typeof index === "number" ? `${withSuffix} #${index + 1}` : withSuffix;
}
