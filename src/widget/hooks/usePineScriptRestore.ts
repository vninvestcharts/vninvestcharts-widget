import { useEffect, useState } from "react";

import { readStoredScripts } from "./useScriptPersistence";
import { getPineScriptAdapter } from "../../lib/pinescript/adapter";

/**
 * Re-registers saved Pine scripts at WIDGET mount (plan item 1.6b).
 *
 * WHY THIS IS NOT IN THE PANEL. `PineEditorPanel` is `lazy()`-loaded, so a restore living there
 * only runs when the user opens the Pine tab. After a plain page reload the plugin registry is
 * empty while the persisted pane layout still names `pine_<scriptId>`; the tier gate then drops
 * those series as unregistered and they stay invisible until something unrelated recomputes the
 * panes. The independent code audit found this — the E2E could not, because the demo opens the
 * tab and always compiles.
 *
 * WHY A VERSION COUNTER. `renderPanes` is memoised on `[resolvedPanes, seriesTierGate]`, and the
 * registry is a module-level Map — mutating it does not invalidate any memo. So registration alone
 * is not enough: the gate must be recomputed once afterwards. Returning a counter and feeding it
 * into that memo's deps makes the second pass explicit instead of accidental.
 *
 * The counter only moves when something was actually restored, so a steady state costs no
 * re-renders. `restorePineScripts` is idempotent (Map writes), so the double-invoke React
 * StrictMode guarantees on mount is harmless.
 *
 * WHY THE IMPORT IS DYNAMIC
 * -------------------------
 * `VNInvestCharts.tsx` imports this hook statically, so a static import of `scriptRegistry` here
 * pulled the whole PineScript compiler (`compile.ts`, `grammar.ts`, `pineBuiltins.ts`, peggy, …)
 * into the ESM entry's static graph for EVERY consumer — Free users included. The dynamic import
 * below keeps it in a separate chunk that a Free layout never asks for.
 *
 * The guard at `types.length === 0` is what makes that safe, and it runs BEFORE the import: a
 * layout with no `pine_*` series never touches the chunk. Note the list is deliberately NOT tier
 * filtered (`VNInvestCharts.tsx:417-419`), so a downgraded user whose saved layout still names a
 * pine series WILL fetch the chunk — by design, because the tier gate, not the fetch, decides
 * visibility.
 *
 * ORDERING: the import makes this effect asynchronous, so restore can land after `useWidgetData`
 * has already computed values. `pineRestoreVersion` therefore also invalidates the canonical
 * series store (see `useWidgetData.ts`), which is what makes a late restore actually correct
 * instead of leaving cached `undefined` series values behind.
 *
 * @param wantedTypes Pine series types currently referenced by the pane layout.
 * @returns a monotonically increasing version, to be used as a memo dependency.
 */
export function usePineScriptRestore(wantedTypes: readonly string[]): number {
	const [version, setVersion] = useState(0);
	// Serialised so a caller passing a freshly-built array does not retrigger every render.
	const signature = wantedTypes.join("|");

	useEffect(() => {
		const types = signature ? signature.split("|") : [];
		if (types.length === 0) return;
		// Fail-closed (Rule 15): a chunk that fails to load leaves the version untouched so the
		// tier gate keeps the series unregistered, rather than surfacing a half-loaded editor.
		let cancelled = false;
		// Fast path (open-core split): a Pro host registers the pinescript module at
		// startup via setPineScriptAdapter(), so restore is synchronous and lands
		// before first paint. Otherwise fall back to the lazy chunk (Free layouts
		// with no pine_* series never reach here — see the types.length guard).
		const adapter = getPineScriptAdapter();
		if (adapter) {
			try {
				const restored = (adapter.restorePineScripts as (s: unknown, t: string[]) => unknown[])(readStoredScripts(), types);
				if (restored.length > 0) setVersion((v) => v + 1);
			} catch {
				// Fail-closed: leave the version untouched (same contract as below).
			}
			return () => {
				cancelled = true;
			};
		}
		void import("@vninvestcharts/widget-pro")
			.then((pro) => {
				if (cancelled) return;
				const restored = (pro.restorePineScripts as (s: unknown, t: string[]) => unknown[])(readStoredScripts(), types);
				if (restored.length > 0) setVersion((v) => v + 1);
			})
			.catch(() => {
				// Fail-closed (Rule 15): if the chunk cannot load, leave the version untouched so the
				// tier gate keeps dropping the series. Silently, because a chart that cannot fetch its
				// own chunk has no user-facing action to offer — surfacing an error here would replace
				// the whole workspace, since the nearest boundary is the multi-chart grid.
			});
		return () => {
			cancelled = true;
		};
	}, [signature]);

	return version;
}