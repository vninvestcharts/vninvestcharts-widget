import { useCallback } from "react";

import { OverlayCanvas, type OverlayDrawContext } from "../../core/canvas/OverlayCanvas";

export interface WhaleEvent {
	ts: Date;
	price: number;
	side: "BUY" | "SELL";
	matchedValue: number;
	severity?: "HIGH" | "EXTREME";
}

export interface WhaleBubbleOverlayProps {
	events: readonly WhaleEvent[];
	threshold?: number;
	baseRadius?: number;
	maxRadius?: number;
}

export function WhaleBubbleOverlay({
	events,
	threshold = 5_000_000_000,
	baseRadius = 12,
	maxRadius = 40,
}: WhaleBubbleOverlayProps) {
	const draw = useCallback(({ ctx, xScale, yScale, plotData }: OverlayDrawContext) => {
		if (events.length === 0 || plotData.length === 0) {
			return;
		}

		const barsByTimestamp = new Map<number, Record<string, unknown>>();
		for (const bar of plotData) {
			const dateValue = bar.date;
			if (dateValue instanceof Date) {
				barsByTimestamp.set(dateValue.getTime(), bar);
			} else if (typeof dateValue === "number") {
				barsByTimestamp.set(dateValue, bar);
			}
		}

		for (const event of events) {
			const bar = barsByTimestamp.get(event.ts.getTime());
			if (!bar) {
				continue;
			}

			const barDate = bar.date instanceof Date ? bar.date : new Date(bar.date as number);
			const x = xScale(barDate);
			const y = yScale(event.price);
			const rawRadius = Math.sqrt(Math.max(event.matchedValue, 0) / Math.max(threshold, 1)) * baseRadius;
			const radius = Math.min(Math.max(rawRadius, 2), maxRadius);
			const alpha = event.severity === "EXTREME" ? 0.85 : 0.65;
			const fillColor = event.side === "BUY"
				? `rgba(0, 200, 100, ${alpha})`
				: `rgba(220, 50, 50, ${alpha})`;
			const strokeColor = event.side === "BUY"
				? "rgba(0, 255, 120, 0.9)"
				: "rgba(255, 80, 80, 0.9)";

			ctx.beginPath();
			ctx.arc(x, y, radius, 0, Math.PI * 2);
			ctx.fillStyle = fillColor;
			ctx.fill();
			ctx.strokeStyle = strokeColor;
			ctx.lineWidth = event.severity === "EXTREME" ? 2 : 1;
			ctx.stroke();

			if (event.severity === "EXTREME" && radius > 20) {
				ctx.fillStyle = "#ffffff";
				ctx.font = `bold ${Math.max(10, Math.round(radius * 0.5))}px sans-serif`;
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText(event.side === "BUY" ? "▲" : "▼", x, y);
			}
		}
	}, [baseRadius, events, maxRadius, threshold]);

	return <OverlayCanvas draw={draw} zIndex={6} />;
}
