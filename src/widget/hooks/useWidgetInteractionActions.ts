import { useState, useEffect, useMemo, useRef, useCallback, type CSSProperties } from "react";
import { type EngineInstance } from "@vninvestcharts/engine-core";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import type { DrawingWorkspaceController } from "@vninvestcharts/engine-react";
import { offsetDrawingByPixels } from "@vninvestcharts/engine-drawing";
import { type WidgetPaneRuntimeSnapshot } from "../utils/widgetHelpers";
import { useShadowRoot } from "../context/VNInvestChartsContext";
import { useKeyboardAdapter } from "./useKeyboardAdapter";
import type { KeyboardAdapter, WindowEventAdapter } from "@vninvestcharts/engine-react";
import { defaultKeyboardAdapter } from "@vninvestcharts/engine-react";

export interface UseWidgetInteractionActionsProps {
	useForkRuntime?: boolean;
	drawingUiEnabled?: boolean;
	drawingWorkspace: DrawingWorkspaceController;
	resolvedDrawings: readonly DrawingObject[];
	resolvedSelectedDrawing: DrawingObject | null;
	onSelectedDrawingChange?: (drawing: DrawingObject | null) => void;
	keyboardAdapter?: KeyboardAdapter;
	windowEventAdapter: WindowEventAdapter;
}

