/**
 * useComparisonState per-chart isolation (regression: compare symbols leaked to
 * every chart via a single shared localStorage key).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { act, createElement } from "react";
import { useComparisonState, comparisonSeriesId, type UseComparisonStateResult } from "../useComparisonState";
import {
	clearSeriesStyleOverrides,
	listSeriesStyleOverrides,
} from "../../../lib/core/registry/SeriesRegistry";

function mountHook(storageId?: string | null): { api: () => UseComparisonStateResult; unmount: () => void } {
	let latest: UseComparisonStateResult | null = null;
	function Harness() {
		latest = useComparisonState(storageId);
		return null;
	}
	const rendered = render(createElement(Harness));
	return {
		api: () => {
			if (!latest) throw new Error("hook did not run");
			return latest;
		},
		unmount: rendered.unmount,
	};
}

/**
 * Mount once, then move the hook to a different storageId without remounting.
 *
 * A remount would not exercise this: it would rebuild state from scratch, which is
 * exactly what a correct implementation is allowed to do. The failure mode only
 * appears on a hook that stays mounted while its storageId changes.
 */
function mountRemountable(initialId?: string | null): {
	api: () => UseComparisonStateResult;
	setId: (next: string | null) => void;
	unmount: () => void;
} {
	let latest: UseComparisonStateResult | null = null;
	let currentId = initialId;
	function Harness() {
		latest = useComparisonState(currentId);
		return null;
	}
	const rendered = render(createElement(Harness));
	return {
		api: () => {
			if (!latest) throw new Error("hook did not run");
			return latest;
		},
		setId: (next: string | null) => {
			act(() => {
				currentId = next;
				rendered.rerender(createElement(Harness));
			});
		},
		unmount: rendered.unmount,
	};
}

beforeEach(() => {
	cleanup();
	localStorage.clear();
});

