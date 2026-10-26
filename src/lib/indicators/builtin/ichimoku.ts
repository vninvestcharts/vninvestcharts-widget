import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { collectNumbers, ichimokuSeries, numericExtent, type IchimokuSeriesResult } from "../utils";

const ICHIMOKU: IndicatorDefinition<OHLCVBar, IchimokuSeriesResult, readonly [number?, number?, number?, number?]> = {
	name: "Ichimoku",
	compute: (bars, tenkan = 9, kijun = 26, senkouB = 52, displacement = 26) => {
		return ichimokuSeries(bars, tenkan, kijun, senkouB, displacement);
	},
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default ICHIMOKU;
