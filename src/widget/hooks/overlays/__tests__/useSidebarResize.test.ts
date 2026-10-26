import { describe, expect, it, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
	DOCK_DEFAULT_WIDTH,
	maxAllowedWidth,
	SIDEBAR_WIDTH_KEY,
	useSidebarResize,
} from "../useSidebarResize";

beforeEach(() => {
	window.localStorage.removeItem(SIDEBAR_WIDTH_KEY);
});

describe("useSidebarResize viewport cap", () => {
	it("defaults to a roomy 300px so all dock items show fully", () => {
		expect(DOCK_DEFAULT_WIDTH).toBe(300);
		const { result } = renderHook(() => useSidebarResize());
		expect(result.current.sidebarWidth).toBe(300);
	});

	it("caps persisted width to 45% of a narrow viewport", () => {
		expect(maxAllowedWidth()).toBeLessThanOrEqual(600);
		window.localStorage.setItem(SIDEBAR_WIDTH_KEY, "600");
		const { result } = renderHook(() => useSidebarResize());
		// jsdom 1024px → cap 460; persisted 600 must clamp, never push the strip off-screen.
		expect(result.current.sidebarWidth).toBe(Math.min(600, Math.floor(1024 * 0.45)));
	});
});
