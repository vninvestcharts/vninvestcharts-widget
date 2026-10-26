// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearSeriesStyleOverrides, getSeriesStyleOverride, overrideSeriesStyle } from "../../lib/core";
import { clearDrawingStyleOverrides, getDrawingStyleOverride, overrideDrawingStyle } from "@vninvestcharts/engine-drawing";
import { loadPersistedStyleOverrides, restorePersistedStyleOverrides, saveCurrentStyleOverrides, STYLE_OVERRIDES_STORAGE_KEY } from "../styleOverridesPersistence";

describe("styleOverridesPersistence", () => {
	beforeEach(() => {
		window.localStorage.clear();
		clearSeriesStyleOverrides();
		clearDrawingStyleOverrides();
	});

	afterEach(() => {
		window.localStorage.clear();
		clearSeriesStyleOverrides();
		clearDrawingStyleOverrides();
	});

	it("round-trips series and drawing overrides through localStorage", () => {
		overrideSeriesStyle("ema-1", { color: "#ff0000", lineWidth: 2, visible: false, dashPattern: [6, 4] });
		overrideDrawingStyle("drawing-1", { color: "#00ff00", lineWidth: 3, opacity: 0.4, dashPattern: [2, 4] });

		saveCurrentStyleOverrides();

		expect(window.localStorage.getItem(STYLE_OVERRIDES_STORAGE_KEY)).toBe(
			JSON.stringify({
				series: {
					"ema-1": {
						color: "#ff0000",
						lineWidth: 2,
						visible: false,
						dashPattern: [6, 4],
					},
				},
				drawings: {
					"drawing-1": {
						color: "#00ff00",
						lineWidth: 3,
						opacity: 0.4,
						dashPattern: [2, 4],
					},
				},
			}),
		);

		clearSeriesStyleOverrides();
		clearDrawingStyleOverrides();
		restorePersistedStyleOverrides();

		expect(getSeriesStyleOverride("ema-1")).toEqual({
			color: "#ff0000",
			lineWidth: 2,
			visible: false,
			dashPattern: [6, 4],
		});
		expect(getDrawingStyleOverride("drawing-1")).toEqual({
			color: "#00ff00",
			lineWidth: 3,
			opacity: 0.4,
			dashPattern: [2, 4],
		});
	});

	it("removes the storage entry when no overrides exist", () => {
		window.localStorage.setItem(STYLE_OVERRIDES_STORAGE_KEY, JSON.stringify({ series: { ema: { color: "#ffffff" } }, drawings: {} }));

		clearSeriesStyleOverrides();
		clearDrawingStyleOverrides();
		saveCurrentStyleOverrides();

		expect(window.localStorage.getItem(STYLE_OVERRIDES_STORAGE_KEY)).toBeNull();
		expect(loadPersistedStyleOverrides()).toBeNull();
	});
});