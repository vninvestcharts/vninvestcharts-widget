import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { useMemo, useRef } from "react";
import type { PaneConfig } from "../types/pane";
import { ChartSyncProvider, type ChartSyncState } from "./context/ChartSyncContext";
import { useDataContext } from "./context/DataContext";
import { useCanvasResize } from "./hooks/useCanvasResize";
import { computeScales } from "./scales/computeScales";

export interface ChartPaneProps extends HTMLAttributes<HTMLElement> {
	pane: PaneConfig;
	children?: ReactNode;
}

export function ChartPane({ pane, children, className, style, ...rest }: ChartPaneProps) {
	const { data } = useDataContext();
	const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const { ref: containerRef, size } = useCanvasResize<HTMLElement>();
	const resolvedHeight = Math.max(size.height, pane.heightPx ?? 240, pane.minHeightPx ?? 40);
	const resolvedWidth = Math.max(size.width, 1);
	const chartScales = useMemo(() => computeScales(pane, data, resolvedHeight), [data, pane, resolvedHeight]);

	const syncValue: ChartSyncState = {
		pane,
		data,
		visibleData: data,
		width: resolvedWidth,
		height: resolvedHeight,
		leftScale: chartScales.leftScale,
		rightScale: chartScales.rightScale,
	};

	const mergedStyle: CSSProperties = {
		position: "relative",
		display: "flex",
		flexDirection: "column",
		minHeight: pane.minHeightPx ?? 40,
		height: pane.heightPx ? pane.heightPx : pane.heightPercent ? `${Math.round(pane.heightPercent * 100)}%` : undefined,
		overflow: "hidden",
		background: "rgba(255, 255, 255, 0.02)",
		borderRadius: 8,
		border: "1px solid rgba(148, 163, 184, 0.18)",
		...style,
	};

	return (
		<section {...rest} ref={containerRef} className={className} style={mergedStyle} data-pane-id={pane.id}>
			<div style={{ position: "relative", flex: "1 1 auto", minHeight: 0 }}>
				<canvas
					ref={mainCanvasRef}
					width={resolvedWidth}
					height={resolvedHeight}
					aria-hidden="true"
					style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
				/>
				<canvas
					ref={overlayCanvasRef}
					width={resolvedWidth}
					height={resolvedHeight}
					aria-hidden="true"
					style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
				/>
				<ChartSyncProvider value={syncValue}>{children}</ChartSyncProvider>
			</div>
		</section>
	);
}

export type { ChartSyncState } from "./context/ChartSyncContext";