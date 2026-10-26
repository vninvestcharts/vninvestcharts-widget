// @vitest-environment jsdom
// S1/BUG-1: multi-select bar mounts in production with all 6 batch actions.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { useWidgetDrawings } from "../useWidgetDrawings";
import { useWidgetOverlays } from "../useWidgetOverlays";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const mkDrawings = () => [1, 2, 3].map((n) => ({
	id: `m${n}`,
	type: "rectangle",
	points: [{ x: n, y: n }, { x: n + 1, y: n + 1 }],
	style: { stroke: "#2962ff", strokeWidth: 2 },
})) as any[];

function makeKeyboardAdapter() {
	const handlers = new Set<(e: KeyboardEvent) => void>();
	return {
		adapter: {
			onKeyDown: (h: (e: KeyboardEvent) => void) => {
				handlers.add(h);
				return () => { handlers.delete(h); };
			},
			onShortcut: () => () => {},
		} as any,
	};
}

function overlaysOptions(overrides: Record<string, unknown> = {}) {
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
		localAvailable: 500,
		localHeights: [500],
		localApplyDelta: () => {},
		localResetToDefault: () => {},
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

function mountMulti(drawings: any[]) {
	window.localStorage.setItem("rsc-drawings-v1-PROBE-1m", JSON.stringify(drawings));
	const keyboard = makeKeyboardAdapter();
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	const captured: { drawings?: any; overlays?: any } = {};
	// Minimal fixtures so resolveDrawingSelectionToolbarPosition succeeds.
	const paneSnapshots = [{
		paneId: "price",
		bounds: { left: 0, top: 0, width: 800, height: 400 },
		plotBounds: { left: 0, top: 0, width: 760, height: 400 },
		scaleSlotStates: { "price-right": { domain: [0, 200] } },
	}] as never;
	const plotData = [0, 1, 2, 3, 4].map((i) => ({
		date: new Date(i * 3600000), open: 100, high: 102, low: 99, close: 101, volume: 1000,
	}));
	function Probe() {
		const drawingsResult = useWidgetDrawings({
			plotData: [],
			symbol: "PROBE",
			timeframe: "1m" as any,
			drawingUiEnabled: true,
			defaultDrawings: drawings,
			keyboardAdapter: keyboard.adapter,
			useForkRuntime: false,
			isEditingText: false,
		});
		const overlaysResult = useWidgetOverlays(overlaysOptions({
			drawingWorkspace: drawingsResult.drawingWorkspace,
			resolvedSelectedDrawing: drawingsResult.resolvedSelectedDrawing,
			paneSnapshots,
			plotData,
		}) as never);
		captured.drawings = drawingsResult;
		captured.overlays = overlaysResult;
		return createElement("div", null, overlaysResult.drawingChromeNode);
	}
	act(() => {
		root.render(createElement(Probe));
	});
	return {
		captured,
		container,
		selectThree: () => {
			act(() => {
				captured.drawings.drawingWorkspace.interaction.dispatch({
					type: "SET_SELECTED_OBJECTS",
					objectIds: ["m1", "m2", "m3"],
				});
			});
		},
		cleanup: () => {
			act(() => { root.unmount(); });
			container.remove();
		},
	};
}

describe("S1 multi-select bar production wiring (BUG-1/M-5)", () => {
	it("selecting 3 shows the multi bar with batch actions", () => {
		const probe = mountMulti(mkDrawings());
		try {
			probe.selectThree();
			const bar = probe.container.querySelector('[role="toolbar"]');
			expect(bar).not.toBeNull();
			// Multi-only buttons: group toggle + delete-all (absent on single bar).
			const labels = Array.from(bar!.querySelectorAll("button")).map((b) =>
				(b.getAttribute("aria-label") || b.textContent || "").toLowerCase(),
			);
			expect(labels.some((l) => l.includes("group"))).toBe(true);
			expect(labels.some((l) => l.includes("delete"))).toBe(true);
		} finally {
			probe.cleanup();
		}
	});

	it("Delete-all removes 3 with 1 history entry; 1 undo restores all", () => {
		const probe = mountMulti(mkDrawings());
		try {
			const ws = () => probe.captured.drawings.drawingWorkspace;
			probe.selectThree();
			const bar = probe.container.querySelector('[role="toolbar"]') as HTMLElement;
			const delBtn = Array.from(bar.querySelectorAll("button")).find((b) =>
				(b.getAttribute("aria-label") || "").toLowerCase().includes("delete"),
			) as HTMLElement;
			expect(delBtn).toBeDefined();
			act(() => { delBtn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
			expect(ws().state.drawings).toHaveLength(0);
			act(() => { ws().interaction.undo(); });
			expect(ws().state.drawings.map((d: any) => d.id).sort()).toEqual(["m1", "m2", "m3"]);
		} finally {
			probe.cleanup();
		}
	});

	it("Group toggles symmetrically: assign shared groupId, second click clears", () => {
		const probe = mountMulti(mkDrawings());
		try {
			const ws = () => probe.captured.drawings.drawingWorkspace;
			probe.selectThree();
			const bar = probe.container.querySelector('[role="toolbar"]') as HTMLElement;
			const groupBtn = Array.from(bar.querySelectorAll("button")).find((b) =>
				(b.getAttribute("aria-label") || "").toLowerCase().includes("group"),
			) as HTMLElement;
			expect(groupBtn).toBeDefined();
			act(() => { groupBtn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
			const ids1 = ws().state.drawings.map((d: any) => d.groupId);
			expect(ids1[0]).toBeTruthy();
			expect(new Set(ids1).size).toBe(1);
			act(() => { groupBtn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
			expect(ws().state.drawings.every((d: any) => !d.groupId)).toBe(true);
		} finally {
			probe.cleanup();
		}
	});
});
