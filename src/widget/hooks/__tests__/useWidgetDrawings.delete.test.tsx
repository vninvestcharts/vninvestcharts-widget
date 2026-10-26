// @vitest-environment jsdom
// S1.1 regression lock (F-01): ONE physical Delete => ONE history entry.
// Pre-fix this file FAILS (dual channel => 2 REPLACE entries => 1 undo no-op).
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { useWidgetDrawings } from "../useWidgetDrawings";
import { useWidgetOverlays } from "../useWidgetOverlays";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const d1 = {
	id: "d1",
	type: "trendLine",
	points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
	style: { stroke: "#2962ff", strokeWidth: 2 },
} as any;

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
		fire: (e: KeyboardEvent) => { handlers.forEach((h) => h(e)); },
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

function mountProbe(keyboard: ReturnType<typeof makeKeyboardAdapter>) {
	// Seed storage BEFORE mount: hydration load would otherwise overwrite the
	// default drawing with [] (empty localStorage => load => []).
	window.localStorage.setItem("rsc-drawings-v1-PROBE-1m", JSON.stringify([d1]));
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	const captured: { drawings?: any; overlays?: any } = {};
	function Probe() {
		const drawingsResult = useWidgetDrawings({
			plotData: [],
			symbol: "PROBE",
			timeframe: "1m" as any,
			drawingUiEnabled: true,
			defaultDrawings: [d1],
			keyboardAdapter: keyboard.adapter,
			useForkRuntime: false,
			isEditingText: false,
		});
		const overlaysResult = useWidgetOverlays(overlaysOptions({
			drawingWorkspace: drawingsResult.drawingWorkspace,
			resolvedSelectedDrawing: drawingsResult.resolvedSelectedDrawing,
		}) as never);
		captured.drawings = drawingsResult;
		captured.overlays = overlaysResult;
		return null;
	}
	act(() => {
		root.render(createElement(Probe));
	});
	return {
		captured,
		cleanup: () => {
			act(() => { root.unmount(); });
			container.remove();
		},
	};
}

function pressDeleteThroughBothChannels(keyboard: ReturnType<typeof makeKeyboardAdapter>, target?: HTMLElement | null) {
	// One physical keypress reaches BOTH subscription points: the raw window
	// listener (overlays channel) and the injected adapter (drawings channel).
	const evt = new KeyboardEvent("keydown", { key: "Delete", bubbles: true });
	const dispatchTarget = target ?? window;
	act(() => {
		dispatchTarget.dispatchEvent(evt);
		keyboard.fire(evt);
	});
}

describe("S1.1 single delete => single history entry (F-01)", () => {
	it("one Delete removes once and one Ctrl+Z restores", () => {
		const keyboard = makeKeyboardAdapter();
		const probe = mountProbe(keyboard);
		try {
			const ws = () => probe.captured.drawings.drawingWorkspace;
			expect(ws().state.drawings).toHaveLength(1);
			act(() => { ws().selectDrawing("d1"); });
			expect(ws().state.selectedIds).toEqual(["d1"]);
			pressDeleteThroughBothChannels(keyboard);
			expect(ws().state.drawings).toHaveLength(0);
			// Exactly ONE history entry: a single undo must restore.
			act(() => { ws().interaction.undo(); });
			expect(ws().state.drawings.map((d: any) => d.id)).toEqual(["d1"]);
		} finally {
			probe.cleanup();
		}
	});

	it("S1.1 toolbar-focus: global channel yields to the floating bar", () => {
		const keyboard = makeKeyboardAdapter();
		const probe = mountProbe(keyboard);
		const bar = document.createElement("div");
		bar.setAttribute("role", "toolbar");
		const inner = document.createElement("button", {} as any);
		bar.appendChild(inner);
		document.body.appendChild(bar);
		try {
			const ws = () => probe.captured.drawings.drawingWorkspace;
			act(() => { ws().selectDrawing("d1"); });
			pressDeleteThroughBothChannels(keyboard, inner);
			// Global must NOT dispatch when focus is inside [role="toolbar"]
			// (the floating bar's local nav owns Delete there).
			expect(ws().state.drawings).toHaveLength(1);
		} finally {
			bar.remove();
			probe.cleanup();
		}
	});

	it("S1.2 keydown+keyup through the adapter still removes exactly once", () => {
		const keyboard = makeKeyboardAdapter();
		const probe = mountProbe(keyboard);
		try {
			const ws = () => probe.captured.drawings.drawingWorkspace;
			act(() => { ws().selectDrawing("d1"); });
			act(() => {
				keyboard.fire(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
				keyboard.fire(new KeyboardEvent("keyup", { key: "Delete", bubbles: true }));
			});
			expect(ws().state.drawings).toHaveLength(0);
			act(() => { ws().interaction.undo(); });
			expect(ws().state.drawings.map((d: any) => d.id)).toEqual(["d1"]);
		} finally {
			probe.cleanup();
		}
	});
});
