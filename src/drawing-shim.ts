// Public contract for `vninvestcharts-widget/drawing`.
//
// The drawing implementation now lives in the engine twin repo
// (PLAN_DRAWING_SSOT_MIGRATION_2026-09-27, Phase 5). This module keeps the
// published subpath working for existing consumers by re-exporting the whole
// former surface: the framework-free half from @vninvestcharts/engine-drawing and the React
// half from @vninvestcharts/engine-react.
//
// The React half used to live in src/lib/drawing and was part of this subpath.
// Dropping it would be a silent runtime break for JavaScript consumers - they
// get `undefined` rather than a compile error - so every name that now exists
// only in engine-react is re-exported explicitly below.
//
// They are listed individually rather than with a second `export *` on purpose:
// the two packages share roughly twenty type names (DrawingObject,
// DrawingToolType, Point, DrawingStyle, ...), and a blanket re-export turns each
// of those into an ambiguous star export that silently vanishes from the
// public surface. consumer-smoke.mjs asserts all 25 names are reachable.
export * from "@vninvestcharts/engine-drawing";

// --- React half, restored from the pre-migration public surface ------------
// Every name below was exported from src/lib/drawing/index.ts before the
// migration. Verified against that barrel at tag drawing-ssot-before-delete.
export {
	AlertNotificationToast, DrawingContextMenu, FloatingSelectionToolbar, filterDrawingsByScope, renderDrawingToSvg, useDrawingAlertEvaluator, useDrawingInteraction, useDrawingStorage, useDrawingWorkspaceController, useLongPress,
} from "@vninvestcharts/engine-react";

export type {
	AlertNotificationToastProps, DrawingAlertToastItem, DrawingDockTab, DrawingStorageErrorInfo, DrawingStorageOperation, DrawingWorkspaceController, DrawingWorkspaceState, DrawingWorkspaceTool, LongPressHandlers, UseDrawingAlertEvaluatorOptions, UseDrawingInteractionReturn, UseDrawingStorageOptions, UseDrawingStorageReturn, UseDrawingWorkspaceControllerOptions, UseLongPressOptions,
} from "@vninvestcharts/engine-react";
