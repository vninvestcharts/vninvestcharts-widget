/**
 * BU-40-01: Feature flags for backfill worker lanes.
 * Toggle external bars normalization worker and candlestick LOD downsample worker.
 */

export interface BackfillWorkerFlags {
	/** Enable/disable external bars normalization async worker (default: true) */
	enableExternalBarsNormalizationWorker?: boolean;
	/** Enable/disable candlestick LOD downsample async worker (default: true) */
	enableCandlestickLodWorker?: boolean;
}

export const DEFAULT_BACKFILL_WORKER_FLAGS: Required<BackfillWorkerFlags> = {
	enableExternalBarsNormalizationWorker: true,
	enableCandlestickLodWorker: true,
};

export function resolveBackfillWorkerFlags(
	props?: BackfillWorkerFlags,
	searchParams: URLSearchParams = new URLSearchParams(),
): Required<BackfillWorkerFlags> {
	const flags = { ...DEFAULT_BACKFILL_WORKER_FLAGS };

	if (searchParams) {
		const externalWorkerParam = searchParams.get("disableExternalBarsWorker");
		if (externalWorkerParam === "1") {
			flags.enableExternalBarsNormalizationWorker = false;
		}

		const lodWorkerParam = searchParams.get("disableLodWorker");
		if (lodWorkerParam === "1") {
			flags.enableCandlestickLodWorker = false;
		}
	}

	// Props override URL params
	if (props?.enableExternalBarsNormalizationWorker !== undefined) {
		flags.enableExternalBarsNormalizationWorker = props.enableExternalBarsNormalizationWorker;
	}
	if (props?.enableCandlestickLodWorker !== undefined) {
		flags.enableCandlestickLodWorker = props.enableCandlestickLodWorker;
	}

	return flags;
}
