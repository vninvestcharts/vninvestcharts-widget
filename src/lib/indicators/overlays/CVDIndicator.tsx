/**
 * CVD (Cumulative Volume Delta) Indicator
 * Displays cumulative volume delta as a bar chart in a separate pane
 */

import { useCallback, type ReactNode } from "react";
import { OverlayCanvas, type OverlayDrawContext } from "../../core/canvas/OverlayCanvas";
import type { VisibleRange } from "../../core/types/chart";
import type { EnrichedDatum } from "../../core/calculators/types";

export interface CVDIndicatorProps {
	/** Enriched data with cvdApprox field */
	data: readonly EnrichedDatum[];
	/** Current visible range */
	visibleRange: VisibleRange | null;
	/** CVD display mode */
	mode?: "oscillator" | "histogram";
}

/**
 * Render CVD as bar oscillator
 *
 * @example
 * <CVDIndicator
 *   data={plotData}
 *   visibleRange={visibleRange}
 *   mode="oscillator"
 * />
 */
export function CVDIndicator({
	data,
	visibleRange,
	mode = "oscillator",
}: CVDIndicatorProps): ReactNode {
	const drawCVD = useCallback(
		(context: OverlayDrawContext) => {
			const { ctx, xScale, xScaleByIndex, yScale, plotData, candleWidth, devicePixelRatio } = context;

			// No-op if no visible range or no data
			if (!visibleRange || plotData.length === 0) {
				return;
			}

			// Filter to visible bars
			const visibleData = plotData.filter(
				(_, idx) => idx >= visibleRange.startIndex && idx <= visibleRange.endIndex
			);

			// Find min/max CVD for scaling
			let minCVD = 0;
			let maxCVD = 0;
			visibleData.forEach((bar) => {
				const cvdApprox = ((bar as any)["cvdApprox"] as number) ?? 0;
				minCVD = Math.min(minCVD, cvdApprox);
				maxCVD = Math.max(maxCVD, cvdApprox);
			});

			// Add padding to range
			const rangeCV = maxCVD - minCVD || 1;
			const paddedMin = minCVD - rangeCV * 0.1;
			const paddedMax = maxCVD + rangeCV * 0.1;

			// Helper to map CVD value to pixel Y
			const cvdYScale = (value: number): number => {
				if (paddedMax === paddedMin) {
					return context.height / 2;
				}
				const normalized = (value - paddedMin) / (paddedMax - paddedMin);
				return context.height * (1 - normalized); // Flip: top is max
			};

			// Draw zero line
			const zeroY = cvdYScale(0);
			ctx.strokeStyle = "rgba(128, 128, 128, 0.3)";
			ctx.lineWidth = 1 * devicePixelRatio;
			ctx.beginPath();
			ctx.moveTo(0, zeroY);
			ctx.lineTo(context.width, zeroY);
			ctx.stroke();

			// Draw CVD bars
			visibleData.forEach((bar, vizIdx) => {
				const barIndex = visibleRange.startIndex + vizIdx;
				const cvdApprox = ((bar as any)["cvdApprox"] as number) ?? 0;

				// Calculate bar position
				const barDate = plotData[barIndex]?.date;
				if (!(barDate instanceof Date)) {
					return;
				}
				const barX = xScaleByIndex ? xScaleByIndex(barIndex) : xScale(barDate);
				const barWidth = Math.max(1, candleWidth * 0.6);
				const barHeight = Math.abs(cvdYScale(cvdApprox) - zeroY);
				const barStartY = cvdApprox >= 0 ? zeroY : cvdYScale(cvdApprox);

				// Color based on positive/negative
				const isPositive = cvdApprox >= 0;
				ctx.fillStyle = isPositive ? "rgba(76, 175, 80, 0.6)" : "rgba(244, 67, 54, 0.6)";

				// Draw bar
				ctx.fillRect(barX - barWidth / 2, barStartY, barWidth, barHeight);

				// Optional outline
				ctx.strokeStyle = isPositive ? "rgb(76, 175, 80)" : "rgb(244, 67, 54)";
				ctx.lineWidth = 1 * devicePixelRatio;
				ctx.strokeRect(barX - barWidth / 2, barStartY, barWidth, barHeight);
			});
		},
		[visibleRange, mode],
	);

	return <OverlayCanvas draw={drawCVD} />;
}
