import { Component } from "react";
import PropTypes from "prop-types";
import { line as d3Line } from "d3-shape";
import GenericChartComponent, { getAxisCanvas, getMouseCanvas } from "../GenericChartComponent";
import { isDefined, getStrokeDasharray, hexToRGBA, strokeDashTypes } from "../utils";
import type { ChartAccessor, ChartDatum } from "../types";

interface LineSeriesProps {
	className?: string;
	strokeWidth?: number;
	strokeOpacity?: number;
	stroke?: string;
	hoverStrokeWidth?: number;
	fill?: string;
	defined: (datum: ChartDatum) => boolean;
	strokeDasharray?: string;
	highlightOnHover?: boolean;
	yAccessor: ChartAccessor;
	connectNulls?: boolean;
	interpolation?: any;
	canvasClip?: (ctx: CanvasRenderingContext2D, moreProps: any) => void;
	style?: React.CSSProperties;
}

class LineSeries extends Component<LineSeriesProps> {
	// NOTE: React 19 no longer runs propTypes validation at runtime.
	// PropTypes kept for documentation and IDE tooling only.
	static propTypes = {
		className: PropTypes.string,
		strokeWidth: PropTypes.number,
		strokeOpacity: PropTypes.number,
		stroke: PropTypes.string,
		hoverStrokeWidth: PropTypes.number,
		fill: PropTypes.string,
		defined: PropTypes.func,
		strokeDasharray: PropTypes.oneOf(strokeDashTypes),
		highlightOnHover: PropTypes.bool,
		yAccessor: PropTypes.func,
		connectNulls: PropTypes.bool,
		interpolation: PropTypes.func,
		canvasClip: PropTypes.func,
		style: PropTypes.object,
	};

	static defaultProps = {
		className: "line ",
		strokeWidth: 1,
		strokeOpacity: 1,
		hoverStrokeWidth: 4,
		fill: "none",
		stroke: "#4682B4",
		strokeDasharray: "Solid",
		defined: (d: any) => !isNaN(d),
		highlightOnHover: false,
		connectNulls: false,
	};

	constructor(props: LineSeriesProps) {
		super(props);
		this.renderSVG = this.renderSVG.bind(this);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
	}

	drawOnCanvas(ctx: CanvasRenderingContext2D, moreProps: any) {
		const { yAccessor, stroke, strokeOpacity = 1, strokeWidth = 1, hoverStrokeWidth = 4, defined, strokeDasharray = "Solid", interpolation, canvasClip, connectNulls = false } = this.props;
		const { xAccessor, xScale, chartConfig: { yScale }, plotData, hovering } = moreProps;

		if (canvasClip) {
			ctx.save();
			canvasClip(ctx, moreProps);
		}

		ctx.lineWidth = hovering ? hoverStrokeWidth : strokeWidth;
		ctx.strokeStyle = hexToRGBA(stroke, strokeOpacity);
		ctx.setLineDash(getStrokeDasharray(strokeDasharray).split(",").map((d: string) => +d));

		const dataSeries = d3Line()
			.x((d: any) => Math.round(xScale(xAccessor(d))))
			.y((d: any) => Math.round(yScale(yAccessor(d))));

		if (isDefined(interpolation)) dataSeries.curve(interpolation);
		if (!connectNulls) dataSeries.defined((d: any) => defined(yAccessor(d)));

		ctx.beginPath();
		dataSeries.context(ctx)(plotData);
		ctx.stroke();

		if (canvasClip) ctx.restore();
	}

	renderSVG(moreProps: any) {
		const { yAccessor, stroke, strokeOpacity = 1, strokeWidth = 1, hoverStrokeWidth = 4, defined, strokeDasharray = "Solid", connectNulls = false, interpolation, style, className, fill = "none" } = this.props;
		const { xAccessor, chartConfig: { yScale }, xScale, plotData, hovering } = moreProps;

		const dataSeries = d3Line()
			.x((d: any) => Math.round(xScale(xAccessor(d))))
			.y((d: any) => Math.round(yScale(yAccessor(d))));

		if (isDefined(interpolation)) dataSeries.curve(interpolation);
		if (!connectNulls) dataSeries.defined((d: any) => defined(yAccessor(d)));

		const d = dataSeries(plotData);

		return (
			<path
				style={style}
				className={`${className} ${stroke ? "" : " line-stroke"}`}
				d={d || undefined}
				stroke={stroke}
				strokeOpacity={strokeOpacity}
				strokeWidth={hovering ? hoverStrokeWidth : strokeWidth}
				strokeDasharray={getStrokeDasharray(strokeDasharray)}
				fill={fill}
			/>
		);
	}

	render() {
		const { highlightOnHover } = this.props;
		const hoverProps = highlightOnHover
			? { drawOn: ["mousemove", "pan"], canvasToDraw: getMouseCanvas }
			: { drawOn: ["pan"], canvasToDraw: getAxisCanvas };

		return (
			<GenericChartComponent
				svgDraw={this.renderSVG}
				canvasDraw={this.drawOnCanvas}
				{...hoverProps}
			/>
		);
	}
}

export default LineSeries;
