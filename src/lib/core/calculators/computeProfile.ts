/**
 * Khối compute: hồ sơ giá/khối lượng (Market Profile, Volume Profile, Footprint,
 * Delta Profile).
 *
 * Một nhóm trong `computeIndicatorComputationResult`, tách riêng (split 2026-09-30).
 * Đây là nhóm đắt nhất (synthesizeTicksFromBar + computeFootprintBars trên cả lịch
 * sử) và là nhóm duy nhất ngoài dòng tiền cần `options` — `asyncVolumeProfiles` cho
 * phép dùng kết quả đã tính sẵn, `mtfBars` cho phép backfill từ khung nhỏ hơn.
 */
import {
	computeDeltaProfile,
	computeFootprintBars,
	computeMarketProfile,
	computeVolumeProfile,
	synthesizeTicksFromBar,
} from "../../indicators/utils";
import type {
	IndicatorComputationOptions,
	IndicatorComputationPlan,
} from "./indicatorComputationTypes";
import type { DeltaProfileData, FootprintBar, MarketProfileData, RawOHLCV, VolumeProfileData } from "./types";

export interface ProfileBlocks {
	marketProfileByKey: Map<string, MarketProfileData>;
	volumeProfileByKey: Map<string, VolumeProfileData>;
	footprintByKey: Map<string, FootprintBar[]>;
	deltaProfileByKey: Map<string, DeltaProfileData>;
}

export function computeProfileBlocks(
	raw: readonly RawOHLCV[],
	plan: IndicatorComputationPlan,
	options?: IndicatorComputationOptions,
): ProfileBlocks {
	const marketProfileByKey = new Map<string, MarketProfileData>();
	for (const [key, config] of plan.marketProfileConfigs) {
		const start = config.sessionStart ?? (raw[0]?.date ? new Date(raw[0].date).getTime() : Date.now());
		const end = config.sessionEnd ?? (raw[raw.length - 1]?.date ? new Date(raw[raw.length - 1].date).getTime() : Date.now());
		const ticks = raw.flatMap(bar => synthesizeTicksFromBar(bar, config.tickSize));
		const data = computeMarketProfile(ticks, start, end, config.tickSize, config.tpoPeriodMinutes);
		marketProfileByKey.set(key, data);
	}

	const volumeProfileByKey = new Map<string, VolumeProfileData>();
	for (const [key, config] of plan.volumeProfileConfigs) {
		const cachedProfile = options?.asyncVolumeProfiles?.[key];
		if (cachedProfile) {
			volumeProfileByKey.set(key, cachedProfile);
		} else {
			let targetData = raw;
			if (options?.mtfBars) {
				const backfillTf = options.mtfBars["1m"] ? "1m" : (options.mtfBars["5m"] ? "5m" : undefined);
				if (backfillTf && options.mtfBars[backfillTf]?.length > 0) {
					targetData = options.mtfBars[backfillTf];
				}
			}
			const data = computeVolumeProfile(targetData as any, config.priceTickSize);
			volumeProfileByKey.set(key, data);
		}
	}

	const footprintByKey = new Map<string, FootprintBar[]>();
	for (const [key, config] of plan.footprintConfigs) {
		const data = computeFootprintBars(raw as any, config.barIntervalMs, config.priceTickSize);
		footprintByKey.set(key, data);
	}

	const deltaProfileByKey = new Map<string, DeltaProfileData>();
	for (const [key, config] of plan.deltaProfileConfigs) {
		const footprintBars = computeFootprintBars(raw as any, config.barIntervalMs, config.priceTickSize);
		const data = computeDeltaProfile(footprintBars, config.smaPeriod);
		deltaProfileByKey.set(key, data);
	}

	return {
		marketProfileByKey,
		volumeProfileByKey,
		footprintByKey,
		deltaProfileByKey,
	};
}
