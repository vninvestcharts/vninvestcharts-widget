import type { TimeIndexMap } from "@vninvestcharts/engine-core";
import type { DrawingObject, Point } from "@vninvestcharts/engine-drawing";

const UNIX_TIMESTAMP_MIN = 1e11;
const INDEX_EPSILON = 1e-6;
const VALUE_EPSILON = 1e-8;

function resolveAnchorTimestamp(point: Point): number | null {
	if (typeof point.timeMsHint === "number" && Number.isFinite(point.timeMsHint)) {
		return point.timeMsHint;
	}

	if (typeof point.x === "number" && Number.isFinite(point.x) && point.x >= UNIX_TIMESTAMP_MIN) {
		return point.x;
	}

	return null;
}

function reconcilePoint(point: Point, timeIndexMap: TimeIndexMap): { point: Point; changed: boolean } {
	const timestamp = resolveAnchorTimestamp(point);
	let nextPoint: Point = point;
	let changed = false;

	if (timestamp !== null && typeof point.y === "number" && Number.isFinite(point.y)) {
		if (typeof point.yPrice !== "number" || !Number.isFinite(point.yPrice) || Math.abs(point.yPrice - point.y) > VALUE_EPSILON) {
			nextPoint = {
				...nextPoint,
				yPrice: point.y,
			};
			changed = true;
		}
	}

	if (timestamp === null) {
		return { point: nextPoint, changed };
	}

	const resolvedIndex = timeIndexMap.resolveIndexByTime(timestamp);
	if (resolvedIndex === null || !Number.isFinite(resolvedIndex)) {
		return { point: nextPoint, changed };
	}

	if (typeof point.xIndexFloat === "number" && Number.isFinite(point.xIndexFloat) && Math.abs(point.xIndexFloat - resolvedIndex) <= INDEX_EPSILON) {
		return { point: nextPoint, changed };
	}

	return {
		point: {
			...nextPoint,
			xIndexFloat: resolvedIndex,
			...(typeof point.timeMsHint === "number" && Number.isFinite(point.timeMsHint)
				? { timeMsHint: point.timeMsHint }
				: { timeMsHint: timestamp }),
		},
		changed: true,
	};
}

export function reconcileForkDrawingIndexAnchors(
	drawings: readonly DrawingObject[],
	timeIndexMap: TimeIndexMap,
): { drawings: readonly DrawingObject[]; changed: boolean } {
	let changed = false;

	const nextDrawings = drawings.map((drawing) => {
		let drawingChanged = false;
		const nextPoints = drawing.points.map((point) => {
			const reconciled = reconcilePoint(point, timeIndexMap);
			if (reconciled.changed) {
				drawingChanged = true;
			}
			return reconciled.point;
		});

		if (!drawingChanged) {
			return drawing;
		}

		changed = true;
		return {
			...drawing,
			points: nextPoints,
		};
	});

	return {
		drawings: changed ? nextDrawings : drawings,
		changed,
	};
}
