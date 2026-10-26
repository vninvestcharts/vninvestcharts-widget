import {
	createDateTimeIndexMap,
	createPaneProjector,
	type EngineOverlayDrawingPrimitiveInput,
	type PaneRuntimeSnapshot,
	type VisibleRange as EngineVisibleRange,
	type OverlayCanvasPoint,
} from "@vninvestcharts/engine-core";

import type { EnrichedDatum } from "../lib/core/calculators/types";
import type { ChartScales, PlotDatum } from "@vninvestcharts/engine-drawing";
import { getDrawingBoundingBox } from "@vninvestcharts/engine-drawing";
import { toOverlayPrimitive } from "@vninvestcharts/engine-drawing";
import { enrichDrawingWithIndex } from "@vninvestcharts/engine-drawing";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";

export interface CreateForkDrawingPrimitiveInputsInput {
	drawings: readonly DrawingObject[];
	selectedDrawing?: DrawingObject | null;
	selectedDrawingIds?: readonly string[];
	paneSnapshots: readonly PaneRuntimeSnapshot[];
	visibleRange: EngineVisibleRange | null;
	plotData: readonly EnrichedDatum[];
	isEditingText?: boolean;
}

function resolvePreferredScaleSlotId(snapshot: PaneRuntimeSnapshot, requestedScaleSlotId?: string) {
	if (requestedScaleSlotId && snapshot.scaleSlotStates[requestedScaleSlotId]?.visible) {
		return requestedScaleSlotId;
	}

	const visibleScaleSlotIds = Object.entries(snapshot.scaleSlotStates)
		.filter(([, state]) => state.visible)
		.map(([scaleSlotId]) => scaleSlotId);
	if (visibleScaleSlotIds.length === 0) {
		return requestedScaleSlotId && snapshot.scaleSlotStates[requestedScaleSlotId]
			? requestedScaleSlotId
			: undefined;
	}

	return visibleScaleSlotIds.find((scaleSlotId) => snapshot.scaleSlotStates[scaleSlotId]?.side === "right")
		?? (requestedScaleSlotId && snapshot.scaleSlotStates[requestedScaleSlotId] ? requestedScaleSlotId : undefined)
		?? visibleScaleSlotIds[0];
}

function resolveDrawingSnapshot(drawing: DrawingObject, paneSnapshots: readonly PaneRuntimeSnapshot[]) {
	if (drawing.paneId) {
		const targetedSnapshot = paneSnapshots.find((snapshot) => snapshot.paneId === drawing.paneId);
		if (targetedSnapshot) {
			return targetedSnapshot;
		}
	}

	return paneSnapshots[0];
}

export function resolveRenderableForkDrawings(drawings: readonly DrawingObject[], selectedDrawing?: DrawingObject | null) {
	const visibleDrawings = drawings.filter((drawing) => drawing.visible !== false);
	if (!selectedDrawing || selectedDrawing.visible === false || visibleDrawings.some((drawing) => drawing.id === selectedDrawing.id)) {
		return visibleDrawings;
	}

	return [...visibleDrawings, selectedDrawing];
}

function sortDrawingsForHitTest(drawings: readonly DrawingObject[]) {
	return [...drawings].sort((left, right) => {
		const leftZIndex = left.zIndex ?? 0;
		const rightZIndex = right.zIndex ?? 0;
		if (leftZIndex !== rightZIndex) {
			return leftZIndex - rightZIndex;
		}

		return left.id.localeCompare(right.id);
	});
}



