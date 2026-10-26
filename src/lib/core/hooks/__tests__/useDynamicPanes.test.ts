import { describe, expect, it } from "vitest";
import type { PaneDescriptor } from "../../types/pane-descriptor";
import { DEFAULT_PANES, PANE_LAYOUT_STORAGE_KEY, PANE_MAX_VISIBLE } from "../../types/pane-descriptor";
import {
	createDefaultPaneLayout,
	dynamicPanesReducer,
	loadPaneLayout,
	savePaneLayout,
} from "../useDynamicPanes";

function createMockStorage(initialValue: string | null = null) {
	let value = initialValue;
	return {
		getItem: () => value,
		setItem: (_key: string, nextValue: string) => {
			value = nextValue;
		},
		removeItem: () => {
			value = null;
		},
		get value() {
			return value;
		},
	};
}

describe("useDynamicPanes helpers", () => {
	it("loads default panes when storage is empty", () => {
		const storage = createMockStorage();
		const panes = loadPaneLayout(storage);
		expect(panes).toHaveLength(5);
		expect(panes[0]?.pinned).toBe(true);
		expect(panes[0]?.series[0]?.scaleSlotId).toBe("price-right");
		expect(panes.find((pane) => pane.id === "momentum")?.series.map((series) => series.scaleSlotId)).toEqual([
			"momentum-left",
			"momentum-right",
		]);
	});

	it("loads from valid localStorage payload", () => {
		const storage = createMockStorage(JSON.stringify({
			version: 1,
			panes: [
				{ ...DEFAULT_PANES[0], heightRatio: 0.7 },
				{ ...DEFAULT_PANES[1], visible: false, heightRatio: 0.3 },
				// Stored visibility is honored: momentum explicitly enabled here
				// (default is hidden since the 5-pane layout).
				{ ...DEFAULT_PANES[2], visible: true },
			],
		}));
		const panes = loadPaneLayout(storage);
		expect(panes.filter((pane) => pane.visible)).toHaveLength(2);
	});

	it("normalizes stale splitScale flags when loading stored layouts", () => {
		const storage = createMockStorage(JSON.stringify({
			version: 1,
			panes: [
				{
					id: "custom",
					label: "Custom",
					pinned: false,
					visible: true,
					heightRatio: 0.4,
					series: [
						{ type: "RSI", yAxis: "left" },
						{ type: "MACD", yAxis: "right" },
					],
					splitScale: false,
					tooltip: "value",
				},
			],
		}));

		const panes = loadPaneLayout(storage);
		const customPane = panes.find((pane) => pane.id === "custom");
		expect(customPane?.splitScale).toBe(true);
		expect(customPane?.series.map((series) => series.scaleSlotId)).toEqual([
			"custom-left",
			"custom-right",
		]);
	});

	it("falls back to default panes when storage is corrupt", () => {
		const storage = createMockStorage("{{invalid json}}");
		const panes = loadPaneLayout(storage);
		expect(panes).toHaveLength(5);
	});

	it("savePaneLayout writes the storage key payload", () => {
		const storage = createMockStorage();
		savePaneLayout(DEFAULT_PANES, storage);
		const payload = JSON.parse(storage.value ?? "null") as { version?: number; panes?: unknown[] } | null;
		expect(payload?.version).toBe(1);
		expect(payload?.panes).toHaveLength(5);
	});
});

