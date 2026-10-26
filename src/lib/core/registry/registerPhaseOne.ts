import { clearRegistry } from "./registryCore";
import { registerCandlestick, registerHollowCandle, registerOHLC, registerHeikinAshi, registerLine, registerArea, registerHistogram, registerBaseline, registerRenko, registerKagi, registerPointAndFigure, registerLineBreak } from "./priceChartTypes";
import { registerEMA, registerMA, registerBBI, registerWMA, registerVWMA, registerHMA, registerDEMA, registerTEMA, registerMARibbon, registerDMA } from "./movingAverage";
import { registerBollingerBand, registerBollingerBands, registerKeltner, registerDonchian, registerChaikinVol, registerStdDev, registerHV } from "./volatility";
import { registerRSI, registerMACD, registerStrengthElder, registerStrengthRelative, registerWR, registerKDJ, registerCCI, registerBIAS, registerMTM, registerAO, registerROC, registerTRIX, registerPSY, registerCR, registerCI, registerAC } from "./momentum";
import { registerVolume, registerCVDApprox, registerCVDRealtime, registerSMFI, registerWhale, registerOBV, registerVR, registerBRAR, registerEMV, registerPVT, registerCMF, registerChaikinOscillator, registerMFI, registerVolOsc, registerVWAP, registerAnchoredVWAP } from "./volumeFlow";
import { registerSAR, registerDMI, registerIchimoku, registerSupertrend, registerAlligator, registerGator, registerHTFOverlay } from "./trend";
import { registerWyckoffWave, registerFractals, registerPivotStandard, registerPivotHighLow } from "./marketStructure";
import { registerMarketProfile, registerVolumeProfile, registerFootprint, registerDeltaProfile, registerComparison } from "./profile";

/** Một thunk đăng ký đúng một series type. */
export type SeriesRegistration = () => void;

/**
 * Orchestrator: clear rồi chạy 74 thunk theo THỨ TỰ LỊCH SỬ.
 *
 * Thứ tự này là hợp đồng, không phải ngẫu nhiên: `listRegistered()` trả về key của
 * `Map` theo thứ tự chèn, và UI đọc thẳng danh sách đó (`SeriesPicker`,
 * `IndicatorsSettingsTab` <select>, `PaneSettingsModal`) — đổi thứ tự là đổi UI.
 * Nhóm file (`./priceChartTypes`, `./volatility`, …) chỉ để đọc, không quyết định thứ tự.
 */
const ORDERED_REGISTRATIONS: readonly SeriesRegistration[] = [
	registerCandlestick,
	registerHollowCandle,
	registerOHLC,
	registerHeikinAshi,
	registerLine,
	registerArea,
	registerVolume,
	registerHistogram,
	registerBaseline,
	registerRenko,
	registerKagi,
	// Hai loại exotic cuối cùng: thứ tự chèn là HỢP ĐỒNG (xem docblock trên), nên
	// chúng đứng cạnh nhóm exotic chứ không phải ở cuối danh sách.
	registerPointAndFigure,
	registerLineBreak,
	registerEMA,
	registerBollingerBand,
	registerBollingerBands,
	registerRSI,
	registerMACD,
	registerCVDApprox,
	registerCVDRealtime,
	registerStrengthElder,
	registerStrengthRelative,
	registerSMFI,
	registerWyckoffWave,
	registerWhale,
	registerMA,
	registerBBI,
	registerSAR,
	registerOBV,
	registerWR,
	registerVR,
	registerKDJ,
	registerCCI,
	registerDMI,
	registerBIAS,
	registerBRAR,
	registerMTM,
	registerEMV,
	registerAO,
	registerROC,
	registerTRIX,
	registerDMA,
	registerPVT,
	registerPSY,
	registerCR,
	registerWMA,
	registerVWMA,
	registerHMA,
	registerDEMA,
	registerTEMA,
	registerMARibbon,
	registerIchimoku,
	registerSupertrend,
	registerKeltner,
	registerDonchian,
	registerChaikinVol,
	registerStdDev,
	registerHV,
	registerCI,
	registerCMF,
	registerChaikinOscillator,
	registerMFI,
	registerVolOsc,
	registerVWAP,
	registerAnchoredVWAP,
	registerAlligator,
	registerFractals,
	registerGator,
	registerAC,
	registerPivotStandard,
	registerPivotHighLow,
	registerMarketProfile,
	registerVolumeProfile,
	registerFootprint,
	registerDeltaProfile,
	registerHTFOverlay,
	registerComparison,
];

export function registerPhaseOneSeries(): void {
	clearRegistry();
	ORDERED_REGISTRATIONS.forEach((register) => register());
}