export function createForkDrawingScales(
	snapshot: PaneRuntimeSnapshot,
	scaleSlotId: string,
	visibleRange: EngineVisibleRange,
	plotData: readonly EnrichedDatum[],
): ChartScales | null {
	if (plotData.length === 0) {
		return null;
	}

	const timeIndexMap = createDateTimeIndexMap(plotData);
	const projector = createPaneProjector(snapshot, visibleRange, scaleSlotId);
	const { plotBounds } = snapshot;
	const scaleSlotDomain = snapshot.scaleSlotStates[scaleSlotId]?.domain;
	const hasFiniteDomain = Array.isArray(scaleSlotDomain)
		&& scaleSlotDomain.length >= 2
		&& Number.isFinite(scaleSlotDomain[0])
		&& Number.isFinite(scaleSlotDomain[1])
		&& scaleSlotDomain[0] !== scaleSlotDomain[1];

	const mapDataIndexToAbsoluteX = (index: number) => {
		const targetIndex = index + 0.5;
		const projected = projector.indexToPixelX(targetIndex);
		if (projected !== null) {
			return projected;
		}

		const from = Math.min(visibleRange.from, visibleRange.to);
		const to = Math.max(visibleRange.from, visibleRange.to);
		const span = Math.max(1e-6, to - from);
		const ratio = (targetIndex - from) / span;
		return plotBounds.left + ratio * plotBounds.width;
	};

	const mapAbsoluteXToDataIndex = (absoluteX: number) => {
		const projected = projector.pixelXToIndex(absoluteX);
		if (projected !== null) {
			return projected - 0.5;
		}

		if (plotBounds.width <= 0) {
			return null;
		}

		const from = Math.min(visibleRange.from, visibleRange.to);
		const to = Math.max(visibleRange.from, visibleRange.to);
		const span = Math.max(1e-6, to - from);
		const ratio = (absoluteX - plotBounds.left) / plotBounds.width;
		const index = from + ratio * span;
		return index - 0.5;
	};

	const mapValueToAbsoluteY = (price: number) => {
		const projected = projector.valueToPixelY(price);
		if (projected !== null) {
			return projected;
		}

		if (hasFiniteDomain && plotBounds.height > 0) {
			const [domainStart, domainEnd] = scaleSlotDomain;
			const ratio = (price - domainStart) / (domainEnd - domainStart);
			return plotBounds.top + ((1 - ratio) * plotBounds.height);
		}

		return null;
	};

	const mapAbsoluteYToValue = (absoluteY: number) => {
		const projected = projector.pixelYToValue(absoluteY);
		if (projected !== null) {
			return projected;
		}

		if (hasFiniteDomain && plotBounds.height > 0) {
			const [domainStart, domainEnd] = scaleSlotDomain;
			const ratio = (plotBounds.top + plotBounds.height - absoluteY) / plotBounds.height;
			return domainStart + ratio * (domainEnd - domainStart);
		}

		return null;
	};

	return {
		xScale: (date: Date) => {
			const fractionalDataIndex = timeIndexMap.resolveIndexByTime(date.getTime());
			const x = fractionalDataIndex === null ? null : mapDataIndexToAbsoluteX(fractionalDataIndex);
			return x === null ? Number.NaN : x - plotBounds.left;
		},
		xScaleByIndex: (index: number) => {
			return mapDataIndexToAbsoluteX(index) - plotBounds.left;
		},
		xScaleInvert: (pixel: number) => {
			const absoluteX = plotBounds.left + pixel;
			const dataIndex = mapAbsoluteXToDataIndex(absoluteX);
			const timestamp = dataIndex === null ? null : timeIndexMap.resolveTimeByIndex(dataIndex);
			return timestamp === null ? new Date(0) : new Date(timestamp);
		},
		xScaleInvertToIndex: (pixel: number) => {
			const absoluteX = plotBounds.left + pixel;
			return mapAbsoluteXToDataIndex(absoluteX);
		},
		yScale: (price: number) => {
			const y = mapValueToAbsoluteY(price);
			return y === null ? Number.NaN : y - plotBounds.top;
		},
		yScaleInvert: (pixel: number) => {
			const absoluteY = plotBounds.top + pixel;
			const value = mapAbsoluteYToValue(absoluteY);
			return value === null ? Number.NaN : value;
		},
		plotData: plotData as unknown as PlotDatum[],
	};
}

export function createForkDrawingPrimitiveInputs({
	drawings,
	selectedDrawing,
	selectedDrawingIds,
	paneSnapshots,
	visibleRange,
	plotData,
	isEditingText,
}: CreateForkDrawingPrimitiveInputsInput): EngineOverlayDrawingPrimitiveInput[] {
	if (!visibleRange || plotData.length === 0 || paneSnapshots.length === 0) {
		return [];
	}

	const selectedDrawingId = selectedDrawing?.id;
	const selectedIdSet = new Set(selectedDrawingIds ?? (selectedDrawingId ? [selectedDrawingId] : []));
	return sortDrawingsForHitTest(resolveRenderableForkDrawings(drawings, selectedDrawing)).flatMap((drawing) => {
		if (isEditingText && selectedDrawing && drawing.id === selectedDrawing.id && ["text", "callout", "priceLabel"].includes(drawing.type)) {
			return [] as EngineOverlayDrawingPrimitiveInput[];
		}
		const snapshot = resolveDrawingSnapshot(drawing, paneSnapshots);
		if (!snapshot) {
			return [] as EngineOverlayDrawingPrimitiveInput[];
		}

		const scaleSlotId = resolvePreferredScaleSlotId(snapshot, drawing.yScaleId);
		if (!scaleSlotId) {
			return [] as EngineOverlayDrawingPrimitiveInput[];
		}

		const scales = createForkDrawingScales(snapshot, scaleSlotId, visibleRange, plotData);
		if (!scales) {
			return [] as EngineOverlayDrawingPrimitiveInput[];
		}

		// Enrich drawing points with xIndexFloat from timeMsHint for frame-perfect zoom sync
		const timeIndexMap = createDateTimeIndexMap(scales.plotData as any); // ARC-1-keep: legacy bridge
		const enrichedDrawing = enrichDrawingWithIndex(drawing, timeIndexMap);

		const primitive = toOverlayPrimitive(enrichedDrawing, scales, {
			chartWidth: snapshot.plotBounds.width,
			chartHeight: snapshot.plotBounds.height,
			plotData: scales.plotData,
		});
		if (!primitive) {
			return [] as EngineOverlayDrawingPrimitiveInput[];
		}

		const primitiveInput = {
			key: drawing.id,
			paneId: snapshot.paneId,
			scaleSlotId,
			primitive,
			selected: selectedIdSet.has(drawing.id),
			drawingId: drawing.id,
			clipToPane: true,
		} satisfies EngineOverlayDrawingPrimitiveInput;

		return [primitiveInput];
	});
}
