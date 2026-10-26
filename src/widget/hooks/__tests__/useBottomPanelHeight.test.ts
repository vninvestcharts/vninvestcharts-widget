/**
 * useBottomPanelHeight unit tests: default, clamp, persist, nudge, reset.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { act, createElement } from "react";
import {
	useBottomPanelHeight,
	clampBottomPanelHeight,
	defaultBottomPanelHeightForTab,
	BOTTOM_PANEL_MIN_PX,
	BOTTOM_PANEL_MAX_PX,
	BOTTOM_PANEL_NUDGE_PX,
	type BottomPanelHeightApi,
} from "../useBottomPanelHeight";
import { BOTTOM_PANEL_HEIGHT_PX } from "../useBottomPanelBehavior";

function mountHook(defaultPx?: number): { api: () => BottomPanelHeightApi; unmount: () => void; rerender: (px?: number) => void } {
	let latest: BottomPanelHeightApi | null = null;
	let currentDefault = defaultPx;
	function Harness() {
		latest = useBottomPanelHeight(currentDefault);
		return null;
	}
	const rendered = render(createElement(Harness));
	return {
		api: () => {
			if (!latest) throw new Error("hook did not run");
			return latest;
		},
		unmount: rendered.unmount,
		rerender: (px?: number) => {
			currentDefault = px;
			rendered.rerender(createElement(Harness));
		},
	};
}

beforeEach(() => {
	cleanup();
	localStorage.clear();
});

describe("useBottomPanelHeight", () => {
	it("defaults to BOTTOM_PANEL_HEIGHT_PX with empty storage", () => {
		const h = mountHook();
		expect(h.api().heightPx).toBe(BOTTOM_PANEL_HEIGHT_PX);
		h.unmount();
	});

	it("clamps resize to [MIN, MAX]", () => {
		expect(clampBottomPanelHeight(-1000)).toBe(BOTTOM_PANEL_MIN_PX);
		expect(clampBottomPanelHeight(99999)).toBe(BOTTOM_PANEL_MAX_PX);
		expect(clampBottomPanelHeight(NaN)).toBe(BOTTOM_PANEL_HEIGHT_PX);
		const h = mountHook();
		act(() => { h.api().resizeBy(-10000); });
		expect(h.api().heightPx).toBe(BOTTOM_PANEL_MIN_PX);
		act(() => { h.api().resizeBy(10000); });
		expect(h.api().heightPx).toBe(BOTTOM_PANEL_MAX_PX);
		h.unmount();
	});

	it("persists across remounts and reset restores default", () => {
		const first = mountHook();
		act(() => { first.api().resizeBy(140); });
		expect(first.api().heightPx).toBe(BOTTOM_PANEL_HEIGHT_PX + 140);
		first.unmount();
		const second = mountHook();
		expect(second.api().heightPx).toBe(BOTTOM_PANEL_HEIGHT_PX + 140);
		act(() => { second.api().reset(); });
		expect(second.api().heightPx).toBe(BOTTOM_PANEL_HEIGHT_PX);
		second.unmount();
		expect(mountHook().api().heightPx).toBe(BOTTOM_PANEL_HEIGHT_PX);
	});

	it("resizeTo commit tuyệt đối, clamp + persist 1 lần (drag release path)", () => {
		const h = mountHook();
		act(() => { h.api().resizeTo(500); });
		expect(h.api().heightPx).toBe(500);
		expect(window.localStorage.getItem("vnsc_bottomPanelHeight")).toBe("500");
		act(() => { h.api().resizeTo(99999); });
		expect(h.api().heightPx).toBe(BOTTOM_PANEL_MAX_PX);
		act(() => { h.api().resizeTo(-1000); });
		expect(h.api().heightPx).toBe(BOTTOM_PANEL_MIN_PX);
		h.unmount();
	});

	it("nudge steps by NUDGE_PX per direction", () => {
		const h = mountHook();
		act(() => { h.api().nudge(1); });
		expect(h.api().heightPx).toBe(BOTTOM_PANEL_HEIGHT_PX + BOTTOM_PANEL_NUDGE_PX);
		act(() => { h.api().nudge(-1); });
		act(() => { h.api().nudge(-1); });
		expect(h.api().heightPx).toBe(BOTTOM_PANEL_HEIGHT_PX - BOTTOM_PANEL_NUDGE_PX);
		h.unmount();
	});
});

describe("useBottomPanelHeight per-tab auto-follow (bottom void fix)", () => {
	it("defaultBottomPanelHeightForTab maps tabs, fallback global", () => {
		expect(defaultBottomPanelHeightForTab("paper_trade")).toBe(240);
		expect(defaultBottomPanelHeightForTab("strategy_tester")).toBe(340);
		expect(defaultBottomPanelHeightForTab("pine_editor")).toBe(320);
		expect(defaultBottomPanelHeightForTab(null)).toBe(BOTTOM_PANEL_HEIGHT_PX);
		expect(defaultBottomPanelHeightForTab("unknown-tab")).toBe(BOTTOM_PANEL_HEIGHT_PX);
	});

	it("uses param default when untouched; follows default changes", () => {
		const h = mountHook(340);
		expect(h.api().heightPx).toBe(340);
		act(() => { h.rerender(240); });
		expect(h.api().heightPx).toBe(240);
		h.unmount();
	});

	it("manual resize pins height; tab default changes ignored after", () => {
		const h = mountHook(340);
		act(() => { h.api().resizeTo(500); });
		expect(h.api().heightPx).toBe(500);
		act(() => { h.rerender(240); });
		expect(h.api().heightPx).toBe(500);
		expect(window.localStorage.getItem("vnsc_bottomPanelHeight")).toBe("500");
		h.unmount();
	});

	it("legacy stored global default counts as untouched (migration)", () => {
		window.localStorage.setItem("vnsc_bottomPanelHeight", String(BOTTOM_PANEL_HEIGHT_PX));
		const h = mountHook(340);
		expect(h.api().heightPx).toBe(340);
		act(() => { h.rerender(240); });
		expect(h.api().heightPx).toBe(240);
		h.unmount();
	});

	it("reset clears storage and returns to current default", () => {
		const h = mountHook(340);
		act(() => { h.api().resizeTo(500); });
		expect(window.localStorage.getItem("vnsc_bottomPanelHeight")).toBe("500");
		act(() => { h.api().reset(); });
		expect(window.localStorage.getItem("vnsc_bottomPanelHeight")).toBeNull();
		expect(h.api().heightPx).toBe(340);
		h.unmount();
	});
});
