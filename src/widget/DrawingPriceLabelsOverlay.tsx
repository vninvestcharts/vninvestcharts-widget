import type { EngineOverlayDrawingPriceLabelsState, PaneRuntimeSnapshot } from "@vninvestcharts/engine-core";
import { useMemo } from "react";

import { measurementPointToPixelWithBridge, type MeasurementCoordinateBridge } from "@vninvestcharts/engine-drawing";
import { resolveDrawingStyle } from "@vninvestcharts/engine-drawing";
import { resolveDrawingPriceMarkers } from "@vninvestcharts/engine-drawing";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import type { ResolvedWidgetRuntime } from "./runtimePolicy";

export interface DrawingPriceLabelsOverlayProps {
	enabled: boolean;
	highlighted?: boolean;
	renderMode?: "engine" | "bridge";
	runtime?: ResolvedWidgetRuntime;
	priceFormat: (value: number) => string;
	enginePriceLabels?: EngineOverlayDrawingPriceLabelsState | null;
	drawing?: DrawingObject | null;
	coordinateBridge?: MeasurementCoordinateBridge;
	paneSnapshots?: readonly PaneRuntimeSnapshot[];
	height: number;
	width: number;
}

const LABEL_COLORS = [
	"#2962FF",
	"#F23645",
	"#089981",
	"#8B5CF6",
	"#F59E0B",
	"#06B6D4",
	"#EC4899",
	"#10B981",
	"#F97316",
	"#6366F1",
];

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function resolvePreferredScaleSlotId(snapshot: PaneRuntimeSnapshot, requestedScaleSlotId?: string) {
	if (requestedScaleSlotId && snapshot.scaleSlotStates[requestedScaleSlotId]?.visible) {
		return requestedScaleSlotId;
	}

	const visibleScaleSlotIds = Object.entries(snapshot.scaleSlotStates)
		.filter(([, state]) => state.visible)
		.map(([scaleSlotId]) => scaleSlotId);
	if (visibleScaleSlotIds.length === 0) {
		return undefined;
	}

	return visibleScaleSlotIds.find((scaleSlotId) => snapshot.scaleSlotStates[scaleSlotId]?.side === "right")
		?? (requestedScaleSlotId && snapshot.scaleSlotStates[requestedScaleSlotId] ? requestedScaleSlotId : undefined)
		?? visibleScaleSlotIds[0];
}

function resolveDrawingSnapshot(drawing: DrawingObject | null | undefined, paneSnapshots: readonly PaneRuntimeSnapshot[]) {
	if (!drawing) {
		return undefined;
	}

	if (drawing.paneId) {
		const targetedSnapshot = paneSnapshots.find((snapshot) => snapshot.paneId === drawing.paneId);
		if (targetedSnapshot) {
			return targetedSnapshot;
		}
	}

	return paneSnapshots[0];
}

function resolveAxisBounds(paneSnapshots: readonly PaneRuntimeSnapshot[] | undefined, paneId: string, side: "left" | "right") {
	if (!paneSnapshots) {
		return null;
	}
	const snapshot = paneSnapshots.find((s) => s.paneId === paneId);
	if (!snapshot) {
		return null;
	}
	return snapshot.axisBounds?.[side] ?? null;
}

