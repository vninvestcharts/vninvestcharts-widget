import { Component } from "react";
import PropTypes from "prop-types";
import GenericChartComponent, { getAxisCanvas } from "../GenericChartComponent";
import { hexToRGBA, functor, plotDataLengthBarWidth } from "../utils";
import type { ChartDatum } from "../types";

export interface HTFOverlaySeriesProps {
	className?: string;
	overlayStyle?: "hollow" | "step" | "area" | "candle";
	width?: number | ((props: HTFOverlaySeriesProps, moreProps: any) => number);
	opacity?: number;
	yAccessor?: (datum: ChartDatum) => any;
}

interface HTFGroup {
	periodStart: number;
	startIndex: number;
	endIndex: number;
	startX: number;
	endX: number;
	open: number;
	high: number;
	low: number;
	close: number;
	isClosed: boolean;
}

class HTFOverlaySeries extends Component<HTFOverlaySeriesProps> {
	static propTypes = {
		className: PropTypes.string,
		overlayStyle: PropTypes.oneOf(["hollow", "step", "area", "candle"]),
		width: PropTypes.oneOfType([PropTypes.number, PropTypes.func]),
		opacity: PropTypes.number,
		yAccessor: PropTypes.func,
	};

	static defaultProps = {
		className: "vninvestcharts-widget-htf-overlay",
		overlayStyle: "candle",
		width: plotDataLengthBarWidth,
		opacity: 0.15,
		yAccessor: (d: any) => d.htf,
	};

	constructor(props: HTFOverlaySeriesProps) {
		super(props);
		this.renderSVG = this.renderSVG.bind(this);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
	}

	drawOnCanvas(ctx: CanvasRenderingContext2D, moreProps: any) {
		const { overlayStyle = "candle", opacity = 0.15, width: widthProp, yAccessor = (d: any) => d.htf } = this.props;
		const { xScale, chartConfig: { yScale }, plotData, xAccessor } = moreProps;

		const groups = getHTFGroups(plotData, yAccessor, xScale, xAccessor);
		if (groups.length === 0) return;

		const barWidth = typeof widthProp === "function"
			? widthProp(this.props, { xScale, xAccessor, plotData })
			: (widthProp ?? 6);

		groups.forEach((g) => {
			const x1 = g.startX - barWidth / 2;
			const x2 = g.endX + barWidth / 2;
			const width = Math.max(1, x2 - x1);
			const centerX = (g.startX + g.endX) / 2;

			const isBullish = g.close >= g.open;
			const color = isBullish ? "#089981" : "#f23645";

			if (overlayStyle === "candle" || overlayStyle === "hollow") {
				// Draw wick
				ctx.strokeStyle = hexToRGBA(color, 0.4);
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(centerX, yScale(g.high));
				ctx.lineTo(centerX, yScale(g.low));
				ctx.stroke();

				// Draw body
				const yTop = yScale(Math.max(g.open, g.close));
				const yBottom = yScale(Math.min(g.open, g.close));
				const height = Math.max(1, yBottom - yTop);

				if (overlayStyle === "candle") {
					ctx.fillStyle = hexToRGBA(color, opacity);
					ctx.fillRect(x1, yTop, width, height);
					ctx.strokeStyle = color;
					ctx.lineWidth = 1;
					ctx.strokeRect(x1, yTop, width, height);
				} else {
					ctx.strokeStyle = color;
					ctx.lineWidth = 1.5;
					ctx.strokeRect(x1, yTop, width, height);
				}
			} else if (overlayStyle === "step") {
				// Draw horizontal step line at close
				ctx.strokeStyle = color;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(x1, yScale(g.close));
				ctx.lineTo(x2, yScale(g.close));
				ctx.stroke();
			} else if (overlayStyle === "area") {
				// Draw transparent band between high and low
				const yTop = yScale(g.high);
				const yBottom = yScale(g.low);
				const height = Math.max(1, yBottom - yTop);

				ctx.fillStyle = hexToRGBA(color, opacity * 0.5);
				ctx.fillRect(x1, yTop, width, height);

				ctx.strokeStyle = hexToRGBA(color, 0.2);
				ctx.lineWidth = 0.5;
				ctx.strokeRect(x1, yTop, width, height);
			}
		});
	}

