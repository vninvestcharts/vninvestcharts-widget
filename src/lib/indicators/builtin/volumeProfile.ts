import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { computeVolumeProfile, VolumeProfileData } from "../utils";

const VolumeProfile: IndicatorDefinition<OHLCVBar, VolumeProfileData, readonly [number?, { from: number; to: number }?]> = {
	name: "VolumeProfile",
	compute: (bars, priceTickSize = 0.01, range) => {
		return computeVolumeProfile(bars as any, priceTickSize, range);
	},
	render: () => undefined,
};

export default VolumeProfile;