describe("dynamicPanesReducer", () => {
	it("toggleVisible reduces visible count", () => {
		// Default layout shows price + volume; hiding volume leaves price only.
		const next = dynamicPanesReducer(createDefaultPaneLayout(), { type: "toggleVisible", id: "volume" });
		expect(next.filter((pane) => pane.visible)).toHaveLength(1);
	});

	it("pinned pane cannot be hidden", () => {
		const next = dynamicPanesReducer(createDefaultPaneLayout(), { type: "toggleVisible", id: "price" });
		expect(next.filter((pane) => pane.visible)).toHaveLength(2);
	});

	it("toggleVisible normalizes visible height ratios", () => {
		const next = dynamicPanesReducer(createDefaultPaneLayout(), { type: "toggleVisible", id: "momentum" });
		const sum = next.filter((pane) => pane.visible).reduce((acc, pane) => acc + pane.heightRatio, 0);
		expect(Math.abs(sum - 1)).toBeLessThan(0.001);
	});

	it("addPane is rejected when PANE_MAX_VISIBLE panes are already visible", () => {
		// Start with default layout (2 visible), enable the 3 hidden panes to reach max
		let state = createDefaultPaneLayout();
		state = dynamicPanesReducer(state, { type: "toggleVisible", id: "momentum" });
		state = dynamicPanesReducer(state, { type: "toggleVisible", id: "orderflow" });
		state = dynamicPanesReducer(state, { type: "toggleVisible", id: "strength" });
		// Now 5 visible panes — trying to add a 6th should be rejected
		const next = dynamicPanesReducer(state, {
			type: "addPane",
			pane: { label: "Extra", pinned: false, visible: true, heightRatio: 0.1, series: [], splitScale: false, tooltip: "value" },
		});
		expect(next.filter((p) => p.visible)).toHaveLength(5);
	});

	it("removePane ignores pinned panes", () => {
		const next = dynamicPanesReducer(createDefaultPaneLayout(), { type: "removePane", id: "price" });
		expect(next).toHaveLength(5);
	});

	it("deletePane removes custom panes but keeps defaults", () => {
		let state = dynamicPanesReducer(createDefaultPaneLayout(), {
			type: "addPane",
			pane: { label: "Research", pinned: false, visible: true, heightRatio: 0.2, series: [], splitScale: false, tooltip: "value" },
		});
		const customPaneId = state[state.length - 1]?.id ?? "";

		state = dynamicPanesReducer(state, { type: "deletePane", id: customPaneId });
		expect(state.some((pane) => pane.id === customPaneId)).toBe(false);

		const defaultState = dynamicPanesReducer(createDefaultPaneLayout(), { type: "deletePane", id: "price" });
		expect(defaultState.some((pane) => pane.id === "price")).toBe(true);
	});

	it("renamePane updates custom labels only", () => {
		let state = dynamicPanesReducer(createDefaultPaneLayout(), {
			type: "addPane",
			pane: { label: "Research", pinned: false, visible: true, heightRatio: 0.2, series: [], splitScale: false, tooltip: "value" },
		});
		const customPaneId = state[state.length - 1]?.id ?? "";

		state = dynamicPanesReducer(state, { type: "renamePane", paneId: customPaneId, label: "Swing Watch" });
		expect(state.find((pane) => pane.id === customPaneId)?.label).toBe("Swing Watch");

		const defaultState = dynamicPanesReducer(createDefaultPaneLayout(), { type: "renamePane", paneId: "price", label: "Changed" });
		expect(defaultState.find((pane) => pane.id === "price")?.label).toBe("Price");
	});

	it("reorderPanes keeps price pinned at the top", () => {
		const next = dynamicPanesReducer(createDefaultPaneLayout(), {
			type: "reorderPanes",
			fromVisibleIndex: 2,
			toVisibleIndex: 1,
		});
		expect(next[0]?.id).toBe("price");
	});

	it("applyDelta updates adjacent visible pane ratios", () => {
		const next = dynamicPanesReducer(createDefaultPaneLayout(), {
			type: "applyDelta",
			splitterIndex: 0,
			deltaY: 20,
			available: 600,
		});
		const sum = next.filter((pane) => pane.visible).reduce((acc, pane) => acc + pane.heightRatio, 0);
		expect(Math.abs(sum - 1)).toBeLessThan(0.001);
	});

	it("replaceLayout swaps the full pane layout", () => {
		const next = dynamicPanesReducer(createDefaultPaneLayout(), {
			type: "replaceLayout",
			panes: [
				{
					id: "price",
					label: "Price",
					pinned: true,
					visible: true,
					heightRatio: 1,
					splitScale: false,
					tooltip: "ohlc",
					series: [{ type: "Candlestick", yAxis: "right" }],
				},
			],
		});
		expect(next).toHaveLength(5);
		expect(next.filter((p) => p.visible)).toHaveLength(1);
		expect(next[0]?.series).toHaveLength(1);
		expect(next[0]?.visible).toBe(true);
	});

	it("toggleSeriesVisible hides an individual series", () => {
		const next = dynamicPanesReducer(createDefaultPaneLayout(), {
			type: "toggleSeriesVisible",
			paneId: "momentum",
			seriesType: "RSI",
		});
		const rsi = next.find((p) => p.id === "momentum")?.series.find((s) => s.type === "RSI");
		expect(rsi?.visible).toBe(false);
	});

	it("toggleSeriesVisible restores a hidden series", () => {
		let state = dynamicPanesReducer(createDefaultPaneLayout(), {
			type: "toggleSeriesVisible",
			paneId: "momentum",
			seriesType: "RSI",
		});
		state = dynamicPanesReducer(state, {
			type: "toggleSeriesVisible",
			paneId: "momentum",
			seriesType: "RSI",
		});
		const rsi = state.find((p) => p.id === "momentum")?.series.find((s) => s.type === "RSI");
		expect(rsi?.visible).toBe(true);
	});

	it("restorePane re-enables a hidden pane and its series", () => {
		const hiddenPane: Omit<PaneDescriptor, "id"> = {
			label: "Research",
			pinned: false,
			visible: false,
			heightRatio: 0.1,
			series: [
				{ type: "RSI", yAxis: "right", visible: false, params: { period: 21 } },
			],
			splitScale: false,
			tooltip: "value",
		};

		let state = dynamicPanesReducer(createDefaultPaneLayout(), {
			type: "addPane",
			pane: hiddenPane,
		});

		state = dynamicPanesReducer(state, {
			type: "restorePane",
			id: state[state.length - 1]?.id ?? "",
			maxVisiblePanes: PANE_MAX_VISIBLE,
		});

		const restoredPane = state[state.length - 1];
		expect(restoredPane?.visible).toBe(true);
		expect(restoredPane?.series.every((series) => series.visible !== false)).toBe(true);
		// Default layout shows price + volume; restoring adds the third visible pane.
		expect(state.filter((pane) => pane.visible)).toHaveLength(3);
	});

	it("restorePane is blocked when the visible pane limit is already reached", () => {
		const hiddenPane: Omit<PaneDescriptor, "id"> = {
			label: "Research",
			pinned: false,
			visible: false,
			heightRatio: 0.1,
			series: [
				{ type: "RSI", yAxis: "right", visible: false, params: { period: 21 } },
			],
			splitScale: false,
			tooltip: "value",
		};

		let state = dynamicPanesReducer(createDefaultPaneLayout(), {
			type: "addPane",
			pane: hiddenPane,
		});
		// Fill all 5 visible slots first (default shows price + volume).
		state = dynamicPanesReducer(state, {
			type: "toggleVisible",
			id: "momentum",
			maxVisiblePanes: PANE_MAX_VISIBLE,
		});
		state = dynamicPanesReducer(state, {
			type: "toggleVisible",
			id: "orderflow",
			maxVisiblePanes: PANE_MAX_VISIBLE,
		});
		state = dynamicPanesReducer(state, {
			type: "toggleVisible",
			id: "strength",
			maxVisiblePanes: PANE_MAX_VISIBLE,
		});

		const blocked = dynamicPanesReducer(state, {
			type: "restorePane",
			id: state[state.length - 1]?.id ?? "",
			maxVisiblePanes: PANE_MAX_VISIBLE,
		});
		const blockedPane = blocked[blocked.length - 1];

		expect(blocked.filter((pane) => pane.visible)).toHaveLength(PANE_MAX_VISIBLE);
		expect(blockedPane?.visible).toBe(false);
		expect(blockedPane?.series[0]?.visible).toBe(false);
	});

	it("toggleSeriesVisible auto-hides pane when all series become hidden", () => {
		let state = dynamicPanesReducer(createDefaultPaneLayout(), {
			type: "toggleSeriesVisible",
			paneId: "momentum",
			seriesType: "RSI",
		});
		state = dynamicPanesReducer(state, {
			type: "toggleSeriesVisible",
			paneId: "momentum",
			seriesType: "MACD",
		});
		expect(state.find((p) => p.id === "momentum")?.visible).toBe(false);
	});

	it("toggleSeriesVisible does not auto-hide if last pane visible", () => {
		const state = dynamicPanesReducer(createDefaultPaneLayout(), {
			type: "toggleSeriesVisible",
			paneId: "volume",
			seriesType: "Volume",
		});
		// Auto-hide fires; volume pane becomes hidden
		expect(state.find((p) => p.id === "volume")?.visible).toBe(false);
	});

	it("updateSeriesParams merges params without replacing unrelated fields", () => {
		const state = dynamicPanesReducer(createDefaultPaneLayout(), {
			type: "updateSeriesParams",
			paneId: "momentum",
			seriesType: "RSI",
			params: { period: 21 },
		});
		const rsi = state.find((p) => p.id === "momentum")?.series.find((s) => s.type === "RSI");
		expect(rsi?.params?.period).toBe(21);
	});

	it("updateSeriesLineWidth stores an explicit indicator line width", () => {
		const state = dynamicPanesReducer(createDefaultPaneLayout(), {
			type: "updateSeriesLineWidth",
			paneId: "momentum",
			seriesType: "RSI",
			lineWidth: 3.5,
		});
		const rsi = state.find((p) => p.id === "momentum")?.series.find((s) => s.type === "RSI");
		expect(rsi?.lineWidth).toBe(3.5);
	});

	it("addSeries assigns scaleSlotId derived from pane id and axis", () => {
		const state: PaneDescriptor[] = [
			{
				id: "custom",
				label: "Custom",
				pinned: false,
				visible: true,
				heightRatio: 1,
				series: [],
				splitScale: false,
				tooltip: "value",
			},
		];

		const next = dynamicPanesReducer(state, {
			type: "addSeries",
			paneId: "custom",
			series: { type: "RSI", yAxis: "left" },
		});

		expect(next[0]?.series[0]?.scaleSlotId).toBe("custom-left");
		expect(next[0]?.splitScale).toBe(false);
	});

	it("updateSeriesYAxis enables splitScale when both axes are present", () => {
		const state: PaneDescriptor[] = [
			{
				id: "custom",
				label: "Custom",
				pinned: false,
				visible: true,
				heightRatio: 1,
				series: [
					{ type: "RSI", yAxis: "right" },
					{ type: "MACD", yAxis: "right" },
				],
				splitScale: false,
				tooltip: "value",
			},
		];

		const next = dynamicPanesReducer(state, {
			type: "updateSeriesYAxis",
			paneId: "custom",
			seriesType: "RSI",
			yAxis: "left",
			seriesIndex: 0,
		});

		expect(next[0]?.series[0]?.yAxis).toBe("left");
		expect(next[0]?.series[0]?.scaleSlotId).toBe("custom-left");
		expect(next[0]?.series[1]?.scaleSlotId).toBe("custom-right");
		expect(next[0]?.splitScale).toBe(true);
	});
});
