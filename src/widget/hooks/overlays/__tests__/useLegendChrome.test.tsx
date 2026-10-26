import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLegendChrome, useCompareLegendNode } from "../useLegendChrome";

const t = (key: string) => key;

let sharedChrome: ReturnType<typeof useLegendChrome>;

function makeNodeDeps(overrides: Record<string, unknown> = {}) {
	return {
		compareLegendSlot: "statusline",
		visiblePanes: [{ id: "price", series: [] }],
		legendPanes: undefined,
		localizePane: (p: unknown) => p,
		legendSeriesSuffix: undefined,
		handlePaneToggleSeries: vi.fn(),
		handlePaneRemoveSeries: vi.fn(),
		handlePaneEditSeries: vi.fn(),
		legendChrome: sharedChrome,
		hoveredDatum: null,
		...overrides,
	} as never;
}

describe("useLegendChrome (D0 split)", () => {
	it("returns icons + i18n labels", () => {
		const { result } = renderHook(() => useLegendChrome(t));
		expect(result.current.icons.eye).toBeDefined();
		expect(result.current.labels.showIndicatorTitle).toBe("legend.show");
		expect(result.current.labels.removeIndicatorAriaLabel("X")).toBe("legend.remove: X");
	});

	it("compare node: null when slot embedded, null without compare, element with compare", () => {
		sharedChrome = renderHook(() => useLegendChrome(t)).result.current;
		const pane = {
			id: "price",
			series: [
				{ type: "Candlestick", yAxis: "right" },
				{ id: "compare-SOL", type: "Comparison", yAxis: "right", overlaySymbolId: "SOL" },
			],
		};
		const embedded = renderHook(() => useCompareLegendNode(makeNodeDeps({ compareLegendSlot: "embedded", visiblePanes: [pane] })));
		expect(embedded.result.current("price")).toBeNull();

		const noCompare = renderHook(() => useCompareLegendNode(makeNodeDeps({ visiblePanes: [{ id: "price", series: [] }] })));
		expect(noCompare.result.current("price")).toBeNull();

		const withCompare = renderHook(() => useCompareLegendNode(makeNodeDeps({ visiblePanes: [pane] })));
		const node = withCompare.result.current("price") as unknown as { props: Record<string, unknown> };
		expect(node).not.toBeNull();
		expect(node.props.pane).toBe(pane);
		expect(node.props.visibleTypes).toEqual(["Comparison"]);
	});
});
