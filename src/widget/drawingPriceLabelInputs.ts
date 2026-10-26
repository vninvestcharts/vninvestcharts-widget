import type { EngineOverlayInputs } from "@vninvestcharts/engine-core";

import { resolvePointAnchor } from "@vninvestcharts/engine-drawing";
import { resolveDrawingPriceMarkers } from "@vninvestcharts/engine-drawing";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";

export function createSelectedPriceLabelsInput(
	drawing: DrawingObject | null,
	enabled: boolean,
	fallbackPaneId: string | null,
): EngineOverlayInputs["selectedPriceLabels"] {
	if (!enabled || !drawing) {
		return null;
	}

	if (drawing.visible === false) {
		return null;
	}

	const markers = resolveDrawingPriceMarkers(drawing);
	if (markers.length === 0) {
		return null;
	}

	const anchorPoint = drawing.points[0] ?? drawing.points[drawing.points.length - 1];
	const paneId = drawing.paneId ?? fallbackPaneId;
	if (!anchorPoint || !paneId) {
		return null;
	}
	const anchor = resolvePointAnchor(anchorPoint);

	const highlightFill = "#f59e0b";

	return {
		drawingId: drawing.id,
		paneId,
		scaleSlotId: drawing.yScaleId,
		anchorTime: anchor.timeMsHint ?? 0,
		markers: markers.map((marker) => ({
			key: marker.key,
			price: marker.price,
		})),
		fill: highlightFill,
		stroke: highlightFill,
		textColor: "#FFFFFF",
		highlighted: true,
		visible: true,
	};
}