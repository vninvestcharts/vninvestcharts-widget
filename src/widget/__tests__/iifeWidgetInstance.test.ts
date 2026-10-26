import { describe, expect, it, vi } from "vitest";
import { createWidgetInstance } from "../iifeWidgetInstance";
import type { VNInvestMultiChartsRef } from "../VNInvestMultiCharts.types";
import type { WidgetChartHandle } from "../utils/widgetHelpers";

type MockHandle = WidgetChartHandle & {
	setSymbol: ReturnType<typeof vi.fn>;
	setTheme: ReturnType<typeof vi.fn>;
	toggleFullscreen: ReturnType<typeof vi.fn>;
	saveAsImage: ReturnType<typeof vi.fn>;
};

function makeHandle(id: string) {
	return {
		id,
		setSymbol: vi.fn(),
		setTimeframe: vi.fn(),
		setVisibleRange: vi.fn(),
		getVisibleRange: vi.fn(() => ({ from: 10, to: 90 })),
		exportDrawings: vi.fn(() => [{ id: "d1" }]),
		importDrawings: vi.fn(),
		getPaneSnapshots: vi.fn(() => [{ id: "p1" }]),
		saveAsImage: vi.fn(),
		toggleFullscreen: vi.fn(),
		setTheme: vi.fn(),
	} as unknown as MockHandle;
}

function makeRef(handles: Record<string, MockHandle>, activeId: string | null) {
	return {
		getActiveChart: vi.fn(() => activeId),
		getChartHandle: vi.fn((id: string) => handles[id]),
		getAllChartHandles: vi.fn(() => Object.values(handles)),		setLayout: vi.fn(),
		getLayout: vi.fn(() => ({ rows: 2, cols: 2 })),
		setActiveChart: vi.fn(),
	} as unknown as VNInvestMultiChartsRef;
}

describe("REL-04 iife widget instance adapter", () => {
	// AC-REL-04-2: mọi method trong docs phải tồn tại (không phải undefined).
	it("exposes every documented method as a real function", () => {
		const inst = createWidgetInstance(() => null);
		const required = [
			"setActiveSymbol",
			"setActiveTimeframe",
			"setActiveVisibleRange",
			"getActiveVisibleRange",
			"getActivePaneSnapshots",
			"exportActiveDrawings",
			"importActiveDrawings",
			"saveActiveChartImage",
			"toggleFullscreen",
			"setTheme",
			"setLayout",
			"getLayout",
			"setActiveChart",
			"getActiveChart",
			"getChartHandle",
			"getAllChartHandles",
		] as const;
		for (const name of required) {
			expect(typeof inst[name], `${name} phải là function`).toBe("function");
		}
	});

	// AC-REL-04-5: method nhắm ACTIVE chart, không phải chart đầu tiên.
	it("targets the active chart, not the first chart", () => {
		const a = makeHandle("a");
		const b = makeHandle("b");
		const ref = makeRef({ a, b }, "b");
		const inst = createWidgetInstance(() => ref);

		inst.setActiveSymbol("HPG");

		expect(b.setSymbol).toHaveBeenCalledWith("HPG");
		expect(a.setSymbol).not.toHaveBeenCalled();
	});

	it("falls back to the first handle when no chart is active", () => {
		const a = makeHandle("a");
		const b = makeHandle("b");
		const ref = makeRef({ a, b }, null);
		const inst = createWidgetInstance(() => ref);

		inst.setActiveTimeframe("1D");

		expect(a.setTimeframe).toHaveBeenCalledWith("1D");
		expect(b.setTimeframe).not.toHaveBeenCalled();
	});

	// Gọi trước khi React mount (ref null) không được throw.
	it("degrades safely when called before mount", () => {
		const inst = createWidgetInstance(() => null);
		expect(() => inst.setActiveSymbol("HPG")).not.toThrow();
		expect(() => inst.setActiveTimeframe("1D")).not.toThrow();
		expect(inst.getActiveVisibleRange()).toBeNull();
		expect(inst.getActivePaneSnapshots()).toEqual([]);
		expect(inst.exportActiveDrawings()).toEqual([]);
		expect(inst.getActiveChart()).toBeNull();
	});

	it("reads range/drawings/snapshots from the active handle", () => {
		const a = makeHandle("a");
		const ref = makeRef({ a }, "a");
		const inst = createWidgetInstance(() => ref);

		expect(inst.getActiveVisibleRange()).toEqual({ from: 10, to: 90 });
		expect(inst.getActivePaneSnapshots()).toEqual([{ id: "p1" }]);
		expect(inst.exportActiveDrawings()).toEqual([{ id: "d1" }]);

		inst.importActiveDrawings([{ id: "d2" }] as never);
		expect(a.importDrawings).toHaveBeenCalled();

		inst.saveActiveChartImage();
		expect(a.saveAsImage).toHaveBeenCalled();

		inst.toggleFullscreen();
		expect(a.toggleFullscreen).toHaveBeenCalled();
	});

	// Alias cũ phải trỏ đúng hàm mới (deprecated nhưng còn hoạt động).
	it("keeps deprecated aliases pointing at the active-chart methods", () => {
		const a = makeHandle("a");
		const ref = makeRef({ a }, "a");
		const inst = createWidgetInstance(() => ref);

		inst.setSymbol?.("VIC");
		expect(a.setSymbol).toHaveBeenCalledWith("VIC");

		inst.setTimeframe?.("1h");
		expect(a.setTimeframe).toHaveBeenCalledWith("1h");

		expect(inst.exportDrawings?.()).toEqual([{ id: "d1" }]);
	});

	it("forwards workspace-level calls to the real multi ref", () => {
		const a = makeHandle("a");
		const ref = makeRef({ a }, "a");
		const inst = createWidgetInstance(() => ref);

		inst.setLayout({ rows: 1, cols: 2 });
		expect(ref.setLayout).toHaveBeenCalledWith({ rows: 1, cols: 2 });
		expect(inst.getLayout()).toEqual({ rows: 2, cols: 2 });
		expect(inst.getAllChartHandles()).toHaveLength(1);
	});
});
