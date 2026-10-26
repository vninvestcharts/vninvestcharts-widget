import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { computeFootprintBars, FootprintBar } from "../utils";

const Footprint: IndicatorDefinition<OHLCVBar, FootprintBar[], readonly [number?, number?]> = {
	name: "Footprint",
	compute: (bars, barIntervalMs = 60000, priceTickSize = 0.01) => {
		return computeFootprintBars(bars as any, barIntervalMs, priceTickSize);
	},
	render: () => undefined,
};

export default Footprint;
