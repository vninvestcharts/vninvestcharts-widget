import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent } from "../utils";

const VOLUME: IndicatorDefinition<OHLCVBar, number[], readonly []> = {
	name: "VOLUME",
	compute: (bars) => bars.map((bar) => bar.volume),
	computeExtents: (values) => numericExtent(values),
	yAxis: "right",
	render: () => undefined,
};

export default VOLUME;