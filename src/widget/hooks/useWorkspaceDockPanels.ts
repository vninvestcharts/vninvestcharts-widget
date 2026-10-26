// S3 (P5 parity F2): bridge đọc workspace của chart đang active và dựng
// drawingDockNode ĐẦY ĐỦ (objects + properties + templates, y hệt single)
// qua shared builders + useDrawingDockNode(forceOpen). Re-read khi
// activeChartId đổi hoặc revision bump (multi bump mỗi khi workspace active
// notify — useWidgetDrawings phát mỗi khi workspace.state đổi identity).
// Empty drawings → null để host disabled tab (giữ semantics W2).
import { useMemo, useState } from "react";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import type { DrawingWorkspaceController } from "@vninvestcharts/engine-react";
import { offsetDrawingByPixels } from "@vninvestcharts/engine-drawing";
import { useWidgetI18n } from "../context/WidgetI18nContext";
import type { FullChartHandle } from "../types/fullChartHandle";
import { useDrawingDockNode } from "./overlays/useDrawingDockNode";
import {
	buildDockObjectsContent,
	buildDockPropertiesContent,
	buildDockTemplatesContent,
} from "../components/dock/drawingDockContentBuilders";

interface UseWorkspaceDockPanelsDeps {
	activeChartId: string | null;
	chartRefs: React.MutableRefObject<Map<string, React.RefObject<FullChartHandle | null>>>;
	/** Bump mỗi khi workspace của active chart notify → đọc lại state mới. */
	revision: number;
}

export function useWorkspaceDockPanels({ activeChartId, chartRefs, revision }: UseWorkspaceDockPanelsDeps) {
	const { t } = useWidgetI18n();
	// Text-edit state (mirror useWidgetSettings 539-554 semantics).
	const [isEditingText, setIsEditingText] = useState(false);
	const [drawingTextDraft, setDrawingTextDraft] = useState("");

	const workspace = (activeChartId
		? chartRefs.current.get(activeChartId)?.current?.getDrawingWorkspace?.() ?? null
		: null) as DrawingWorkspaceController | null;
	const selected = workspace?.state.selectedDrawing ?? null;
	const drawings = useMemo(() => (workspace ? [...workspace.state.drawings] : [] as DrawingObject[]),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[workspace, revision]);

	const textEdit = useMemo(() => ({
		isEditingText,
		drawingTextDraft,
		setDrawingTextDraft,
		onStartTextEdit: (initial: string) => {
			setDrawingTextDraft(initial);
			setIsEditingText(true);
		},
		onCommitTextEdit: (commit: (draft: string) => void) => {
			commit(drawingTextDraft);
			setIsEditingText(false);
		},
		onCancelTextEdit: () => setIsEditingText(false),
	}), [isEditingText, drawingTextDraft]);

	const actions = useMemo(() => {
		const guard = () => (workspace && selected ? { workspace, selected } : null);
		return {
			onDeleteDrawing: () => {
				const g = guard();
				if (!g) return;
				const next = g.workspace.interaction.allDrawings.filter((x: DrawingObject) => x.id !== g.selected.id);
				g.workspace.interaction.replaceDrawings(next);
				g.workspace.selectDrawing(null);
			},
			onCloneSelected: () => {
				const g = guard();
				if (!g) return;
				const nextClone = offsetDrawingByPixels(g.selected, 10, 10, undefined, undefined, undefined, 60000, {
					paneId: g.selected.paneId,
					yScaleId: g.selected.yScaleId,
				});
				g.workspace.interaction.replaceDrawings([...g.workspace.interaction.allDrawings, nextClone]);
				g.workspace.selectDrawing(nextClone.id);
			},
			onToggleSelectedLock: () => {
				const g = guard();
				if (!g) return;
				g.workspace.interaction.updateDrawing(g.selected.id, { locked: !g.selected.locked });
			},
			onToggleSelectedVisibility: () => {
				const g = guard();
				if (!g) return;
				g.workspace.interaction.updateDrawing(g.selected.id, { visible: g.selected.visible === false });
			},
			onBringSelectedToFront: () => {
				const g = guard();
				if (!g) return;
				const maxZ = g.workspace.interaction.allDrawings.reduce((m: number, x: DrawingObject) => Math.max(m, x.zIndex ?? -1), -1);
				g.workspace.interaction.updateDrawing(g.selected.id, { zIndex: maxZ + 1 });
			},
			onSendSelectedToBack: () => {
				const g = guard();
				if (!g) return;
				const minZ = g.workspace.interaction.allDrawings.reduce((m: number, x: DrawingObject) => Math.min(m, x.zIndex ?? -1), -1);
				g.workspace.interaction.updateDrawing(g.selected.id, { zIndex: minZ - 1 });
			},
		};
	}, [workspace, selected]);

	const deps = useMemo(() => ({
		workspace, selected, t, textEdit, actions,
	}), [workspace, selected, t, textEdit, actions]);

	const dockObjectsContent = useMemo(() => buildDockObjectsContent(deps), [deps]);
	const dockPropertiesContent = useMemo(() => buildDockPropertiesContent(deps), [deps]);
	const dockTemplatesContent = useMemo(() => buildDockTemplatesContent(deps), [deps]);

	const node = useDrawingDockNode({
		showDrawingDock: true,
		forceOpen: true,
		drawingWorkspace: workspace,
		renderDrawingDock: undefined,
		t,
		dockPropertiesContent,
		dockObjectsContent,
		dockTemplatesContent,
	});

	if (!workspace || drawings.length === 0) {
		return { drawingDockNode: null };
	}
	return { drawingDockNode: node };
}