function DrawingPriceLabelsOverlay({
	enabled,
	highlighted = false,
	renderMode,
	runtime = "fork",
	priceFormat,
	enginePriceLabels,
	drawing,
	coordinateBridge,
	paneSnapshots,
	height,
	width,
}: DrawingPriceLabelsOverlayProps) {
	if (renderMode === "engine") {
		if (!enabled || !enginePriceLabels || enginePriceLabels.labels.length === 0) {
			return null;
		}

		return (
			<div
				aria-hidden="true"
				data-rsc-drawing-price-labels={runtime}
				data-rsc-drawing-price-labels-source="engine"
				style={{
					position: "absolute",
					inset: 0,
					pointerEvents: "none",
					zIndex: 12,
				}}
			>
				{enginePriceLabels.labels.map((label, idx) => {
					const top = height > 0 ? clamp(label.y - 10, 0, Math.max(0, height - 22)) : label.y - 10;
					const accent = LABEL_COLORS[idx % LABEL_COLORS.length];
					const axisSide = label.side === "right" ? "right" : "left";
					const axisBounds = resolveAxisBounds(paneSnapshots, enginePriceLabels.paneId, axisSide);
					const labelLeft = axisBounds?.left ?? (axisSide === "right" ? Math.max(0, width - 48) : 0);
					const labelMaxWidth = axisBounds?.width ?? 48;

					return (
						<div
							key={label.key}
							data-rsc-drawing-price-label={label.key}
							style={{
								position: "absolute",
								top,
								left: labelLeft,
								transform: "translateY(-50%)",
								minWidth: 0,
								maxWidth: labelMaxWidth,
								padding: "1px 3px",
								boxSizing: "border-box",
								display: "flex",
								justifyContent: "flex-start",
								alignItems: "center",
								borderRadius: 3,
								border: `1px solid ${accent}`,
								background: accent,
								color: "#FFFFFF",
								fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
								fontSize: 9,
								fontWeight: 500,
								lineHeight: "12px",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{priceFormat(label.price)}
						</div>
					);
				})}
			</div>
		);
	}

	const markers = useMemo(() => resolveDrawingPriceMarkers(drawing), [drawing]);
	const effectiveDrawing = useMemo(() => drawing ? {
		...drawing,
		style: resolveDrawingStyle(drawing),
	} : null, [drawing]);

	if (!enabled || markers.length === 0 || !effectiveDrawing || !coordinateBridge || !paneSnapshots) {
		return null;
	}

	const snapshot = resolveDrawingSnapshot(drawing, paneSnapshots);
	if (!snapshot) {
		return null;
	}

	const anchorPoint = effectiveDrawing.points[0] ?? effectiveDrawing.points[effectiveDrawing.points.length - 1];
	if (!anchorPoint) {
		return null;
	}

	const scaleSlotId = resolvePreferredScaleSlotId(snapshot, effectiveDrawing.yScaleId);
	if (!scaleSlotId) {
		return null;
	}

	const axisSide = snapshot.scaleSlotStates[scaleSlotId]?.side === "left" ? "left" : "right";
	const axisBounds = snapshot.axisBounds?.[axisSide] ?? null;
	const labelLeft = axisBounds?.left ?? (axisSide === "right" ? Math.max(0, width - 48) : 0);
	const labelMaxWidth = axisBounds?.width ?? 48;

	return (
		<div
			aria-hidden="true"
			data-rsc-drawing-price-labels={runtime}
			style={{
				position: "absolute",
				inset: 0,
				pointerEvents: "none",
				zIndex: 12,
			}}
		>
			{markers.map((marker, idx) => {
				const pixel = measurementPointToPixelWithBridge(coordinateBridge, {
					paneId: snapshot.paneId,
					scaleSlotId,
					point: {
						index: 0,
						date: new Date(anchorPoint.x),
						price: marker.price,
					},
				});

				if (!pixel) {
					return null;
				}

				const top = height > 0 ? clamp(pixel.y - 10, 0, Math.max(0, height - 22)) : pixel.y - 10;
				const accent = LABEL_COLORS[idx % LABEL_COLORS.length];

				return (
					<div
						key={marker.key}
						data-rsc-drawing-price-label={marker.key}
						style={{
							position: "absolute",
							top,
							left: labelLeft,
							transform: "translateY(-50%)",
							minWidth: 0,
							maxWidth: labelMaxWidth,
							padding: "1px 3px",
							boxSizing: "border-box",
							display: "flex",
							justifyContent: "flex-start",
							alignItems: "center",
							borderRadius: 3,
							border: `1px solid ${accent}`,
							background: accent,
							color: "#FFFFFF",
							fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
							fontSize: 9,
							fontWeight: 500,
							lineHeight: "12px",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{priceFormat(marker.price)}
					</div>
				);
			})}
		</div>
	);
}

export default DrawingPriceLabelsOverlay;
export { DrawingPriceLabelsOverlay };
