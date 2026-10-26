/**
 * Kiểu dữ liệu của `indicatorComputation` — SSOT cho cả plan lẫn result.
 *
 * Tách ra khỏi `indicatorComputation.ts` (split 2026-09-30) vì cả
 * `buildIndicatorComputationPlan`, `computeIndicatorComputationResult` và
 * `materializeIndicatorValues` đều cần đúng những kiểu này, và chúng đã vượt
 * budget 800 dòng khi nằm chung. Module này chỉ khai báo kiểu + import kiểu, nên
 * không tạo cạnh runtime nào trong đồ thị phụ thuộc.
 */
import type { SeriesConfig } from "../types/pane-descriptor";
import type { calcCVDApprox } from "./calcCVDApprox";
import type { calcStrengthElder } from "./calcStrengthElder";
import type {
	IndicatorAcValue,
	IndicatorAlligatorValue,
	IndicatorBandValue,
	IndicatorBrarValue,
	IndicatorCrValue,
	IndicatorDmaValue,
	IndicatorDmiValue,
	IndicatorDonchianValue,
	IndicatorEmvValue,
	IndicatorFractalValue,
	IndicatorGatorValue,
	IndicatorIchimokuValue,
	IndicatorKdjValue,
	IndicatorKeltnerValue,
	IndicatorMacdValue,
	IndicatorMARibbonValue,
	IndicatorMtmValue,
	IndicatorPivotValue,
	IndicatorPsyValue,
	IndicatorSupertrendValue,
	IndicatorTrixValue,
	IndicatorVwapValue,
	IndicatorWhaleValue,
	IndicatorWyckoffValue,
	MarketProfileData,
	VolumeProfileData,
	FootprintBar,
	DeltaProfileData,
	RawOHLCV,
} from "./types";

export interface MacdConfig {
	fast: number;
	slow: number;
	signal: number;
}

export interface BollingerConfig {
	period: number;
	stdDev: number;
}

export interface KdjConfig {
	period: number;
	m1: number;
	m2: number;
}

export interface PeriodSignalConfig {
	period: number;
	signalPeriod: number;
}

export interface DmaConfig {
	fastPeriod: number;
	slowPeriod: number;
	signalPeriod: number;
}

export interface CrConfig {
	period: number;
	m1: number;
	m2: number;
	m3: number;
	m4: number;
}

/** Đầu vào tuỳ chọn của `computeIndicatorComputationResult` (ngoài `raw` + `plan`). */
export interface IndicatorComputationOptions {
	compareBarsBySymbol?: Record<string, readonly RawOHLCV[]>;
	mtfBars?: Record<string, readonly RawOHLCV[]>;
	asyncVolumeProfiles?: Record<string, VolumeProfileData>;
}

export interface IndicatorComputationPlan {
	emaPeriods: Set<number>;
	smaPeriods: Set<number>;
	rsiPeriods: Set<number>;
	macdConfigs: Map<string, MacdConfig>;
	bollingerConfigs: Map<string, BollingerConfig>;
	whaleThresholds: Set<number>;
	bbiEnabled: boolean;
	sarByKey: Map<string, { afStep: number; afMax: number }>;
	obvEnabled: boolean;
	wrPeriods: Set<number>;
	vrPeriods: Set<number>;
	kdjConfigs: Map<string, KdjConfig>;
	cciPeriods: Set<number>;
	dmiPeriods: Set<number>;
	biasPeriods: Set<number>;
	brarPeriods: Set<number>;
	mtmConfigs: Map<string, PeriodSignalConfig>;
	emvPeriods: Set<number>;
	aoEnabled: boolean;
	rocPeriods: Set<number>;
	trixConfigs: Map<string, PeriodSignalConfig>;
	dmaConfigs: Map<string, DmaConfig>;
	pvtEnabled: boolean;
	psyConfigs: Map<string, PeriodSignalConfig>;
	crConfigs: Map<string, CrConfig>;
	defaultMacdKey: string;
	defaultBollingerKey: string;
	defaultWhaleKey: string;
	// CE26 additions
	wmaPeriods: Set<number>;
	vwmaPeriods: Set<number>;
	hmaPeriods: Set<number>;
	demaPeriods: Set<number>;
	temaPeriods: Set<number>;
	maRibbonConfigs: Map<string, { type: "SMA" | "EMA"; periods: number[] }>;
	ichimokuConfigs: Map<string, { tenkan: number; kijun: number; senkouB: number; displacement: number }>;
	supertrendConfigs: Map<string, { period: number; multiplier: number }>;
	keltnerConfigs: Map<string, { period: number; atrPeriod: number; multiplier: number }>;
	donchianPeriods: Set<number>;
	chaikinVolPeriods: Set<number>;
	stdDevPeriods: Set<number>;
	hvConfigs: Map<string, { period: number; annualize: boolean }>;
	ciPeriods: Set<number>;
	cmfPeriods: Set<number>;
	mfiPeriods: Set<number>;
	volOscConfigs: Map<string, { shortPeriod: number; longPeriod: number }>;
	chaikinOscConfigs: Map<string, { fast: number; slow: number }>;
	vwapConfigs: Map<string, { anchor: "session" | "week" | "month"; showBands: boolean; multiplier: number }>;
	anchoredVwapConfigs: Map<string, { anchorTime: number; showBands: boolean; multiplier: number }>;
	alligatorConfigs: Map<string, { jawPeriod: number; jawShift: number; teethPeriod: number; teethShift: number; lipsPeriod: number; lipsShift: number }>;
	fractalsEnabled: boolean;
	gatorConfigs: Map<string, { jawPeriod: number; jawShift: number; teethPeriod: number; teethShift: number; lipsPeriod: number; lipsShift: number }>;
	acEnabled: boolean;
	pivotStandardConfigs: Map<string, { pivotType: number }>;
	pivotHighLowConfigs: Map<string, { lookback: number; pivotType: number }>;
	marketProfileConfigs: Map<string, { sessionStart?: number; sessionEnd?: number; tickSize: number; tpoPeriodMinutes: number }>;
	volumeProfileConfigs: Map<string, { priceTickSize: number }>;
	footprintConfigs: Map<string, { barIntervalMs: number; priceTickSize: number }>;
	deltaProfileConfigs: Map<string, { barIntervalMs: number; priceTickSize: number; smaPeriod: number }>;
	strengthRelativeConfigs: Map<string, { compareSymbol: string; period: number }>;
	smfiEnabled: boolean;
	wyckoffWaveConfigs: Map<string, { thresholdPercent: number }>;
	orderedSeries: readonly SeriesConfig[];
}

