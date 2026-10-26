// @vitest-environment jsdom
// UI-P2 regression lock: static pane label hidden when chips identify the pane.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { PaneHeader } from "../PaneHeader";
import type { PaneDescriptor } from "../types/pane-descriptor";

function createPane(overrides: Partial<PaneDescriptor> = {}): PaneDescriptor {
	return {
		id: "volume",
		label: "Khối lượng",
		pinned: false,
		visible: true,
		heightRatio: 0.2,
		series: [],
		splitScale: false,
		tooltip: "value",
		...overrides,
	};
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

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

function renderHeader(pane: PaneDescriptor, children?: React.ReactNode) {
	act(() => {
		root?.render(
			createElement(
				PaneHeader,
				{
					pane,
					onToggleVisible: () => {},
					onRemove: () => {},
					onAddSeries: () => {},
				},
				children,
			),
		);
	});
}

describe("PaneHeader duplicate label (UI-P2)", () => {
	it("hides the static label when an embedded legend is present", () => {
		renderHeader(createPane(), createElement("span", null, "Vol chip"));
		expect(container?.querySelector(".rsc-pane-header__label")).toBeNull();
		expect(container?.textContent).toContain("Vol chip");
	});

	it("hides the static label when series chips exist without children", () => {
		renderHeader(createPane({ series: [{ type: "Volume", yAxis: "right" }] }));
		expect(container?.querySelector(".rsc-pane-header__label")).toBeNull();
	});

	it("keeps the static label for empty panes without legend", () => {
		renderHeader(createPane());
		expect(container?.querySelector(".rsc-pane-header__label")?.textContent).toBe("Khối lượng");
	});

	it("keeps the add-series (+) button available (hover-only via CSS)", () => {
		const onAddSeries = vi.fn();
		act(() => {
			root?.render(
				createElement(PaneHeader, {
					pane: createPane(),
					onToggleVisible: () => {},
					onRemove: () => {},
					onAddSeries,
				}),
			);
		});
		const addBtn = Array.from(container?.querySelectorAll("button") ?? []).find(
			(b) => b.textContent === "+",
		) as HTMLButtonElement | undefined;
		expect(addBtn).toBeDefined();
		act(() => {
			addBtn?.click();
		});
		expect(onAddSeries).toHaveBeenCalledTimes(1);
	});
});
