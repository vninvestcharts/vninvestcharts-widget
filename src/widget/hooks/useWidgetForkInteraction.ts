import { useState, useRef, useCallback, useEffect, useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent, type MutableRefObject } from "react";
import {
	ForkPointerContext,
	ForkManipulationSession,
	ForkPointerOwner,
	ForkRubberBandSelection,
	WidgetPaneRuntimeSnapshot,
	resolvePreferredScaleSlotId,
	dateFormat,
} from "../utils/widgetHelpers";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import type { DrawingWorkspaceController } from "@vninvestcharts/engine-react";
import type { MagnetSensitivity } from "@vninvestcharts/engine-drawing";
import { type EnrichedDatum } from "../../lib/core/calculators/types";
import { type PaneDescriptor } from "../../lib/core";
import type { DrawingToolType } from "@vninvestcharts/engine-drawing";
import {
	type EngineInstance,
	type VisibleRange as EngineVisibleRange,
	resolvePaneDataIndexAtPixel,
	createDateTimeIndexMap,
} from "@vninvestcharts/engine-core";
import {
	createForkDrawingScales,
	resolveRenderableForkDrawings,
} from "../ForkDrawingsOverlay";
import {
	FORK_DRAWING_TOOL_CURSOR_MAP,
	type ForkSurfaceCursor,
	hasForkDraftProgress,
	isForkMultiStepTool,
	isForkSinglePointTool,
	isPrimaryPointerPressed,
	resolveForkMultiStepDraftOnClick,
} from "../forkInteractionHelpers";
import { reconcileForkDrawingIndexAnchors } from "../forkAnchorReconciliation";
import { clampIndex } from "../visibleRangeBridge";
import { createWidgetCoordinateBridge } from "../utils/coordinateBridge";
import { findPaneSnapshotAtPosition } from "../paneInteractionUtils";
import { resizeDrawingsByIds, translateDrawingsByIds, type TextBoxEdgePixels } from "@vninvestcharts/engine-drawing";
import { createDrawingInteractionCommand, hitTestDrawingWithContext, resolveDrawingManipulationIntentWithContext, resolveDrawingInteractionContext, resolveDrawingPointWithContext } from "@vninvestcharts/engine-drawing";
import { createDraftFromTool, createTool, isDrawingToolName } from "@vninvestcharts/engine-drawing";
import { isDrawingInRect } from "@vninvestcharts/engine-drawing";
import { chartPointToPixel, type PlotDatum } from "@vninvestcharts/engine-drawing";
import { appendPoint } from "@vninvestcharts/engine-drawing";
import { type WindowEventAdapter } from "@vninvestcharts/engine-react";
import { isTypingTarget } from "@vninvestcharts/engine-drawing";

export interface UseWidgetForkInteractionProps {
	useForkRuntime: boolean;
	drawingUiEnabled: boolean;
	activeForkDrawingTool: string | null;
	drawingWorkspace: DrawingWorkspaceController;
	resolvedDrawings: readonly DrawingObject[];
	resolvedSelectedDrawing: DrawingObject | null;
	resolvedForkSingleSelection: DrawingObject | null;
	onSelectedDrawingChange?: (drawing: DrawingObject | null) => void;
	magnetSensitivity: MagnetSensitivity;
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	plotData: readonly EnrichedDatum[];
	forkMovableSelectionIds: readonly string[];
	activeForkManipulationDrawing: DrawingObject | null;
	forkSelectionModifierPressed: boolean;
	closeForkDrawingContextMenu: () => void;
	setForkDrawingContextMenu: (menu: any) => void;
	size: { width: number; height: number };
	engineInstanceRef: MutableRefObject<EngineInstance | null>;
	visiblePanes: readonly PaneDescriptor[];
	onContextMenu?: (payload: any, nativeEvent: any) => void;
	onClick?: (payload: any, nativeEvent: any) => void;
	onTimeAnchor?: (timestamp: number) => void;
	forkAltShortcutPressedRef: MutableRefObject<boolean>;
	cloneSelectedDrawing: () => void;
	toggleSelectedLock: () => void;
	updateForkReadonlySelection: (drawing: DrawingObject | null) => void;
	updateForkReadonlySelectionByIds: (ids: readonly string[]) => void;
	forkVisibleRangeRef: MutableRefObject<EngineVisibleRange | null>;
	forkPaneSnapshotsRef: MutableRefObject<readonly WidgetPaneRuntimeSnapshot[]>;
	windowEventAdapter?: WindowEventAdapter;
	isEditingText?: boolean;
	handleStartTextEdit?: (draft: string) => void;
}

