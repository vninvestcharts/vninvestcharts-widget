// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { GridContainer } from "./GridContainer";
import type { GridLayout } from "../../grid/types";

const layout2x2: GridLayout = {
	rows: 2,
	cols: 2,
	rowSizes: ["1fr", "1fr"],
	colSizes: ["1fr", "1fr"],
	slots: [
		{ id: "a", rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1, areaName: "a" },
		{ id: "b", rowStart: 1, rowEnd: 1, colStart: 2, colEnd: 2, areaName: "b" },
		{ id: "c", rowStart: 2, rowEnd: 2, colStart: 1, colEnd: 1, areaName: "c" },
		{ id: "d", rowStart: 2, rowEnd: 2, colStart: 2, colEnd: 2, areaName: "d" },
	],
	templateAreas: ['"a b"', '"c d"'],
	areas: {} as any,
};

describe("GridContainer Splitters Commercial Standards", () => {
	it("renders separator handles with proper ARIA attributes and i18n labels", () => {
		const { container } = render(
			<GridContainer
				charts={[]}
				layout={layout2x2}
				activeChartId={null}
				syncSettings={{} as any}
				defaultChartProps={{} as any}
				chartRefs={{ current: new Map() } as any}
				chartHandles={{ current: new Map() } as any}
				setActiveChart={() => {}}
				addChart={() => {}}
			/>
		);

		const separators = container.querySelectorAll('[role="separator"]');
		expect(separators.length).toBeGreaterThanOrEqual(2);

		const rowSep = Array.from(separators).find(s => s.getAttribute("aria-orientation") === "horizontal");
		const colSep = Array.from(separators).find(s => s.getAttribute("aria-orientation") === "vertical");

		expect(rowSep).toBeDefined();
		expect(colSep).toBeDefined();

		// Check ARIA and label
		expect(rowSep?.getAttribute("aria-valuenow")).toBeDefined();
		expect(rowSep?.getAttribute("aria-valuetext")).toMatch(/%/);
		expect(rowSep?.getAttribute("aria-label")).toMatch(/Thay đổi kích thước hàng|Resize row/);
		expect(colSep?.getAttribute("aria-label")).toMatch(/Thay đổi kích thước cột|Resize column/);
	});

	it("supports keyboard resizing via Arrow keys, Home, and End", () => {
		const onLayoutChange = vi.fn();
		const { container } = render(
			<GridContainer
				charts={[]}
				layout={layout2x2}
				activeChartId={null}
				syncSettings={{} as any}
				defaultChartProps={{} as any}
				chartRefs={{ current: new Map() } as any}
				chartHandles={{ current: new Map() } as any}
				setActiveChart={() => {}}
				addChart={() => {}}
				onLayoutChange={onLayoutChange}
			/>
		);

		const rowSep = container.querySelector('[role="separator"][aria-orientation="horizontal"]') as HTMLElement;
		expect(rowSep).toBeDefined();

		// ArrowDown on row separator
		fireEvent.keyDown(rowSep, { key: "ArrowDown" });
		expect(onLayoutChange).toHaveBeenCalled();
		const afterDown = onLayoutChange.mock.calls.at(-1)?.[0] as GridLayout;
		expect(parseFloat(afterDown.rowSizes[0])).toBeGreaterThan(1);

		// Home key sets to min
		fireEvent.keyDown(rowSep, { key: "Home" });
		const afterHome = onLayoutChange.mock.calls.at(-1)?.[0] as GridLayout;
		expect(parseFloat(afterHome.rowSizes[0])).toBeLessThanOrEqual(parseFloat(afterDown.rowSizes[0]));
	});

	it("resets tracks to 1fr on double click", () => {
		const onLayoutChange = vi.fn();
		const { container } = render(
			<GridContainer
				charts={[]}
				layout={{
					...layout2x2,
					rowSizes: ["1.5fr", "0.5fr"],
				}}
				activeChartId={null}
				syncSettings={{} as any}
				defaultChartProps={{} as any}
				chartRefs={{ current: new Map() } as any}
				chartHandles={{ current: new Map() } as any}
				setActiveChart={() => {}}
				addChart={() => {}}
				onLayoutChange={onLayoutChange}
			/>
		);

		const rowSep = container.querySelector('[role="separator"][aria-orientation="horizontal"]') as HTMLElement;
		fireEvent.doubleClick(rowSep);

		expect(onLayoutChange).toHaveBeenCalled();
		const resetLayout = onLayoutChange.mock.calls.at(-1)?.[0] as GridLayout;
		expect(resetLayout.rowSizes).toEqual(["1fr", "1fr"]);
	});

	it("handles pointer drag and releases cleanly", () => {
		const onLayoutChange = vi.fn();
		const { container } = render(
			<GridContainer
				charts={[]}
				layout={layout2x2}
				activeChartId={null}
				syncSettings={{} as any}
				defaultChartProps={{} as any}
				chartRefs={{ current: new Map() } as any}
				chartHandles={{ current: new Map() } as any}
				setActiveChart={() => {}}
				addChart={() => {}}
				onLayoutChange={onLayoutChange}
			/>
		);

		const colSep = container.querySelector('[role="separator"][aria-orientation="vertical"]') as HTMLElement;
		expect(colSep).toBeDefined();

		fireEvent.pointerDown(colSep, { clientX: 300, clientY: 300, pointerId: 1 });
		window.dispatchEvent(new PointerEvent("pointermove", { clientX: 350, clientY: 300, pointerId: 1 }));
		window.dispatchEvent(new PointerEvent("pointerup", { clientX: 350, clientY: 300, pointerId: 1 }));

		expect(onLayoutChange).toHaveBeenCalled();
		const newLayout = onLayoutChange.mock.calls.at(-1)?.[0] as GridLayout;
		expect(newLayout.colSizes).toBeDefined();
	});

	it("does not persist on click without drag (zero delta)", () => {
		const onLayoutChange = vi.fn();
		const { container } = render(
			<GridContainer
				charts={[]}
				layout={layout2x2}
				activeChartId={null}
				syncSettings={{} as any}
				defaultChartProps={{} as any}
				chartRefs={{ current: new Map() } as any}
				chartHandles={{ current: new Map() } as any}
				setActiveChart={() => {}}
				addChart={() => {}}
				onLayoutChange={onLayoutChange}
			/>
		);

		const colSep = container.querySelector('[role="separator"][aria-orientation="vertical"]') as HTMLElement;
		fireEvent.pointerDown(colSep, { clientX: 300, clientY: 300, pointerId: 2 });
		window.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 300, pointerId: 2 }));

		expect(onLayoutChange).not.toHaveBeenCalled();
	});

	it("cancels drag on Escape without persisting", () => {
		const onLayoutChange = vi.fn();
		const { container } = render(
			<GridContainer
				charts={[]}
				layout={layout2x2}
				activeChartId={null}
				syncSettings={{} as any}
				defaultChartProps={{} as any}
				chartRefs={{ current: new Map() } as any}
				chartHandles={{ current: new Map() } as any}
				setActiveChart={() => {}}
				addChart={() => {}}
				onLayoutChange={onLayoutChange}
			/>
		);

		const colSep = container.querySelector('[role="separator"][aria-orientation="vertical"]') as HTMLElement;
		fireEvent.pointerDown(colSep, { clientX: 300, clientY: 300, pointerId: 3 });
		window.dispatchEvent(new PointerEvent("pointermove", { clientX: 380, clientY: 300, pointerId: 3 }));
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		window.dispatchEvent(new PointerEvent("pointerup", { clientX: 380, clientY: 300, pointerId: 3 }));

		expect(onLayoutChange).not.toHaveBeenCalled();
	});
});
