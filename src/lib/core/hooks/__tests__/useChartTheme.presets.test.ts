// @vitest-environment jsdom
/**
 * S-03: midnight-blue must be a first-class ChartTheme value — storage
 * hydration, mode mapping (dark), and cycle rotation membership.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { themeToMode, useChartTheme, type ChartTheme } from "../useChartTheme";

const MIDNIGHT = "midnight-blue" as ChartTheme;

describe("useChartTheme presets (S-03)", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	afterEach(() => {
		window.localStorage.clear();
	});

	it("hydrates midnight-blue from storage (ALL_THEMES membership)", () => {
		window.localStorage.setItem("rsc-chart-theme", MIDNIGHT);
		const { result } = renderHook(() => useChartTheme("classic-dark"));
		expect(result.current.theme).toBe("midnight-blue");
		expect(result.current.resolvedMode).toBe("dark");
		expect(result.current.isDark).toBe(true);
	});

	it("themeToMode maps midnight-blue to dark", () => {
		expect(themeToMode(MIDNIGHT)).toBe("dark");
	});

	it("cycleTheme includes midnight-blue in rotation (neutral-pro -> midnight-blue)", () => {
		window.localStorage.setItem("rsc-chart-theme", "neutral-pro");
		const { result } = renderHook(() => useChartTheme("classic-dark"));
		act(() => {
			result.current.cycleTheme();
		});
		expect(result.current.theme).toBe("midnight-blue");
	});

	it("setTheme(midnight-blue) persists to storage", () => {
		const { result } = renderHook(() => useChartTheme("classic-dark"));
		act(() => {
			result.current.setTheme(MIDNIGHT);
		});
		expect(window.localStorage.getItem("rsc-chart-theme")).toBe("midnight-blue");
	});
});