export function useWidgetForkInteraction({
	useForkRuntime,
	drawingUiEnabled,
	activeForkDrawingTool,
	drawingWorkspace,
	resolvedDrawings,
	resolvedSelectedDrawing,
	resolvedForkSingleSelection,
	onSelectedDrawingChange,
	magnetSensitivity,
	paneSnapshots,
	plotData,
	forkMovableSelectionIds,
	activeForkManipulationDrawing,
	forkSelectionModifierPressed,
	closeForkDrawingContextMenu,
	setForkDrawingContextMenu,
	size,
	engineInstanceRef,
	visiblePanes,
	onContextMenu,
	onClick,
	onTimeAnchor,
	forkAltShortcutPressedRef,
	cloneSelectedDrawing,
	toggleSelectedLock,
	updateForkReadonlySelection,
	updateForkReadonlySelectionByIds,
	forkVisibleRangeRef,
	forkPaneSnapshotsRef,
	windowEventAdapter,
	isEditingText,
	handleStartTextEdit,
}: UseWidgetForkInteractionProps) {
	const ignoreNextForkDrawingClickRef = useRef(false);
	const startForkDrawingPointerRef = useRef<{ x: number; y: number } | null>(null);
	const forkManipulationSessionRef = useRef<ForkManipulationSession | null>(null);
	const forkManipulationPreviewRef = useRef<readonly DrawingObject[] | null>(null);
	const forkRubberBandSelectionRef = useRef<ForkRubberBandSelection | null>(null);
	const forkRubberBandJustCommittedRef = useRef(false);
	const previousForkAuthoringToolRef = useRef<string | null>(null);
	const suppressNextForkSurfaceClickRef = useRef(false);
	const forkPointerOwnerRef = useRef<ForkPointerOwner | null>(null);
	const lastPointerContextRef = useRef<ForkPointerContext | null>(null);

	// forkSurfaceCursor is computed dynamically below resolveForkSurfaceCursor
	const [forkPreviewRevision, setForkPreviewRevision] = useState(0);
	const [forkManipulationActive, setForkManipulationActive] = useState(false);
	const forkManipulationActiveRef = useRef(false);
	const updateForkManipulationActive = useCallback((active: boolean) => {
		forkManipulationActiveRef.current = active;
		setForkManipulationActive(active);
	}, []);
	const [forkRubberBandTick, setForkRubberBandTick] = useState(0);

	const forkDrawingStateRef = useRef(drawingWorkspace.interaction.drawingState);

	useEffect(() => {
		forkDrawingStateRef.current = drawingWorkspace.interaction.drawingState;
	}, [drawingWorkspace.interaction.drawingState]);

	const clearForkPointerOwner = useCallback(() => {
		forkPointerOwnerRef.current = null;
	}, []);

	const claimForkPointerOwner = useCallback((owner: ForkPointerOwner) => {
		forkPointerOwnerRef.current = owner;
	}, []);

	const releaseForkPointerOwner = useCallback((owner: ForkPointerOwner) => {
		if (forkPointerOwnerRef.current === owner) {
			clearForkPointerOwner();
		}
	}, [clearForkPointerOwner]);

	const releasePointerOwner = useCallback(() => {
		if (forkPointerOwnerRef.current === "pane-splitter") {
			return;
		}
		clearForkPointerOwner();
	}, [clearForkPointerOwner]);

	const releaseWhenNoButtonsPressed = useCallback((event: MouseEvent | PointerEvent) => {
		if (forkPointerOwnerRef.current === "pane-splitter") {
			return;
		}
		if ("buttons" in event && event.buttons === 0) {
			clearForkPointerOwner();
		}
	}, [clearForkPointerOwner]);

	const releaseOnVisibilityChange = useCallback(() => {
		if (typeof document === "undefined" || document.visibilityState !== "visible") {
			clearForkPointerOwner();
		}
	}, [clearForkPointerOwner]);

	const resolveForkDrawingContext = useCallback((pointerContext: ForkPointerContext, drawing?: DrawingObject) => {
		const engine = engineInstanceRef.current;
		const visibleRange = (() => {
			if (!engine) return null;
			const range = engine.getVisibleRange();
			if (!range || Math.abs(range.to - range.from) <= 1e-6) return null;
			return range;
		})() ?? forkVisibleRangeRef.current;
		if (!visibleRange) {
			return null;
		}

		const currentPaneSnapshots = (() => {
			if (!engine) return null;
			const sn = engine.getPaneSnapshots();
			if (!sn || sn.length === 0) return null;
			return sn;
		})() ?? (forkPaneSnapshotsRef.current.length > 0 ? forkPaneSnapshotsRef.current : paneSnapshots);

		const bridge = createWidgetCoordinateBridge(
			currentPaneSnapshots,
			visibleRange,
			plotData,
			"fork"
		);
		if (!bridge) {
			return null;
		}

		const snapshot = drawing?.paneId
			? currentPaneSnapshots.find((candidate) => candidate.paneId === drawing.paneId) ?? null
			: (pointerContext.paneId
				? currentPaneSnapshots.find((candidate) => candidate.paneId === pointerContext.paneId) ?? null
				: findPaneSnapshotAtPosition(currentPaneSnapshots, pointerContext.localX, pointerContext.localY));
		if (!snapshot) {
			return null;
		}

		const scaleSlotId = resolvePreferredScaleSlotId(snapshot, drawing?.yScaleId);
		if (!scaleSlotId) {
			return null;
		}

		const scaleSlotDomain = snapshot.scaleSlotStates[scaleSlotId]?.domain;
		const yDomain = Array.isArray(scaleSlotDomain) && scaleSlotDomain.length >= 2
			? [scaleSlotDomain[0], scaleSlotDomain[1]] as const
			: undefined;

		const normalizedX = pointerContext.localX;
		const normalizedY = pointerContext.localY;

		return resolveDrawingInteractionContext({
			bridge,
			paneId: snapshot.paneId,
			scaleSlotId,
			chartWidth: snapshot.plotBounds.width,
			chartHeight: snapshot.plotBounds.height,
			x: normalizedX,
			y: normalizedY,
			plotData: plotData as unknown as readonly PlotDatum[],
			yDomain,
			pixelOffset: { x: snapshot.plotBounds.left, y: snapshot.plotBounds.top },
		}) ?? null;
	}, [paneSnapshots, plotData, forkPaneSnapshotsRef, forkVisibleRangeRef, engineInstanceRef]);

	const resolveForkDrawingCommand = useCallback((
		type: "pointerdown" | "pointermove" | "click",
		pointerContext: ForkPointerContext,
		drawing?: DrawingObject,
	) => {
		const interactionContext = resolveForkDrawingContext(pointerContext, drawing);
		if (!interactionContext) {
			return null;
		}

		return createDrawingInteractionCommand(type, interactionContext, pointerContext);
	}, [resolveForkDrawingContext]);

	const resolveForkSurfaceCursor = useCallback((pointerContext?: ForkPointerContext): ForkSurfaceCursor => {
		const context = pointerContext ?? lastPointerContextRef.current ?? undefined;
		const activeTool = drawingWorkspace.state.activeTool;
		if (activeTool === "cursor" && context) {
			const { localX, localY } = context;
			const currentPaneSnapshots = forkPaneSnapshotsRef.current.length > 0 ? forkPaneSnapshotsRef.current : paneSnapshots;
			const overSlot = currentPaneSnapshots.some((snapshot) => {
				return Object.values(snapshot.scaleSlotBounds).some((bounds: any) => {
					const right = bounds.left + bounds.width;
					const bottom = bounds.top + bounds.height;
					return localX >= bounds.left && localX <= right && localY >= bounds.top && localY <= bottom;
				});
			});
			if (overSlot) {
				return "ns-resize";
			}
		}

		const toolCursor = isDrawingToolName(activeTool)
			? FORK_DRAWING_TOOL_CURSOR_MAP[activeTool]
			: undefined;
		if (toolCursor) {
			return toolCursor;
		}
		if (activeTool !== "cursor" && isDrawingToolName(activeTool)) {
			return "crosshair";
		}

		if (forkDrawingStateRef.current.type === "drawing") {
			return "crosshair";
		}

		const manipulationSession = forkManipulationSessionRef.current;
		if (manipulationSession) {
			return manipulationSession.mode === "resize" ? "pointer" : "grabbing";
		}

		const isSelectionModifierPressed = activeTool === "cursor"
			&& (forkSelectionModifierPressed || Boolean(context?.ctrlKey || context?.metaKey || context?.shiftKey));
		if (isSelectionModifierPressed && !context) {
			return "cell";
		}

		if (!context) {
			return "grab";
		}

		const interactionContext = resolveForkDrawingContext(context, activeForkManipulationDrawing ?? undefined);
		if (!interactionContext) {
			return "grab";
		}

		if (activeForkManipulationDrawing) {
			const manipulationIntent = resolveDrawingManipulationIntentWithContext(activeForkManipulationDrawing, interactionContext);
			if (manipulationIntent?.mode === "resize") {
				const hi = manipulationIntent.handleIndex;
				if (hi >= 100 && hi <= 107) {
					const TEXT_BOX_CURSORS: Record<number, CSSProperties["cursor"]> = {
						100: "nw-resize", 101: "n-resize", 102: "ne-resize",
						103: "e-resize", 104: "se-resize", 105: "s-resize",
						106: "sw-resize", 107: "w-resize",
					};
					return TEXT_BOX_CURSORS[hi] ?? "pointer";
				}
				return "pointer";
			}

			if (isSelectionModifierPressed) {
				return "cell";
			}

			if (manipulationIntent?.mode === "move") {
				return "move";
			}
		}

		if (isSelectionModifierPressed) {
			return "cell";
		}

		const hitDrawing = [...resolvedDrawings]
			.filter((drawing) => drawing.visible !== false)
			.reverse()
			.find((drawing) => hitTestDrawingWithContext(drawing, interactionContext));
		if (hitDrawing) {
			return "pointer";
		}

		if (activeTool === "cursor" && ((context?.buttons ?? 0) & 1) === 1) {
			return "grabbing";
		}

		return "grab";
	}, [activeForkManipulationDrawing, drawingWorkspace.state.activeTool, forkSelectionModifierPressed, resolveForkDrawingContext, resolvedDrawings, paneSnapshots, forkPaneSnapshotsRef]);

	const forkSurfaceCursor = resolveForkSurfaceCursor();

	const handleForkDrawingPointerDown = useCallback((pointerContext: ForkPointerContext) => {
		if (!activeForkDrawingTool || activeForkDrawingTool === "cursor") {
			return;
		}

		const currentDrawingState = forkDrawingStateRef.current;
		if (currentDrawingState.type === "drawing") {
			return;
		}

		closeForkDrawingContextMenu();
		const command = resolveForkDrawingCommand("pointerdown", pointerContext);
		if (!command) {
			return;
		}

		const resolvedPoint = resolveDrawingPointWithContext(resolvedDrawings, command.context, magnetSensitivity).point;
		const draft = {
			...createDraftFromTool(activeForkDrawingTool as DrawingToolType, resolvedPoint),
			paneId: command.frame.paneId,
			yScaleId: command.frame.scaleSlotId,
		};
		if (resolvedSelectedDrawing) {
			updateForkReadonlySelection(null);
			drawingWorkspace.selectDrawing(null);
		}

		ignoreNextForkDrawingClickRef.current = true;
		startForkDrawingPointerRef.current = {
			x: pointerContext.localX,
			y: pointerContext.localY,
		};
		forkDrawingStateRef.current = {
			type: "drawing",
			toolName: activeForkDrawingTool as DrawingToolType,
			object: draft,
		};
		drawingWorkspace.interaction.dispatch({
			type: "START_DRAWING",
			toolName: activeForkDrawingTool as DrawingToolType,
			object: draft,
		});
	}, [activeForkDrawingTool, closeForkDrawingContextMenu, drawingWorkspace, magnetSensitivity, updateForkReadonlySelection, resolveForkDrawingCommand, resolvedDrawings, resolvedSelectedDrawing]);

	const handleForkDrawingPointerMove = useCallback((pointerContext: ForkPointerContext) => {
		const currentDrawingState = forkDrawingStateRef.current;
		if (currentDrawingState.type !== "drawing") {
			return;
		}

		if (ignoreNextForkDrawingClickRef.current && startForkDrawingPointerRef.current) {
			const dx = pointerContext.localX - startForkDrawingPointerRef.current.x;
			const dy = pointerContext.localY - startForkDrawingPointerRef.current.y;
			if (Math.hypot(dx, dy) > 5) {
				ignoreNextForkDrawingClickRef.current = false;
				startForkDrawingPointerRef.current = null;
			}
		}

		const command = resolveForkDrawingCommand("pointermove", pointerContext, currentDrawingState.object);
		if (!command) {
			return;
		}

		const resolvedPoint = resolveDrawingPointWithContext(resolvedDrawings, command.context, magnetSensitivity).point;
		const nextDraft = createTool(currentDrawingState.toolName).updateDraft(currentDrawingState.object, resolvedPoint);
		forkDrawingStateRef.current = {
			...currentDrawingState,
			object: nextDraft,
		};
		drawingWorkspace.interaction.dispatch({ type: "UPDATE_DRAWING", object: nextDraft });
	}, [drawingWorkspace, magnetSensitivity, resolveForkDrawingCommand, resolvedDrawings]);

	// NOTE: declared before the click/double-click handlers below (TS2448) —
	// resolves a pointer position to the bar datum under it.
	const resolveForkEventPayloadAtPosition = useCallback((localX: number, localY: number) => {
		const engine = engineInstanceRef.current;
		const visibleRange = (() => {
			if (!engine) return null;
			const range = engine.getVisibleRange();
			if (!range || Math.abs(range.to - range.from) <= 1e-6) return null;
			return range;
		})() ?? forkVisibleRangeRef.current;
		const currentPaneSnapshots = (() => {
			if (!engine) return null;
			const sn = engine.getPaneSnapshots();
			if (!sn || sn.length === 0) return null;
			return sn;
		})() ?? (forkPaneSnapshotsRef.current.length > 0 ? forkPaneSnapshotsRef.current : paneSnapshots);

		const snapshot = findPaneSnapshotAtPosition(currentPaneSnapshots, localX, localY);
		if (!snapshot) {
			return {
				mouseXY: [localX, localY] as [number, number],
			};
		}

		const currentCharts = visiblePanes.findIndex((pane) => pane.id === snapshot.paneId);
		const dataIndex = visibleRange
			? resolvePaneDataIndexAtPixel(snapshot, visibleRange, localX, plotData.length)
			: null;

		return {
			currentItem: dataIndex === null ? undefined : plotData[dataIndex],
			currentCharts: currentCharts >= 0 ? [currentCharts] : undefined,
			mouseXY: [localX, localY] as [number, number],
		};
	}, [paneSnapshots, plotData, visiblePanes, forkPaneSnapshotsRef, forkVisibleRangeRef, engineInstanceRef]);

	const handleForkDrawingClick = useCallback((pointerContext: ForkPointerContext) => {
		if (forkPointerOwnerRef.current !== null) {
			return;
		}

		const currentDrawingState = forkDrawingStateRef.current;
		if (currentDrawingState.type !== "drawing") {
			return;
		}

		if (ignoreNextForkDrawingClickRef.current) {
			ignoreNextForkDrawingClickRef.current = false;
			startForkDrawingPointerRef.current = null;
			return;
		}

		startForkDrawingPointerRef.current = null;

		const command = resolveForkDrawingCommand("click", pointerContext, currentDrawingState.object);
		if (!command) {
			return;
		}

		const resolvedPoint = resolveDrawingPointWithContext(resolvedDrawings, command.context, magnetSensitivity).point;
		const toolName = currentDrawingState.toolName;

		if (toolName === "polyline" || toolName === "path" || toolName === "polygon") {
			const draft = currentDrawingState.object;
			if (toolName === "polygon" && draft.points.length >= 4) {
				const firstPt = chartPointToPixel(draft.points[0], command.context.renderScales);
				const clickPt = chartPointToPixel(resolvedPoint, command.context.renderScales);
				const dist = Math.hypot(clickPt.x - firstPt.x, clickPt.y - firstPt.y);
				if (dist < 15) { // 15 pixels tolerance to close polygon
					const completedPoints = draft.points.slice(0, draft.points.length - 1);
					const completed = {
						...draft,
						points: completedPoints,
					};
					ignoreNextForkDrawingClickRef.current = false;
					forkDrawingStateRef.current = { type: "complete", object: completed };
					drawingWorkspace.interaction.dispatch({ type: "COMPLETE_DRAWING", object: completed });
					drawingWorkspace.interaction.dispatch({ type: "PUSH", drawing: completed });
					drawingWorkspace.selectDrawing(completed.id);
					drawingWorkspace.setActiveTool("cursor");
					return;
				}
			}

			const updated = appendPoint(draft, resolvedPoint);
			forkDrawingStateRef.current = {
				...currentDrawingState,
				object: updated,
			};
			drawingWorkspace.interaction.dispatch({ type: "UPDATE_DRAWING", object: updated });
			return;
		}

		if (isForkMultiStepTool(currentDrawingState.toolName)) {
			const { nextDraft, shouldComplete } = resolveForkMultiStepDraftOnClick(currentDrawingState.object, resolvedPoint);
			if (!shouldComplete) {
				forkDrawingStateRef.current = {
					...currentDrawingState,
					object: nextDraft,
				};
				drawingWorkspace.interaction.dispatch({ type: "UPDATE_DRAWING", object: nextDraft });
				return;
			}

			ignoreNextForkDrawingClickRef.current = false;
			forkDrawingStateRef.current = { type: "complete", object: nextDraft };
			drawingWorkspace.interaction.dispatch({ type: "COMPLETE_DRAWING", object: nextDraft });
			drawingWorkspace.interaction.dispatch({ type: "PUSH", drawing: nextDraft });
			drawingWorkspace.selectDrawing(nextDraft.id);
			drawingWorkspace.setActiveTool("cursor");
			return;
		}

		const completedDrawing = createTool(currentDrawingState.toolName).updateDraft(currentDrawingState.object, resolvedPoint);

		ignoreNextForkDrawingClickRef.current = false;
		forkDrawingStateRef.current = { type: "complete", object: completedDrawing };
		drawingWorkspace.interaction.dispatch({ type: "COMPLETE_DRAWING", object: completedDrawing });
		drawingWorkspace.interaction.dispatch({ type: "PUSH", drawing: completedDrawing });
		drawingWorkspace.selectDrawing(completedDrawing.id);
		drawingWorkspace.setActiveTool("cursor");
	}, [drawingWorkspace, magnetSensitivity, resolveForkDrawingCommand, resolvedDrawings]);

	const handleForkDoubleClick = useCallback((pointerContext: ForkPointerContext) => {
		const currentDrawingState = forkDrawingStateRef.current;

		if (currentDrawingState.type !== "drawing") {
			if (drawingWorkspace.state.activeTool === "cursor" && handleStartTextEdit) {
				const hitDrawingState = engineInstanceRef.current?.hitTestDrawingPrimitive(pointerContext.localX, pointerContext.localY) ?? null;
				const hitDrawing = hitDrawingState?.drawingId
					? (resolvedDrawings.find((drawing) => drawing.id === hitDrawingState.drawingId) ?? null)
					: null;
				if (hitDrawing && ["text", "callout", "priceLabel"].includes(hitDrawing.type) && hitDrawing.locked !== true) {
					handleStartTextEdit(hitDrawing.text ?? "");
					return;
				}
			}
			// F1: double-click on empty area (cursor tool, no hit, not drawing)
			// anchors followers' time — they keep their zoom (spec §2.4).
			if (onTimeAnchor) {
				const atPointer = resolveForkEventPayloadAtPosition(pointerContext.localX, pointerContext.localY);
				const anchorTs = (atPointer.currentItem as any)?.date?.getTime?.(); // ARC-1-keep: legacy bridge
				if (typeof anchorTs === "number" && Number.isFinite(anchorTs)) onTimeAnchor(anchorTs);
			}
			return;
		}

		if (!["polyline", "path", "polygon"].includes(currentDrawingState.toolName)) {
			return;
		}

		const command = resolveForkDrawingCommand("click", pointerContext, currentDrawingState.object);
		if (!command) {
			return;
		}

		const resolvedPoint = resolveDrawingPointWithContext(resolvedDrawings, command.context, magnetSensitivity).point;
		const toolName = currentDrawingState.toolName;
		const tool = createTool(toolName);
		let completed = tool.updateDraft(currentDrawingState.object, resolvedPoint);

		// Clean up final points for polyline, path, and polygon on double-click
		if (completed.points.length > 2) {
			const cleanPoints = [...completed.points];
			const last = cleanPoints[cleanPoints.length - 1];
			const prev = cleanPoints[cleanPoints.length - 2];
			if (last && prev && last.x === prev.x && last.y === prev.y) {
				cleanPoints.pop();
			}
			completed = {
				...completed,
				points: cleanPoints,
			};
		}

		ignoreNextForkDrawingClickRef.current = false;
		forkDrawingStateRef.current = { type: "complete", object: completed };
		drawingWorkspace.interaction.dispatch({ type: "COMPLETE_DRAWING", object: completed });
		drawingWorkspace.interaction.dispatch({ type: "PUSH", drawing: completed });
		drawingWorkspace.selectDrawing(completed.id);
		drawingWorkspace.setActiveTool("cursor");
	}, [drawingWorkspace, magnetSensitivity, resolveForkDrawingCommand, resolvedDrawings, engineInstanceRef, handleStartTextEdit, onTimeAnchor, resolveForkEventPayloadAtPosition]);

	const handleForkManipulationPointerDown = useCallback((pointerContext: ForkPointerContext) => {
		const hitDrawingState = engineInstanceRef.current?.hitTestDrawingPrimitive(pointerContext.localX, pointerContext.localY) ?? null;

		if (
			drawingWorkspace.state.activeTool === "cursor"
			&& Boolean(pointerContext.ctrlKey || pointerContext.metaKey)
		) {
			if (!hitDrawingState || hitDrawingState.actionHandle) {
				forkRubberBandSelectionRef.current = {
					startPixel: [pointerContext.localX, pointerContext.localY],
					currentPixel: [pointerContext.localX, pointerContext.localY],
				};
				setForkRubberBandTick((revision) => revision + 1);
				return;
			}
		}

		const hitDrawing = hitDrawingState?.drawingId
			? (resolvedDrawings.find((drawing) => drawing.id === hitDrawingState.drawingId) ?? null)
			: null;

		let targetDrawing: DrawingObject | null = null;
		let targetIds: readonly string[] = [];

		if (activeForkManipulationDrawing) {
			targetDrawing = activeForkManipulationDrawing;
			targetIds = forkMovableSelectionIds.includes(targetDrawing.id)
				? forkMovableSelectionIds
				: [targetDrawing.id];
		} else if (hitDrawing) {
			targetDrawing = hitDrawing;
			if (pointerContext.ctrlKey || pointerContext.metaKey) {
				const currentSelectedIds = drawingWorkspace.state.selectedIds;
				targetIds = currentSelectedIds.includes(hitDrawing.id)
					? currentSelectedIds.filter((id) => id !== hitDrawing.id)
					: [...currentSelectedIds, hitDrawing.id];
				updateForkReadonlySelectionByIds(targetIds);
			} else {
				targetIds = [hitDrawing.id];
				updateForkReadonlySelection(hitDrawing);
			}
			engineInstanceRef.current?.setOverlayInputs({ measurementEnabled: true });
		}

		if (!targetDrawing) {
			if (forkMovableSelectionIds.length > 0) {
				updateForkReadonlySelection(null);
				engineInstanceRef.current?.setOverlayInputs({ measurementEnabled: false });
			}
			return;
		}

		closeForkDrawingContextMenu();
		const command = resolveForkDrawingCommand("pointerdown", pointerContext, targetDrawing);
		if (!command) {
			return;
		}

		const drawingForHitTest = (() => {
			if (plotData.length === 0) return targetDrawing;
			const timeIndexMap = createDateTimeIndexMap(plotData);
			const [reconciled] = reconcileForkDrawingIndexAnchors([targetDrawing], timeIndexMap).drawings;
			return reconciled;
		})();
		const manipulationIntent = resolveDrawingManipulationIntentWithContext(drawingForHitTest, command.context);
		forkManipulationPreviewRef.current = null;
		setForkPreviewRevision((revision) => revision + 1);
		if (manipulationIntent?.mode === "resize") {
			drawingWorkspace.interaction.startResizing(targetDrawing.id, String(manipulationIntent.handleIndex));
			forkManipulationSessionRef.current = {
				mode: "resize",
				objectId: targetDrawing.id,
				objectIds: [targetDrawing.id],
				baseDrawings: resolvedDrawings,
				handleIndex: manipulationIntent.handleIndex,
				started: true,
			};
			engineInstanceRef.current?.setOverlayInputs({ measurementEnabled: true });
			updateForkManipulationActive(true);
			return;
		}

		if (!manipulationIntent || manipulationIntent.mode !== "move") {
			forkManipulationSessionRef.current = null;
			return;
		}

		drawingWorkspace.interaction.startMoving(targetDrawing.id, command.frame.chartPoint, command.frame.chartPoint);
		forkManipulationSessionRef.current = {
			mode: "move",
			objectId: targetDrawing.id,
			objectIds: targetIds,
			baseDrawings: resolvedDrawings,
			startChartPoint: command.frame.chartPoint,
			started: true,
		};
		engineInstanceRef.current?.setOverlayInputs({ measurementEnabled: true });
		updateForkManipulationActive(true);
	}, [activeForkManipulationDrawing, closeForkDrawingContextMenu, drawingWorkspace.state.activeTool, forkMovableSelectionIds, resolveForkDrawingCommand, resolvedDrawings, engineInstanceRef, updateForkReadonlySelection, updateForkReadonlySelectionByIds]);

	const handleForkManipulationPointerMove = useCallback((pointerContext: ForkPointerContext) => {
		const sess = forkManipulationSessionRef.current;
		if (forkRubberBandSelectionRef.current) {
			forkRubberBandSelectionRef.current = {
				startPixel: forkRubberBandSelectionRef.current.startPixel,
				currentPixel: [pointerContext.localX, pointerContext.localY],
			};
			setForkRubberBandTick((revision) => revision + 1);
			return;
		}

		const session = forkManipulationSessionRef.current;
		if (!session) {
			return;
		}

		if (!isPrimaryPointerPressed(pointerContext)) {
			return;
		}

		const targetDrawing = session.baseDrawings.find((drawing: DrawingObject) => drawing.id === session.objectId);
		if (!targetDrawing) {
			return;
		}

		const command = resolveForkDrawingCommand("pointermove", pointerContext, targetDrawing);
		if (!command) {
			return;
		}

		if (session.mode === "resize" && session.handleIndex != null) {
			const handleIdx = session.handleIndex;
			const target = session.baseDrawings.find((d: DrawingObject) => d.id === session.objectId);
			if (handleIdx >= 100 && target && (target.type === "callout" || target.type === "text" || target.type === "priceLabel")) {
				const renderScales = command.context.renderScales;
				const anchorPixel = chartPointToPixel(target.points[0], renderScales);
				if (Number.isFinite(anchorPixel.x) && Number.isFinite(anchorPixel.y)) {
					const pxArgs: TextBoxEdgePixels = {
						mousePixelX: command.frame.mousePosition[0],
						mousePixelY: command.frame.mousePosition[1],
						anchorPixelX: anchorPixel.x,
						anchorPixelY: anchorPixel.y,
						xScaleInvert: renderScales.xScaleInvert,
						yScaleInvert: renderScales.yScaleInvert,
						xScaleInvertToIndex: renderScales.xScaleInvertToIndex,
					};
					forkManipulationPreviewRef.current = resizeDrawingsByIds(
						session.baseDrawings,
						session.objectIds,
						handleIdx,
						command.frame.chartPoint,
						pxArgs,
					);
				} else {
					forkManipulationPreviewRef.current = [...session.baseDrawings];
				}
			} else {
				forkManipulationPreviewRef.current = resizeDrawingsByIds(
					session.baseDrawings,
					session.objectIds,
					handleIdx,
					command.frame.chartPoint,
				);
			}
			setForkPreviewRevision((revision) => revision + 1);
			return;
		}

		if (!session.startChartPoint) {
			return;
		}

		const deltaX = command.frame.chartPoint.x - session.startChartPoint.x;
		const deltaY = command.frame.chartPoint.y - session.startChartPoint.y;
		const deltaIndex = typeof command.frame.chartPoint.xIndexFloat === "number"
			&& Number.isFinite(command.frame.chartPoint.xIndexFloat)
			&& typeof session.startChartPoint.xIndexFloat === "number"
			&& Number.isFinite(session.startChartPoint.xIndexFloat)
			? command.frame.chartPoint.xIndexFloat - session.startChartPoint.xIndexFloat
			: undefined;

		forkManipulationPreviewRef.current = translateDrawingsByIds(
			session.baseDrawings,
			session.objectIds,
			deltaX,
			deltaY,
			deltaIndex,
		);
		setForkPreviewRevision((revision) => revision + 1);
	}, [resolveForkDrawingCommand]);

	const handleForkManipulationPointerUp = useCallback(() => {
		const rubberBand = forkRubberBandSelectionRef.current;
		if (rubberBand) {
			forkRubberBandSelectionRef.current = null;
			setForkRubberBandTick((revision) => revision + 1);

			const dx = Math.abs(rubberBand.currentPixel[0] - rubberBand.startPixel[0]);
			const dy = Math.abs(rubberBand.currentPixel[1] - rubberBand.startPixel[1]);
			if (dx < 4 && dy < 4) {
				return;
			}

			const engine = engineInstanceRef.current;
			const visibleRange = (() => {
				if (!engine) return null;
				const range = engine.getVisibleRange();
				if (!range || Math.abs(range.to - range.from) <= 1e-6) return null;
				return range;
			})() ?? forkVisibleRangeRef.current;
			const currentPaneSnapshots = (() => {
				if (!engine) return null;
				const sn = engine.getPaneSnapshots();
				if (!sn || sn.length === 0) return null;
				return sn;
			})() ?? (forkPaneSnapshotsRef.current.length > 0 ? forkPaneSnapshotsRef.current : paneSnapshots);

			if (!visibleRange || plotData.length === 0 || currentPaneSnapshots.length === 0) {
				return;
			}

			const absoluteRect = {
				minX: Math.min(rubberBand.startPixel[0], rubberBand.currentPixel[0]),
				maxX: Math.max(rubberBand.startPixel[0], rubberBand.currentPixel[0]),
				minY: Math.min(rubberBand.startPixel[1], rubberBand.currentPixel[1]),
				maxY: Math.max(rubberBand.startPixel[1], rubberBand.currentPixel[1]),
			};

			const matchingIds = resolvedDrawings
				.filter((drawing) => drawing.visible !== false)
				.filter((drawing) => {
					const snapshot = drawing.paneId
						? currentPaneSnapshots.find((candidate) => candidate.paneId === drawing.paneId)
						: currentPaneSnapshots[0];
					if (!snapshot) {
						return false;
					}

					const scaleSlotId = resolvePreferredScaleSlotId(snapshot, drawing.yScaleId);
					if (!scaleSlotId) {
						return false;
					}

					const renderScales = createForkDrawingScales(snapshot, scaleSlotId, visibleRange, plotData);
					if (!renderScales) {
						return false;
					}

					const paneRect = {
						minX: absoluteRect.minX - snapshot.plotBounds.left,
						maxX: absoluteRect.maxX - snapshot.plotBounds.left,
						minY: absoluteRect.minY - snapshot.plotBounds.top,
						maxY: absoluteRect.maxY - snapshot.plotBounds.top,
					};

					return isDrawingInRect(
						drawing,
						paneRect,
						renderScales,
						snapshot.plotBounds.width,
						snapshot.plotBounds.height,
					);
				})
				.map((drawing) => drawing.id);

			const normalizedIds = Array.from(new Set(matchingIds));
			drawingWorkspace.interaction.setSelectedObjects(normalizedIds);
			const nextDrawing = normalizedIds.length === 1
				? (resolvedDrawings.find((drawing) => drawing.id === normalizedIds[0]) ?? null)
				: null;
			updateForkReadonlySelection(nextDrawing);
			forkRubberBandJustCommittedRef.current = true;
			return;
		}

		const session = forkManipulationSessionRef.current;
		const previewDrawings = forkManipulationPreviewRef.current;
		forkManipulationSessionRef.current = null;
		forkManipulationPreviewRef.current = null;
		setForkPreviewRevision((revision) => revision + 1);
		updateForkManipulationActive(false);

		if (!session) {
			return;
		}

		const didChange = previewDrawings != null
			? (previewDrawings.length !== session.baseDrawings.length
				|| previewDrawings.some((drawing, index) => drawing !== session.baseDrawings[index]))
			: false;
		if (previewDrawings && didChange) {
			drawingWorkspace.interaction.replaceDrawings(previewDrawings);
			suppressNextForkSurfaceClickRef.current = true;
		}

		if (session.started) {
			if (session.objectIds.length > 1) {
				drawingWorkspace.interaction.setSelectedObjects(session.objectIds);
			} else {
				drawingWorkspace.selectDrawing(session.objectId);
			}
		}
	}, [drawingWorkspace, updateForkReadonlySelection, paneSnapshots, plotData, resolvedDrawings, forkPaneSnapshotsRef, forkVisibleRangeRef, engineInstanceRef]);

	const handleForkPointerDown = useCallback((pointerContext: ForkPointerContext) => {
		lastPointerContextRef.current = pointerContext;
		if (forkPointerOwnerRef.current !== null) {
			return;
		}

		if (!isPrimaryPointerPressed(pointerContext) && pointerContext.buttons !== 0) {
			return;
		}

		if (activeForkDrawingTool && activeForkDrawingTool !== "cursor") {
			handleForkDrawingPointerDown(pointerContext);
			return;
		}

		handleForkManipulationPointerDown(pointerContext);
	}, [activeForkDrawingTool, handleForkDrawingPointerDown, handleForkManipulationPointerDown]);

	const handleForkPointerMove = useCallback((pointerContext: ForkPointerContext) => {
		lastPointerContextRef.current = pointerContext;
		if (forkPointerOwnerRef.current !== null) {
			return;
		}

		if (forkDrawingStateRef.current.type === "drawing") {
			handleForkDrawingPointerMove(pointerContext);
			return;
		}

		handleForkManipulationPointerMove(pointerContext);

		if (!forkManipulationSessionRef.current && !forkRubberBandSelectionRef.current) {
			setForkPreviewRevision((rev) => rev + 1);
		}
	}, [handleForkDrawingPointerMove, handleForkManipulationPointerMove, setForkPreviewRevision]);

	const handleForkPointerUp = useCallback((pointerContext: ForkPointerContext) => {
		lastPointerContextRef.current = pointerContext;
		if (forkPointerOwnerRef.current !== null) {
			return;
		}

		const currentDrawingState = forkDrawingStateRef.current;
		if (
			currentDrawingState.type === "drawing"
			&& !isForkMultiStepTool(currentDrawingState.toolName)
			&& (
				hasForkDraftProgress(currentDrawingState.object)
				|| isForkSinglePointTool(currentDrawingState.toolName)
			)
		) {
			const command = resolveForkDrawingCommand("pointermove", pointerContext, currentDrawingState.object);
			const completedDrawing = command
				? createTool(currentDrawingState.toolName).updateDraft(
					currentDrawingState.object,
					resolveDrawingPointWithContext(resolvedDrawings, command.context, magnetSensitivity).point,
				)
				: currentDrawingState.object;

			ignoreNextForkDrawingClickRef.current = false;
			startForkDrawingPointerRef.current = null;
			forkDrawingStateRef.current = { type: "complete", object: completedDrawing };
			drawingWorkspace.interaction.dispatch({ type: "COMPLETE_DRAWING", object: completedDrawing });
			drawingWorkspace.interaction.dispatch({ type: "PUSH", drawing: completedDrawing });
			drawingWorkspace.selectDrawing(completedDrawing.id);
			drawingWorkspace.setActiveTool("cursor");
			return;
		}

		handleForkManipulationPointerUp();
	}, [handleForkManipulationPointerUp]);

	const handleForkPointerLeave = useCallback(() => {
		lastPointerContextRef.current = null;
		if (forkPointerOwnerRef.current !== null) {
			return;
		}
	}, []);

	useEffect(() => {
		const previousTool = previousForkAuthoringToolRef.current;
		previousForkAuthoringToolRef.current = activeForkDrawingTool;

		if (!useForkRuntime || !drawingUiEnabled || !activeForkDrawingTool) {
			return;
		}

		if (previousTool === activeForkDrawingTool) {
			return;
		}

		forkManipulationSessionRef.current = null;
		forkManipulationPreviewRef.current = null;
		updateForkManipulationActive(false);
		setForkPreviewRevision((revision) => revision + 1);
		closeForkDrawingContextMenu();

		if (!resolvedSelectedDrawing) {
			return;
		}

		updateForkReadonlySelection(null);
		drawingWorkspace.selectDrawing(null);
	}, [activeForkDrawingTool, closeForkDrawingContextMenu, drawingUiEnabled, drawingWorkspace, updateForkReadonlySelection, resolvedSelectedDrawing, useForkRuntime]);

	const forkRenderableDrawings = useMemo(
		() => {
			if (forkManipulationPreviewRef.current) {
				return forkManipulationPreviewRef.current;
			}

			const editingDrawingId = isEditingText && resolvedForkSingleSelection && ["text", "callout", "priceLabel"].includes(resolvedForkSingleSelection.type)
				? resolvedForkSingleSelection.id
				: null;
			const filtered = editingDrawingId ? resolvedDrawings.filter((d) => d.id !== editingDrawingId) : resolvedDrawings;

			if (drawingWorkspace.interaction.drawingState.type === "drawing") {
				const draftDrawing = drawingWorkspace.interaction.drawingState.object;
				return resolveRenderableForkDrawings(
					[...filtered.filter((drawing) => drawing.id !== draftDrawing.id), draftDrawing],
					resolvedForkSingleSelection,
				);
			}

			return resolveRenderableForkDrawings(filtered, resolvedForkSingleSelection);
		},
		[drawingWorkspace.interaction.drawingState, forkPreviewRevision, resolvedDrawings, resolvedForkSingleSelection, isEditingText],
	);

	const forkRenderableDrawingMap = useMemo(
		() => new Map(forkRenderableDrawings.map((drawing: DrawingObject) => [drawing.id, drawing] as const)),
		[forkRenderableDrawings],
	);

	const openForkContextMenuAtPosition = useCallback((localX: number, localY: number, nativeEvent: unknown) => {
		const hitDrawingState = engineInstanceRef.current?.hitTestDrawingPrimitive(localX, localY) ?? null;
		const hitDrawing = hitDrawingState?.actionHandle
			? null
			: (hitDrawingState?.drawingId ?? hitDrawingState?.key)
				? forkRenderableDrawingMap.get(hitDrawingState.drawingId ?? hitDrawingState.key) ?? null
				: null;

		if (hitDrawing) {
			updateForkReadonlySelection(hitDrawing);
			setForkDrawingContextMenu({
				x: Math.min(Math.max(12, localX + 8), Math.max(12, size.width - 260)),
				y: Math.min(Math.max(12, localY + 8), Math.max(12, size.height - 260)),
				drawingId: hitDrawing.id,
			});
			return;
		}

		// P3-b: empty-canvas right-click opens the canvas menu (drawingId null)
		// instead of a silent no-op. Host onContextMenu passthrough preserved.
		setForkDrawingContextMenu({
			x: Math.min(Math.max(12, localX + 8), Math.max(12, size.width - 260)),
			y: Math.min(Math.max(12, localY + 8), Math.max(12, size.height - 260)),
			drawingId: null,
		});
		if (!onContextMenu) {
			return;
		}

		onContextMenu(resolveForkEventPayloadAtPosition(localX, localY), nativeEvent);
	}, [closeForkDrawingContextMenu, forkRenderableDrawingMap, onContextMenu, resolveForkEventPayloadAtPosition, size.height, size.width, updateForkReadonlySelection, setForkDrawingContextMenu, engineInstanceRef]);

	const handleForkClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
		if (!useForkRuntime) {
			return;
		}

		if (forkRubberBandJustCommittedRef.current) {
			forkRubberBandJustCommittedRef.current = false;
			return;
		}

		if (suppressNextForkSurfaceClickRef.current) {
			suppressNextForkSurfaceClickRef.current = false;
			return;
		}

		if (activeForkDrawingTool && activeForkDrawingTool !== "cursor") {
			return;
		}

		closeForkDrawingContextMenu();

		const rect = event.currentTarget.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const localY = event.clientY - rect.top;
		const hitDrawingState = engineInstanceRef.current?.hitTestDrawingPrimitive(localX, localY) ?? null;
		if (hitDrawingState?.actionHandle) {
			switch (hitDrawingState.actionHandle) {
				case "delete":
					drawingWorkspace.interaction.deleteSelected();
					return;
				case "clone":
					cloneSelectedDrawing();
					return;
				case "lock":
					toggleSelectedLock();
					return;
			}
		}

		const hitDrawingId = hitDrawingState?.drawingId ?? hitDrawingState?.key ?? null;
		const hitDrawing = hitDrawingId
			? forkRenderableDrawingMap.get(hitDrawingId) ?? null
			: null;
		const isMultiSelectModifier = Boolean(event.shiftKey || event.ctrlKey || event.metaKey);

		if (hitDrawing) {
			if (isMultiSelectModifier) {
				const currentSelectedIds = drawingWorkspace.state.selectedIds;
				const nextSelectedIds = currentSelectedIds.includes(hitDrawing.id)
					? currentSelectedIds.filter((id) => id !== hitDrawing.id)
					: [...currentSelectedIds, hitDrawing.id];
				updateForkReadonlySelectionByIds(nextSelectedIds);
				return;
			}

			if (resolvedSelectedDrawing?.id !== hitDrawing.id) {
				updateForkReadonlySelection(hitDrawing);
			}
			return;
		}

		if (resolvedSelectedDrawing) {
			updateForkReadonlySelection(null);
		}

		if (!onClick) {
			return;
		}

		const payload = resolveForkEventPayloadAtPosition(localX, localY);
		onClick(payload, event.nativeEvent);
	}, [activeForkDrawingTool, cloneSelectedDrawing, closeForkDrawingContextMenu, drawingWorkspace, forkRenderableDrawingMap, onClick, resolveForkEventPayloadAtPosition, resolvedSelectedDrawing, toggleSelectedLock, updateForkReadonlySelection, updateForkReadonlySelectionByIds, useForkRuntime, engineInstanceRef]);

	const handleForkHostContextMenu = useCallback((pointerContext: ForkPointerContext) => {
		if (!useForkRuntime || pointerContext.pointerType === "mouse") {
			return;
		}

		if (forkPointerOwnerRef.current !== null || (activeForkDrawingTool && activeForkDrawingTool !== "cursor")) {
			return;
		}

		openForkContextMenuAtPosition(pointerContext.localX, pointerContext.localY, pointerContext);
	}, [activeForkDrawingTool, openForkContextMenuAtPosition, useForkRuntime]);

	const handleForkContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
		if (!useForkRuntime) {
			return;
		}

		const isReplayShortcut = Boolean(
			event.altKey
			|| event.nativeEvent.altKey
			|| event.getModifierState?.("Alt")
			|| forkAltShortcutPressedRef.current,
		);
		if (isReplayShortcut) {
			closeForkDrawingContextMenu();
			if (!onContextMenu) {
				return;
			}

			event.preventDefault();
			const rect = event.currentTarget.getBoundingClientRect();
			const localX = event.clientX - rect.left;
			const localY = event.clientY - rect.top;
			onContextMenu(resolveForkEventPayloadAtPosition(localX, localY), event.nativeEvent);
			return;
		}

		event.preventDefault();
		const rect = event.currentTarget.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const localY = event.clientY - rect.top;
		openForkContextMenuAtPosition(localX, localY, event.nativeEvent);
	}, [closeForkDrawingContextMenu, onContextMenu, openForkContextMenuAtPosition, resolveForkEventPayloadAtPosition, useForkRuntime, forkAltShortcutPressedRef]);

	const cancelForkInteraction = useCallback(() => {
		forkPointerOwnerRef.current = null;
		forkManipulationSessionRef.current = null;
		forkManipulationPreviewRef.current = null;
		updateForkManipulationActive(false);
		setForkPreviewRevision((revision) => revision + 1);
		if (forkRubberBandSelectionRef.current) {
			forkRubberBandSelectionRef.current = null;
			setForkRubberBandTick((revision) => revision + 1);
		}
		ignoreNextForkDrawingClickRef.current = false;
		startForkDrawingPointerRef.current = null;
		drawingWorkspace.interaction.cancelDrawing();
		drawingWorkspace.setActiveTool("cursor");
	}, [drawingWorkspace]);

	// Clean up any active fork interaction on unmount to prevent stale
	// drawingWorkspace.interaction state (e.g. "moving") from persisting
	// across runtime switches and causing infinite re-render loops.
	useEffect(() => {
		return () => {
			forkPointerOwnerRef.current = null;
			forkManipulationSessionRef.current = null;
			forkManipulationPreviewRef.current = null;
			ignoreNextForkDrawingClickRef.current = false;
			startForkDrawingPointerRef.current = null;
			if (forkRubberBandSelectionRef.current) {
				forkRubberBandSelectionRef.current = null;
			}
			drawingWorkspace.interaction.cancelDrawing();
			drawingWorkspace.setActiveTool("cursor");
		};
	}, [drawingWorkspace]);

	// ESC-cancel (P3 closeout): Escape mid-draft MUST abandon the fork draft.
	// Without this, forkDrawingStateRef stays { type: "drawing" } with a stale
	// toolName; the next click (after a >5px move clears ignoreNextForkDrawingClick)
	// completes a GHOST drawing. Only cancels while a draft is really in
	// progress — committed/selected drawings are untouched, and the post-commit
	// setActiveTool("cursor") reset in the click/pointerup paths stays intact.
	useEffect(() => {
		if (!useForkRuntime || !drawingUiEnabled) {
			return undefined;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (isEditingText) return;
			if (isTypingTarget(event)) return;
			if (forkDrawingStateRef.current.type !== "drawing") return;
			ignoreNextForkDrawingClickRef.current = false;
			startForkDrawingPointerRef.current = null;
			forkDrawingStateRef.current = { type: "idle" };
			drawingWorkspace.interaction.cancelDrawing();
			setForkPreviewRevision((revision) => revision + 1);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [useForkRuntime, drawingUiEnabled, drawingWorkspace, isEditingText]);

	useEffect(() => {
		if (!useForkRuntime) {
			return undefined;
		}

		// Use injected windowEventAdapter for global event listeners (no direct window/document access)
		if (windowEventAdapter) {
			const cleanup = windowEventAdapter.addGlobalListeners({
				onPointerUp: releasePointerOwner,
				onPointerCancel: releasePointerOwner,
				onPointerMove: releaseWhenNoButtonsPressed,
				onMouseUp: releasePointerOwner,
				onTouchEnd: releasePointerOwner,
				onTouchCancel: releasePointerOwner,
				onContextMenu: releasePointerOwner,
				onLostPointerCapture: releasePointerOwner,
				onPageHide: releasePointerOwner,
				onBlur: releasePointerOwner,
				onVisibilityChange: releaseOnVisibilityChange,
			});

			return () => {
				cleanup?.();
			};
		}

		// No fallback - windowEventAdapter is required for fork runtime
		return undefined;
	}, [clearForkPointerOwner, useForkRuntime, releasePointerOwner, releaseWhenNoButtonsPressed, releaseOnVisibilityChange, windowEventAdapter]);

	const forkRubberBandSelection = forkRubberBandSelectionRef.current;

	return {
		forkSurfaceCursor,
		forkPreviewRevision,
		forkManipulationActive,
		forkManipulationActiveRef,
		forkRubberBandSelection,
		forkRenderableDrawings,
		forkPointerOwnerRef,
		claimForkPointerOwner,
		releaseForkPointerOwner,
		handleForkPointerDown,
		handleForkPointerMove,
		handleForkPointerUp,
		handleForkPointerLeave,
		handleForkClick,
		handleForkContextMenu,
		handleForkHostContextMenu,
		handleForkDrawingClick,
		handleForkDoubleClick,
		cancelForkInteraction,
	};
}