export interface IndicatorComputationResult {
	valuesByKey: Map<string, Array<any>>;
	emaByPeriod: Map<number, Array<number | undefined>>;
	smaByPeriod: Map<number, Array<number | undefined>>;
	rsiByPeriod: Map<number, Array<number | undefined>>;
	macdByKey: Map<string, Array<IndicatorMacdValue | undefined>>;
	bollingerByKey: Map<string, Array<IndicatorBandValue | undefined>>;
	whaleByKey: Map<string, Array<IndicatorWhaleValue | undefined>>;
	bbi: Array<number | undefined>;
	sarByKey: Map<string, Array<number | undefined>>;
	obv: Array<number | undefined>;
	wrByPeriod: Map<number, Array<number | undefined>>;
	vrByPeriod: Map<number, Array<number | undefined>>;
	kdjByKey: Map<string, Array<IndicatorKdjValue | undefined>>;
	cciByPeriod: Map<number, Array<number | undefined>>;
	dmiByPeriod: Map<number, Array<IndicatorDmiValue | undefined>>;
	biasByPeriod: Map<number, Array<number | undefined>>;
	brarByPeriod: Map<number, Array<IndicatorBrarValue | undefined>>;
	mtmByKey: Map<string, Array<IndicatorMtmValue | undefined>>;
	emvByPeriod: Map<number, Array<IndicatorEmvValue | undefined>>;
	ao: Array<number | undefined>;
	rocByPeriod: Map<number, Array<number | undefined>>;
	trixByKey: Map<string, Array<IndicatorTrixValue | undefined>>;
	dmaByKey: Map<string, Array<IndicatorDmaValue | undefined>>;
	pvt: Array<number | undefined>;
	psyByKey: Map<string, Array<IndicatorPsyValue | undefined>>;
	crByKey: Map<string, Array<IndicatorCrValue | undefined>>;
	cvd: ReturnType<typeof calcCVDApprox>;
	strength: ReturnType<typeof calcStrengthElder>;
	// CE26 additions
	wmaByPeriod: Map<number, Array<number | undefined>>;
	vwmaByPeriod: Map<number, Array<number | undefined>>;
	hmaByPeriod: Map<number, Array<number | undefined>>;
	demaByPeriod: Map<number, Array<number | undefined>>;
	temaByPeriod: Map<number, Array<number | undefined>>;
	maRibbonByKey: Map<string, Array<IndicatorMARibbonValue | undefined>>;
	ichimokuByKey: Map<string, Array<IndicatorIchimokuValue | undefined>>;
	supertrendByKey: Map<string, Array<IndicatorSupertrendValue | undefined>>;
	keltnerByKey: Map<string, Array<IndicatorKeltnerValue | undefined>>;
	donchianByPeriod: Map<number, Array<IndicatorDonchianValue | undefined>>;
	chaikinVolByPeriod: Map<number, Array<number | undefined>>;
	stdDevByPeriod: Map<number, Array<number | undefined>>;
	hvByKey: Map<string, Array<number | undefined>>;
	ciByPeriod: Map<number, Array<number | undefined>>;
	cmfByPeriod: Map<number, Array<number | undefined>>;
	mfiByPeriod: Map<number, Array<number | undefined>>;
	volOscByKey: Map<string, Array<number | undefined>>;
	chaikinOscByKey: Map<string, Array<number | undefined>>;
	vwapByKey: Map<string, Array<IndicatorVwapValue | undefined>>;
	anchoredVwapByKey: Map<string, Array<IndicatorVwapValue | undefined>>;
	alligatorByKey: Map<string, Array<IndicatorAlligatorValue | undefined>>;
	fractals: Array<IndicatorFractalValue | undefined>;
	gatorByKey: Map<string, Array<IndicatorGatorValue | undefined>>;
	ac: Array<IndicatorAcValue | undefined>;
	pivotStandardByKey: Map<string, Array<IndicatorPivotValue | undefined>>;
	pivotHighLowByKey: Map<string, Array<IndicatorPivotValue | undefined>>;
	marketProfileByKey: Map<string, MarketProfileData>;
	volumeProfileByKey: Map<string, VolumeProfileData>;
	footprintByKey: Map<string, FootprintBar[]>;
	deltaProfileByKey: Map<string, DeltaProfileData>;
	strengthRelativeByKey: Map<string, Array<number | undefined>>;
	smfi: Array<number | undefined>;
	wyckoffWaveByKey: Map<string, Array<IndicatorWyckoffValue | undefined>>;
}
