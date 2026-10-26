import type { EngineOverlayMeasurementSelection, EngineOverlayMeasurementState, PaneRuntimeSnapshot } from "@vninvestcharts/engine-core";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import GenericChartComponent from "../lib/GenericChartComponent";
import { getMouseCanvas } from "../lib/GenericComponent";
import { measurementPointToPixelWithBridge, resolveMeasurementPointWithBridge, type MeasurementCoordinateBridge } from "@vninvestcharts/engine-drawing";
import { measurementPointToPixel, resolveMeasurementPoint, summarizeMeasurement, type MeasurementSelection } from "@vninvestcharts/engine-drawing";
import { useWidgetI18n } from "./context/WidgetI18nContext";

export interface MeasurementOverlayLabels {
	title: string;
	bars: string;
	price: string;
}

export interface MeasurementOverlayProps {
	enabled: boolean;
	isDark: boolean;
	priceFormat: (value: number) => string;
	labels: MeasurementOverlayLabels;
	renderMode?: "engine" | "bridge";
	engineMeasurementState?: EngineOverlayMeasurementState | null;
	coordinateBridge?: MeasurementCoordinateBridge | null;
	paneSnapshots?: readonly PaneRuntimeSnapshot[];
	width?: number;
	height?: number;
	pixelRatio?: number;
}

interface MeasurementOverlayState {
	draft: MeasurementSelection | null;
	committed: MeasurementSelection | null;
}

interface BridgeMeasurementPoint {
	paneId: string;
	scaleSlotId?: string;
	point: NonNullable<ReturnType<typeof resolveMeasurementPoint>>;
}

interface BridgeMeasurementSelection {
	paneId: string;
	scaleSlotId?: string;
	selection: MeasurementSelection;
}

interface BridgeMeasurementOverlayProps {
	enabled: boolean;
	isDark: boolean;
	priceFormat: (value: number) => string;
	labels: MeasurementOverlayLabels;
	coordinateBridge: MeasurementCoordinateBridge;
	paneSnapshots: readonly PaneRuntimeSnapshot[];
	width: number;
	height: number;
	pixelRatio?: number;
}

interface EngineMeasurementOverlayProps {
	enabled: boolean;
	isDark: boolean;
	priceFormat: (value: number) => string;
	labels: MeasurementOverlayLabels;
	measurementState: EngineOverlayMeasurementState | null;
	width: number;
	height: number;
	pixelRatio?: number;
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
		?? visibleScaleSlotIds[0];
}

function resolvePaneSnapshotAtPixel(
	snapshots: readonly PaneRuntimeSnapshot[],
	x: number,
	y: number,
) {
	return snapshots.find((snapshot) => {
		const right = snapshot.bounds.left + snapshot.bounds.width;
		const bottom = snapshot.bounds.top + snapshot.bounds.height;
		return x >= snapshot.bounds.left && x <= right && y >= snapshot.bounds.top && y <= bottom;
	});
}

function resolveBridgeMeasurementPoint(
	coordinateBridge: MeasurementCoordinateBridge,
	paneSnapshots: readonly PaneRuntimeSnapshot[],
	x: number,
	y: number,
	activePaneId?: string,
	activeScaleSlotId?: string,
): BridgeMeasurementPoint | undefined {
	const snapshot = activePaneId
		? paneSnapshots.find((candidate) => candidate.paneId === activePaneId)
		: resolvePaneSnapshotAtPixel(paneSnapshots, x, y);
	if (!snapshot) {
		return undefined;
	}

	const scaleSlotId = resolvePreferredScaleSlotId(snapshot, activeScaleSlotId);
	if (!scaleSlotId) {
		return undefined;
	}

	const point = resolveMeasurementPointWithBridge(coordinateBridge, {
		paneId: snapshot.paneId,
		scaleSlotId,
		x,
		y,
	});
	if (!point) {
		return undefined;
	}

	return {
		paneId: snapshot.paneId,
		scaleSlotId,
		point,
	};
}

function formatSignedPrice(value: number, formatValue: (nextValue: number) => string) {
	return `${value >= 0 ? "+" : ""}${formatValue(Math.abs(value))}`;
}

function drawRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
) {
	const right = x + width;
	const bottom = y + height;
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.lineTo(right - radius, y);
	ctx.quadraticCurveTo(right, y, right, y + radius);
	ctx.lineTo(right, bottom - radius);
	ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
	ctx.lineTo(x + radius, bottom);
	ctx.quadraticCurveTo(x, bottom, x, bottom - radius);
	ctx.lineTo(x, y + radius);
	ctx.quadraticCurveTo(x, y, x + radius, y);
	ctx.closePath();
}

function drawPoint(ctx: CanvasRenderingContext2D, x: number, y: number, accentColor: string) {
	ctx.save();
	ctx.fillStyle = accentColor;
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.arc(x, y, 4.5, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
	ctx.restore();
}

function drawMeasurementLabel(
	ctx: CanvasRenderingContext2D,
	start: { x: number; y: number },
	end: { x: number; y: number },
	selection: MeasurementSelection,
	labels: MeasurementOverlayLabels,
	priceFormat: (value: number) => string,
	isDark: boolean,
	chartWidth: number,
	chartHeight: number,
	accentColor: string,
) {
	const summary = summarizeMeasurement(selection);
	const lines = [
		labels.title,
		`${labels.bars}: ${summary.bars}`,
		`${labels.price}: ${formatSignedPrice(summary.priceDelta, priceFormat)}`,
	];
	const paddingX = 10;
	const paddingY = 8;
	const lineHeight = 16;

	ctx.save();
	ctx.font = "600 12px Inter, ui-sans-serif, system-ui, sans-serif";
	ctx.textBaseline = "top";

	const boxWidth = Math.max(...lines.map((line) => ctx.measureText(line).width)) + paddingX * 2;
	const boxHeight = lineHeight * lines.length + paddingY * 2;

	let boxX = end.x + 14;
	if (boxX + boxWidth > chartWidth - 4) {
		boxX = Math.max(4, start.x - 14 - boxWidth);
	}

	let boxY = end.y - boxHeight - 14;
	if (boxY < 4) {
		boxY = Math.min(chartHeight - boxHeight - 4, end.y + 14);
	}
	boxY = Math.max(4, Math.min(boxY, chartHeight - boxHeight - 4));

	ctx.fillStyle = isDark ? "rgba(15, 23, 42, 0.94)" : "rgba(255, 255, 255, 0.96)";
	ctx.strokeStyle = accentColor;
	ctx.lineWidth = 1.25;
	drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 8);
	ctx.fill();
	ctx.stroke();

	ctx.fillStyle = isDark ? "#f8fafc" : "#0f172a";
	lines.forEach((line, index) => {
		ctx.fillText(line, boxX + paddingX, boxY + paddingY + index * lineHeight);
	});
	ctx.restore();
}

function toSummarySelection(selection: EngineOverlayMeasurementSelection): MeasurementSelection {
	return {
		start: {
			index: selection.start.index,
			date: new Date(selection.start.index),
			price: selection.start.price,
		},
		end: {
			index: selection.end.index,
			date: new Date(selection.end.index),
			price: selection.end.price,
		},
	};
}

function EngineMeasurementOverlay({
	enabled,
	isDark,
	priceFormat,
	labels,
	measurementState,
	width,
	height,
	pixelRatio,
}: EngineMeasurementOverlayProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || width <= 0 || height <= 0) {
			return;
		}

		const devicePixelRatio = pixelRatio ?? 1;
		canvas.width = Math.max(1, Math.floor(width * devicePixelRatio));
		canvas.height = Math.max(1, Math.floor(height * devicePixelRatio));

		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) {
			return;
		}

		ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
		ctx.clearRect(0, 0, width, height);
		if (!enabled || !measurementState?.enabled) {
			return;
		}

		const accentColor = isDark ? "rgba(245, 158, 11, 0.95)" : "rgba(180, 83, 9, 0.95)";
		const selection = measurementState.draft ?? measurementState.committed;

		if (selection) {
			const startPixel = { x: selection.start.x, y: selection.start.y };
			const endPixel = { x: selection.end.x, y: selection.end.y };

			ctx.save();
			ctx.strokeStyle = accentColor;
			ctx.fillStyle = accentColor;
			ctx.lineWidth = 1.5;
			ctx.setLineDash([5, 4]);
			ctx.beginPath();
			ctx.moveTo(startPixel.x, startPixel.y);
			ctx.lineTo(endPixel.x, endPixel.y);
			ctx.stroke();
			ctx.setLineDash([]);
			drawPoint(ctx, startPixel.x, startPixel.y, accentColor);
			drawPoint(ctx, endPixel.x, endPixel.y, accentColor);
			drawMeasurementLabel(
				ctx,
				startPixel,
				endPixel,
				toSummarySelection(selection),
				labels,
				priceFormat,
				isDark,
				width,
				height,
				accentColor,
			);
			ctx.restore();
			return;
		}

		if (!measurementState.hoverPoint) {
			return;
		}

		drawPoint(ctx, measurementState.hoverPoint.x, measurementState.hoverPoint.y, accentColor);
	}, [enabled, height, isDark, labels, measurementState, priceFormat, width]);

	return (
		<canvas
			ref={canvasRef}
			aria-hidden="true"
			data-rsc-measurement-mode="engine"
			data-rsc-measurement-source="engine"
			style={{
				position: "absolute",
				inset: 0,
				width: "100%",
				height: "100%",
				zIndex: 10,
				pointerEvents: "none",
			}}
		/>
	);
}

