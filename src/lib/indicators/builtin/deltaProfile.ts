import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { computeFootprintBars, computeDeltaProfile, DeltaProfileData } from "../utils";

const DeltaProfile: IndicatorDefinition<OHLCVBar, DeltaProfileData, readonly [number?, number?, number?]> = {
	name: "DeltaProfile",
	compute: (bars, barIntervalMs = 60000, priceTickSize = 0.01, smaPeriod = 14) => {
		const footprintBars = computeFootprintBars(bars as any, barIntervalMs, priceTickSize);
		return computeDeltaProfile(footprintBars, smaPeriod);
	},
	render: () => undefined,
};

export default DeltaProfile;
