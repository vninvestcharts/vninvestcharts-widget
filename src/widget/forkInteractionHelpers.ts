import type { CSSProperties } from "react";

import { replacePoint } from "@vninvestcharts/engine-drawing";
import type { DrawingObject, DrawingToolType, Point } from "@vninvestcharts/engine-drawing";

export function isPrimaryPointerPressed(pointerContext: { buttons: number }) {
	return (pointerContext.buttons & 1) === 1;
}

/**
 * Portable cursor type. `CSSProperties["cursor"]` resolves to csstype's
 * `Cursor` interface, which a published .d.ts cannot name (TS2883), so the
 * drawing-hook return type would be unnameable. The values are plain CSS
 * cursor keywords; the `(string & {})` arm keeps editor autocomplete.
 */
export type ForkSurfaceCursor = CSSProperties["cursor"] | (string & {});

export const FORK_DRAWING_TOOL_CURSOR_MAP: Partial<Record<DrawingToolType, ForkSurfaceCursor>> = {
	hLine: "ns-resize",
	vLine: "ew-resize",
};

export function isForkMultiStepTool(toolName: DrawingToolType) {
	return (
		toolName === "channel"
		|| toolName === "parallelChannel"
		|| toolName === "pitchfork"
		|| toolName === "triangle"
		|| toolName === "abcdPattern"
		|| toolName === "elliottImpulse"
		|| toolName === "elliottCorrection"
		|| toolName === "elliottTriangle"
		|| toolName === "elliottDoubleCombo"
		|| toolName === "elliottTripleCombo"
		|| toolName === "xabcdPattern"
		|| toolName === "cypherPattern"
		|| toolName === "headAndShoulders"
		|| toolName === "trianglePattern"
		|| toolName === "threeDrivesPattern"
		|| toolName === "fibChannel"
		|| toolName === "trendBasedFibTime"
		|| toolName === "fibWedge"
		|| toolName === "pitchfan"
		|| toolName === "polyline"
		|| toolName === "path"
		|| toolName === "polygon"
	);
}

export function hasForkDraftProgress(drawing: DrawingObject) {
	const startPoint = drawing.points[0];
	if (!startPoint) {
		return false;
	}

	return drawing.points.some((point, index) => index > 0 && (point.x !== startPoint.x || point.y !== startPoint.y));
}

export function resolveForkMultiStepDraftOnClick(draft: DrawingObject, nextPoint: Point) {
	const startPoint = draft.points[0];
	const lastIndex = draft.points.length - 1;
	const nextInteriorIdx = startPoint
		? draft.points.findIndex((point, index) => index > 0 && index < lastIndex && point.x === startPoint.x && point.y === startPoint.y)
		: -1;

	if (nextInteriorIdx >= 0) {
		return {
			nextDraft: replacePoint(draft, nextInteriorIdx, nextPoint),
			shouldComplete: false,
		};
	}

	return {
		nextDraft: replacePoint(draft, lastIndex, nextPoint),
		shouldComplete: true,
	};
}

export function isForkSinglePointTool(toolName: DrawingToolType) {
	return toolName === "hLine"
		|| toolName === "vLine"
		|| toolName === "text"
		|| toolName === "priceLabel";
}
