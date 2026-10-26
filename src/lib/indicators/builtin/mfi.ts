import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent, mfiSeries } from "../utils";

const MFI: IndicatorDefinition<OHLCVBar, number[], readonly [number?]> = {
	name: "MFI",
	compute: (bars, period = 14) => mfiSeries(bars, period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default MFI;
