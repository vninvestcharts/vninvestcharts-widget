// S1/BUG-1 — Batch actions for the multi-select floating toolbar.
// Pure dispatch layer over multiSelectBatch.ts + clipboard clone + group toggle.
// Group/Ungroup via REPLACE (no new interaction API — see §3.2 contract).
import { useCallback, useMemo } from "react";
import { applyBatchColor, applyBatchDelete, applyBatchLock, applyBatchVisible, resolveNextLockState, resolveNextVisibleState } from "@vninvestcharts/engine-drawing";
import { offsetDrawingByPixels } from "@vninvestcharts/engine-drawing";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import type { DrawingWorkspaceController } from "@vninvestcharts/engine-react";

export interface UseMultiSelectActionsProps {
	drawingWorkspace: DrawingWorkspaceController | null;
	selectedIds: readonly string[];
	drawings: readonly DrawingObject[];
	t: (key: string) => string;
}

export interface UseMultiSelectActionsReturn {
	selectedCount: number;
	allLocked: boolean;
	allHidden: boolean;
	hasUnlocked: boolean;
	isAllGrouped: boolean;
	handleDeleteAll: () => void;
	handleLockAll: () => void;
	handleSetVisibleAll: (visible: boolean) => void;
	handleBatchColor: (color: string) => void;
	handleCloneAll: () => void;
	handleGroupToggleAll: () => void;
}

export function useMultiSelectActions({
	drawingWorkspace,
	selectedIds,
	drawings,
}: UseMultiSelectActionsProps): UseMultiSelectActionsReturn {
	const selected = useMemo(
		() => drawings.filter((d) => selectedIds.includes(d.id)),
		[drawings, selectedIds],
	);
	const selectedCount = selectedIds.length;
	const hasUnlocked = useMemo(
		() => selected.some((d) => d.locked !== true),
		[selected],
	);
	const allLocked = selectedCount > 0 && !hasUnlocked;
	const allHidden = useMemo(
		() => selectedCount > 0 && selected.every((d) => d.visible === false),
		[selected, selectedCount],
	);
	const isAllGrouped = useMemo(
		() => selectedCount > 1 && selected.every((d) => !!d.groupId && d.groupId === selected[0].groupId),
		[selected, selectedCount],
	);

	const replace = useCallback((next: DrawingObject[]) => {
		drawingWorkspace?.interaction.replaceDrawings(next);
	}, [drawingWorkspace]);

	const handleDeleteAll = useCallback(() => {
		if (!drawingWorkspace || selectedCount === 0) return;
		replace(applyBatchDelete(drawings, selectedIds));
		drawingWorkspace.selectDrawing(null);
	}, [drawingWorkspace, drawings, selectedIds, selectedCount, replace]);

	const handleLockAll = useCallback(() => {
		if (!drawingWorkspace || selectedCount === 0) return;
		replace(applyBatchLock(drawings, selectedIds, resolveNextLockState(drawings, selectedIds)));
	}, [drawingWorkspace, drawings, selectedIds, selectedCount, replace]);

	const handleSetVisibleAll = useCallback((visible: boolean) => {
		if (!drawingWorkspace || selectedCount === 0) return;
		replace(applyBatchVisible(drawings, selectedIds, visible));
	}, [drawingWorkspace, drawings, selectedIds, selectedCount, replace]);

	const handleBatchColor = useCallback((color: string) => {
		if (!drawingWorkspace || selectedCount === 0) return;
		replace(applyBatchColor(drawings, selectedIds, color));
	}, [drawingWorkspace, drawings, selectedIds, selectedCount, replace]);

	const handleCloneAll = useCallback(() => {
		if (!drawingWorkspace || selectedCount === 0) return;
		const next = [...drawings];
		const clonedIds: string[] = [];
		for (const id of selectedIds) {
			const drawing = drawings.find((d) => d.id === id);
			if (!drawing) continue;
			const clone = offsetDrawingByPixels(drawing, 10, 10, undefined, undefined, undefined, 60000, {
				paneId: drawing.paneId,
				yScaleId: drawing.yScaleId,
			});
			next.push(clone);
			clonedIds.push(clone.id);
		}
		if (clonedIds.length === 0) return;
		replace(next);
		drawingWorkspace.interaction.dispatch({ type: "SET_SELECTED_OBJECTS", objectIds: clonedIds });
	}, [drawingWorkspace, drawings, selectedIds, selectedCount, replace]);

	const handleGroupToggleAll = useCallback(() => {
		if (!drawingWorkspace || selectedCount < 2) return;
		const idSet = new Set(selectedIds);
		if (isAllGrouped) {
			// Ungroup: clear groupId on members (symmetric toggle, §3.2).
			replace(drawings.map((d) => (idSet.has(d.id) ? { ...d, groupId: undefined } : d)));
		} else {
			const groupId = `group_${Date.now()}`;
			replace(drawings.map((d) => (idSet.has(d.id) ? { ...d, groupId } : d)));
		}
	}, [drawingWorkspace, drawings, selectedIds, selectedCount, isAllGrouped, replace]);

	return {
		selectedCount,
		allLocked,
		allHidden,
		hasUnlocked,
		isAllGrouped,
		handleDeleteAll,
		handleLockAll,
		handleSetVisibleAll,
		handleBatchColor,
		handleCloneAll,
		handleGroupToggleAll,
	};
}
