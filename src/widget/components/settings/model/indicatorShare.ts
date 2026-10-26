/**
 * Indicator cross-chart share (explicit "apply to all" only).
 *
 * v1 scope: indicator SERIES (never symbols/timeframes/layout). Price-pane main
 * series (series[0]), compare overlays (overlaySymbolId) and derived-on-derived
 * series (sourceType indicator, unresolvable cross-chart) are never shared.
 * Shared copies drop identity + data-source bindings so targets compute from
 * their own bars (same minimal shape the composer writes).
 */
import type { PaneDescriptor, SeriesConfig } from "../../../../lib/core/types/pane-descriptor";

export const INDICATORS_SHARE_EVENT = "vnsc-indicators-share";

export interface SharedIndicator {
	paneId: string;
	paneLabel: string;
	series: SeriesConfig;
}

export interface IndicatorsShareDetail {
	sourceChartId: string | null;
	indicators: SharedIndicator[];
}

function seriesKey(s: { type: string; params?: Record<string, unknown> }): string {
	return `${s.type}::${JSON.stringify(s.params ?? {})}`;
}

/** Collect shareable indicator series with pane attribution (pure, no mutation). */
export function extractShareableIndicators(panes: readonly PaneDescriptor[]): SharedIndicator[] {
	const out: SharedIndicator[] = [];
	for (const pane of panes) {
		pane.series.forEach((s, index) => {
			if (pane.id === "price" && index === 0) return; // main symbol series (append-only invariant)
			const rec = s as unknown as Record<string, unknown>;
			if (rec["overlaySymbolId"]) return; // compare overlays stay per-chart (COMPARE_ISOLATION_FIX)
			if (rec["sourceType"] === "indicator") return; // derived-on-derived: unresolvable cross-chart
			const { id: _droppedId, sourceType: _droppedST, sourceId: _droppedSI, sourceKey: _droppedSK, ...rest } = rec;
			void _droppedId; void _droppedST; void _droppedSI; void _droppedSK;
			out.push({ paneId: pane.id, paneLabel: pane.label, series: rest as unknown as SeriesConfig });
		});
	}
	return out;
}

/**
 * Merge shared indicators into a target layout (pure, no mutation).
 * Returns the ORIGINAL array reference when nothing was added (no-op signal).
 * Never touches the target price-pane main series; creates missing non-price
 * panes as visible shells (heightRatio 0.15 matches volume-class panes).
 */
export function mergeIndicatorsIntoLayout(
	panes: readonly PaneDescriptor[],
	indicators: readonly SharedIndicator[]
): readonly PaneDescriptor[] {
	if (indicators.length === 0) return panes;
	const next: PaneDescriptor[] = panes.map((p) => ({ ...p, series: [...p.series] }));
	let changed = false;
	for (const entry of indicators) {
		let pane = next.find((p) => p.id === entry.paneId);
		if (!pane) {
			if (entry.paneId === "price") continue; // price pane pinned: never recreate
			pane = {
				id: entry.paneId,
				label: entry.paneLabel,
				pinned: false,
				visible: true,
				heightRatio: 0.15,
				series: [],
				splitScale: false,
				tooltip: "value",
			} as PaneDescriptor;
			next.push(pane);
			changed = true;
		}
		const key = seriesKey(entry.series as { type: string; params?: Record<string, unknown> });
		const exists = pane.series.some(
			(s, index) => !(pane!.id === "price" && index === 0)
				&& `${s.type}::${JSON.stringify(s.params ?? {})}` === key
		);
		if (!exists) {
			pane.series.push({ ...entry.series });
			changed = true;
		}
	}
	return changed ? next : panes;
}
