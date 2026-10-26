import { describe, expect, it } from "vitest";
import type { PaneConfig } from "../../types/pane";
import { paneManagerReducer } from "./usePaneManager";

const pricePane: PaneConfig = {
	id: "price",
	indicators: [],
	minHeightPx: 80,
};

const volumePane: PaneConfig = {
	id: "volume",
	indicators: [{ name: "Volume", yAxis: "right" }],
	minHeightPx: 60,
};

describe("paneManagerReducer", () => {
	it("adds panes with a generated id", () => {
		const nextState = paneManagerReducer([pricePane], {
			type: "addPane",
			pane: {
				indicators: [],
				minHeightPx: 50,
			},
		});

		expect(nextState).toHaveLength(2);
		expect(nextState[1].id).toMatch(/^pane-/);
		expect(nextState[1].minHeightPx).toBe(50);
	});

	it("removes panes by id", () => {
		const nextState = paneManagerReducer([pricePane, volumePane], {
			type: "removePane",
			paneId: "price",
		});

		expect(nextState).toEqual([volumePane]);
	});

	it("clamps pane height to minHeightPx when resizing", () => {
		const nextState = paneManagerReducer([pricePane], {
			type: "resizePane",
			paneId: "price",
			heightPx: 24,
		});

		expect(nextState[0].heightPx).toBe(80);
	});

	it("updates indicators without mutating other panes", () => {
		const nextState = paneManagerReducer([pricePane, volumePane], {
			type: "updateIndicator",
			paneId: "volume",
			indicatorName: "Volume",
			patch: { yAxis: "left" },
		});

		expect(nextState[0]).toBe(pricePane);
		expect(nextState[1].indicators[0]).toMatchObject({
			name: "Volume",
			yAxis: "left",
		});
	});
});
