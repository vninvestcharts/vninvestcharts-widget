import type { EnrichedDatum } from "../../lib/core/calculators/types";

export interface EnrichedHashOptions {
	/**
	 * Include per-bar comparison overlay closes (`symbolData`) in the hash so
	 * `setEnrichedData` fires when a comparison symbol is added/removed.
	 * VNInvestCharts passes true; useWidgetData passes false (its items carry
	 * no symbolData) — preserving each call-site's exact legacy semantics.
	 */
	includeComparison?: boolean;
}

/**
 * Shared change-detection hash for enriched bars (BL-07 dedup).
 * Previously duplicated in VNInvestCharts.tsx and useWidgetData.ts.
 */
export function hashEnrichedData(data: readonly EnrichedDatum[], options?: EnrichedHashOptions): string {
	if (!data) return "";
	const includeComparison = options?.includeComparison === true;
	let hash = 0;
	for (let i = 0; i < data.length; i++) {
		const d = data[i] as any; // ARC-1-keep: legacy bridge
		hash = (hash * 31 + (d?.date?.getTime?.() ?? 0)) >>> 0;
		hash = (hash * 31 + Math.round((d?.open ?? 0) * 100)) >>> 0;
		hash = (hash * 31 + Math.round((d?.high ?? 0) * 100)) >>> 0;
		hash = (hash * 31 + Math.round((d?.low ?? 0) * 100)) >>> 0;
		hash = (hash * 31 + Math.round((d?.close ?? 0) * 100)) >>> 0;
		hash = (hash * 31 + (d?.volume ?? 0)) >>> 0;
		if (includeComparison) {
			const sd = d?.symbolData;
			if (sd && typeof sd === "object") {
				const keys = Object.keys(sd);
				hash = (hash * 31 + keys.length) >>> 0;
				for (let k = 0; k < keys.length; k++) {
					const entry = sd[keys[k]];
					if (entry && typeof entry === "object") {
						hash = (hash * 31 + Math.round((entry.close ?? 0) * 100)) >>> 0;
					}
				}
			}
		}
	}
	return String(hash);
}
