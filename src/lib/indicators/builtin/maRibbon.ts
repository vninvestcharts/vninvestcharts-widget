import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { collectNumbers, maRibbonSeries, numericExtent, type MARibbonSeriesResult } from "../utils";

const MARIBBON: IndicatorDefinition<OHLCVBar, MARibbonSeriesResult, [("SMA" | "EMA")?, (readonly number[])?]> = {
	name: "MARibbon",
	compute: (bars, type = "EMA", periods) => {
		return maRibbonSeries(bars.map((b) => b.close), type, periods ?? undefined);
	},
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default MARIBBON;