function BridgeMeasurementOverlay({
	enabled,
	isDark,
	priceFormat,
	labels,
	coordinateBridge,
	paneSnapshots,
	width,
	height,
	pixelRatio,
}: BridgeMeasurementOverlayProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [hoverPoint, setHoverPoint] = useState<BridgeMeasurementPoint | null>(null);
	const [draft, setDraft] = useState<BridgeMeasurementSelection | null>(null);
	const [committed, setCommitted] = useState<BridgeMeasurementSelection | null>(null);

	useEffect(() => {
		if (!enabled && (hoverPoint || draft || committed)) {
			setHoverPoint(null);
			setDraft(null);
			setCommitted(null);
		}
	}, [committed, draft, enabled, hoverPoint]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || width <= 0 || height <= 0) {
			return;
		}

		const devicePixelRatio = pixelRatio ?? 1;
		canvas.width = Math.max(1, Math.floor(width * devicePixelRatio));
		canvas.height = Math.max(1, Math.floor(height * devicePixelRatio));

		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) {
			return;
		}

		ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
		ctx.clearRect(0, 0, width, height);
		if (!enabled) {
			return;
		}

		const accentColor = isDark ? "rgba(245, 158, 11, 0.95)" : "rgba(180, 83, 9, 0.95)";
		const selection = draft ?? committed;

		if (selection) {
			const startPixel = measurementPointToPixelWithBridge(coordinateBridge, {
				paneId: selection.paneId,
				scaleSlotId: selection.scaleSlotId,
				point: selection.selection.start,
			});
			const endPixel = measurementPointToPixelWithBridge(coordinateBridge, {
				paneId: selection.paneId,
				scaleSlotId: selection.scaleSlotId,
				point: selection.selection.end,
			});
			if (!startPixel || !endPixel) {
				return;
			}

			ctx.save();
			ctx.strokeStyle = accentColor;
			ctx.fillStyle = accentColor;
			ctx.lineWidth = 1.5;
			ctx.setLineDash([5, 4]);
			ctx.beginPath();
			ctx.moveTo(startPixel.x, startPixel.y);
			ctx.lineTo(endPixel.x, endPixel.y);
			ctx.stroke();
			ctx.setLineDash([]);
			drawPoint(ctx, startPixel.x, startPixel.y, accentColor);
			drawPoint(ctx, endPixel.x, endPixel.y, accentColor);
			drawMeasurementLabel(
				ctx,
				startPixel,
				endPixel,
				selection.selection,
				labels,
				priceFormat,
				isDark,
				width,
				height,
				accentColor,
			);
			ctx.restore();
			return;
		}

		if (!hoverPoint) {
			return;
		}

		const hoverPixel = measurementPointToPixelWithBridge(coordinateBridge, {
			paneId: hoverPoint.paneId,
			scaleSlotId: hoverPoint.scaleSlotId,
			point: hoverPoint.point,
		});
		if (!hoverPixel) {
			return;
		}

		drawPoint(ctx, hoverPixel.x, hoverPixel.y, accentColor);
	}, [committed, coordinateBridge, draft, enabled, height, hoverPoint, isDark, labels, priceFormat, width]);

	const resolveLocalPosition = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
	}, []);

	const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
		if (!enabled) {
			return;
		}

		const { x, y } = resolveLocalPosition(event);
		const nextPoint = resolveBridgeMeasurementPoint(coordinateBridge, paneSnapshots, x, y);
		if (!nextPoint) {
			return;
		}

		setHoverPoint(nextPoint);
		setCommitted(null);
		setDraft({
			paneId: nextPoint.paneId,
			scaleSlotId: nextPoint.scaleSlotId,
			selection: {
				start: nextPoint.point,
				end: nextPoint.point,
			},
		});
	}, [coordinateBridge, enabled, paneSnapshots, resolveLocalPosition]);

	const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
		if (!enabled) {
			return;
		}

		const { x, y } = resolveLocalPosition(event);
		if (draft) {
			const nextPoint = resolveBridgeMeasurementPoint(coordinateBridge, paneSnapshots, x, y, draft.paneId, draft.scaleSlotId);
			if (!nextPoint) {
				return;
			}

			setHoverPoint(nextPoint);
			setDraft({
				paneId: draft.paneId,
				scaleSlotId: draft.scaleSlotId,
				selection: {
					start: draft.selection.start,
					end: nextPoint.point,
				},
			});
			return;
		}

		setHoverPoint(resolveBridgeMeasurementPoint(coordinateBridge, paneSnapshots, x, y) ?? null);
	}, [coordinateBridge, draft, enabled, paneSnapshots, resolveLocalPosition]);

	const handleCommit = useCallback(() => {
		if (!enabled || !draft) {
			return;
		}

		setCommitted({
			paneId: draft.paneId,
			scaleSlotId: draft.scaleSlotId,
			selection: {
				start: draft.selection.start,
				end: draft.selection.end,
			},
		});
		setDraft(null);
	}, [draft, enabled]);

	const handlePointerLeave = useCallback(() => {
		if (!enabled) {
			return;
		}

		setHoverPoint(null);
		handleCommit();
	}, [enabled, handleCommit]);

	return (
		<canvas
			ref={canvasRef}
			aria-hidden="true"
			data-rsc-measurement-mode="bridge"
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onClick={handleCommit}
			onPointerLeave={handlePointerLeave}
			style={{
				position: "absolute",
				inset: 0,
				width: "100%",
				height: "100%",
				zIndex: 10,
				pointerEvents: enabled ? "auto" : "none",
				touchAction: enabled ? "none" : undefined,
				cursor: enabled ? "crosshair" : "default",
			}}
		/>
	);
}

