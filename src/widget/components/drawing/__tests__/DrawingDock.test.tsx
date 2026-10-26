// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";

import { createRoot } from "react-dom/client";

import DrawingDock from "../DrawingDock";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const labels = {
	title: "Dock",
	close: "Close",
	properties: "Properties",
	objects: "Objects",
	templates: "Templates",
	emptyProperties: "No properties",
	emptyObjects: "No objects",
	emptyTemplates: "No templates",
	resize: "Resize",
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

describe("DrawingDock", () => {
	it("switches tabs and renders the matching content", () => {
		const onTabChange = vi.fn();

		act(() => {
			root?.render(createElement(DrawingDock, {
				isOpen: true,
				activeTab: "properties",
				labels,
				onClose: vi.fn(),
				onTabChange,
				propertiesContent: createElement("div", null, "Inspector body"),
				objectsContent: createElement("div", null, "Objects body"),
			}));
		});

		expect(container?.textContent).toContain("Inspector body");

		const objectsButton = Array.from(container?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((button) => button.textContent === "Objects");
		act(() => {
			objectsButton?.click();
		});

		expect(onTabChange).toHaveBeenCalledWith("objects");
	});

	it("renders passed objectsContent on the objects tab instead of the empty fallback (P0 D-UI-02)", () => {
		act(() => {
			root?.render(createElement(DrawingDock, {
				isOpen: true,
				activeTab: "objects",
				labels,
				onClose: vi.fn(),
				onTabChange: vi.fn(),
				objectsContent: createElement("div", null, "Objects body"),
			}));
		});

		expect(container?.textContent).toContain("Objects body");
		expect(container?.textContent).not.toContain("No objects");
	});

	it("renders the empty-state fallback for templates when no content is provided", () => {
		act(() => {
			root?.render(createElement(DrawingDock, {
				isOpen: true,
				activeTab: "templates",
				labels,
				onClose: vi.fn(),
				onTabChange: vi.fn(),
			}));
		});

		expect(container?.textContent).toContain("No templates");
	});

	it("restores persisted drag offset and size delta from props", () => {
		act(() => {
			root?.render(createElement(DrawingDock, {
				isOpen: true,
				activeTab: "properties",
				labels,
				onClose: vi.fn(),
				onTabChange: vi.fn(),
				initialDragDelta: { x: 40, y: 24 },
				initialSizeDelta: { w: 60, h: 100 },
			}));
		});

		const section = container?.querySelector<HTMLElement>("section");
		// base left 16 + dragDelta 40 = 56; base top 16 + 24 = 40
		expect(section?.style.left).toBe("56px");
		expect(section?.style.top).toBe("40px");
		// base width 360 + 60 = 420; base height 200 + 100 = 300
		expect(section?.style.width).toBe("420px");
		expect(section?.style.minHeight).toBe("300px");
	});

	it("clamps a restored off-screen drag offset back into the viewport on open", () => {
		const onLayoutChange = vi.fn();
		act(() => {
			root?.render(createElement(DrawingDock, {
				isOpen: true,
				activeTab: "properties",
				labels,
				onClose: vi.fn(),
				onTabChange: vi.fn(),
				initialDragDelta: { x: 99999, y: 99999 },
				onLayoutChange,
			}));
		});

		const section = container?.querySelector<HTMLElement>("section");
		const left = parseInt(section?.style.left ?? "0", 10);
		const top = parseInt(section?.style.top ?? "0", 10);
		// Must be pulled inside the window bounds, not left at 99999+16.
		expect(left).toBeLessThan(window.innerWidth);
		expect(top).toBeLessThan(window.innerHeight);
		// The corrected layout is persisted back through onLayoutChange.
		expect(onLayoutChange).toHaveBeenCalled();
	});
});
