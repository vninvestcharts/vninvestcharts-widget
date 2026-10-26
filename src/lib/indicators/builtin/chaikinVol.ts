import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { chaikinVolSeries, numericExtent } from "../utils";

const CHAIKINVOL: IndicatorDefinition<OHLCVBar, number[], readonly [number?]> = {
	name: "ChaikinVol",
	compute: (bars, period = 10) => chaikinVolSeries(bars, period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default CHAIKINVOL;