class MeasurementOverlayImpl extends Component<MeasurementOverlayProps, MeasurementOverlayState> {
	state: Readonly<MeasurementOverlayState> = {
		draft: null,
		committed: null,
	};

	static getDerivedStateFromProps(nextProps: MeasurementOverlayProps, prevState: MeasurementOverlayState) {
		if (!nextProps.enabled && (prevState.draft || prevState.committed)) {
			return {
				draft: null,
				committed: null,
			};
		}
		return null;
	}

	getSelection() {
		return this.state.draft ?? this.state.committed;
	}

	handleMouseDown = (moreProps: any) => {
		if (!this.props.enabled) {
			return;
		}

		const point = resolveMeasurementPoint(moreProps);
		if (!point) {
			return;
		}

		this.setState({
			draft: {
				start: point,
				end: point,
			},
			committed: null,
		});
	};

	handleMouseMove = (moreProps: any) => {
		if (!this.props.enabled) {
			return;
		}

		this.setState((state) => {
			if (!state.draft) {
				return null;
			}

			const point = resolveMeasurementPoint(moreProps);
			if (!point) {
				return null;
			}

			return {
				draft: {
					start: state.draft.start,
					end: point,
				},
				committed: state.committed,
			};
		});
	};

	handleClick = () => {
		if (!this.props.enabled) {
			return;
		}

		this.setState((state) => {
			if (!state.draft) {
				return null;
			}

			return {
				draft: null,
				committed: {
					start: state.draft.start,
					end: state.draft.end,
				},
			};
		});
	};

	handleUnHover = () => {
		if (!this.props.enabled) {
			return;
		}

		this.setState((state) => {
			if (!state.draft) {
				return null;
			}

			return {
				draft: null,
				committed: {
					start: state.draft.start,
					end: state.draft.end,
				},
			};
		});
	};