export function useWidgetInteractionActions({
	useForkRuntime = false,
	drawingUiEnabled = false,
	drawingWorkspace,
	resolvedDrawings,
	resolvedSelectedDrawing,
	onSelectedDrawingChange,
	keyboardAdapter,
	windowEventAdapter,
}: UseWidgetInteractionActionsProps) {
	// Use default keyboard adapter if not provided
	const effectiveKeyboardAdapter = keyboardAdapter ?? defaultKeyboardAdapter;
	const onSelectedDrawingChangeRef = useRef(onSelectedDrawingChange);
	useEffect(() => {
		onSelectedDrawingChangeRef.current = onSelectedDrawingChange;
	}, [onSelectedDrawingChange]);

	const [forkSelectionModifierPressed, setForkSelectionModifierPressed] = useState(false);
	const [forkDrawingContextMenu, setForkDrawingContextMenu] = useState<{ x: number; y: number; drawingId: string | null } | null>(null);

	const forkAltShortcutPressedRef = useRef(false);
	const shadowRoot = useShadowRoot();

	// Keyboard adapter for modifier key tracking
	const { onKeyDown } = useKeyboardAdapter({
		keyboardAdapter: effectiveKeyboardAdapter,
		enabled: useForkRuntime && drawingUiEnabled && drawingWorkspace.state.activeTool === "cursor",
	});

	// Keyboard adapter for Alt key tracking (always enabled when fork runtime is active)
	const { onKeyDown: onAltKeyDown } = useKeyboardAdapter({
		keyboardAdapter: effectiveKeyboardAdapter,
		enabled: useForkRuntime,
	});

	// Track selection modifier (ctrl/shift/meta)
	useEffect(() => {
		if (!useForkRuntime || !drawingUiEnabled || drawingWorkspace.state.activeTool !== "cursor") {
			setForkSelectionModifierPressed(false);
			return;
		}

		const syncSelectionModifier = (next: boolean) => {
			setForkSelectionModifierPressed((current) => (current === next ? current : next));
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			syncSelectionModifier(Boolean(event.ctrlKey || event.metaKey || event.shiftKey));
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			syncSelectionModifier(Boolean(event.ctrlKey || event.metaKey || event.shiftKey));
		};

		const resetSelectionModifier = () => {
			syncSelectionModifier(false);
		};

		// Use injected keyboard adapter for keydown/keyup
		const cleanupKeyDown = onKeyDown(handleKeyDown);
		const cleanupKeyUp = onKeyDown(handleKeyUp); // onKeyDown handles both down/up via the same listener

		// Use injected windowEventAdapter for blur (required - no fallback)
		const cleanupBlur = windowEventAdapter.addGlobalListeners({
			onBlur: resetSelectionModifier,
		});

		return () => {
			cleanupKeyDown?.();
			cleanupKeyUp?.();
			cleanupBlur?.();
		};
	}, [drawingUiEnabled, drawingWorkspace.state.activeTool, useForkRuntime, onKeyDown, windowEventAdapter]);

	// Track alt key for fork shortcuts
	useEffect(() => {
		if (!useForkRuntime) {
			forkAltShortcutPressedRef.current = false;
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			forkAltShortcutPressedRef.current = Boolean(event.altKey || event.key === "Alt");
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			forkAltShortcutPressedRef.current = Boolean(event.altKey || event.key === "Alt");
		};

		const resetModifierState = () => {
			forkAltShortcutPressedRef.current = false;
		};

		// Use injected keyboard adapter
		const cleanupKeyDown = onAltKeyDown(handleKeyDown);
		const cleanupKeyUp = onAltKeyDown(handleKeyUp);

		// Use injected windowEventAdapter for blur (required - no fallback)
		const cleanupBlur = windowEventAdapter.addGlobalListeners({
			onBlur: resetModifierState,
		});

		return () => {
			cleanupKeyDown?.();
			cleanupKeyUp?.();
			cleanupBlur?.();
		};
	}, [useForkRuntime, onAltKeyDown, windowEventAdapter]);

	const copySelectedDrawing = useCallback(() => {
		drawingWorkspace.copySelected();
	}, [drawingWorkspace]);

	const pasteCopiedDrawing = useCallback(() => {
		const clipboardDrawing = drawingWorkspace.cloneClipboard();
		if (!clipboardDrawing) {
			return;
		}

		const nextDrawing = offsetDrawingByPixels(clipboardDrawing, 10, 10, undefined, undefined, undefined, 60000, {
			paneId: clipboardDrawing.paneId,
			yScaleId: clipboardDrawing.yScaleId,
		});
		drawingWorkspace.interaction.replaceDrawings([...resolvedDrawings, nextDrawing]);
		drawingWorkspace.selectDrawing(nextDrawing.id);
	}, [drawingWorkspace, resolvedDrawings]);

	const bringSelectedToFront = useCallback(() => {
		if (!resolvedSelectedDrawing) {
			return;
		}
		const maxZIndex = resolvedDrawings.reduce((currentMax, drawing) => Math.max(currentMax, drawing.zIndex ?? -1), -1);
		drawingWorkspace.interaction.updateDrawing(resolvedSelectedDrawing.id, { zIndex: maxZIndex + 1 });
	}, [drawingWorkspace, resolvedDrawings, resolvedSelectedDrawing]);

	const sendSelectedToBack = useCallback(() => {
		if (!resolvedSelectedDrawing) {
			return;
		}
		const minZIndex = resolvedDrawings.reduce((currentMin, drawing) => Math.min(currentMin, drawing.zIndex ?? -1), -1);
		drawingWorkspace.interaction.updateDrawing(resolvedSelectedDrawing.id, { zIndex: minZIndex - 1 });
	}, [drawingWorkspace, resolvedDrawings, resolvedSelectedDrawing]);

	const toggleSelectedLock = useCallback(() => {
		if (!resolvedSelectedDrawing) {
			return;
		}
		drawingWorkspace.interaction.updateDrawing(resolvedSelectedDrawing.id, { locked: !resolvedSelectedDrawing.locked });
	}, [drawingWorkspace, resolvedSelectedDrawing]);

	const cloneSelectedDrawing = useCallback(() => {
		if (!resolvedSelectedDrawing) {
			return;
		}
		const nextClone = offsetDrawingByPixels(resolvedSelectedDrawing, 10, 10, undefined, undefined, undefined, 60000, {
			paneId: resolvedSelectedDrawing.paneId,
			yScaleId: resolvedSelectedDrawing.yScaleId,
		});
		drawingWorkspace.interaction.replaceDrawings([...resolvedDrawings, nextClone]);
		drawingWorkspace.selectDrawing(nextClone.id);
	}, [drawingWorkspace, resolvedDrawings, resolvedSelectedDrawing]);

	const updateForkReadonlySelection = useCallback((nextDrawing: DrawingObject | null) => {
		onSelectedDrawingChangeRef.current?.(nextDrawing);
		drawingWorkspace.interaction.setSelectedObjects(nextDrawing ? [nextDrawing.id] : []);
	}, [drawingWorkspace.interaction]);

	const updateForkReadonlySelectionByIds = useCallback((nextSelectedIds: readonly string[]) => {
		const normalizedIds = Array.from(new Set(nextSelectedIds));
		drawingWorkspace.interaction.setSelectedObjects(normalizedIds);

		const nextDrawing = normalizedIds.length === 1
			? (resolvedDrawings.find((drawing) => drawing.id === normalizedIds[0]) ?? null)
			: null;
		onSelectedDrawingChangeRef.current?.(nextDrawing);
	}, [drawingWorkspace.interaction, resolvedDrawings]);

	const closeForkDrawingContextMenu = useCallback(() => {
		setForkDrawingContextMenu(null);
	}, []);

	return {
		forkSelectionModifierPressed,
		forkDrawingContextMenu,
		setForkDrawingContextMenu,
		forkAltShortcutPressedRef,
		copySelectedDrawing,
		pasteCopiedDrawing,
		bringSelectedToFront,
		sendSelectedToBack,
		toggleSelectedLock,
		cloneSelectedDrawing,
		updateForkReadonlySelection,
		updateForkReadonlySelectionByIds,
		closeForkDrawingContextMenu,
	};
}