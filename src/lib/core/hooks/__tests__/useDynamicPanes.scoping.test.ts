/**
 * Pane-layout storage scoping (regression: Settings add-indicator leaked to every
 * chart via one shared localStorage key — init-on-mount inherited last writer).
 */
import { describe, expect, it } from "vitest";
import { PANE_LAYOUT_STORAGE_KEY } from "../../types/pane-descriptor";
import {
	createDefaultPaneLayout,
	loadPaneLayout,
	savePaneLayout,
	scopedPaneLayoutKey,
} from "../useDynamicPanes";

function mapStorage() {
	const m = new Map<string, string>();
	return {
		getItem: (key: string) => (m.has(key) ? m.get(key)! : null),
		setItem: (key: string, value: string) => { m.set(key, value); },
		removeItem: (key: string) => { m.delete(key); },
		has: (key: string) => m.has(key),
	};
}

describe("pane layout storage scoping", () => {
	it("scopedPaneLayoutKey namespaces per chart, legacy base otherwise", () => {
		expect(scopedPaneLayoutKey("chart-1")).toBe(`${PANE_LAYOUT_STORAGE_KEY}:chart-1`);
		expect(scopedPaneLayoutKey()).toBe(PANE_LAYOUT_STORAGE_KEY);
		expect(scopedPaneLayoutKey(null)).toBe(PANE_LAYOUT_STORAGE_KEY);
		expect(scopedPaneLayoutKey("")).toBe(PANE_LAYOUT_STORAGE_KEY);
	});

	const MARKER_PERIOD = 999001;
	function withMarkerSeries(panes: ReturnType<typeof createDefaultPaneLayout>) {
		return panes.map((p) => p.id === "price"
			? { ...p, series: [...p.series, { type: "EMA" as const, yAxis: "left" as const, params: { period: MARKER_PERIOD } }] }
			: p);
	}
	function hasMarkerSeries(panes: ReturnType<typeof createDefaultPaneLayout>): boolean {
		return panes.some((p) => (p.series ?? []).some((s: any) => s?.params?.period === MARKER_PERIOD));
	}

	it("T1: save under one scope is invisible to another scope (the reported bug)", () => {
		const store = mapStorage();
		savePaneLayout(withMarkerSeries(createDefaultPaneLayout()), store, "chart-a");
		expect(store.has(scopedPaneLayoutKey("chart-a"))).toBe(true);
		expect(store.has(PANE_LAYOUT_STORAGE_KEY)).toBe(false);
		// Fresh mount of another chart (new cell / remount / reload-time init).
		expect(hasMarkerSeries(loadPaneLayout(store, "chart-b"))).toBe(false);
		expect(hasMarkerSeries(loadPaneLayout(store, "chart-a"))).toBe(true);
	});

	it("T2: same scope reload retains content identical to legacy path", () => {
		const scoped = mapStorage();
		const legacy = mapStorage();
		const panes = createDefaultPaneLayout();
		savePaneLayout(panes, scoped, "chart-a");
		savePaneLayout(panes, legacy);
		expect(loadPaneLayout(scoped, "chart-a")).toEqual(loadPaneLayout(legacy));
	});

	it("T3: no scope keeps legacy shared-key behavior (single-chart compat)", () => {
		const store = mapStorage();
		const panes = createDefaultPaneLayout();
		savePaneLayout(panes, store);
		expect(store.has(PANE_LAYOUT_STORAGE_KEY)).toBe(true);
		expect(loadPaneLayout(store)).toEqual(loadPaneLayout(store, undefined));
		const scoped = mapStorage();
		savePaneLayout(panes, scoped, "chart-a");
		expect(loadPaneLayout(store)).toEqual(loadPaneLayout(scoped, "chart-a"));
	});
});
