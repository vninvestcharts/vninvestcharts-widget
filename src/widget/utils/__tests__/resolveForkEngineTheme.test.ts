// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolveForkEngineTheme } from "../resolveForkEngineTheme";

/**
 * Batch B / B2 — the appearance tab writes `appearance.crosshairColor` into
 * the settings composite, but the fork engine theme hard-coded its own
 * crosshair colour, so the control never reached the engine renderer.
 */
const BASE = {
	mode: "dark" as const,
	gridColor: "rgba(255,255,255,0.05)",
	gridDash: "",
	gridWidth: 0.5,
	bullish: "rgb(38,166,154)",
	bearish: "rgb(239,83,80)",
	fallbackCrosshairColor: "#2962ff",
};

describe("resolveForkEngineTheme (B2)", () => {
	it("uses the crosshair colour coming from the settings", () => {
		const theme = resolveForkEngineTheme({ ...BASE, crosshairColor: "#ff00aa" });
		expect(theme.crosshairColor).toBe("#ff00aa");
	});

	it("falls back to the canvas theme colour when the setting is missing", () => {
		const theme = resolveForkEngineTheme(BASE);
		expect(theme.crosshairColor).toBe("#2962ff");
	});

	it("falls back when the setting is blank", () => {
		const theme = resolveForkEngineTheme({ ...BASE, crosshairColor: "   " });
		expect(theme.crosshairColor).toBe("#2962ff");
	});

	it("keeps the remaining engine theme fields untouched", () => {
		const theme = resolveForkEngineTheme({ ...BASE, crosshairColor: "#ff00aa" });
		expect(theme.mode).toBe("dark");
		expect(theme.gridColor).toBe(BASE.gridColor);
		expect(theme.gridDash).toBe(BASE.gridDash);
		expect(theme.gridWidth).toBe(BASE.gridWidth);
		expect(theme.candleUp).toBe(BASE.bullish);
		expect(theme.candleDown).toBe(BASE.bearish);
	});

	it("supports the light mode without changing the crosshair fallback", () => {
		const theme = resolveForkEngineTheme({ ...BASE, mode: "light" });
		expect(theme.mode).toBe("light");
		expect(theme.crosshairColor).toBe("#2962ff");
	});
});

/**
 * A1 — the per-direction grid switches and colours of the appearance tab
 * reach the engine theme. Before this they stopped at the tab, so the
 * control had no effect on the chart.
 */
describe("resolveForkEngineTheme (A1 — per-direction grid)", () => {
	it("leaves the grid untouched when the appearance tab says nothing", () => {
		const theme = resolveForkEngineTheme(BASE);
		expect(theme.gridVisible).toBeUndefined();
		expect(theme.gridColorVertical).toBeUndefined();
		expect(theme.gridColorHorizontal).toBeUndefined();
	});

	it("carries the two visibility switches", () => {
		const theme = resolveForkEngineTheme({
			...BASE,
			vertGridVisible: false,
			horzGridVisible: true,
		});
		expect(theme.gridVisible).toEqual({ vertical: false, horizontal: true });
	});

	it("carries the two colours", () => {
		const theme = resolveForkEngineTheme({
			...BASE,
			vertGridColor: "rgba(255,0,0,0.1)",
			horzGridColor: "rgba(0,0,255,0.2)",
		});
		expect(theme.gridColorVertical).toBe("rgba(255,0,0,0.1)");
		expect(theme.gridColorHorizontal).toBe("rgba(0,0,255,0.2)");
	});

	it("leaves the visibility object undefined when only a colour is given", () => {
		// The engine reads a missing key as "visible", so an object of
		// `undefined`s would mean the same thing — but it would also claim
		// the tab had an opinion it does not have. Keep it undefined.
		const theme = resolveForkEngineTheme({ ...BASE, vertGridColor: "#123456" });
		expect(theme.gridVisible).toBeUndefined();
		expect(theme.gridColorVertical).toBe("#123456");
	});
});
