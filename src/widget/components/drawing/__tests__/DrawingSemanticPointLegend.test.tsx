// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import DrawingSemanticPointLegend from "../DrawingSemanticPointLegend";
import { createDrawingObject } from "@vninvestcharts/engine-drawing";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const labels = {
	title: "Semantic points",
	empty: "No points",
	hint: "Hover a point",
	clear: "Clear focus",
};

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) {
		act(() => {
			root?.unmount();
		});
	}
	root = null;
	container?.remove();
	container = null;
});

describe("DrawingSemanticPointLegend", () => {
	it("renders semantic point labels and updates focus on hover", () => {
		const drawing = createDrawingObject("xabcdPattern", [
			{ x: 10, y: 10 },
			{ x: 20, y: 20 },
			{ x: 30, y: 30 },
			{ x: 40, y: 40 },
			{ x: 50, y: 50 },
		]);
		const onPointFocusChange = vi.fn();

		act(() => {
			root?.render(createElement(DrawingSemanticPointLegend, {
				drawing,
				labels,
				activePointIndex: null,
				onPointFocusChange,
			}));
		});

		expect(container?.textContent).toContain("Semantic points");
		expect(container?.textContent).toContain("X");
		expect(container?.textContent).toContain("D");

		const pointButtons = Array.from(container?.querySelectorAll<HTMLButtonElement>("button") ?? []).filter((button) => button.textContent?.includes("X") || button.textContent?.includes("A"));
		const firstPointButton = pointButtons[0];

		act(() => {
			firstPointButton?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
		});

		expect(onPointFocusChange).toHaveBeenCalledWith(0);
	});
});
