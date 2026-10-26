// @vitest-environment jsdom
// VOL_FIX lock: every pane header (incl. Vol without its own left series)
// clears the GLOBAL left gutter, matching the engine plot shift.
import { createElement } from "react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";

import { useWidgetOverlays } from "../useWidgetOverlays";

const pricePane: any = { id: "price", label: "Price", pinned: true, visible: true, heightRatio: 0.7, series: [], splitScale: false, tooltip: "ohlc" };
const volumePane: any = { id: "volume", label: "Vol", visible: true, heightRatio: 0.3, series: [], splitScale: false };

const bounds = (width: number) => ({ top: 0, left: 0, width, height: 100 });

function optionsFor(priceAxis: any, volumeAxis: any, toolbarLocked = false, showToolbar = true) {
	const priceSnapshot: any = { paneId: "price", bounds: { left: 0, top: 0, width: 800, height: 400 }, plotBounds: { left: 60, top: 0, width: 672, height: 400 }, axisBounds: priceAxis };
	const volumeSnapshot: any = { paneId: "volume", bounds: { left: 0, top: 400, width: 800, height: 200 }, plotBounds: { left: 60, top: 400, width: 672, height: 200 }, axisBounds: volumeAxis };
	const seen: Record<string, any> = {};
	return {
		useForkRuntime: false,
		visiblePanes: [pricePane, volumePane],
		paneSnapshotMap: new Map([["price", priceSnapshot], ["volume", volumeSnapshot]]),
		paneSnapshots: [priceSnapshot, volumeSnapshot],
		size: { width: 800, height: 600 },
		hoveredPaneId: null,
		claimForkPointerOwner: () => {}, releaseForkPointerOwner: () => {},
		handlePaneToggleVisible: () => {}, handlePaneRemove: () => {},
		handlePaneAddSeries: () => {}, handlePaneEditSeries: () => {},
		handlePaneToggleSeries: () => {}, handlePaneRemoveSeries: () => {},
		localizePane: (pane: unknown) => pane,
		localAvailable: 500, localHeights: [400, 200], localApplyDelta: () => {}, localResetToDefault: () => {},
		drawingWorkspace: null, resolvedSelectedDrawing: null,
		resolvedLegacyVisibleRange: null, effectiveForkVisibleRange: null,
		magnetSensitivity: "medium", isDark: false, plotData: [],
		visibleDomainRef: { current: null },
		cloneSelectedDrawing: () => {}, toggleSelectedLock: () => {},
		handleStartTextEdit: () => {}, isEditingText: false, drawingTextDraft: "", setDrawingTextDraft: () => {},
		handleCommitTextEdit: () => {}, handleCancelTextEdit: () => {},
		bringSelectedToFront: () => {}, sendSelectedToBack: () => {},
		showDrawingDock: false, renderDrawingDock: undefined,
		activeSettingsOpen: false, activeOnSettingsClose: () => {},
		t: (key: string) => key, showDrawingPriceMarkers: false,
		resolvedForkPriceMarkerSelection: null, previewImageDataUrl: null, setPreviewImageDataUrl: () => {},
		renderPaneToolbar: (ctx: any) => {
			seen[ctx.pane.id] = ctx.paneHeaderStyle;
			return createElement("div", { "data-probe": ctx.pane.id });
		},
		toolbarLocked,
		showToolbar,
		__seen: seen,
	};
}

function captureOverlays(hookOptions: any) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	let captured: any = null;
	function Probe(props: { hookOptions: unknown }) {
		captured = useWidgetOverlays(props.hookOptions as never);
		return null;
	}
	act(() => { root.render(createElement(Probe, { hookOptions })); });
	const seen = (hookOptions as any).__seen;
	const nodes = captured.paneToolbarNodes;
	const splitters = captured.paneSplitterNodes;
	act(() => { root.unmount(); });
	container.remove();
	return { seen: seen as Record<string, any>, nodes, splitters };
}

function captureStyles(hookOptions: any) {
	return captureOverlays(hookOptions).seen;
}

