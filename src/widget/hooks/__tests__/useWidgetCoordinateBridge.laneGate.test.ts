import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChartScaleAdapter } from "../../runtime/ChartScaleAdapter";
import { useWidgetCoordinateBridge } from "../useWidgetCoordinateBridge";
import type { UseWidgetCoordinateBridgeOptions } from "../useWidgetCoordinateBridge";

/**
 * G2 (2026-10-03) - of the three legacy memos, exactly one is gate-able.
 *
 * Plan v5 G2.1 proposed gating all three on the lane. Two of them turned out to be
 * read on fork as well, and gating them broke 135 tests:
 *   - legacyChartScale      read at VNInvestCharts.tsx:1378-1388, outside the legacy JSX
 *   - legacyCoordinateBridge  handed to useChartImperativeHandle, which is fork-reachable
 * Both are therefore left running on both lanes, with a comment saying why.
 *
 * legacyPaneSnapshots is genuinely lane-only: useForkRuntime.ts:616 picks it with a
 * `useForkRuntime ? paneSnapshots : legacyPaneSnapshots` ternary, and its JSX uses sit
 * inside the DynamicChart branch. That one is gated, and this test holds the gate.
 *
 * The assertion is on the adapter seam rather than on a return value, because
 * "returns a cheap default" and "never called the builder" are different claims
 * and only the second one is the win.
 *
 * ── CORRECTION 2026-10-05: the justification above is STALE ──────────────────────────
 * The two claims cited as the reason `legacyChartScale` and `legacyCoordinateBridge`
 * must keep running on fork no longer hold, and this file repeated them:
 *
 *   - `VNInvestCharts.tsx:1378-1388` is inside `handleLegacyVisibleDomainChange`, declared
 *     at `:1383`. That identifier occurs **exactly once** in the file — it is declared and
 *     never referenced, so the reads of `legacyChartScale.usesDiscontinuousScale`, `.data`
 *     and `.xAccessor` at `:1384`/`:1386` are unreachable.
 *   - `useForkRuntime.ts:276` destructures `legacyChartScale` into the hook's parameters
 *     and **never reads it** (its only other occurrence is the type at `:157`).
 *
 * So `legacyChartScale` currently has **zero live readers**. The memos are left ungated
 * anyway — G2.1's finding that gating them broke 135 tests still stands, and ungating is
 * not this slice's business — but the *reason* recorded here was wrong, and a wrong reason
 * is how the next agent "fixes" a gate that is not broken.
 *
 * What the flag actually reaches is measured in the block at the bottom of this file.
 */

// Module scope, not inside a describe: the AC-2 block at the bottom reuses this fixture with
// stable values, and it was unreachable while the helper lived in the first describe's closure
// (`ReferenceError: makeOptions is not defined`). Hoisting it changes no existing assertion.
//
// One cast for the whole fixture. The options object is ~40 fields and only three
// of them drive the code under test, so typing each stub separately buries the
// assertions under casts and hides which fields actually matter.
function makeOptions(overrides: Record<string, unknown> = {}): UseWidgetCoordinateBridgeOptions {
	const datum = { date: new Date("2026-01-01T00:00:00Z"), open: 1, high: 2, low: 0, close: 1.5, volume: 10 };
	return {
		useForkRuntime: true,
		plotData: [datum, { ...datum, date: new Date("2026-01-02T00:00:00Z") }],
		enrichedData: [datum, { ...datum, date: new Date("2026-01-02T00:00:00Z") }],
		bars: [],
		visiblePanes: [],
		size: { width: 800, height: 400 },
		scaleSlotDomains: {},
		activeHeights: [400],
		forkEngineInstance: null,
		forkVisibleRange: null,
		setForkVisibleRange: vi.fn(),
		forkVisibleRangeRef: { current: null },
		forkPaneSnapshotsRef: { current: [] },
		paneSnapshots: [],
		setPaneSnapshots: vi.fn(),
		snapshotRevision: 0,
		incrementSnapshotRevision: vi.fn(),
		legacyVisibleRange: null,
		setLegacyVisibleRange: vi.fn(),
		onCoordinateBridgeChange: undefined,
		onPaneSnapshotsChange: undefined,
		onVisibleDomainChange: undefined,
		onVisibleRangeChange: undefined,
		controlledXExtents: undefined,
		internalXExtents: undefined,
		setInternalXExtents: vi.fn(),
		symbol: "TEST",
		localRange: undefined,
		showNonTradingDays: false,
		chartSurfaceReady: true,
		resolvedRuntime: "fork",
		pendingForkVisibleRangeRef: { current: null },
		pendingForkVisibleRangeRafRef: { current: null },
		lastStableForkSpanRef: { current: null },
		pendingHistoryPatchRef: { current: null },
		lastEmittedPaneSnapshotsRef: { current: [] },
		lastPaneSnapshotsSubscriberRef: { current: undefined },
		resolvedLegacyVisibleRangeRef: { current: null },
		engineInstanceRef: { current: null },
		storageAdapter: undefined,
		...overrides,
	} as unknown as UseWidgetCoordinateBridgeOptions;
}

