import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { DrawingObject, DrawingStorageAdapter } from "@vninvestcharts/engine-drawing";
import type { DrawingWorkspaceController, DrawingDockTab } from "@vninvestcharts/engine-react";
import { useDrawingWorkspaceController } from "@vninvestcharts/engine-react";
import { cloneDrawingSnapshot, isValidDrawingSnapshot, offsetDrawingByPixels } from "@vninvestcharts/engine-drawing";
import { WIDGET_CLIPBOARD_KEY } from "@vninvestcharts/engine-drawing";
import { reconcileForkDrawingIndexAnchors } from "../forkAnchorReconciliation";
import { createDateTimeIndexMap } from "@vninvestcharts/engine-core";
import { type EnrichedDatum } from "../../lib/core/calculators/types";
import type { MagnetSensitivity } from "@vninvestcharts/engine-drawing";
import { type WidgetPaneRuntimeSnapshot } from "../utils/widgetHelpers";
import { useKeyboardAdapter } from "./useKeyboardAdapter";
import { isTypingTarget } from "@vninvestcharts/engine-drawing";
import { ALT_TOOL_SHORTCUTS } from "../config/toolShortcuts";
import { dispatchToggleFavoritesBar } from "@vninvestcharts/engine-react";

import { type Timeframe } from "../../lib/types/adapter";
import type { KeyboardAdapter, StorageAdapter } from "@vninvestcharts/engine-react";
import { defaultKeyboardAdapter, defaultLocalStorageAdapter } from "@vninvestcharts/engine-react";

export interface UseWidgetDrawingsProps {
	defaultDrawings?: readonly DrawingObject[];
	drawings?: readonly DrawingObject[];
	drawingStorageKey?: string;
	drawingStorageAdapter?: DrawingStorageAdapter;
	/** P1-09: opt-in instance namespace for the default storage prefix. */
	instanceId?: string;
	/** P1-03/05: surfaced for UI feedback (toast) on storage failures. */
	onStorageError?: (info: { operation: "load" | "save" | "import" | "clear" | "dock-save"; error: unknown }) => void;
	defaultDrawingDockTab?: DrawingDockTab;
	onDrawingsChange?: (drawings: readonly DrawingObject[]) => void;
	drawingUiEnabled?: boolean;
	selectedDrawing?: DrawingObject | null;
	onSelectedDrawingChange?: (drawing: DrawingObject | null) => void;
	onDrawingWorkspaceChange?: (workspace: DrawingWorkspaceController | null) => void;
	plotData: readonly EnrichedDatum[];
	useForkRuntime?: boolean;
	symbol: string;
	timeframe: Timeframe;
	keyboardAdapter?: KeyboardAdapter;
	storageAdapter?: StorageAdapter;
	isEditingText?: boolean;
}

