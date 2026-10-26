// @vitest-environment jsdom
// UI-C regression lock: subpane separators drawn at every pane bottom but the last.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ForkPaneSeparators } from "../ForkPaneSeparators";
import type { WidgetPaneRuntimeSnapshot } from "../../utils/widgetHelpers";

function makeSnapshot(paneId: string, top: number, height: number): WidgetPaneRuntimeSnapshot {
	return {
		paneId,
		bounds: { top, height, left: 0, width: 600 },
		plotBounds: { top, height, left: 0, width: 532 },
	} as unknown as WidgetPaneRuntimeSnapshot;
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function renderSeparators(
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[],
	lastPaneId?: string,
) {
	act(() => {
		root?.render(createElement(ForkPaneSeparators, { paneSnapshots, lastPaneId }));
	});
}

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) act(() => { root?.unmount(); });
	root = null;
	container?.remove();
	container = null;
});

describe("ForkPaneSeparators (UI-C)", () => {
	it("draws one separator per pane except the last, at pane bottoms", () => {
		renderSeparators([
			makeSnapshot("price", 0, 300),
			makeSnapshot("volume", 300, 80),
			makeSnapshot("rsi", 380, 100),
		]);
		const separators = Array.from(container?.querySelectorAll("[data-pane-separator]") ?? []);
		expect(separators.map((el) => el.getAttribute("data-pane-separator"))).toEqual(["price", "volume"]);
		expect((separators[0] as HTMLElement).style.top).toBe("300px");
		expect((separators[1] as HTMLElement).style.top).toBe("380px");
	});

	it("renders nothing for a single pane", () => {
		renderSeparators([makeSnapshot("price", 0, 400)]);
		expect(container?.querySelectorAll("[data-pane-separator]").length).toBe(0);
	});

	it("respects an explicit lastPaneId override", () => {
		renderSeparators([makeSnapshot("price", 0, 300), makeSnapshot("rsi", 300, 100)], "price");
		const separators = Array.from(container?.querySelectorAll("[data-pane-separator]") ?? []);
		expect(separators.map((el) => el.getAttribute("data-pane-separator"))).toEqual(["rsi"]);
	});
});
