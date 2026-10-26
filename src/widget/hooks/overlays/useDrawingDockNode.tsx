import React, { useMemo } from "react";
import type { DrawingWorkspaceController, DrawingDockTab } from "@vninvestcharts/engine-react";
import DrawingDock from "../../components/drawing/DrawingDock";

export interface DrawingDockNodeDeps {
	showDrawingDock?: boolean;
	drawingWorkspace: DrawingWorkspaceController | null | undefined;
	renderDrawingDock?: any;
	t: (key: string) => string;
	dockPropertiesContent: React.ReactNode;
	dockObjectsContent: React.ReactNode;
	dockTemplatesContent: React.ReactNode;
	/** S3 (P5 parity F2): workspace bridge force node (host tab owns visibility,
		không qua cell dock open-state). Default false (single giữ nguyên). */
	forceOpen?: boolean;
}

// Drawing dock node. Split from useWidgetOverlays (D0 headroom).
export function useDrawingDockNode(deps: DrawingDockNodeDeps): React.ReactNode {
	const {
		showDrawingDock, drawingWorkspace, renderDrawingDock, t,
		dockPropertiesContent, dockObjectsContent, dockTemplatesContent,
		forceOpen,
	} = deps;

	return useMemo(() => {
		if ((!showDrawingDock && !forceOpen) || !drawingWorkspace) return null;
		const dockOpen = forceOpen || drawingWorkspace.state.dock.isOpen;
		if (!dockOpen) return null;

		const labels = {
			title: t("drawing.dock.title") ?? "Drawing Properties",
			close: t("drawing.dock.close") ?? "Close",
			properties: t("drawing.dock.properties") ?? "Properties",
			objects: t("drawing.dock.objects") ?? "Objects",
			templates: t("drawing.dock.templates") ?? "Templates",
			emptyProperties: t("drawing.dock.emptyProperties") ?? "No properties available",
			emptyObjects: t("drawing.dock.emptyObjects") ?? "No objects selected",
			emptyTemplates: t("drawing.dock.templates") ?? "No templates saved",
			resize: t("drawing.dock.resize") ?? "Resize",
		};

		if (renderDrawingDock) {
			return (
				<React.Fragment key="dock">
					{renderDrawingDock({
						isOpen: dockOpen,
						activeTab: drawingWorkspace.state.dock.activeTab,
						labels,
						onClose: () => drawingWorkspace.closeDock(),
						onTabChange: (tab: DrawingDockTab) => drawingWorkspace.setDockTab(tab),
						propertiesContent: dockPropertiesContent,
						objectsContent: dockObjectsContent,
						templatesContent: dockTemplatesContent,
					})}
				</React.Fragment>
			);
		}

		return (
			<DrawingDock
				key="dock"
				isOpen={dockOpen}
				activeTab={drawingWorkspace.state.dock.activeTab}
				labels={labels}
				initialDragDelta={drawingWorkspace.state.dock.position}
				initialSizeDelta={drawingWorkspace.state.dock.sizeDelta}
				onLayoutChange={({ dragDelta, sizeDelta }) => drawingWorkspace.setDockLayout({ position: dragDelta, sizeDelta })}
				onClose={() => drawingWorkspace.closeDock()}
				onTabChange={(tab: DrawingDockTab) => drawingWorkspace.setDockTab(tab)}
				propertiesContent={dockPropertiesContent}
				objectsContent={dockObjectsContent}
				templatesContent={dockTemplatesContent}
			/>
		);
	}, [showDrawingDock, forceOpen, drawingWorkspace, renderDrawingDock, t, dockPropertiesContent, dockObjectsContent, dockTemplatesContent]);
}
