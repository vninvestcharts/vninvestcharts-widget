import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWidgetWorkspaceIO, type WidgetWorkspaceIODeps } from "../useWidgetWorkspaceIO";

function makeDeps(overrides: Partial<WidgetWorkspaceIODeps> = {}): WidgetWorkspaceIODeps {
	return {
		paneState: { panes: [], dispatch: vi.fn() } as never,
		drawingsInteraction: { allDrawings: [], replaceDrawings: vi.fn() },
		settings: {
			t: (k: string) => k,
			themeState: { theme: "dark", toggleTheme: vi.fn() },
		} as never,
		activeSymbol: "HPG",
		activeTimeframe: "1D",
		enrichedData: [],
		resolvedPanes: [],
		portalAdapter: null,
		...overrides,
	};
}

describe("useWidgetWorkspaceIO", () => {
	it("compareLegendSuffix guards (short data / unknown pane / non-comparison)", () => {
		const { result } = renderHook(() => useWidgetWorkspaceIO(makeDeps()));
		expect(result.current.compareLegendSuffix("p", 0)).toBeUndefined();
	});

	it("compareLegendSuffix returns signed % for Comparison overlays", () => {
		const symbolData = { FPT: { close: 100 } };
		const deps = makeDeps({
			enrichedData: [
				{ symbolData } as never,
				{ symbolData: { FPT: { close: 110 } } } as never,
			],
			resolvedPanes: [
				{ id: "price", series: [{ type: "Comparison", overlaySymbolId: "FPT" }] } as never,
			],
		});
		const { result } = renderHook(() => useWidgetWorkspaceIO(deps));
		expect(result.current.compareLegendSuffix("price", 0)).toBe("+10.00%");
		expect(result.current.compareLegendSuffix("nope", 0)).toBeUndefined();
	});

	it("handleImportLayout rejects malformed JSON with an alert", () => {
		const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
		try {
			const deps = makeDeps();
			const { result } = renderHook(() => useWidgetWorkspaceIO(deps));
			result.current.handleImportLayout("not-json{{{");
			expect(alertSpy).toHaveBeenCalled();
			expect(deps.paneState.dispatch).not.toHaveBeenCalled();
		} finally {
			alertSpy.mockRestore();
		}
	});

	it("BL-17: routes feedback through notify instead of alert when provided", () => {
		const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
		const notify = vi.fn();
		try {
			const deps = makeDeps({ notify });
			const { result } = renderHook(() => useWidgetWorkspaceIO(deps));
			result.current.handleImportLayout("not-json{{{");
			expect(notify).toHaveBeenCalledWith(expect.any(String), "error");
			expect(alertSpy).not.toHaveBeenCalled();
			expect(deps.paneState.dispatch).not.toHaveBeenCalled();
		} finally {
			alertSpy.mockRestore();
		}
	});

	it("BL-17: applies a valid workspace and notifies success", () => {
		const notify = vi.fn();
		const replaceDrawings = vi.fn();
		const dispatch = vi.fn();
		const deps = makeDeps({
			notify,
			drawingsInteraction: { allDrawings: [], replaceDrawings },
			paneState: { panes: [], dispatch } as never,
		});
		const { result } = renderHook(() => useWidgetWorkspaceIO(deps));
		result.current.handleImportLayout(JSON.stringify({
			version: 1,
			panes: [{ id: "price", series: [] }],
			drawings: [{ id: "d1", type: "trendLine", points: [] }],
			settings: {},
		}));
		expect(dispatch).toHaveBeenCalledWith({ type: "replaceLayout", panes: [{ id: "price", series: [] }] });
		expect(replaceDrawings).toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(expect.any(String), "success");
	});
});
