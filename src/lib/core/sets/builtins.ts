import cryptoStandard from "./builtins/crypto-standard.json";
import emaMulti from "./builtins/ema-multi.json";
import orderflowSuite from "./builtins/orderflow-suite.json";
import vnSwingSetup from "./builtins/vn-swing-setup.json";
import type { IndicatorSet } from "../types/indicator-set";

export const BUILTIN_INDICATOR_SETS: readonly IndicatorSet[] = [
	vnSwingSetup as IndicatorSet,
	emaMulti as IndicatorSet,
	orderflowSuite as IndicatorSet,
	cryptoStandard as IndicatorSet,
];