import { useEffect, useRef } from "react";

import { useChartRenderContext } from "./ChartRenderContext";
import type { ChartRenderContextValue } from "./ChartRenderContext";

export interface OverlayDrawContext {
	ctx: CanvasRenderingContext2D;
	xScale: ChartRenderContextValue["xScale"];
	xScaleByIndex: ChartRenderContextValue["xScaleByIndex"];
	yScale: ChartRenderContextValue["yScale"];
	plotData: ChartRenderContextValue["plotData"];
	candleWidth: ChartRenderContextValue["candleWidth"];
	devicePixelRatio: ChartRenderContextValue["devicePixelRatio"];
	visibleRange: ChartRenderContextValue["visibleRange"];
	width: ChartRenderContextValue["width"];
	height: ChartRenderContextValue["height"];
}

export interface OverlayCanvasProps {
	draw: (context: OverlayDrawContext) => void;
	zIndex?: number;
	className?: string;
}

export function OverlayCanvas({ draw, zIndex = 5, className }: OverlayCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const renderContext = useChartRenderContext();

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		if (typeof canvas.getContext !== "function") {
			return;
		}

		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) {
			return;
		}

		const physicalWidth = Math.max(1, Math.round(renderContext.width * renderContext.devicePixelRatio));
		const physicalHeight = Math.max(1, Math.round(renderContext.height * renderContext.devicePixelRatio));
		if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
			canvas.width = physicalWidth;
			canvas.height = physicalHeight;
		}

		context.setTransform(renderContext.devicePixelRatio, 0, 0, renderContext.devicePixelRatio, 0, 0);
		context.clearRect(0, 0, renderContext.width, renderContext.height);

		try {
			draw({
				ctx: context,
				xScale: renderContext.xScale,
				xScaleByIndex: renderContext.xScaleByIndex,
				yScale: renderContext.yScale,
				plotData: renderContext.plotData,
				candleWidth: renderContext.candleWidth,
				devicePixelRatio: renderContext.devicePixelRatio,
				visibleRange: renderContext.visibleRange,
				width: renderContext.width,
				height: renderContext.height,
			});
		} catch (error) {
			console.error("OverlayCanvas draw failed:", error);
		}
	}, [draw, renderContext]);

	return (
		<canvas
			ref={canvasRef}
			className={className}
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				zIndex,
				pointerEvents: "none",
				width: renderContext.width,
				height: renderContext.height,
			}}
		/>
	);
}