describe("useWidgetCoordinateBridge - legacyPaneSnapshots is gated on the lane", () => {
	const spies = {
		getChartScale: vi.spyOn(ChartScaleAdapter.prototype, "getChartScale"),
		buildPaneSnapshots: vi.spyOn(ChartScaleAdapter.prototype, "buildPaneSnapshots"),
		createCoordinateBridge: vi.spyOn(ChartScaleAdapter.prototype, "createCoordinateBridge"),
	};

	beforeEach(() => {
		for (const s of Object.values(spies)) s.mockClear();
	});

	it("does not build legacy pane snapshots while on fork", () => {
		renderHook(() => useWidgetCoordinateBridge(makeOptions({ useForkRuntime: true })));

		expect(spies.buildPaneSnapshots).not.toHaveBeenCalled();
	});

	it("still builds them on the legacy lane - the gate must not disable the lane", () => {
		renderHook(() => useWidgetCoordinateBridge(makeOptions({ useForkRuntime: false })));

		expect(spies.buildPaneSnapshots).toHaveBeenCalled();
	});

	it("re-rendering on fork never re-runs the builder", () => {
		const { rerender } = renderHook(() => useWidgetCoordinateBridge(makeOptions({ useForkRuntime: true })));
		rerender();
		rerender();

		expect(spies.buildPaneSnapshots).not.toHaveBeenCalled();
	});

	it("keeps legacyPaneSnapshots referentially stable on fork", () => {
		// The legacy/fork handover effect lists legacyPaneSnapshots in its dependency
		// array. A fresh [] per render would re-fire that effect every frame, which
		// is the regression this module-level constant exists to prevent.
		const { result, rerender } = renderHook(() =>
			useWidgetCoordinateBridge(makeOptions({ useForkRuntime: true })),
		);
		const first = result.current.legacyPaneSnapshots;
		act(() => {
			rerender();
		});

		expect(result.current.legacyPaneSnapshots).toBe(first);
		expect(result.current.legacyPaneSnapshots).toHaveLength(0);
	});

	it("still produces the other two legacy values on fork, because the memos are not gated", () => {
		// Regression lock for the 135 failures: these must NOT be nulled on fork.
		// The original justification cited `useForkRuntime.ts:616` and
		// `VNInvestCharts.tsx:1378` as the reason they are needed. Both are now known to be
		// wrong — see the CORRECTION block in this file's header — so what actually holds this
		// lock is the 135-test regression, not a live reader.
		renderHook(() => useWidgetCoordinateBridge(makeOptions({ useForkRuntime: true })));

		expect(spies.getChartScale).toHaveBeenCalled();
		expect(spies.createCoordinateBridge).toHaveBeenCalled();
	});
});

/**
 * AC-2: `showNonTradingDays` reaches the scale memo and does NOT reach the render-context memo.
 *
 * This is the behavioural lock behind the G3 deferral (`G3_DEFER_GATE_HARDEN_B2_2026-10-05` D1):
 * the flag cannot move a pixel, because the fork render context is memoised without it.
 *
 * Three things this test must get right, all three of which were gotten wrong in earlier
 * revisions of the plan — the first version was a tautology, the second was `expect(null).toBe(null)`:
 *
 *  1. **The value must exist.** `createForkChartRenderContextValue` guards on
 *     `paneSnapshots.length === 0` and on `normalizeEngineVisibleRange`, and returns `null`
 *     otherwise. So the fixture supplies one real snapshot and a non-null `forkVisibleRange`.
 *  2. **The inputs must be stable across the rerender.** The fork memo's deps are
 *     `[paneSnapshots, plotData, size.height, size.width, snapshotRevision, forkVisibleRange,
 *     forkEngineInstance]` (`useWidgetCoordinateBridge.ts:241`). `useMemo` preserves identity
 *     only when every dep is `Object.is`-stable, so the arrays are built ONCE outside the render
 *     callback and passed through `initialProps`. Building them inside the callback — as
 *     `makeOptions` does — re-fires the memo for reasons unrelated to the flag, and the test
 *     could no longer tell flag-dependence from fixture instability.
 *  3. **The flag really is in the other memo.** `legacyChartScale`'s deps at `:159` include
 *     `showNonTradingDays`, so flipping it must change that identity. Asserting the negative
 *     case alone would pass even if the flag were deleted from the dependency array.
 */