describe("useComparisonState per-chart isolation", () => {
	it("T1: chart mounted after another chart saved sees NO symbols (the reported bug)", () => {
		const chartA = mountHook("chart-a");
		act(() => { chartA.api().addSymbol("AAA"); });
		expect(chartA.api().overlays.map((o) => o.symbolId)).toEqual(["AAA"]);
		chartA.unmount();
		// Fresh mount = new chart cell / remount after solo toggle / reload-time init.
		const chartB = mountHook("chart-b");
		expect(chartB.api().overlays).toEqual([]);
		chartB.unmount();
	});

	it("T2: same chartId remount retains its own symbols (persistence kept)", () => {
		const first = mountHook("chart-a");
		act(() => { first.api().addSymbol("AAA"); });
		first.unmount();
		const second = mountHook("chart-a");
		expect(second.api().overlays.map((o) => o.symbolId)).toEqual(["AAA"]);
		second.unmount();
	});

	it("T3: no chartId keeps legacy shared-key behavior (single-chart compat)", () => {
		const first = mountHook(null);
		act(() => { first.api().addSymbol("AAA"); });
		first.unmount();
		const second = mountHook(undefined);
		expect(second.api().overlays.map((o) => o.symbolId)).toEqual(["AAA"]);
		second.unmount();
	});

	it("T4: removeSymbol on one chart never touches another chart's key", () => {
		const chartA = mountHook("chart-a");
		const chartB = mountHook("chart-b");
		act(() => { chartB.api().addSymbol("BBB"); });
		act(() => { chartA.api().addSymbol("AAA"); });
		act(() => { chartA.api().removeSymbol("AAA"); });
		chartA.unmount();
		expect(chartB.api().overlays.map((o) => o.symbolId)).toEqual(["BBB"]);
		chartB.unmount();
		const freshB = mountHook("chart-b");
		expect(freshB.api().overlays.map((o) => o.symbolId)).toEqual(["BBB"]);
		freshB.unmount();
	});

	// AUD-08. The cases above all isolate *localStorage*, via storageKeyFor(storageId).
	// The registry key was a different story: `overlaySeriesId` ignored storageId and
	// returned `compare-<symbolId>`, so two charts comparing the same symbol wrote to
	// one module-level Map entry. Chart B calling removeSymbol cleared chart A's style

	// ---------------------------------------------------------------------
	// W-18: comparison overlays must not live in the global style registry.
	// ---------------------------------------------------------------------
	//
	// Five audit rounds converged here. The series-style registry is process-wide; comparison
	// overlays are per-chart. Writing them in meant:
	//   F1  two charts colliding on one registry key
	//   F2  one chart removing an overlay clearing the sibling style
	//   N1  paneScaleSlotDomains.ts:38 - the one production reader - consulting that shared
	//       value for Y-axis inclusion, so a sibling toggle pulled this chart overlay off
	//       this chart axis. Measured: domain [49,51] -> undefined.
	//
	// Rendering never read the registry, and these overlays are already persisted per chart
	// by saveOverlays, so nothing is lost by staying out of it. These tests assert the
	// outcome a user sees - independence between charts - rather than which store was written,
	// because the previous eleven tests asserted the store and so passed for the wrong reason.
	describe("comparison overlays stay out of the global registry", () => {
		beforeEach(() => {
			clearSeriesStyleOverrides();
		});

		it("W18-1: adding an overlay writes nothing into the series-style registry", () => {
			const a = mountHook(undefined);
			act(() => { a.api().addSymbol("S", { color: "#111111" }); });

			// The whole invariant in one assertion: whatever else happens, a comparison
			// overlay must never appear as a global override.
			expect(listSeriesStyleOverrides()).toEqual({});

			a.unmount();
		});

		it("W18-2: two charts with no id stay fully independent", () => {
			// Both charts omit `id`, which is the default for the public API - two embedded
			// widgets on one page is the ordinary case, not an edge case.
			const a = mountHook(undefined);
			const b = mountHook(undefined);
			act(() => {
				a.api().addSymbol("SHARED", { color: "#111111" });
				b.api().addSymbol("SHARED", { color: "#222222" });
			});

			act(() => { b.api().toggleVisibility("SHARED"); });

			// A never toggled, and A keeps its own colour and visibility. This is the
			// assertion the N1 probe used to fail on.
			expect(a.api().overlays[0].visible).toBe(true);
			expect(a.api().overlays[0].color).toBe("#111111");
			expect(b.api().overlays[0].visible).toBe(false);

			a.unmount();
			b.unmount();
		});

		it("W18-3: two charts given the SAME id stay independent", () => {
			// The case the storageId-scoped key could never express: identical ids on
			// purpose. Identity now comes from the mount, so it does not matter.
			const a = mountHook("dup");
			const b = mountHook("dup");
			act(() => {
				a.api().addSymbol("DUP", { color: "#aaaaaa" });
				b.api().addSymbol("DUP", { color: "#bbbbbb" });
			});

			act(() => { b.api().removeSymbol("DUP"); });

			expect(a.api().overlays.map((o) => o.symbolId)).toEqual(["DUP"]);
			expect(a.api().overlays[0].color).toBe("#aaaaaa");
			expect(b.api().overlays).toEqual([]);

			a.unmount();
			b.unmount();
		});

		it("W18-4: each chart gets its own series ids", () => {
			// The identity guarantee itself. paneScaleSlotDomains keys its lookup by series
			// id, so two charts sharing one would re-introduce N1 through the reader side.
			const a = mountHook(undefined);
			const b = mountHook(undefined);
			const idA = comparisonSeriesId(a.api().scope, "S");
			const idB = comparisonSeriesId(b.api().scope, "S");

			expect(idA).not.toBe(idB);

			// And stable within one chart, across re-renders, because the engine keys
			// series state on this string.
			const first = a.api().scope;
			act(() => { a.api().addSymbol("OTHER"); });
			expect(a.api().scope).toBe(first);

			a.unmount();
			b.unmount();
		});
	});
});
