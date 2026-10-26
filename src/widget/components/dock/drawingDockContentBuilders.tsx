// S3 (P5 parity F2): shared builders cho DrawingDock contents — single
// (useWidgetOverlays) và multi (workspace bridge) DÙNG CHUNG (Rule 6).
// Move thuần túy từ useWidgetOverlays 724-880, tham số hóa workspace +
// selected + text-edit + callbacks. Không đổi behavior/labels/testids.
import type { ReactNode } from "react";
import DrawingInspector from "../drawing/DrawingInspector";
import DrawingListPanel from "../drawing/DrawingListPanel";
import TemplateManagerPanel from "../drawing/TemplateManagerPanel";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import type { DrawingWorkspaceController } from "@vninvestcharts/engine-react";

export interface DrawingDockTextEdit {
	isEditingText: boolean;
	drawingTextDraft: string;
	setDrawingTextDraft: (value: string) => void;
	onStartTextEdit: (initial: string) => void;
	onCommitTextEdit: (commit: (draft: string) => void) => void;
	onCancelTextEdit: () => void;
}

export interface DrawingDockSelectedActions {
	onDeleteDrawing: () => void;
	onCloneSelected: () => void;
	onToggleSelectedLock: () => void;
	onToggleSelectedVisibility: () => void;
	onBringSelectedToFront: () => void;
	onSendSelectedToBack: () => void;
}

export interface DrawingDockContentDeps {
	workspace: DrawingWorkspaceController | null;
	selected: DrawingObject | null;
	t: (key: string) => string;
	textEdit: DrawingDockTextEdit;
	actions: DrawingDockSelectedActions;
}

export function buildDockObjectsContent(deps: DrawingDockContentDeps): ReactNode {
	const { workspace, selected, t } = deps;
	if (!workspace) {
		return null;
	}
	const drawings = [...workspace.state.drawings];

	return (
		<DrawingListPanel
			drawings={drawings}
			selectedId={selected?.id ?? null}
			embedded
			labels={{
				title: t("drawing.list.title"),
				empty: t("drawing.list.empty"),
				visible: t("drawing.list.visible"),
				hidden: t("drawing.list.hidden"),
				locked: t("drawing.list.locked"),
				unlocked: t("drawing.list.unlocked"),
				selected: t("drawing.list.selected"),
				delete: t("drawing.list.delete"),
			}}
			onSelect={(id: string | null) => workspace.selectDrawing(id)}
			onToggleVisible={(id: string) => {
				const d = drawings.find((x) => x.id === id);
				if (d) {
					workspace.interaction.updateDrawing(id, { visible: d.visible === false });
				}
			}}
			onToggleLocked={(id: string) => {
				const d = drawings.find((x) => x.id === id);
				if (d) {
					workspace.interaction.updateDrawing(id, { locked: !d.locked });
				}
			}}
			onDelete={(id: string) => {
				const nextDrawings = workspace.interaction.allDrawings.filter((x: DrawingObject) => x.id !== id);
				workspace.interaction.replaceDrawings(nextDrawings);
				if (selected?.id === id) {
					workspace.selectDrawing(null);
				}
			}}
			onRename={(id: string, label: string) => {
				workspace.interaction.updateDrawing(id, { label });
			}}
			onBringToFront={(id: string) => {
				const maxZ = workspace.interaction.allDrawings.reduce((m: number, x: DrawingObject) => Math.max(m, x.zIndex ?? 0), 0);
				workspace.interaction.updateDrawing(id, { zIndex: maxZ + 1 });
			}}
			onSendToBack={(id: string) => {
				const minZ = workspace.interaction.allDrawings.reduce((m: number, x: DrawingObject) => Math.min(m, x.zIndex ?? 0), 0);
				workspace.interaction.updateDrawing(id, { zIndex: minZ - 1 });
			}}
			bringToFrontLabel={t("drawing.bringToFront")}
			sendToBackLabel={t("drawing.sendToBack")}
		/>
	);
}

export function buildDockPropertiesContent(deps: DrawingDockContentDeps): ReactNode {
	const { workspace, selected, t, textEdit, actions } = deps;
	if (!selected || !workspace) {
		return <div className="vnsc-drawing-dock__empty">{t("drawing.dock.emptyProperties") ?? "No object selected"}</div>;
	}

	return (
		<DrawingInspector
			drawing={selected}
			embedded
			labels={{
				title: t("drawing.dockProperties"),
				stroke: t("drawing.stroke"),
				selectIcon: t("drawing.selectIcon"),
				iconSize: t("drawing.iconSize"),
				fill: t("drawing.fill"),
				strokeWidth: t("drawing.strokeWidth"),
				lineStyle: t("drawing.lineStyle"),
				opacity: t("drawing.opacity"),
				solid: t("drawing.solid"),
				dashed: t("drawing.dashed"),
				dotted: t("drawing.dotted"),
				lock: t("drawing.lock"),
				unlock: t("drawing.unlock"),
				clone: t("drawing.clone"),
				hide: t("drawing.hide"),
				show: t("drawing.show"),
				bringToFront: t("drawing.bringToFront"),
				sendToBack: t("drawing.sendToBack"),
				delete: t("drawing.delete"),
				close: t("drawing.close"),
			}}
			textEditor={["text", "callout", "priceLabel"].includes(selected.type) ? {
				active: textEdit.isEditingText,
				value: textEdit.drawingTextDraft,
				labels: {
					title: t("drawing.textEditorTitle"),
					label: t("drawing.textEditorLabel"),
					placeholder: t("drawing.textEditorPlaceholder"),
					edit: t("drawing.textEditorEdit"),
					save: t("drawing.textEditorSave"),
					cancel: t("drawing.textEditorCancel"),
					empty: t("drawing.textEditorEmpty"),
				},
				onChange: textEdit.setDrawingTextDraft,
				onStartEdit: () => textEdit.onStartTextEdit(selected?.text ?? ""),
				onCommit: () => textEdit.onCommitTextEdit((draft: string) => {
					workspace.interaction.updateDrawing(selected.id, { text: draft });
				}),
				onCancel: textEdit.onCancelTextEdit,
			} : undefined}
			onUpdate={(patch: Partial<DrawingObject>) => workspace?.interaction.updateDrawing(selected.id, patch)}
			onDelete={actions.onDeleteDrawing}
			onClone={actions.onCloneSelected}
			onToggleLock={actions.onToggleSelectedLock}
			onToggleVisible={actions.onToggleSelectedVisibility}
			onBringToFront={actions.onBringSelectedToFront}
			onSendToBack={actions.onSendSelectedToBack}
			onClose={() => workspace?.selectDrawing(null)}
		/>
	);
}

export function buildDockTemplatesContent(deps: DrawingDockContentDeps): ReactNode {
	const { workspace, selected, t } = deps;
	if (!selected) {
		return <div className="vnsc-drawing-dock__empty">{t("drawing.dock.emptyTemplates")}</div>;
	}
	return (
		<TemplateManagerPanel
			drawingType={selected.type}
			drawing={selected}
			locked={selected.locked}
			onUpdate={(patch: Partial<DrawingObject>) => workspace?.interaction.updateDrawing(selected.id, patch)}
			labels={{
				loadTemplate: t("drawing.templatesLoad"),
				saveAs: t("drawing.templatesSave"),
				load: t("drawing.templatesLoad"),
				save: t("drawing.templatesSave"),
				delete: t("drawing.templatesDelete"),
				namePlaceholder: t("drawing.templatesNamePlaceholder"),
			}}
		/>
	);
}
