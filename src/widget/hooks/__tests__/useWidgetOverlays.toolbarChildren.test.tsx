// @vitest-environment jsdom
import { Children, createElement, isValidElement } from "react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";

import { IndicatorLegend } from "../../../lib/core";
import { useWidgetOverlays } from "../useWidgetOverlays";

const pricePane: any = {
	id: "price",
	label: "Price",
	pinned: true,
	visible: true,
	heightRatio: 0.7,
	series: [],
	splitScale: false,
	tooltip: "ohlc",
};

const priceSnapshot: any = {
	paneId: "price",
	bounds: { left: 0, top: 0, width: 800, height: 500 },
	plotBounds: { left: 0, top: 24, width: 752, height: 476 },
	axisBounds: { right: { left: 752, top: 0, width: 48, height: 500 } },
};

function baseOptions(overrides: Record<string, unknown> = {}) {
	return {
		useForkRuntime: false,
		visiblePanes: [pricePane],
		paneSnapshotMap: new Map([["price", priceSnapshot]]),
		paneSnapshots: [priceSnapshot],
		size: { width: 800, height: 600 },
		hoveredPaneId: null,
		claimForkPointerOwner: () => {},
		releaseForkPointerOwner: () => {},
		handlePaneToggleVisible: () => {},
		handlePaneRemove: () => {},
		handlePaneAddSeries: () => {},
		handlePaneEditSeries: () => {},
		handlePaneToggleSeries: () => {},
		handlePaneRemoveSeries: () => {},
		localizePane: (pane: unknown) => pane,
		localAvailable: 500,
		localHeights: [500],
		localApplyDelta: () => {},
		localResetToDefault: () => {},
		drawingWorkspace: null,
		resolvedSelectedDrawing: null,
		resolvedLegacyVisibleRange: null,
		effectiveForkVisibleRange: null,
		magnetSensitivity: "medium",
		isDark: false,
		plotData: [],
		visibleDomainRef: { current: null },
		cloneSelectedDrawing: () => {},
		toggleSelectedLock: () => {},
		handleStartTextEdit: () => {},
		isEditingText: false,
		drawingTextDraft: "",
		setDrawingTextDraft: () => {},
		handleCommitTextEdit: () => {},
		handleCancelTextEdit: () => {},
		bringSelectedToFront: () => {},
		sendSelectedToBack: () => {},
		showDrawingDock: false,
		renderDrawingDock: undefined,
		activeSettingsOpen: false,
		activeOnSettingsClose: () => {},
		t: (key: string) => key,
		showDrawingPriceMarkers: false,
		resolvedForkPriceMarkerSelection: null,
		previewImageDataUrl: null,
		setPreviewImageDataUrl: () => {},
		...overrides,
	};
}

function renderProbe(options: Record<string, unknown>) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	let captured: any = null;
	function Probe(props: { hookOptions: unknown }) {
		captured = useWidgetOverlays(props.hookOptions as never);
		return null;
	}
	act(() => {
		root.render(createElement(Probe, { hookOptions: options }));
	});
	return {
		captured: () => captured,
		cleanup: () => {
			act(() => {
				root.unmount();
			});
			container.remove();
		},
	};
}

/** Deep-search a React element tree for the first element of a given type. */
function findByType(node: unknown, type: unknown): boolean {
	if (!isValidElement(node)) return false;
	if ((node as { type: unknown }).type === type) return true;
	let found = false;
	Children.forEach((node as { props?: { children?: unknown } }).props?.children, (child) => {
		if (!found && findByType(child, type)) found = true;
	});
	return found;
}

/** Collect all `data-*` marker values in a React element tree. */
function collectTestIds(node: unknown, out: string[]) {
	if (!isValidElement(node)) return;
	const props = (node as { props?: Record<string, unknown> }).props ?? {};
	for (const [key, value] of Object.entries(props)) {
		if (key.startsWith("data-") && typeof value === "string") out.push(`${key}=${value}`);
	}
	Children.forEach(props.children as unknown, (child) => collectTestIds(child, out));
}

describe("useWidgetOverlays custom toolbar children (legend-append lock)", () => {
	it("preserves the custom toolbar children and appends the indicator legend", () => {
		const probe = renderProbe(baseOptions({
			renderPaneToolbar: () =>
				createElement("div", { "data-custom-toolbar": "price" },
					createElement("button", { type: "button", "data-custom-btn": "toggle" }, "toggle")),
		}));
		try {
			const nodes = probe.captured().paneToolbarNodes;
			expect(nodes).toHaveLength(1);
			expect(isValidElement(nodes[0])).toBe(true);
			const markers: string[] = [];
			collectTestIds(nodes[0], markers);
			// The custom interactive child must survive (old code replaced children).
			expect(markers).toContain("data-custom-btn=toggle");
			// The indicator legend must still be appended after it.
			expect(findByType(nodes[0], IndicatorLegend)).toBe(true);
		} finally {
			probe.cleanup();
		}
	});

	it("still renders the legend when the custom toolbar has no children", () => {
		const probe = renderProbe(baseOptions({
			renderPaneToolbar: () => createElement("div", { "data-custom-toolbar": "price" }),
		}));
		try {
			const nodes = probe.captured().paneToolbarNodes;
			expect(nodes).toHaveLength(1);
			expect(findByType(nodes[0], IndicatorLegend)).toBe(true);
		} finally {
			probe.cleanup();
		}
	});
});
