import { Component } from "react";
import PropTypes from "prop-types";
import GenericChartComponent, { getAxisCanvas } from "../GenericChartComponent";
import { functor, isDefined, plotDataLengthBarWidth } from "../utils";
import type { BarData, ChartAccessor, ChartDatum } from "../types";

// W1.2/A2: export để `HistogramSeries` bọc lại mà không phải khai lại shape.
export interface BarSeriesProps {
	baseAt?: number | ((xScale: any, yScale: any, datum?: ChartDatum) => number);
	stroke?: boolean;
	width?: number | ((props: BarSeriesProps, moreProps: any) => number);
	widthRatio?: number;
	yAccessor: ChartAccessor;
	opacity?: number;
	fill?: string | ((datum: ChartDatum) => string);
	className?: string | ((datum: ChartDatum) => string);
	clip?: boolean;
}

class BarSeries extends Component<BarSeriesProps> {
	// NOTE: React 19 no longer runs propTypes validation at runtime.
	// PropTypes kept for documentation and IDE tooling only.
	static propTypes = {
		baseAt: PropTypes.oneOfType([PropTypes.number, PropTypes.func]),
		stroke: PropTypes.bool,
		width: PropTypes.oneOfType([PropTypes.number, PropTypes.func]),
		yAccessor: PropTypes.func.isRequired,
		opacity: PropTypes.number,
		fill: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
		className: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
		clip: PropTypes.bool,
	};

	static defaultProps = {
		baseAt: (xScale: any, yScale: any) => yScale(0),
		fill: "#4682B4",
		stroke: false,
		width: plotDataLengthBarWidth,
		opacity: 0.5,
		clip: true,
	};

	constructor(props: BarSeriesProps) {
		super(props);
		this.renderSVG = this.renderSVG.bind(this);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
	}

	drawOnCanvas(ctx: CanvasRenderingContext2D, moreProps: any) {
		const bars = getBars(this.props, moreProps);
		const { opacity = 0.5 } = this.props;

		bars.forEach((d: BarData) => {
			ctx.fillStyle = d.fill;
			ctx.globalAlpha = opacity;
			ctx.fillRect(d.x, d.y, d.width, d.height);
			if (d.stroke !== "none") {
				ctx.strokeStyle = d.stroke;
				ctx.strokeRect(d.x, d.y, d.width, d.height);
			}
		});
		ctx.globalAlpha = 1.0;
	}

	renderSVG(moreProps: any) {
		const bars = getBars(this.props, moreProps);
		const { opacity = 0.5 } = this.props;

		return (
			<g className="vninvestcharts-widget-bar-series">
				{bars.map((d: BarData, i: number) => (
					<rect
						key={i}
						x={d.x}
						y={d.y}
						width={d.width}
						height={d.height}
						fill={d.fill}
						fillOpacity={opacity}
						stroke={d.stroke}
					/>
				))}
			</g>
		);
	}

	render() {
		const { clip } = this.props;
		return (
			<GenericChartComponent
				clip={clip}
				svgDraw={this.renderSVG}
				canvasToDraw={getAxisCanvas}
				canvasDraw={this.drawOnCanvas}
				drawOn={["pan"]}
			/>
		);
	}
}

function getBars(props: BarSeriesProps, moreProps: any): BarData[] {
	const { baseAt, fill, stroke, yAccessor } = props;
	const { xScale, xAccessor, plotData, chartConfig: { yScale } } = moreProps;

	const getFill = functor(fill);
	const getBase = functor(baseAt);
	const widthFunctor = functor(props.width);

	const width = widthFunctor(props, { xScale, xAccessor, plotData });
	const offset = Math.floor(0.5 * width);

	return plotData
		.filter((d: ChartDatum) => isDefined(yAccessor(d)))
		.map((d: ChartDatum) => {
			const yValue = yAccessor(d);
			let y = yScale(yValue);
			const x = Math.round(xScale(xAccessor(d))) - offset;
			let h = getBase(xScale, yScale, d) - yScale(yValue);

			if (h < 0) {
				y = y + h;
				h = -h;
			}

			return {
				x,
				y: Math.round(y),
				height: Math.round(h),
				width: offset * 2,
				fill: getFill(d),
				stroke: stroke ? getFill(d) : "none",
			};
		});
}

export default BarSeries;
