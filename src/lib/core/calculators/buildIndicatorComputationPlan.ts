/**
 * Tầng 1/2: đọc danh sách series của pane và gom thành `IndicatorComputationPlan`.
 *
 * Plan là BẢNG TRA CỨU trước khi tính: "với mọi bar này, tôi cần EMA bao nhiêu kỳ,
 * MACD nào theo khoá nào". Tách plan khỏi compute (split 2026-09-30) vì nó là
 * một hàm duy nhất với một `switch` 60+ nhánh: giữ nguyên khối lớn này trong một
 * file (thay vì nhặt case rải rác) giữ nguyên khả năng đọc theo thứ tự lịch sử, và
 * 540 dòng vẫn dưới trần mặc định 800 — điểm cần nới là file 1933 dòng trước đây.
 *
 * Thuần diễn dịch: `switch (normalizeSeriesTypeId(type))` là toàn bộ "ngôn ngữ" của
 * hàm này. Thêm một nhánh = thêm một `case`; không có bảng tra cứu thứ hai phải
 * đồng bộ.
 */
import { normalizeSeriesTypeId, type SeriesConfig } from "../types/pane-descriptor";
import type {
	BollingerConfig,
	CrConfig,
	DmaConfig,
	IndicatorComputationPlan,
	KdjConfig,
	MacdConfig,
	PeriodSignalConfig,
} from "./indicatorComputationTypes";
import { defaultSeries, indicatorKey, numberParam } from "./computationHelpers";
import { resolveCalculationOrder } from "./resolveCalculationOrder";

