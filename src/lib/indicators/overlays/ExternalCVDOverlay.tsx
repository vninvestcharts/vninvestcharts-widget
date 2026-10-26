/**
 * ExternalCVDOverlay — Slice H-03
 * Renders real-tick CVD series from the VNInvest order-flow API as a cumulative
 * delta line inside a chart pane. Data comes pre-computed from the backend
 * (compute_cvd_series), so it reflects actual trade flow, not OHLCV approximation.
 *
 * Each CVDPoint carries a `bucket_ts` (ISO datetime) and `cumulative_cvd`.
 * The xScale inside OverlayDrawContext accepts Date, enabling direct time projection.
 */

import { useCallback } from "react";
import { OverlayCanvas, type OverlayDrawContext } from "../../core/canvas/OverlayCanvas";
import type { CVDPoint } from "../../types/vninvest";

export interface ExternalCVDOverlayProps {
	/** CVD buckets from VNInvest order-flow API. */
	series: readonly CVDPoint[];
}

function drawOverlay(ctx: CanvasRenderingContext2D, context: OverlayDrawContext, series: readonly CVDPoint[]): void {
	if (series.length === 0) return;

	const { xScale, width, height, devicePixelRatio: dpr } = context;

	// Build typed points, filtering out NaN projections
	const pts = series
		.map((pt) => ({
			x: xScale(new Date(pt.bucket_ts)),
			cvd: pt.cumulative_cvd,
		}))
		.filter((pt) => Number.isFinite(pt.x) && pt.x >= -width && pt.x <= width * 2);

	if (pts.length === 0) return;

	// Auto-scale y to the visible CVD range
	let minCvd = pts[0].cvd;
	let maxCvd = pts[0].cvd;
	for (const pt of pts) {
		if (pt.cvd < minCvd) minCvd = pt.cvd;
		if (pt.cvd > maxCvd) maxCvd = pt.cvd;
	}
	// Ensure zero is always within the range
	minCvd = Math.min(minCvd, 0);
	maxCvd = Math.max(maxCvd, 0);
	const span = maxCvd - minCvd || 1;
	const padded = span * 0.12;
	const lo = minCvd - padded;
	const hi = maxCvd + padded;
	const ySpan = hi - lo;

	const cvdY = (v: number): number => height * (1 - (v - lo) / ySpan);

	const zeroY = cvdY(0);

	// Zero baseline
	ctx.save();
	ctx.strokeStyle = "rgba(128,128,128,0.25)";
	ctx.lineWidth = 1 * dpr;
	ctx.setLineDash([4, 4]);
	ctx.beginPath();
	ctx.moveTo(0, zeroY);
	ctx.lineTo(width, zeroY);
	ctx.stroke();
	ctx.setLineDash([]);
	ctx.restore();

	// Gradient fill (area under curve)
	const lastPt = pts[pts.length - 1];
	const isPositive = (lastPt?.cvd ?? 0) >= 0;
	const fillColor = isPositive ? "rgba(76,175,80," : "rgba(244,67,54,";
	const lineColor = isPositive ? "rgb(76,175,80)" : "rgb(244,67,54)";

	ctx.save();

	// Area fill
	const grad = ctx.createLinearGradient(0, 0, 0, height);
	grad.addColorStop(0, fillColor + "0.3)");
	grad.addColorStop(1, fillColor + "0.03)");
	ctx.fillStyle = grad;

	ctx.beginPath();
	ctx.moveTo(pts[0].x, zeroY);
	for (const pt of pts) {
		ctx.lineTo(pt.x, cvdY(pt.cvd));
	}
	ctx.lineTo(lastPt.x, zeroY);
	ctx.closePath();
	ctx.fill();

	// Line
	ctx.strokeStyle = lineColor;
	ctx.lineWidth = 1.5 * dpr;
	ctx.lineJoin = "round";
	ctx.beginPath();
	for (let i = 0; i < pts.length; i++) {
		if (i === 0) ctx.moveTo(pts[i].x, cvdY(pts[i].cvd));
		else ctx.lineTo(pts[i].x, cvdY(pts[i].cvd));
	}
	ctx.stroke();

	ctx.restore();
}

export function ExternalCVDOverlay({ series }: ExternalCVDOverlayProps): React.ReactNode {
	const draw = useCallback(
		(context: OverlayDrawContext) => {
			drawOverlay(context.ctx, context, series);
		},
		[series],
	);
	return <OverlayCanvas draw={draw} zIndex={4} />;
}
