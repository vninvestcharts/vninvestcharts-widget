import { type AxisSide, type ScaleSlotRuntimeState } from "@vninvestcharts/engine-core";
import { type WidgetPaneRuntimeSnapshot, type WidgetRuntimeCapabilities } from "./widgetHelpers";

export function areBoundsEqual(left: { top: number; left: number; width: number; height: number }, right: { top: number; left: number; width: number; height: number }) {
	return left.top === right.top
		&& left.left === right.left
		&& left.width === right.width
		&& left.height === right.height;
}

export function areHeaderAnchorEqual(left: { top: number; left: number; width: number }, right: { top: number; left: number; width: number }) {
	return left.top === right.top && left.left === right.left && left.width === right.width;
}

export function areLabelAnchorEqual(left: { top: number; left: number; height: number }, right: { top: number; left: number; height: number }) {
	return left.top === right.top && left.left === right.left && left.height === right.height;
}

export function areAxisBoundsEqual(
	left: Partial<Record<AxisSide, { top: number; left: number; width: number; height: number }>>,
	right: Partial<Record<AxisSide, { top: number; left: number; width: number; height: number }>>,
) {
	const leftKeys = Object.keys(left) as AxisSide[];
	const rightKeys = Object.keys(right) as AxisSide[];
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	for (const axisSide of leftKeys) {
		const leftBounds = left[axisSide];
		const rightBounds = right[axisSide];
		if (!leftBounds || !rightBounds || !areBoundsEqual(leftBounds, rightBounds)) {
			return false;
		}
	}

	return true;
}

export function areBoundsMapEqual(
	left: Record<string, { top: number; left: number; width: number; height: number }>,
	right: Record<string, { top: number; left: number; width: number; height: number }>,
) {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	for (const key of leftKeys) {
		const leftBounds = left[key];
		const rightBounds = right[key];
		if (!rightBounds || !areBoundsEqual(leftBounds, rightBounds)) {
			return false;
		}
	}

	return true;
}

export function areDomainTupleEqual(left: readonly [number, number] | undefined, right: readonly [number, number] | undefined) {
	if (left === right) {
		return true;
	}

	if (!left || !right) {
		return false;
	}

	return left[0] === right[0] && left[1] === right[1];
}

export function areScaleSlotStatesEqual(
	left: Record<string, ScaleSlotRuntimeState>,
	right: Record<string, ScaleSlotRuntimeState>,
) {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	for (const key of leftKeys) {
		const leftState = left[key];
		const rightState = right[key];
		if (!rightState) {
			return false;
		}

		if (
			leftState.side !== rightState.side
			|| leftState.mode !== rightState.mode
			|| leftState.visible !== rightState.visible
			|| !areDomainTupleEqual(leftState.domain, rightState.domain)
		) {
			return false;
		}
	}

	return true;
}

export function arePaneSnapshotsEqual(
	left: readonly WidgetPaneRuntimeSnapshot[],
	right: readonly WidgetPaneRuntimeSnapshot[],
) {
	if (left === right) {
		return true;
	}

	if (left.length !== right.length) {
		return false;
	}

	for (let index = 0; index < left.length; index += 1) {
		const leftSnapshot = left[index];
		const rightSnapshot = right[index];
		if (
			leftSnapshot.paneId !== rightSnapshot.paneId
			|| !areBoundsEqual(leftSnapshot.bounds, rightSnapshot.bounds)
			|| !areBoundsEqual(leftSnapshot.plotBounds, rightSnapshot.plotBounds)
			|| !areAxisBoundsEqual(leftSnapshot.axisBounds, rightSnapshot.axisBounds)
			|| !areBoundsMapEqual(leftSnapshot.scaleSlotBounds, rightSnapshot.scaleSlotBounds)
			|| !areScaleSlotStatesEqual(leftSnapshot.scaleSlotStates, rightSnapshot.scaleSlotStates)
			|| !areHeaderAnchorEqual(leftSnapshot.headerAnchor, rightSnapshot.headerAnchor)
			|| !areLabelAnchorEqual(leftSnapshot.labelAnchor, rightSnapshot.labelAnchor)
		) {
			return false;
		}
	}

	return true;
}

export function areRuntimeCapabilitiesEqual(
	left: WidgetRuntimeCapabilities | null | undefined,
	right: WidgetRuntimeCapabilities | null | undefined,
) {
	if (left === right) {
		return true;
	}

	if (!left || !right) {
		return false;
	}

	return left.engineRuntime === right.engineRuntime
		&& left.paneToolbar === right.paneToolbar
		&& left.paneSplitters === right.paneSplitters
		&& left.chartCanvasOverlays === right.chartCanvasOverlays
		&& left.measurementOverlay === right.measurementOverlay
		&& left.drawingOverlays === right.drawingOverlays;
}