describe("useWidgetCoordinateBridge - showNonTradingDays reaches the scale memo, not the render context", () => {
	const PLOT = { top: 0, left: 0, width: 1000, height: 600 };

	// Built once, module-scope within this describe, so identity survives every rerender.
	const STABLE_PLOT_DATA = [
		{ date: new Date("2026-09-18T00:00:00Z"), open: 1, high: 2, low: 0, close: 1.5, volume: 10 },
		{ date: new Date("2026-09-21T00:00:00Z"), open: 1, high: 2, low: 0, close: 1.6, volume: 10 },
		{ date: new Date("2026-09-22T00:00:00Z"), open: 1, high: 2, low: 0, close: 1.7, volume: 10 },
		{ date: new Date("2026-09-23T00:00:00Z"), open: 1, high: 2, low: 0, close: 1.8, volume: 10 },
	];

	// side / mode / visible / domain are the four fields resolvePreferredScaleSlotId reads, and
	// the third guard leg of createForkChartRenderContextValue is `!primaryScaleSlotId`.
	const STABLE_PANE_SNAPSHOTS = [
		{
			paneId: "price",
			bounds: PLOT,
			plotBounds: PLOT,
			axisBounds: {},
			scaleSlotBounds: { "price-right": PLOT },
			scaleSlotStates: {
				"price-right": { side: "right", mode: "auto", visible: true, domain: [1, 2] },
			},
			headerAnchor: { top: 0, left: 0, width: 1000 },
			labelAnchor: { top: 0, left: 0, height: 20 },
		},
	];

	const STABLE_SIZE = { width: 1000, height: 600 };
	const STABLE_RANGE = { from: 0, to: 4 };

	function stableOptions(showNonTradingDays: boolean): UseWidgetCoordinateBridgeOptions {
		return {
			...makeOptions({
				useForkRuntime: true,
				plotData: STABLE_PLOT_DATA,
				enrichedData: STABLE_PLOT_DATA,
				paneSnapshots: STABLE_PANE_SNAPSHOTS,
				forkVisibleRange: STABLE_RANGE,
				size: STABLE_SIZE,
			}),
			showNonTradingDays,
		};
	}

	it("changes the scale identity but leaves the render context referentially identical", () => {
		const { result, rerender } = renderHook(
			({ showNonTradingDays }: { showNonTradingDays: boolean }) =>
				useWidgetCoordinateBridge(stableOptions(showNonTradingDays)),
			{ initialProps: { showNonTradingDays: false } },
		);

		// (1) The value must exist — without this, (3) below is `null === null` and passes for
		// the wrong reason. This assertion is the whole reason the fixture is built this way.
		const firstContext = result.current.forkChartRenderContextValue;
		expect(firstContext).not.toBeNull();
		expect(firstContext).toBeTruthy();

		const firstScale = result.current.legacyChartScale;
		expect(firstScale).toBeTruthy();

		rerender({ showNonTradingDays: true });

		// (3a) The flag IS in the scale memo's deps (`:159`), so the identity must change.
		// If this ever fails, the flag stopped reaching the scale and (3b) proves nothing.
		expect(result.current.legacyChartScale).not.toBe(firstScale);
		expect(result.current.legacyChartScale.usesDiscontinuousScale).toBe(false);

		// (3b) The flag is NOT in the render-context memo's deps (`:241`), so the identity must
		// NOT change — the same object, with the same pixel functions.
		expect(result.current.forkChartRenderContextValue).toBe(firstContext);

		// And the pixels are literally the same numbers, not merely a shared reference.
		const after = result.current.forkChartRenderContextValue!;
		expect([0, 1, 2, 3].map((i) => after.xScaleByIndex!(i))).toEqual([125, 375, 625, 875]);
	});

	it("keeps the render context stable across a plain rerender too (control for fixture drift)", () => {
		// If this fails, the identity stability in the case above is a property of the harness
		// rather than of the dependency array, and the real lock proves nothing.
		const { result, rerender } = renderHook(
			({ showNonTradingDays }: { showNonTradingDays: boolean }) =>
				useWidgetCoordinateBridge(stableOptions(showNonTradingDays)),
			{ initialProps: { showNonTradingDays: false } },
		);
		expect(result.current.forkChartRenderContextValue).not.toBeNull();
		const first = result.current.forkChartRenderContextValue;
		rerender({ showNonTradingDays: false });
		expect(result.current.forkChartRenderContextValue).toBe(first);
	});
});