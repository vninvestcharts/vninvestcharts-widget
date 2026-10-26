import { filterAvailableSeries } from "./registryCore";
import type { SeriesTier } from "./registryCore";
import type { PaneDescriptor } from "../types/pane-descriptor";

/**
 * Tier render gate for ALL series types (PINE STAGE 2 item W-01).
 *
 * WHAT IT GATES. Every series in every pane passes through `filterAvailableSeries`
 * (registryCore.ts:232-243) — built-ins and Pine-generated alike. Unregistered types
 * fail closed inside it (catch → dropped), which is what keeps the tooltip path from
 * throwing `SeriesRegistry: unknown type` on an orphan `pine_*` id after a browser
 * restart, or after `importScript` mints a new script id (`useScriptPersistence.ts:124`)
 * and orphans every `pine_<oldId>`.
 *
 * WHY NOT Pine-only (the Stage 1 shape). Stage 1 item 1.7 gated only runtime-generated
 * Pine types and left the 9 paid BUILT-IN types ungated: Baseline, Renko, Kagi,
 * PointAndFigure, LineBreak, MarketProfile, VolumeProfile (pro) + Footprint,
 * DeltaProfile (enterprise). PROBE A measured 77 registered types = 68 free / 7 pro /
 * 2 enterprise, and PROBE B showed `filterPanesBySeriesTier(panes_with_all_9, "free")`
 * keeping 10/10 by identity — the render gate deleted in `c38ccae` (2026-10-03, "cut
 * the legacy lane") was never restored for built-ins (`DynamicChart.tsx:1281` used to
 * call `filterAvailableSeries` before the cut). This function IS that restoration.
 *
 * WHO LOSES WHAT (PROBE C — measured, not feared). After this gate: pro keeps 7/7,
 * enterprise keeps 9/9, free loses exactly the 9 paid types. The old docblock's fear
 * ("strip up to 9 chart types from paying customers") is wrong about pro/enterprise —
 * only Free loses anything, and Free was never entitled to paid types (Rule 15), so no
 * paying customer needs any notice. Locked in by `builtInSeriesTierGate.test.ts`.
 *
 * WHY THE GATE LIVES HERE (unchanged from Stage 1). Gating at `resolvedPanes`
 * (VNInvestCharts.tsx:351) is not possible: that memo's body finishes at :404, while
 * `effectiveToolbarTier` does not exist until :713 — reading the tier there is a TDZ
 * error (:315 already warns about this). So the widget derives `renderPanes` AFTER the
 * tier is known (VNInvestCharts.tsx:822-828) and feeds THAT to the engine
 * (`forkEnginePanes`, VNInvestCharts.tsx:1230). `resolvedPanes` itself stays UNFILTERED
 * so the settings composer can still show a locked series as an upgrade prompt.
 *
 * SHAPE CONTRACT: the returned array has the SAME LENGTH as the input. `paneDescriptorBridge.ts`
 * maps pane descriptors to engine pane specs 1:1, so dropping a pane here would shift every
 * downstream index. A pane whose series are all locked becomes `{...pane, series: []}`.
 * When nothing is dropped the INPUT array is returned by identity, so the memo upstream
 * never invalidates on a no-op pass (no Pine pre-check is needed: refs are preserved,
 * not rebuilt).
 */
export function filterPanesBySeriesTier(
	panes: readonly PaneDescriptor[] | undefined,
	currentTier: SeriesTier,
): readonly PaneDescriptor[] {
	if (!panes || panes.length === 0) return panes ?? [];

	let changed = false;
	const next: PaneDescriptor[] = new Array(panes.length);

	for (let i = 0; i < panes.length; i += 1) {
		const pane = panes[i];
		const series = pane.series ?? [];

		// Every series is re-judged here — built-ins and Pine alike. Unregistered
		// Pine types fail `getSeriesTier` inside `filterAvailableSeries`, which
		// catches and returns false -> dropped. That is the fail-closed behaviour
		// that keeps the tooltip path from throwing on an orphan id.
		const kept = filterAvailableSeries(series, currentTier);

		if (kept.length === series.length) {
			next[i] = pane;
			continue;
		}

		changed = true;
		next[i] = { ...pane, series: kept };
	}

	return changed ? next : panes;
}