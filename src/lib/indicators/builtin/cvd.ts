import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent } from "../utils";

const CVD: IndicatorDefinition<OHLCVBar, number[], readonly []> = {
	name: "CVD",
	compute: (bars) => {
		let cumulative = 0;
		return bars.map((bar) => {
			const delta = (bar.buyVolume ?? 0) - (bar.sellVolume ?? 0);
			cumulative += delta;
			return cumulative;
		});
	},
	computeExtents: (values) => numericExtent(values),
	yAxis: "right",
	render: () => undefined,
};

export default CVD;