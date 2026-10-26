import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { collectNumbers, numericExtent, fractalsSeries, type FractalsSeriesResult } from "../utils";

const Fractals: IndicatorDefinition<OHLCVBar, FractalsSeriesResult, readonly []> = {
	name: "Fractals",
	compute: (bars) => fractalsSeries(bars),
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default Fractals;