describe("useWidgetOverlays global header offset (VOL_FIX)", () => {
	it("shifts the Vol header just outside the left axis owned by the price pane", () => {
		const seen = captureStyles(optionsFor(
			{ left: bounds(60), right: bounds(68) },
			{ right: bounds(68) },
		));
		// Small uniform gap hugging outside the axes — never floating deep
		// inside the plot area.
		expect(seen.price.paddingLeft).toBe("calc(60px + 4px)");
		expect(seen.volume.paddingLeft).toBe("calc(60px + 4px)");
		expect(seen.price.paddingRight).toBe("calc(68px + 4px)");
		expect(seen.volume.paddingRight).toBe("calc(68px + 4px)");
	});

	it("stays flush-left when no pane owns a left axis", () => {
		const seen = captureStyles(optionsFor(
			{ right: bounds(68) },
			{ right: bounds(68) },
		));
		expect(seen.price.paddingLeft).toBe(0);
		expect(seen.volume.paddingLeft).toBe(0);
		expect(seen.price.paddingRight).toBe("calc(68px + 4px)");
		expect(seen.volume.paddingRight).toBe("calc(68px + 4px)");
	});
});

describe("useWidgetOverlays docked-toolbar origin (DOCK_FIX)", () => {
	it("shifts header + splitter wraps by the dock margin while the rail is docked", () => {
		const { seen, nodes, splitters } = captureOverlays(optionsFor(
			{ left: bounds(60), right: bounds(68) },
			{ right: bounds(68) },
			true,
		));
		// Overlay layer tracks the INNER (dock-margined) chart box: wrap
		// origin moves right 44px so the 👁 actions hug the right Y axis
		// instead of sitting 48px off it.
		expect(nodes[0].props.style.left).toBe(44);
		expect(nodes[1].props.style.left).toBe(44);
		expect(nodes[0].props.style.width).toBe(800);
		// Axis clearance paddings are unchanged by docking.
		expect(seen.volume.paddingLeft).toBe("calc(60px + 4px)");
		expect(seen.volume.paddingRight).toBe("calc(68px + 4px)");
		// Splitter lives in the same outer layer: plotBounds.left (60) + 44.
		const splitterInner = (splitters[0] as any).props.children;
		expect(splitterInner.props.style.left).toBe(104);
	});

	it("SYM-AXIS: keeps wrap origin at snapshot bounds while undocked with a left axis", () => {
		const { nodes, splitters } = captureOverlays(optionsFor(
			{ left: bounds(60), right: bounds(68) },
			{ right: bounds(68) },
			false,
		));
		// The 48px left gutter hosts the rail grip — reserve 0, frame symmetric.
		expect(nodes[0].props.style.left).toBe(0);
		expect(nodes[1].props.style.left).toBe(0);
		const splitterInner = (splitters[0] as any).props.children;
		expect(splitterInner.props.style.left).toBe(60);
	});

	it("shifts wrap origin by the 10px rail grip while undocked without a left axis", () => {
		const { nodes, splitters } = captureOverlays(optionsFor(
			{ right: bounds(68) },
			{ right: bounds(68) },
			false,
		));
		// Matches the chart-column marginLeft (resolveRailReservePx): the
		// auto-hide rail keeps a 10px grip strip, not a 44px dead gutter.
		expect(nodes[0].props.style.left).toBe(10);
		expect(nodes[1].props.style.left).toBe(10);
		const splitterInner = (splitters[0] as any).props.children;
		expect(splitterInner.props.style.left).toBe(70);
	});

	it("ignores the shared docked key when this instance mounts no rail (grid cell)", () => {
		// Grid cells read the same vnsc_toolbar_docked key but render no
		// rail — without the showToolbar gate every cell would keep a
		// phantom 44px strip beside the left Y axis.
		const { nodes, splitters } = captureOverlays(optionsFor(
			{ left: bounds(60), right: bounds(68) },
			{ right: bounds(68) },
			true,
			false,
		));
		expect(nodes[0].props.style.left).toBe(0);
		expect(nodes[1].props.style.left).toBe(0);
		const splitterInner = (splitters[0] as any).props.children;
		expect(splitterInner.props.style.left).toBe(60);
	});
});