export function buildIndicatorComputationPlan(series: readonly SeriesConfig[], whaleThreshold: number): IndicatorComputationPlan {
	const emaPeriods = new Set<number>([13, 20, 50]);
	const smaPeriods = new Set<number>();
	const rsiPeriods = new Set<number>([14]);
	const macdConfigs = new Map<string, MacdConfig>();
	const bollingerConfigs = new Map<string, BollingerConfig>();
	const whaleThresholds = new Set<number>([whaleThreshold]);
	const sarByKey = new Map<string, { afStep: number; afMax: number }>();
	const wrPeriods = new Set<number>();
	const vrPeriods = new Set<number>();
	const kdjConfigs = new Map<string, KdjConfig>();
	const cciPeriods = new Set<number>();
	const dmiPeriods = new Set<number>();
	const biasPeriods = new Set<number>();
	const brarPeriods = new Set<number>();
	const mtmConfigs = new Map<string, PeriodSignalConfig>();
	const emvPeriods = new Set<number>();
	const rocPeriods = new Set<number>();
	const trixConfigs = new Map<string, PeriodSignalConfig>();
	const dmaConfigs = new Map<string, DmaConfig>();
	const psyConfigs = new Map<string, PeriodSignalConfig>();
	const crConfigs = new Map<string, CrConfig>();
	// CE26 additions
	const wmaPeriods = new Set<number>();
	const vwmaPeriods = new Set<number>();
	const hmaPeriods = new Set<number>();
	const demaPeriods = new Set<number>();
	const temaPeriods = new Set<number>();
	const maRibbonConfigs = new Map<string, { type: "SMA" | "EMA"; periods: number[] }>();
	const ichimokuConfigs = new Map<string, { tenkan: number; kijun: number; senkouB: number; displacement: number }>();
	const supertrendConfigs = new Map<string, { period: number; multiplier: number }>();
	const keltnerConfigs = new Map<string, { period: number; atrPeriod: number; multiplier: number }>();
	const donchianPeriods = new Set<number>();
	const chaikinVolPeriods = new Set<number>();
	const stdDevPeriods = new Set<number>();
	const hvConfigs = new Map<string, { period: number; annualize: boolean }>();
	const ciPeriods = new Set<number>();
	const cmfPeriods = new Set<number>();
	const mfiPeriods = new Set<number>();
	const volOscConfigs = new Map<string, { shortPeriod: number; longPeriod: number }>();
	const chaikinOscConfigs = new Map<string, { fast: number; slow: number }>();
	const vwapConfigs = new Map<string, { anchor: "session" | "week" | "month"; showBands: boolean; multiplier: number }>();
	const anchoredVwapConfigs = new Map<string, { anchorTime: number; showBands: boolean; multiplier: number }>();
	const alligatorConfigs = new Map<string, { jawPeriod: number; jawShift: number; teethPeriod: number; teethShift: number; lipsPeriod: number; lipsShift: number }>();
	let fractalsEnabled = false;
	const gatorConfigs = new Map<string, { jawPeriod: number; jawShift: number; teethPeriod: number; teethShift: number; lipsPeriod: number; lipsShift: number }>();
	let acEnabled = false;
	const pivotStandardConfigs = new Map<string, { pivotType: number }>();
	const pivotHighLowConfigs = new Map<string, { lookback: number; pivotType: number }>();
	const marketProfileConfigs = new Map<string, { sessionStart?: number; sessionEnd?: number; tickSize: number; tpoPeriodMinutes: number }>();
	const volumeProfileConfigs = new Map<string, { priceTickSize: number }>();
	const footprintConfigs = new Map<string, { barIntervalMs: number; priceTickSize: number }>();
	const deltaProfileConfigs = new Map<string, { barIntervalMs: number; priceTickSize: number; smaPeriod: number }>();
	const strengthRelativeConfigs = new Map<string, { compareSymbol: string; period: number }>();
	let smfiEnabled = false;
	const wyckoffWaveConfigs = new Map<string, { thresholdPercent: number }>();

	let bbiEnabled = false;
	let obvEnabled = false;
	let aoEnabled = false;
	let pvtEnabled = false;
	const defaultMacdSeries = defaultSeries("MACD", { fast: 12, slow: 26, signal: 9 });
	const defaultBollingerSeries = defaultSeries("BollingerBand", { period: 20, stdDev: 2 });
	const defaultWhaleSeries = defaultSeries("Whale", { threshold: whaleThreshold });

	const defaultMacdKey = indicatorKey(defaultMacdSeries)!;
	const defaultBollingerKey = indicatorKey(defaultBollingerSeries)!;
	const defaultWhaleKey = indicatorKey(defaultWhaleSeries)!;

	macdConfigs.set(defaultMacdKey, { fast: 12, slow: 26, signal: 9 });
	bollingerConfigs.set(defaultBollingerKey, { period: 20, stdDev: 2 });

	for (const nextSeries of series) {
		switch (normalizeSeriesTypeId(nextSeries.type)) {
			case "EMA":
				emaPeriods.add(numberParam(nextSeries, "period", 20));
				break;
			case "MA":
				smaPeriods.add(numberParam(nextSeries, "period", 20));
				break;
			case "RSI":
				rsiPeriods.add(numberParam(nextSeries, "period", 14));
				break;
			case "MACD": {
				const key = indicatorKey(nextSeries);
				if (key) {
					macdConfigs.set(key, {
						fast: numberParam(nextSeries, "fast", 12),
						slow: numberParam(nextSeries, "slow", 26),
						signal: numberParam(nextSeries, "signal", 9),
					});
				}
				break;
			}
			case "BollingerBand": {
				const key = indicatorKey(nextSeries);
				if (key) {
					bollingerConfigs.set(key, {
						period: numberParam(nextSeries, "period", 20),
						stdDev: numberParam(nextSeries, "stdDev", 2),
					});
				}
				break;
			}
			case "Whale":
				whaleThresholds.add(numberParam(nextSeries, "threshold", whaleThreshold));
				break;
			case "BBI":
				bbiEnabled = true;
				break;
			case "SAR": {
				const key = indicatorKey(nextSeries);
				if (key) {
					sarByKey.set(key, {
						afStep: numberParam(nextSeries, "afStep", 0.02),
						afMax: numberParam(nextSeries, "afMax", 0.2),
					});
				}
				break;
			}
			case "OBV":
				obvEnabled = true;
				break;
			case "WR":
				wrPeriods.add(numberParam(nextSeries, "period", 14));
				break;
			case "VR":
				vrPeriods.add(numberParam(nextSeries, "period", 26));
				break;
			case "KDJ": {
				const key = indicatorKey(nextSeries);
				if (key) {
					kdjConfigs.set(key, {
						period: numberParam(nextSeries, "period", 9),
						m1: numberParam(nextSeries, "m1", 3),
						m2: numberParam(nextSeries, "m2", 3),
					});
				}
				break;
			}
			case "CCI":
				cciPeriods.add(numberParam(nextSeries, "period", 20));
				break;
			case "DMI":
				dmiPeriods.add(numberParam(nextSeries, "period", 14));
				break;
			case "BIAS":
				biasPeriods.add(numberParam(nextSeries, "period", 6));
				break;
			case "BRAR":
				brarPeriods.add(numberParam(nextSeries, "period", 26));
				break;
			case "MTM": {
				const key = indicatorKey(nextSeries);
				if (key) {
					mtmConfigs.set(key, {
						period: numberParam(nextSeries, "period", 6),
						signalPeriod: numberParam(nextSeries, "signalPeriod", 6),
					});
				}
				break;
			}
			case "EMV":
				emvPeriods.add(numberParam(nextSeries, "period", 14));
				break;
			case "AO":
				aoEnabled = true;
				break;
			case "ROC":
				rocPeriods.add(numberParam(nextSeries, "period", 12));
				break;
			case "TRIX": {
				const key = indicatorKey(nextSeries);
				if (key) {
					trixConfigs.set(key, {
						period: numberParam(nextSeries, "period", 12),
						signalPeriod: numberParam(nextSeries, "signalPeriod", 9),
					});
				}
				break;
			}
			case "DMA": {
				const key = indicatorKey(nextSeries);
				if (key) {
					dmaConfigs.set(key, {
						fastPeriod: numberParam(nextSeries, "fastPeriod", 10),
						slowPeriod: numberParam(nextSeries, "slowPeriod", 50),
						signalPeriod: numberParam(nextSeries, "signalPeriod", 10),
					});
				}
				break;
			}
			case "PVT":
				pvtEnabled = true;
				break;
			case "PSY": {
				const key = indicatorKey(nextSeries);
				if (key) {
					psyConfigs.set(key, {
						period: numberParam(nextSeries, "period", 12),
						signalPeriod: numberParam(nextSeries, "signalPeriod", 6),
					});
				}
				break;
			}
			case "CR": {
				const key = indicatorKey(nextSeries);
				if (key) {
					crConfigs.set(key, {
						period: numberParam(nextSeries, "period", 26),
						m1: numberParam(nextSeries, "m1", 10),
						m2: numberParam(nextSeries, "m2", 20),
						m3: numberParam(nextSeries, "m3", 40),
						m4: numberParam(nextSeries, "m4", 60),
					});
				}
				break;
			}
			// CE26 additions
			case "WMA":
				wmaPeriods.add(numberParam(nextSeries, "period", 9));
				break;
			case "VWMA":
				vwmaPeriods.add(numberParam(nextSeries, "period", 20));
				break;
			case "HMA":
				hmaPeriods.add(numberParam(nextSeries, "period", 9));
				break;
			case "DEMA":
				demaPeriods.add(numberParam(nextSeries, "period", 9));
				break;
			case "TEMA":
				temaPeriods.add(numberParam(nextSeries, "period", 9));
				break;
			case "MARibbon": {
				const key = indicatorKey(nextSeries);
				if (key) {
					const type = (nextSeries.params?.type as "SMA" | "EMA") || "EMA";
					const periods = (nextSeries.params?.periods as number[]) || [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
					maRibbonConfigs.set(key, { type, periods });
				}
				break;
			}
			case "Ichimoku": {
				const key = indicatorKey(nextSeries);
				if (key) {
					ichimokuConfigs.set(key, {
						tenkan: numberParam(nextSeries, "tenkan", 9),
						kijun: numberParam(nextSeries, "kijun", 26),
						senkouB: numberParam(nextSeries, "senkouB", 52),
						displacement: numberParam(nextSeries, "displacement", 26),
					});
				}
				break;
			}
			case "Supertrend": {
				const key = indicatorKey(nextSeries);
				if (key) {
					supertrendConfigs.set(key, {
						period: numberParam(nextSeries, "period", 10),
						multiplier: numberParam(nextSeries, "multiplier", 3),
					});
				}
				break;
			}
			case "Keltner": {
				const key = indicatorKey(nextSeries);
				if (key) {
					keltnerConfigs.set(key, {
						period: numberParam(nextSeries, "period", 20),
						atrPeriod: numberParam(nextSeries, "atrPeriod", 10),
						multiplier: numberParam(nextSeries, "multiplier", 2),
					});
				}
				break;
			}
			case "Donchian":
				donchianPeriods.add(numberParam(nextSeries, "period", 20));
				break;
			case "ChaikinVol":
				chaikinVolPeriods.add(numberParam(nextSeries, "period", 10));
				break;
			case "StdDev":
				stdDevPeriods.add(numberParam(nextSeries, "period", 20));
				break;
			case "HV": {
				const key = indicatorKey(nextSeries);
				if (key) {
					hvConfigs.set(key, {
						period: numberParam(nextSeries, "period", 20),
						annualize: nextSeries.params?.annualize !== false,
					});
				}
				break;
			}
			case "CI":
				ciPeriods.add(numberParam(nextSeries, "period", 14));
				break;
			case "CMF":
				cmfPeriods.add(numberParam(nextSeries, "period", 20));
				break;
			case "MFI":
				mfiPeriods.add(numberParam(nextSeries, "period", 14));
				break;
			case "VolOsc": {
				const key = indicatorKey(nextSeries);
				if (key) {
					volOscConfigs.set(key, {
						shortPeriod: numberParam(nextSeries, "shortPeriod", 5),
						longPeriod: numberParam(nextSeries, "longPeriod", 20),
					});
				}
				break;
			}
			case "ChaikinOscillator": {
				const key = indicatorKey(nextSeries);
				if (key) {
					chaikinOscConfigs.set(key, {
						fast: numberParam(nextSeries, "fast", 3),
						slow: numberParam(nextSeries, "slow", 10),
					});
				}
				break;
			}
			case "VWAP": {
				const key = indicatorKey(nextSeries);
				if (key) {
					const anchorParam = nextSeries.params?.anchor;
					const anchor = (anchorParam === "session" || anchorParam === "week" || anchorParam === "month") ? anchorParam : "session";
					vwapConfigs.set(key, {
						anchor,
						showBands: nextSeries.params?.showBands !== false,
						multiplier: numberParam(nextSeries, "multiplier", 1),
					});
				}
				break;
			}
			case "AnchoredVWAP": {
				const key = indicatorKey(nextSeries);
				if (key) {
					anchoredVwapConfigs.set(key, {
						anchorTime: numberParam(nextSeries, "anchorTime", 0),
						showBands: nextSeries.params?.showBands !== false,
						multiplier: numberParam(nextSeries, "multiplier", 1),
					});
				}
				break;
			}
			case "Alligator": {
				const key = indicatorKey(nextSeries);
				if (key) {
					alligatorConfigs.set(key, {
						jawPeriod: numberParam(nextSeries, "jawPeriod", 13),
						jawShift: numberParam(nextSeries, "jawShift", 8),
						teethPeriod: numberParam(nextSeries, "teethPeriod", 8),
						teethShift: numberParam(nextSeries, "teethShift", 5),
						lipsPeriod: numberParam(nextSeries, "lipsPeriod", 5),
						lipsShift: numberParam(nextSeries, "lipsShift", 3),
					});
				}
				break;
			}
			case "Fractals":
				fractalsEnabled = true;
				break;
			case "Gator": {
				const key = indicatorKey(nextSeries);
				if (key) {
					gatorConfigs.set(key, {
						jawPeriod: numberParam(nextSeries, "jawPeriod", 13),
						jawShift: numberParam(nextSeries, "jawShift", 8),
						teethPeriod: numberParam(nextSeries, "teethPeriod", 8),
						teethShift: numberParam(nextSeries, "teethShift", 5),
						lipsPeriod: numberParam(nextSeries, "lipsPeriod", 5),
						lipsShift: numberParam(nextSeries, "lipsShift", 3),
					});
				}
				break;
			}
			case "AC":
				acEnabled = true;
				break;
			case "PivotStandard": {
				const key = indicatorKey(nextSeries);
				if (key) {
					pivotStandardConfigs.set(key, {
						pivotType: numberParam(nextSeries, "pivotType", 0),
					});
				}
				break;
			}
			case "PivotHighLow": {
				const key = indicatorKey(nextSeries);
				if (key) {
					pivotHighLowConfigs.set(key, {
						lookback: numberParam(nextSeries, "lookback", 10),
						pivotType: numberParam(nextSeries, "pivotType", 0),
					});
				}
				break;
			}
			case "MarketProfile": {
				const key = indicatorKey(nextSeries);
				if (key) {
					marketProfileConfigs.set(key, {
						sessionStart: nextSeries.params?.sessionStart as number | undefined,
						sessionEnd: nextSeries.params?.sessionEnd as number | undefined,
						tickSize: numberParam(nextSeries, "tickSize", 0.01),
						tpoPeriodMinutes: numberParam(nextSeries, "tpoPeriodMinutes", 30),
					});
				}
				break;
			}
			case "VolumeProfile": {
				const key = indicatorKey(nextSeries);
				if (key) {
					volumeProfileConfigs.set(key, {
						priceTickSize: numberParam(nextSeries, "priceTickSize", 0.01),
					});
				}
				break;
			}
			case "Footprint": {
				const key = indicatorKey(nextSeries);
				if (key) {
					footprintConfigs.set(key, {
						barIntervalMs: numberParam(nextSeries, "barIntervalMs", 60000),
						priceTickSize: numberParam(nextSeries, "priceTickSize", 0.01),
					});
				}
				break;
			}
			case "DeltaProfile": {
				const key = indicatorKey(nextSeries);
				if (key) {
					deltaProfileConfigs.set(key, {
						barIntervalMs: numberParam(nextSeries, "barIntervalMs", 60000),
						priceTickSize: numberParam(nextSeries, "priceTickSize", 0.01),
						smaPeriod: numberParam(nextSeries, "smaPeriod", 14),
					});
				}
				break;
			}
			case "StrengthRelative": {
				const key = indicatorKey(nextSeries);
				if (key) {
					strengthRelativeConfigs.set(key, {
						compareSymbol: (nextSeries.params?.compareSymbol as string) || "VNINDEX",
						period: numberParam(nextSeries, "period", 14),
					});
				}
				break;
			}
			case "SMFI":
				smfiEnabled = true;
				break;
			case "WyckoffWave": {
				const key = indicatorKey(nextSeries);
				if (key) {
					wyckoffWaveConfigs.set(key, {
						thresholdPercent: numberParam(nextSeries, "thresholdPercent", 1),
					});
				}
				break;
			}
			default:
				break;
		}
	}

	return {
		emaPeriods,
		smaPeriods,
		rsiPeriods,
		macdConfigs,
		bollingerConfigs,
		whaleThresholds,
		bbiEnabled,
		sarByKey,
		obvEnabled,
		wrPeriods,
		vrPeriods,
		kdjConfigs,
		cciPeriods,
		dmiPeriods,
		biasPeriods,
		brarPeriods,
		mtmConfigs,
		emvPeriods,
		aoEnabled,
		rocPeriods,
		trixConfigs,
		dmaConfigs,
		pvtEnabled,
		psyConfigs,
		crConfigs,
		defaultMacdKey,
		defaultBollingerKey,
		defaultWhaleKey,
		// CE26 additions
		wmaPeriods,
		vwmaPeriods,
		hmaPeriods,
		demaPeriods,
		temaPeriods,
		maRibbonConfigs,
		ichimokuConfigs,
		supertrendConfigs,
		keltnerConfigs,
		donchianPeriods,
		chaikinVolPeriods,
		stdDevPeriods,
		hvConfigs,
		ciPeriods,
		// CE27 additions
		cmfPeriods,
		mfiPeriods,
		volOscConfigs,
		chaikinOscConfigs,
		vwapConfigs,
		anchoredVwapConfigs,
		alligatorConfigs,
		fractalsEnabled,
		gatorConfigs,
		acEnabled,
		pivotStandardConfigs,
		pivotHighLowConfigs,
		marketProfileConfigs,
		volumeProfileConfigs,
		footprintConfigs,
		deltaProfileConfigs,
		strengthRelativeConfigs,
		smfiEnabled,
		wyckoffWaveConfigs,
		orderedSeries: resolveCalculationOrder(series),
	};
}