	renderSVG(moreProps: any) {
		const { className, overlayStyle = "candle", opacity = 0.15, width: widthProp, yAccessor = (d: any) => d.htf } = this.props;
		const { xScale, chartConfig: { yScale }, plotData, xAccessor } = moreProps;

		const groups = getHTFGroups(plotData, yAccessor, xScale, xAccessor);
		if (groups.length === 0) return null;

		const barWidth = typeof widthProp === "function"
			? widthProp(this.props, { xScale, xAccessor, plotData })
			: (widthProp ?? 6);

		return (
			<g className={className}>
				{groups.map((g, idx) => {
					const x1 = g.startX - barWidth / 2;
					const x2 = g.endX + barWidth / 2;
					const width = Math.max(1, x2 - x1);
					const centerX = (g.startX + g.endX) / 2;

					const isBullish = g.close >= g.open;
					const color = isBullish ? "#089981" : "#f23645";

					if (overlayStyle === "candle" || overlayStyle === "hollow") {
						const yTop = yScale(Math.max(g.open, g.close));
						const yBottom = yScale(Math.min(g.open, g.close));
						const height = Math.max(1, yBottom - yTop);

						return (
							<g key={idx}>
								<line
									x1={centerX}
									y1={yScale(g.high)}
									x2={centerX}
									y2={yScale(g.low)}
									stroke={color}
									strokeOpacity={0.4}
									strokeWidth={1}
								/>
								<rect
									x={x1}
									y={yTop}
									width={width}
									height={height}
									fill={overlayStyle === "candle" ? color : "none"}
									fillOpacity={overlayStyle === "candle" ? opacity : 0}
									stroke={color}
									strokeWidth={overlayStyle === "candle" ? 1 : 1.5}
								/>
							</g>
						);
					} else if (overlayStyle === "step") {
						return (
							<line
								key={idx}
								x1={x1}
								y1={yScale(g.close)}
								x2={x2}
								y2={yScale(g.close)}
								stroke={color}
								strokeWidth={2}
							/>
						);
					} else if (overlayStyle === "area") {
						const yTop = yScale(g.high);
						const yBottom = yScale(g.low);
						const height = Math.max(1, yBottom - yTop);

						return (
							<rect
								key={idx}
								x={x1}
								y={yTop}
								width={width}
								height={height}
								fill={color}
								fillOpacity={opacity * 0.5}
								stroke={color}
								strokeOpacity={0.2}
								strokeWidth={0.5}
							/>
						);
					}
					return null;
				})}
			</g>
		);
	}

	render() {
		return (
			<GenericChartComponent
				clip={true}
				svgDraw={this.renderSVG}
				canvasDraw={this.drawOnCanvas}
				canvasToDraw={getAxisCanvas}
				drawOn={["pan"]}
			/>
		);
	}
}

function getHTFGroups(plotData: any[], yAccessor: any, xScale: any, xAccessor: any): HTFGroup[] {
	const groups: HTFGroup[] = [];
	let currentGroup: HTFGroup | null = null;

	plotData.forEach((datum, idx) => {
		const htf = yAccessor(datum);
		if (!htf) return;

		const x = xScale(xAccessor(datum));

		if (!currentGroup || currentGroup.periodStart !== htf.periodStart) {
			if (currentGroup) {
				groups.push(currentGroup);
			}
			currentGroup = {
				periodStart: htf.periodStart,
				startIndex: idx,
				endIndex: idx,
				startX: x,
				endX: x,
				open: htf.open,
				high: htf.high,
				low: htf.low,
				close: htf.close,
				isClosed: htf.isClosed,
			};
		} else {
			currentGroup.endIndex = idx;
			currentGroup.endX = x;
			currentGroup.high = htf.high;
			currentGroup.low = htf.low;
			currentGroup.close = htf.close;
			currentGroup.isClosed = htf.isClosed;
		}
	});

	if (currentGroup) {
		groups.push(currentGroup);
	}

	return groups;
}

export default HTFOverlaySeries;
