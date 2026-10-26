// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";

import { createRoot } from "react-dom/client";

import TemplateManagerPanel from "../TemplateManagerPanel";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const drawing: DrawingObject = {
	id: "d1",
	type: "trendLine",
	points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
	style: { stroke: "#ff0000", strokeWidth: 2 },
	createdAt: 1,
	updatedAt: 1,
};

beforeEach(() => {
	localStorage.clear();
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
	localStorage.clear();
});

function getButton(label: string): HTMLButtonElement | undefined {
	return Array.from(container?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((b) => b.textContent === label);
}

describe("TemplateManagerPanel", () => {
	it("renders load and save controls", () => {
		act(() => {
			root?.render(createElement(TemplateManagerPanel, { drawingType: "trendLine", drawing }));
		});
		expect(container?.textContent).toContain("Load Template");
		expect(container?.textContent).toContain("Save As");
	});

	it("saves a template and shows it in the select", () => {
		act(() => {
			root?.render(createElement(TemplateManagerPanel, { drawingType: "trendLine", drawing }));
		});

		const input = container?.querySelector<HTMLInputElement>("#template-manager-new-name");
		act(() => {
			if (input) {
				const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
				setter?.call(input, "My Template");
				input.dispatchEvent(new Event("input", { bubbles: true }));
			}
		});

		act(() => {
			getButton("Save")?.click();
		});

		const options = Array.from(container?.querySelectorAll("option") ?? []).map((o) => o.textContent);
		expect(options).toContain("My Template");
	});

	it("loads a saved template via onUpdate", () => {
		act(() => {
			root?.render(createElement(TemplateManagerPanel, { drawingType: "trendLine", drawing }));
		});

		const input = container?.querySelector<HTMLInputElement>("#template-manager-new-name");
		act(() => {
			if (input) {
				const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
				setter?.call(input, "Tpl");
				input.dispatchEvent(new Event("input", { bubbles: true }));
			}
		});
		act(() => {
			getButton("Save")?.click();
		});

		const onUpdate = vi.fn();
		act(() => {
			root?.render(createElement(TemplateManagerPanel, { drawingType: "trendLine", drawing, onUpdate }));
		});

		const select = container?.querySelector<HTMLSelectElement>("#template-manager-select");
		act(() => {
			if (select) {
				const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
				setter?.call(select, "Tpl");
				select.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});
		act(() => {
			getButton("Load")?.click();
		});

		expect(onUpdate).toHaveBeenCalledTimes(1);
	});

	it("disables actions when locked", () => {
		act(() => {
			root?.render(createElement(TemplateManagerPanel, { drawingType: "trendLine", drawing, locked: true }));
		});
		expect(getButton("Save")?.disabled).toBe(true);
	});
});
