import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent, rsiSeries } from "../utils";

const RSI: IndicatorDefinition<OHLCVBar, number[], readonly [number?]> = {
	name: "RSI",
	compute: (bars, period = 14) => rsiSeries(bars.map((bar) => bar.close), period),
	computeExtents: () => [0, 100],
	yAxis: "right",
	render: () => undefined,
};

export default RSI;