import { useEffect, useState } from "react";
import { type OHLCVBar } from "../../lib/types/ohlcv";
import { type EnrichedDatum, type VolumeProfileData } from "../../lib/core/calculators/types";
import { type WhaleOrder } from "../../lib/types/vninvest";
import { type WhaleEvent } from "../../lib/indicators/overlays/whaleDetector";
import { buildIndicatorSeriesKey } from "../../lib/core/seriesValueResolver";
import { type resolveVisiblePanes } from "../utils/widgetHelpers";
import { resolveTimeframeMs } from "../history/historyDataUtils";
import { createHookLogger } from "../../lib/utils/logger";

const log = createHookLogger("useWidgetData");

export type VisiblePaneLike = ReturnType<typeof resolveVisiblePanes>;

/**
 * BL-01 extraction from useWidgetData.ts (behavior-identical move).
 * Progressive higher-timeframe aggregation over base bars.
 */
export function computeProgressiveHTFData(
	baseBars: readonly OHLCVBar[],
	timeframe: string,
	overlayTimeframe: string
) {
	if (!baseBars || baseBars.length === 0 || !overlayTimeframe || overlayTimeframe === "Same as chart" || overlayTimeframe === timeframe) {
		return [];
	}

	const ltfMs = resolveTimeframeMs(timeframe);
	const htfMs = resolveTimeframeMs(overlayTimeframe);

	let currentPeriodStart = -1;
	let open = NaN;
	let high = -Infinity;
	let low = Infinity;
	let close = NaN;

	const htfData: any[] = new Array(baseBars.length);

	for (let i = 0; i < baseBars.length; i++) {
		const bar = baseBars[i];
		const barTime = bar.date.getTime();
		const periodStart = Math.floor(barTime / htfMs) * htfMs;
		const periodEnd = periodStart + htfMs;

		if (periodStart !== currentPeriodStart) {
			currentPeriodStart = periodStart;
			open = bar.open;
			high = bar.high;
			low = bar.low;
		} else {
			high = Math.max(high, bar.high);
			low = Math.min(low, bar.low);
		}
		close = bar.close;

		const isLastInPeriod = (i + 1 < baseBars.length)
			? (Math.floor(baseBars[i + 1].date.getTime() / htfMs) * htfMs !== periodStart)
			: (barTime + ltfMs >= periodEnd);

		htfData[i] = {
			open,
			high,
			low,
			close,
			periodStart,
			isClosed: isLastInPeriod
		};
	}

	return htfData;
}

export interface WhaleMappingInput {
	enableWhale?: boolean;
	whaleOrders?: readonly WhaleOrder[] | null;
	plotData: readonly EnrichedDatum[];
}

/**
 * BL-01 extraction from useWidgetData.ts (behavior-identical move).
 * Maps external/internal whale orders to nearest bar indices.
 */
export function mapWhaleEventsToBars({ enableWhale, whaleOrders, plotData }: WhaleMappingInput): WhaleEvent[] {
	if (enableWhale && whaleOrders && whaleOrders.length > 0 && plotData.length > 0) {
		const mapped: WhaleEvent[] = [];
		for (const order of whaleOrders) {
			const ts = new Date(order.ts).valueOf();
			let nearestIdx = 0;
			let minDiff = Math.abs(plotData[0].date.valueOf() - ts);
			for (let i = 1; i < plotData.length; i++) {
				const diff = Math.abs(plotData[i].date.valueOf() - ts);
				if (diff < minDiff) {
					minDiff = diff;
					nearestIdx = i;
				}
			}
			const matchedValue = order.matched_value > 0 ? order.matched_value : order.price * order.volume;
			if (!Number.isFinite(matchedValue) || matchedValue <= 0) {
				continue;
			}
			mapped.push({
				index: nearestIdx,
				date: new Date(order.ts),
				buyVol: order.side === "buy" ? matchedValue : 0,
				sellVol: order.side === "sell" ? matchedValue : 0,
				netDelta: order.side === "buy" ? matchedValue : -matchedValue,
				dominance: order.side === "buy" ? "buy" : "sell",
				sizeCategory: "large",
			});
		}
		return mapped;
	}
	return [];
}

export interface AsyncVolumeProfilesInput {
	symbol?: string;
	canaryFilteredBars: readonly OHLCVBar[];
	mtfBarsByTimeframe: Record<string, readonly OHLCVBar[]>;
	visiblePanes: VisiblePaneLike;
}

/**
 * BL-01 extraction from useWidgetData.ts (behavior-identical move).
 * Worker-backed VolumeProfile computation for visible VolumeProfile series.
 */
export function useAsyncVolumeProfiles({
	symbol,
	canaryFilteredBars,
	mtfBarsByTimeframe,
	visiblePanes,
}: AsyncVolumeProfilesInput): Record<string, VolumeProfileData> {
	const [asyncVolumeProfiles, setAsyncVolumeProfiles] = useState<Record<string, VolumeProfileData>>({});

	useEffect(() => {
		if (!symbol || canaryFilteredBars.length === 0) return;

		// Scan for VolumeProfile series
		const vpSeriesList = visiblePanes.flatMap((p) => p.series).filter((s) => s.type === "VolumeProfile");
		if (vpSeriesList.length === 0) return;

		let active = true;

		const runWorkerCalculations = async () => {
			const { computeVolumeProfileAsync } = await import("../../lib/indicators/builtin/VolumeProfileWorker");

			const nextProfiles: Record<string, VolumeProfileData> = {};
			for (const s of vpSeriesList) {
				const priceTickSize = (s.params?.priceTickSize as number) ?? 0.01;
				// Resolve target data for Volume Profile
				const backfillTf = mtfBarsByTimeframe["1m"] ? "1m" : (mtfBarsByTimeframe["5m"] ? "5m" : undefined);
				const targetBars = backfillTf ? mtfBarsByTimeframe[backfillTf] : canaryFilteredBars;

				if (targetBars && targetBars.length > 0) {
					try {
						const key = buildIndicatorSeriesKey(s);
						if (key) {
							const profile = await computeVolumeProfileAsync(targetBars as any[], priceTickSize); // ARC-1-keep: legacy bridge
							nextProfiles[key] = profile;
						}
					} catch (err) {
						log.error("Failed to compute volume profile asynchronously:", err);
					}
				}
			}

			if (active) {
				setAsyncVolumeProfiles(nextProfiles);
			}
		};

		runWorkerCalculations();

		return () => {
			active = false;
		};
	}, [symbol, canaryFilteredBars, mtfBarsByTimeframe, visiblePanes]);

	return asyncVolumeProfiles;
}
