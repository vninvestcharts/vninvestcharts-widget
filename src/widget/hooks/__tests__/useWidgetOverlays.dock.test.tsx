// @vitest-environment jsdom
import { isValidElement, createElement } from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useWidgetOverlays } from "../useWidgetOverlays";
import DrawingDock from "../../components/drawing/DrawingDock";

const fakeDrawing: any = {
	id: "d1",
	type: "trendLine",
	points: [{ x: 1, y: 10 }, { x: 5, y: 12 }],
	style: { stroke: "#2962ff", strokeWidth: 2 },
	createdAt: 1,
	updatedAt: 1,
};

function makeWorkspace(drawings: any[], activeTab: string) {
	return {
		state: {
			activeTool: "cursor",
			clipboard: null,
			dock: { isOpen: true, activeTab, position: null, sizeDelta: { w: 0, h: 0 } },
			drawings,
			selectedDrawing: drawings[0] ?? null,
			selectedIds: drawings.length > 0 ? [drawings[0].id] : [],
		},
		interaction: {
			allDrawings: drawings,
			updateDrawing: vi.fn(),
			replaceDrawings: vi.fn(),
			dispatch: vi.fn(),
		},
		selectDrawing: vi.fn(),
		closeDock: vi.fn(),
		setDockTab: vi.fn(),
		setDockLayout: vi.fn(),
	};
}

function baseOptions(overrides: Record<string, unknown> = {}) {
	return {
		useForkRuntime: false,
		visiblePanes: [],
		paneSnapshotMap: new Map(),
		paneSnapshots: [],
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
		localAvailable: 0,
		localHeights: [],
		localApplyDelta: () => {},
		localResetToDefault: () => {},
		drawingWorkspace: makeWorkspace([], "objects"),
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
		showDrawingDock: true,
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

describe("useWidgetOverlays drawing dock (P0 regression for D-UI-02)", () => {
	it("forwards the objects list content to the live dock", () => {
		const workspace = makeWorkspace([fakeDrawing], "objects");
		const probe = renderProbe(baseOptions({ drawingWorkspace: workspace }));
		try {
			const node = probe.captured().drawingDockNode;
			expect(isValidElement(node)).toBe(true);
			expect((node as { type: unknown }).type).toBe(DrawingDock);
			const props = (node as { props: Record<string, unknown> }).props;
			expect(isValidElement(props.objectsContent)).toBe(true);
			expect(isValidElement(props.propertiesContent)).toBe(true);
			expect(isValidElement(props.templatesContent)).toBe(true);
		} finally {
			probe.cleanup();
		}
	});

	it("passes all three contents through a custom renderDrawingDock", () => {
		let received: Record<string, unknown> | null = null;
		const workspace = makeWorkspace([fakeDrawing], "objects");
		const probe = renderProbe(baseOptions({
			drawingWorkspace: workspace,
			renderDrawingDock: (ctx: Record<string, unknown>) => {
				received = ctx;
				return null;
			},
		}));
		try {
			if (received === null) throw new Error("renderDrawingDock was not called");
			const ctx: Record<string, unknown> = received;
			expect(isValidElement(ctx.propertiesContent)).toBe(true);
			expect(isValidElement(ctx.objectsContent)).toBe(true);
			expect(isValidElement(ctx.templatesContent)).toBe(true);
		} finally {
			probe.cleanup();
		}
	});

	it("returns null dock node when the dock is closed", () => {
		const workspace = makeWorkspace([fakeDrawing], "objects");
		workspace.state.dock.isOpen = false;
		const probe = renderProbe(baseOptions({ drawingWorkspace: workspace }));
		try {
			expect(probe.captured().drawingDockNode).toBeNull();
		} finally {
			probe.cleanup();
		}
	});

	// DOCK_SSOT_B3 (S2): test D2 cũ (matrix `showDock`) đã gỡ — `showDock` không còn
	// vào hook (mount + shell giờ ở VNInvestCharts → RightDockRail). Coverage mount
	// nằm tại RightDockDefault.test.tsx (AC1), coverage shell tại WorkspaceRightDock.
});
