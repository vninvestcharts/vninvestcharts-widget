import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { createElement, useMemo } from "react";

import { usePineScriptRestore } from "../usePineScriptRestore";
import { scriptChecksum } from "../useScriptPersistence";
import { filterPanesBySeriesTier } from "../../../lib/core/registry/filterPanesBySeriesTier";
import { getSeries } from "../../../lib/core/registry/registryCore";
import { pineSeriesTypeFor } from "../../../lib/core/seriesValueResolver";
import type { PaneDescriptor, SeriesTypeId } from "../../../lib/core/types/pane-descriptor";

/**
 * MAJOR-3 of the independent code audit: `pineRestore.test.ts` proved the REGISTRY works, which is
 * exactly where the blocker was not. The defect was on the RENDER side — the tier gate reads a
 * module-level Map, so registering a script does not invalidate the memo that decides which panes
 * render. A saved series therefore stayed dropped after a reload until something unrelated
 * changed the panes.
 *
 * The observable asserted here is the sequence a user experiences:
 *   load -> first pass drops the unregistered series -> restore registers it ->
 *   the gate RE-EVALUATES and the series comes back.
 *
 * Each test uses its OWN script id. `registerSeries` writes into a module-level registry that
 * nothing resets between tests, so reusing one id would make a later test's "before" precondition
 * silently pass for the wrong reason — which is precisely the failure the first draft of this
 * file had.
 */

const SCRIPT = `study("reload probe", overlay=true)
val = ta.sma(close, 3)
plot(val)`;

/**
 * `usePineScriptRestore` loads `scriptRegistry` through a dynamic `import()` (BL-15, so the
 * PineScript compiler leaves the static graph). Restore therefore settles asynchronously, and
 * the wait is NOT a fixed number of microtask turns: the chunk still has to be transformed and
 * evaluated, and `scriptRegistry` pulls in `compile.ts` → peggy, so resolution takes real wall
 * clock time in the Vitest transform pipeline. A fixed flush count passes on a warm cache and
 * would be a cold-cache flake — the `P3-07` failure mode this repo has already paid for once.
 *
 * Polls the OBSERVABLE (is the registry populated yet?) rather than a proxy, so the assertions
 * that follow stay honest and the wait cannot accidentally assert the thing under test.
 *
 * Each poll runs inside `act`, so the `setVersion` that follows the chunk resolving is flushed as
 * a React update rather than leaking an "update was not wrapped in act(...)" warning.
 */
async function settleRestore(isReady: () => boolean): Promise<void> {
	await vi.waitFor(() => {
		act(() => {});
		expect(isReady()).toBe(true);
	}, { timeout: 10000, interval: 25 });
}

/** "the series is registered" as a boolean, without letting getSeries throw. */
function isRegistered(type: SeriesTypeId): boolean {
	return gateBeforeRestore(type) === 1;
}

function seedStoredScript(id: string, source: string) {
	// The real key is `vn._scripts` (useScriptPersistence.ts:3). Guessing it in a first draft of
	// this test produced a silently empty store and three red tests — that failure was mine, not
	// the restore path's.
	localStorage.setItem(
		"vn._scripts",
		JSON.stringify({
			formatVersion: 1,
			scripts: {
				[id]: {
					id,
					name: id,
					source,
					created: "2024-01-01T00:00:00.000Z",
					lastModified: "2024-01-01T00:00:00.000Z",
					integrity: { checksum: scriptChecksum(source), sourceLength: source.length },
				},
			},
			lastActiveId: id,
		}),
	);
}

/** Mirrors the `VNInvestCharts` composition: restore version feeds the gated-panes memo. */
function Host({ types }: { types: readonly string[] }) {
	const version = usePineScriptRestore(types);
	const pane = {
		id: "price",
		label: "Price",
		pinned: true,
		visible: true,
		heightRatio: 1,
		series: [{ id: types[0], type: types[0], yAxis: "right" }],
		splitScale: false,
		tooltip: "ohlc",
	} as unknown as PaneDescriptor;
	const gated = filterPanesBySeriesTier([pane], "pro");
	return createElement("div", {
		"data-testid": "host",
		"data-version": String(version),
		"data-series": gated[0].series.length,
	});
}

/** The gate as it behaves BEFORE anything is registered — the browser's state on first paint. */
function gateBeforeRestore(type: SeriesTypeId): number {
	return filterPanesBySeriesTier(
		[{ id: "price", series: [{ id: type, type, yAxis: "right" }] } as PaneDescriptor],
		"pro",
	)[0].series.length;
}

