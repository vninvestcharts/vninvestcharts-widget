// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { GridContainer } from "../GridContainer";
import type { GridLayout } from "../../../grid/types";

const layout1x2: GridLayout = {
	rows: 1,
	cols: 2,
	rowSizes: ["1fr"],
	colSizes: ["1fr", "1fr"],
	slots: [
		{ id: "c1", rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1, areaName: "c1", symbol: "VIC", timeframe: "1D" },
		{ id: "c2", rowStart: 1, rowEnd: 1, colStart: 2, colEnd: 2, areaName: "c2", symbol: "FPT", timeframe: "1D" },
	],
	templateAreas: ['"c1 c2"'],
	areas: {} as never,
};

const charts = [
	{ id: "c1", symbol: "VIC", timeframe: "1D" },
	{ id: "c2", symbol: "FPT", timeframe: "1D" },
];

function renderGrid(activeChartId: string | null, setActiveChart?: (id: string) => void) {
	return render(
		<GridContainer
			charts={charts as never}
			layout={layout1x2}
			activeChartId={activeChartId}
			syncSettings={{} as never}
			defaultChartProps={{} as never}
			chartRefs={{ current: new Map() } as never}
			chartHandles={{ current: new Map() } as never}
			setActiveChart={setActiveChart ?? (() => {})}
			addChart={() => {}}
		/>
	);
}

const cellOf = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-chart-id="${id}"]`)!;

describe("UX-01 grid keyboard / roving tabindex", () => {
	// AC-UX-01-1: Tab must leave the grid, not be trapped inside it.
	it("does not hijack Tab / Shift+Tab", () => {
		const { container } = renderGrid("c1");
		const c1 = cellOf(container, "c1");

		const tab = fireEvent.keyDown(c1, { key: "Tab" });
		const shiftTab = fireEvent.keyDown(c1, { key: "Tab", shiftKey: true });

		expect(tab).toBe(true); // not prevented
		expect(shiftTab).toBe(true);
	});

	// Roving tabindex: the grid is entered once and exited again.
	it("exposes exactly one cell with tabIndex 0", () => {
		const { container } = renderGrid("c1");
		const focusable = Array.from(container.querySelectorAll<HTMLElement>('[role="gridcell"]')).filter(
			(el) => el.tabIndex === 0
		);
		expect(focusable).toHaveLength(1);
		expect(focusable[0].getAttribute("data-chart-id")).toBe("c1");
	});

	it("keeps a Tab-reachable cell even when nothing is active", () => {
		const { container } = renderGrid(null);
		const focusable = Array.from(container.querySelectorAll<HTMLElement>('[role="gridcell"]')).filter(
			(el) => el.tabIndex === 0
		);
		expect(focusable).toHaveLength(1);
		expect(focusable[0].getAttribute("data-chart-id")).toBe("c1");
	});

	// AC-UX-01-3
	it("moves the active chart with arrow keys", () => {
		const setActiveChart = vi.fn();
		const { container } = renderGrid("c1", setActiveChart);

		fireEvent.keyDown(cellOf(container, "c1"), { key: "ArrowRight" });
		expect(setActiveChart).toHaveBeenCalledWith("c2");

		// Wraps around: ArrowLeft from the first cell lands on the last one.
		fireEvent.keyDown(cellOf(container, "c1"), { key: "ArrowLeft" });
		expect(setActiveChart).toHaveBeenCalledWith("c2");
	});

	// AC-UX-01-2: a focused child control keeps its native Enter/Space.
	it("leaves Enter/Space alone when a child control has focus", () => {
		const setActiveChart = vi.fn();
		const { container } = renderGrid("c1", setActiveChart);

		const button = container.ownerDocument.createElement("button");
		cellOf(container, "c1").appendChild(button);

		expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(true);
		expect(fireEvent.keyDown(button, { key: " " })).toBe(true);
		expect(setActiveChart).not.toHaveBeenCalled();
	});

	// Enter on the cell itself still activates it.
	it("activates the cell on Enter/Space when the cell itself has focus", () => {
		const setActiveChart = vi.fn();
		const { container } = renderGrid(null, setActiveChart);

		fireEvent.keyDown(cellOf(container, "c2"), { key: "Enter" });
		expect(setActiveChart).toHaveBeenCalledWith("c2");
	});

	// AC-UX-01-4
	it("exposes an accessible name and selected state", () => {
		const { container } = renderGrid("c1");
		const c1 = cellOf(container, "c1");
		expect(c1.getAttribute("aria-label")).toContain("VIC");
		expect(c1.getAttribute("aria-label")).toContain("active");
		expect(c1.getAttribute("aria-selected")).toBe("true");
		expect(cellOf(container, "c2").getAttribute("aria-selected")).toBe("false");
	});
});
