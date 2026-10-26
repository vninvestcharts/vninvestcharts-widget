import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { historicalVolSeries, numericExtent } from "../utils";

const HV: IndicatorDefinition<OHLCVBar, number[], readonly [number?, boolean?]> = {
	name: "HV",
	compute: (bars, period = 20, annualize = true) => {
		return historicalVolSeries(bars.map((b) => b.close), period, annualize);
	},
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default HV;