describe("G-PINE-RESTORE (render side): a saved series comes back after a reload", () => {
	it("B-1: dropped on the first pass, present once the restore version re-evaluates the gate", async () => {
		const id = "pine_reloadprobe1";
		const type = pineSeriesTypeFor(id) as SeriesTypeId;
		localStorage.clear();
		seedStoredScript(id, SCRIPT);

		// Precondition, asserted rather than assumed: this id has never been registered, which is
		// exactly the state a browser is in immediately after loading the page.
		expect(gateBeforeRestore(type)).toBe(0);

		act(() => {
			render(createElement(Host, { types: [type] }));
		});
		await settleRestore(() => isRegistered(type));
		const host = document.querySelector('[data-testid="host"]') as HTMLElement;

		expect(Number(host.getAttribute("data-version")), "the restore version must advance").toBeGreaterThan(0);
		expect(Number(host.getAttribute("data-series")), "the gate must re-evaluate and keep the series").toBe(1);
		expect(getSeries(type).tier).toBe("pro");
	});

	it("B-1b: the recompute comes from the restore version, not from an incidental re-render", async () => {
		const id = "pine_reloadprobe2";
		const type = pineSeriesTypeFor(id) as SeriesTypeId;
		localStorage.clear();
		seedStoredScript(id, SCRIPT);

		// The PRE-FIX shape: same hook, but the panes memo is NOT given the returned version, so
		// re-rendering on restore cannot invalidate it. This must reproduce the defect — a real
		// `useMemo` is essential here; computing the gate inline in the render body would
		// recompute every render and make this control vacuously green.
		function PinnedHost() {
			usePineScriptRestore([type]);
			const pane = useMemo(
				() =>
					({
						id: "price",
						series: [{ id: type, type, yAxis: "right" }],
					}) as unknown as PaneDescriptor,
				[],
			);
			const gated = useMemo(() => filterPanesBySeriesTier([pane], "pro"), [pane]);
			return createElement("div", { "data-testid": "pinned", "data-series": gated[0].series.length });
		}

		act(() => {
			render(createElement(PinnedHost));
		});
		await settleRestore(() => isRegistered(type));
		const pinned = document.querySelector('[data-testid="pinned"]') as HTMLElement;
		// The registry IS populated after the effect ran...
		expect(gateBeforeRestore(type), "registry is populated, so a fresh gate call sees it").toBe(1);
		// ...but the pinned memo never recomputed, so the rendered output is still the stale "dropped"
		// answer. That is exactly the blocker: a saved series invisible after a plain reload.
		expect(Number(pinned.getAttribute("data-series")), "pinned composition stays on its stale value").toBe(0);

		// And the fixed shape, side by side, disagrees — which is what makes this a control.
		act(() => {
			render(createElement(Host, { types: [type] }));
		});
		await settleRestore(() => isRegistered(type));
		const fixed = document.querySelector('[data-testid="host"]') as HTMLElement;
		expect(Number(fixed.getAttribute("data-series")), "the version-fed composition catches up").toBe(1);
	});

	it("does nothing when the layout references no Pine type", () => {
		const id = "pine_reloadprobe3";
		localStorage.clear();
		seedStoredScript(id, SCRIPT);

		act(() => {
			render(createElement(Host, { types: [] }));
		});
		const host = document.querySelector('[data-testid="host"]') as HTMLElement;
		expect(Number(host.getAttribute("data-version")), "no wanted types means no restore work").toBe(0);
		expect(gateBeforeRestore(pineSeriesTypeFor(id) as SeriesTypeId)).toBe(0);
	});

	it("is idempotent across a StrictMode-style double mount", async () => {
		const id = "pine_reloadprobe4";
		const type = pineSeriesTypeFor(id) as SeriesTypeId;
		localStorage.clear();
		seedStoredScript(id, SCRIPT);

		act(() => {
			render(createElement(Host, { types: [type] }));
		});
		await settleRestore(() => isRegistered(type));
		act(() => {
			render(createElement(Host, { types: [type] }));
		});
		await settleRestore(() => isRegistered(type));
		// Registration is a Map write, so a double mount cannot create a second series entry — which
		// is what makes `removeSeries(paneId, seriesType, seriesIndex?)` unambiguous.
		expect(getSeries(type).tier).toBe("pro");
		const host = document.querySelector('[data-testid="host"]') as HTMLElement;
		expect(Number(host.getAttribute("data-series"))).toBe(1);
	});
});