	drawOnCanvas = (ctx: CanvasRenderingContext2D, moreProps: any) => {
		const chartConfig = Array.isArray(moreProps.chartConfig) ? moreProps.chartConfig[0] : moreProps.chartConfig;

		if (!chartConfig) {
			return;
		}

		if (!this.props.enabled) {
			ctx.clearRect(0, 0, chartConfig.width, chartConfig.height);
			return;
		}

		const accentColor = this.props.isDark ? "rgba(245, 158, 11, 0.95)" : "rgba(180, 83, 9, 0.95)";
		const selection = this.getSelection();
		const hoverPoint = selection ? undefined : resolveMeasurementPoint(moreProps);

		if (selection) {
			const startPixel = measurementPointToPixel(selection.start, moreProps);
			const endPixel = measurementPointToPixel(selection.end, moreProps);
			if (!startPixel || !endPixel) {
				return;
			}

			ctx.save();
			ctx.strokeStyle = accentColor;
			ctx.fillStyle = accentColor;
			ctx.lineWidth = 1.5;
			ctx.setLineDash([5, 4]);
			ctx.beginPath();
			ctx.moveTo(startPixel.x, startPixel.y);
			ctx.lineTo(endPixel.x, endPixel.y);
			ctx.stroke();
			ctx.setLineDash([]);
			drawPoint(ctx, startPixel.x, startPixel.y, accentColor);
			drawPoint(ctx, endPixel.x, endPixel.y, accentColor);
			drawMeasurementLabel(
				ctx,
				startPixel,
				endPixel,
				selection,
				this.props.labels,
				this.props.priceFormat,
				this.props.isDark,
				chartConfig.width,
				chartConfig.height,
				accentColor,
			);
			ctx.restore();
			return;
		}

		if (!hoverPoint) {
			return;
		}

		const hoverPixel = measurementPointToPixel(hoverPoint, moreProps);
		if (!hoverPixel) {
			return;
		}

		drawPoint(ctx, hoverPixel.x, hoverPixel.y, accentColor);
	};

	render() {
		const { enabled } = this.props;
		const drawOn = enabled ? ["mousemove", "click", "pan", "zoom", "drag", "dragend"] : [];

		return (
			<GenericChartComponent
				clip={false}
				selected={enabled}
				interactiveCursorClass="vninvestcharts-widget-magnet-cursor"
				disablePan={enabled}
				isHover={() => enabled}
				onMouseDown={this.handleMouseDown}
				onMouseMove={this.handleMouseMove}
				onClick={this.handleClick}
				onUnHover={this.handleUnHover}
				svgDraw={() => null}
				canvasDraw={this.drawOnCanvas}
				canvasToDraw={getMouseCanvas}
				drawOn={drawOn}
			/>
		);
	}
}

function MeasurementOverlayWithI18n(props: Omit<MeasurementOverlayProps, "labels">) {
	const { t } = useWidgetI18n();
	const labels = useMemo<MeasurementOverlayLabels>(() => ({
		title: t("measurement.title") ?? "",
		bars: t("measurement.bars") ?? "",
		price: t("measurement.price") ?? "",
	}), [t]);
	const { coordinateBridge, engineMeasurementState, paneSnapshots, renderMode, width, height, ...legacyProps } = props;

	if (paneSnapshots) {
		if (typeof width !== "number" || typeof height !== "number") {
			return null;
		}

		if (renderMode === "engine") {
			return (
				<EngineMeasurementOverlay
					{...legacyProps}
					labels={labels}
					measurementState={engineMeasurementState ?? null}
					width={width}
					height={height}
				/>
			);
		}

		if (!coordinateBridge) {
			return null;
		}

		return (
			<BridgeMeasurementOverlay
				{...legacyProps}
				labels={labels}
				coordinateBridge={coordinateBridge}
				paneSnapshots={paneSnapshots}
				width={width}
				height={height}
			/>
		);
	}

	return <MeasurementOverlayImpl {...legacyProps} labels={labels} />;
}

const MeasurementOverlay = MeasurementOverlayWithI18n;
export { MeasurementOverlay };
export default MeasurementOverlayWithI18n;