export function useWidgetDrawings({
	defaultDrawings,
	drawings,
	drawingStorageKey,
	drawingStorageAdapter,
	instanceId,
	onStorageError,
	defaultDrawingDockTab,
	onDrawingsChange,
	drawingUiEnabled = false,
	selectedDrawing,
	onSelectedDrawingChange,
	onDrawingWorkspaceChange,
	plotData,
	useForkRuntime = false,
	symbol,
	timeframe,
	keyboardAdapter,
	storageAdapter,
	isEditingText,
}: UseWidgetDrawingsProps) {
	// Use default keyboard adapter if not provided
	const effectiveKeyboardAdapter = keyboardAdapter ?? defaultKeyboardAdapter;
	// Use default storage adapter if not provided
	const effectiveStorageAdapter = storageAdapter ?? defaultLocalStorageAdapter;
	const drawingWorkspace = useDrawingWorkspaceController({
		defaultDrawings,
		drawings,
		drawingStorageKey,
		drawingStorageAdapter,
		instanceId,
		onStorageError,
		defaultDockTab: defaultDrawingDockTab,
		onDrawingsChange,
		symbol,
		timeframe,
	});

	const lastDrawingWorkspaceSubscriberRef = useRef<((workspace: DrawingWorkspaceController | null) => void) | undefined>(onDrawingWorkspaceChange);
	const lastEmittedDrawingWorkspaceRef = useRef<DrawingWorkspaceController | null>(null);
	const lastEmittedDrawingWorkspaceStateRef = useRef<DrawingWorkspaceController["state"] | null>(null);
	const lastNotifiedSelectedDrawingIdRef = useRef<string | null>(null);
	const forkDrawingStateRef = useRef(drawingWorkspace.interaction.drawingState);

	useEffect(() => {
		forkDrawingStateRef.current = drawingWorkspace.interaction.drawingState;
	}, [drawingWorkspace.interaction.drawingState]);

	lastDrawingWorkspaceSubscriberRef.current = onDrawingWorkspaceChange;

	const isSelectedDrawingControlled = selectedDrawing !== undefined;
	const resolvedSelectedDrawing = isSelectedDrawingControlled ? (selectedDrawing ?? null) : drawingWorkspace.state.selectedDrawing;
	const hasMultipleDrawingsSelected = drawingWorkspace.state.selectedIds.length > 1;
	const resolvedForkSingleSelection = hasMultipleDrawingsSelected ? null : resolvedSelectedDrawing;

	useEffect(() => {
		if (!isSelectedDrawingControlled) {
			return;
		}

		if (drawingWorkspace.interaction.drawingState.type === "drawing") {
			return;
		}

		const currentSelectedId = drawingWorkspace.state.selectedIds[0] ?? null;
		const nextSelectedId = selectedDrawing?.id ?? null;
		if (currentSelectedId === nextSelectedId) {
			return;
		}

		drawingWorkspace.selectDrawing(nextSelectedId);
	}, [drawingWorkspace, drawingWorkspace.interaction.drawingState.type, isSelectedDrawingControlled, selectedDrawing?.id]);

	useEffect(() => {
		const nextWorkspace = drawingUiEnabled ? drawingWorkspace : null;
		const nextWorkspaceState = nextWorkspace?.state ?? null;
		const workspaceChanged = lastEmittedDrawingWorkspaceRef.current !== nextWorkspace;
		const workspaceStateChanged = lastEmittedDrawingWorkspaceStateRef.current !== nextWorkspaceState;
		if (!workspaceChanged && !workspaceStateChanged) {
			return;
		}

		lastEmittedDrawingWorkspaceRef.current = nextWorkspace;
		lastEmittedDrawingWorkspaceStateRef.current = nextWorkspaceState;
		lastDrawingWorkspaceSubscriberRef.current?.(nextWorkspace ? { ...nextWorkspace } : null);
	}, [drawingUiEnabled, drawingWorkspace, drawingWorkspace.state]);

	useEffect(() => {
		return () => {
			const callback = lastDrawingWorkspaceSubscriberRef.current;
			lastEmittedDrawingWorkspaceRef.current = null;
			lastEmittedDrawingWorkspaceStateRef.current = null;
			lastDrawingWorkspaceSubscriberRef.current = undefined;
			callback?.(null);
		};
	}, []);

	useEffect(() => {
		const nextSelectedDrawingId = resolvedForkSingleSelection?.id ?? null;
		if (lastNotifiedSelectedDrawingIdRef.current === nextSelectedDrawingId && lastNotifiedSelectedDrawingIdRef.current !== undefined) {
			return;
		}

		lastNotifiedSelectedDrawingIdRef.current = nextSelectedDrawingId;
		onSelectedDrawingChange?.(resolvedForkSingleSelection);
	}, [onSelectedDrawingChange, resolvedForkSingleSelection]);

	// Keyboard shortcuts via injected adapter
	const { onShortcut, onKeyDown } = useKeyboardAdapter({
		keyboardAdapter: effectiveKeyboardAdapter,
		enabled: drawingUiEnabled,
	});

	// S1.1/D-01 (2026-09-24): sole Delete/Backspace channel; overlays keydown
	// removed — keep single. Toolbar-focus yields to useToolbarKeyboardNav.
	// S1.2/D-02 contract: `KeyboardAdapter` invokes onKeyDown handlers on BOTH
	// keydown+keyup by design (modifier-trackers rely on keyup at
	// useWidgetInteractionActions:82); the `e.type !== "keydown"` guard below
	// is MANDATORY — never remove (P3-06b double-fire).
	// Delete/Backspace - delete selected drawings (disabled when text editing)
	useEffect(() => {
		return onKeyDown((e) => {
			if (e.type !== "keydown") return;
			if (e.key !== 'Delete' && e.key !== 'Backspace') return;
			if (isEditingText) return;
			if (isTypingTarget(e as unknown as KeyboardEvent)) return;
			if ((e.target as HTMLElement | null)?.closest?.('[role="toolbar"]')) return;
			e.preventDefault();
			const selectedIds = drawingWorkspace.state.selectedIds;
			if (selectedIds.length > 0) {
				const nextDrawings = drawingWorkspace.interaction.allDrawings.filter((d) => !selectedIds.includes(d.id));
				drawingWorkspace.interaction.replaceDrawings(nextDrawings);
				drawingWorkspace.selectDrawing(null);
			}
		});
	}, [drawingWorkspace, onKeyDown, isEditingText]);

	// P3: Alt+letter tool select + Ctrl+Z/Y undo/redo (industry standard,
	// TradingView parity). Guarded by isTypingTarget so typing / IME and
	// native input undo are never hijacked (the P3 reviewer requirement).
	useEffect(() => {
		return onKeyDown((e) => {
			if (e.type !== "keydown") return;
			if (isEditingText) return;
			if (isTypingTarget(e as unknown as KeyboardEvent)) return;
			const key = e.key.toLowerCase();
			const mod = e.ctrlKey || e.metaKey;
			if (mod && !e.altKey && !e.shiftKey && key === "z") {
				e.preventDefault();
				drawingWorkspace.interaction.undo();
				return;
			}
			if (mod && !e.altKey && (key === "y" || (key === "z" && e.shiftKey))) {
				e.preventDefault();
				drawingWorkspace.interaction.redo();
				return;
			}
			if (e.altKey && !mod && !e.shiftKey) {
				if (key === "s") {
					e.preventDefault();
					dispatchToggleFavoritesBar();
					return;
				}
				const tool = ALT_TOOL_SHORTCUTS[key];
				if (tool) {
					e.preventDefault();
					drawingWorkspace.setActiveTool(tool as never);
				}
			}
		});
	}, [drawingWorkspace, onKeyDown, isEditingText]);

	// Ctrl+C - copy selected drawing
	useEffect(() => {
		return onShortcut("ctrl+c", () => {
			const selectedDrawing = drawingWorkspace.state.selectedDrawing;
			if (selectedDrawing) {
				effectiveStorageAdapter.setItem(WIDGET_CLIPBOARD_KEY, JSON.stringify(cloneDrawingSnapshot(selectedDrawing)));
			}
		});
	}, [drawingWorkspace, onShortcut, effectiveStorageAdapter]);

	// Ctrl+V - paste copied drawing
	useEffect(() => {
		return onShortcut("ctrl+v", () => {
			const clipboardRaw = effectiveStorageAdapter.getItem(WIDGET_CLIPBOARD_KEY);
			if (clipboardRaw) {
				try {
					const snapshot: unknown = JSON.parse(clipboardRaw);
					if (!isValidDrawingSnapshot(snapshot)) {
						console.warn("Rejected malformed drawing clipboard snapshot (BL-12 schema).");
						return;
					}
					// P3/D-06: no scales here — fixed data-unit fallback applies;
					// plotData keeps the time fallback calendar-correct.
					const offset = offsetDrawingByPixels(snapshot, 15, 15, undefined, undefined, undefined, 60000, undefined, { plotData });
					drawingWorkspace.interaction.dispatch({ type: "PUSH", drawing: offset });
					drawingWorkspace.selectDrawing(offset.id);
				} catch (e) {
					console.warn("Failed to parse drawing clipboard:", e);
				}
			}
		});
	}, [drawingWorkspace, onShortcut, effectiveStorageAdapter, plotData]);

	// Ctrl+L - toggle lock
	useEffect(() => {
		return onShortcut("ctrl+l", () => {
			const sel = drawingWorkspace.state.selectedDrawing;
			if (sel) {
				drawingWorkspace.interaction.updateDrawing(sel.id, { locked: !sel.locked });
			}
		});
	}, [drawingWorkspace, onShortcut]);

	// Ctrl+H - toggle visibility
	useEffect(() => {
		return onShortcut("ctrl+h", () => {
			const sel = drawingWorkspace.state.selectedDrawing;
			if (sel) {
				drawingWorkspace.interaction.updateDrawing(sel.id, { visible: sel.visible === false ? true : false });
			}
		});
	}, [drawingWorkspace, onShortcut]);

	// P3-07: re-anchor points to the CURRENT time-index map.
	//
	// This is a PASSIVE normalization, not a user intent, so it goes through
	// `reconcileDrawings` and not `replaceDrawings`. Dispatching it as REPLACE
	// pushed an undo step and cleared the redo stack, which produced three
	// measured failures:
	//   - Ctrl+Y after Ctrl+Z was a no-op whenever the map shifted in between
	//     (the P3-07 E2E flake, 4 PASS / 2 FAIL);
	//   - Ctrl+Z after drawing one line left the line on screen;
	//   - every live-data tick that shifted indices burned an invisible undo
	//     step, so undoing one line took N+1 presses.
	// Evidence + reducer-level regression lock: engine `history.test.ts`
	// "historyReducer RECONCILE (P3-07)".
	useEffect(() => {
		if (!useForkRuntime || !drawingUiEnabled || plotData.length === 0 || drawingWorkspace.state.drawings.length === 0) {
			return;
		}

		const drawingStateType = drawingWorkspace.interaction.drawingState.type;
		if (
			drawingStateType === "drawing" ||
			drawingStateType === "moving" ||
			drawingStateType === "resizing"
		) {
			return;
		}

		const timeIndexMap = createDateTimeIndexMap(plotData);
		const reconciled = reconcileForkDrawingIndexAnchors(drawingWorkspace.state.drawings, timeIndexMap);
		if (!reconciled.changed) {
			return;
		}

		drawingWorkspace.interaction.reconcileDrawings(reconciled.drawings);
	}, [
		drawingUiEnabled,
		drawingWorkspace.interaction,
		drawingWorkspace.interaction.drawingState.type,
		plotData,
		drawingWorkspace.state.drawings,
		useForkRuntime,
	]);

	const resolvedDrawings = useMemo(() => {
		return drawingWorkspace.state.drawings.filter(drawing => {
			if (drawing.visibility?.hidden) return false;
			if (drawing.visibility?.timeframes?.length && timeframe && !drawing.visibility.timeframes.includes(timeframe)) return false;
			if (drawing.visibility?.symbols?.length && symbol && !drawing.visibility.symbols.includes(symbol)) return false;
			return true;
		});
	}, [drawingWorkspace.state.drawings, symbol, timeframe]);

	return {
		drawingWorkspace,
		resolvedDrawings,
		resolvedSelectedDrawing,
		hasMultipleDrawingsSelected,
		resolvedForkSingleSelection,
	};
}
