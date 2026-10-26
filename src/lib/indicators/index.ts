import { getIndicator, listIndicators, registerIndicator } from "./registry";
import EMA from "./builtin/ema";
import SMA from "./builtin/sma";
import RSI from "./builtin/rsi";
import MACD from "./builtin/macd";
import BOLLINGER from "./builtin/bollinger";
import VOLUME from "./builtin/volume";
import CVD from "./builtin/cvd";
import MA from "./builtin/ma";
import BBI from "./builtin/bbi";
import SAR from "./builtin/sar";
import OBV from "./builtin/obv";
import WR from "./builtin/wr";
import VR from "./builtin/vr";
import KDJ from "./builtin/kdj";
import CCI from "./builtin/cci";
import DMI from "./builtin/dmi";
import BIAS from "./builtin/bias";
import BRAR from "./builtin/brar";
import MTM from "./builtin/mtm";
import EMV from "./builtin/emv";
import AO from "./builtin/ao";
import ROC from "./builtin/roc";
import TRIX from "./builtin/trix";
import DMA from "./builtin/dma";
import PVT from "./builtin/pvt";
import PSY from "./builtin/psy";
import CR from "./builtin/cr";
// CE26 additions
import WMA from "./builtin/wma";
import VWMA from "./builtin/vwma";
import HMA from "./builtin/hma";
import DEMA from "./builtin/dema";
import TEMA from "./builtin/tema";
import MARIBBON from "./builtin/maRibbon";
import ICHIMOKU from "./builtin/ichimoku";
import SUPERTREND from "./builtin/supertrend";
import KELTNER from "./builtin/keltner";
import DONCHIAN from "./builtin/donchian";
import CHAIKINVOL from "./builtin/chaikinVol";
import STDDEV from "./builtin/stdDev";
import HV from "./builtin/hv";
import CI from "./builtin/ci";
// CE27 additions
import CMF from "./builtin/cmf";
import ChaikinOscillator from "./builtin/chaikinOscillator";
import MFI from "./builtin/mfi";
import VOLOSC from "./builtin/volOsc";
import VWAP from "./builtin/vwap";
import ANCHOREDVAP from "./builtin/anchoredVwap";
import ALLIGATOR from "./builtin/alligator";
import FRACTALS from "./builtin/fractals";
import GATOR from "./builtin/gator";
import AC from "./builtin/ac";
import PIVOTSTANDARD from "./builtin/pivotStandard";
import PIVOTHIGHLOW from "./builtin/pivotHighLow";
// CE28 additions
import MARKETPROFILE from "./builtin/marketProfile";
import VOLUMEPROFILE from "./builtin/volumeProfile";
import FOOTPRINT from "./builtin/footprint";
import DELTAPROFILE from "./builtin/deltaProfile";
// CE30 additions
import STRENGTHRELATIVE from "./builtin/strengthRelative";
import SMFI from "./builtin/smfi";
import WYCKOFFWAVE from "./builtin/wyckoffWave";


registerIndicator(EMA);
registerIndicator(SMA);
registerIndicator(RSI);
registerIndicator(MACD);
registerIndicator(BOLLINGER);
registerIndicator(VOLUME);
registerIndicator(CVD);
registerIndicator(MA);
registerIndicator(BBI);
registerIndicator(SAR);
registerIndicator(OBV);
registerIndicator(WR);
registerIndicator(VR);
registerIndicator(KDJ);
registerIndicator(CCI);
registerIndicator(DMI);
registerIndicator(BIAS);
registerIndicator(BRAR);
registerIndicator(MTM);
registerIndicator(EMV);
registerIndicator(AO);
registerIndicator(ROC);
registerIndicator(TRIX);
registerIndicator(DMA);
registerIndicator(PVT);
registerIndicator(PSY);
registerIndicator(CR);
// CE26 registrations
registerIndicator(WMA);
registerIndicator(VWMA);
registerIndicator(HMA);
registerIndicator(DEMA);
registerIndicator(TEMA);
registerIndicator(MARIBBON);
registerIndicator(ICHIMOKU);
registerIndicator(SUPERTREND);
registerIndicator(KELTNER);
registerIndicator(DONCHIAN);
registerIndicator(CHAIKINVOL);
registerIndicator(STDDEV);
registerIndicator(HV);
registerIndicator(CI);
// CE27 registrations
registerIndicator(CMF);
registerIndicator(ChaikinOscillator);
registerIndicator(MFI);
registerIndicator(VOLOSC);
registerIndicator(VWAP);
registerIndicator(ANCHOREDVAP);
registerIndicator(ALLIGATOR);
registerIndicator(FRACTALS);
registerIndicator(GATOR);
registerIndicator(AC);
registerIndicator(PIVOTSTANDARD);
registerIndicator(PIVOTHIGHLOW);
// CE28 registrations
registerIndicator(MARKETPROFILE);
registerIndicator(VOLUMEPROFILE);
registerIndicator(FOOTPRINT);
registerIndicator(DELTAPROFILE);
registerIndicator(STRENGTHRELATIVE);
registerIndicator(SMFI);
registerIndicator(WYCKOFFWAVE);


export { getIndicator, listIndicators, registerIndicator } from "./registry";
export type { IndicatorName, IndicatorRegistry, RegisteredIndicator } from "./types";
export {
	EMA, SMA, RSI, MACD, BOLLINGER, VOLUME, CVD, MA, BBI, SAR, OBV, WR, VR, KDJ, CCI, DMI, BIAS, BRAR, MTM, EMV, AO, ROC, TRIX, DMA, PVT, PSY, CR,
	WMA, VWMA, HMA, DEMA, TEMA, MARIBBON, ICHIMOKU, SUPERTREND, KELTNER, DONCHIAN, CHAIKINVOL, STDDEV, HV, CI,
	ChaikinOscillator, CMF, MFI, VOLOSC, VWAP, ANCHOREDVAP, ALLIGATOR, FRACTALS, GATOR, AC, PIVOTSTANDARD, PIVOTHIGHLOW,
	MARKETPROFILE, VOLUMEPROFILE, FOOTPRINT, DELTAPROFILE,
	STRENGTHRELATIVE, SMFI, WYCKOFFWAVE
};