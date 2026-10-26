
import React, { Component } from "react";
import PropTypes from "prop-types";
import { area as d3Area } from "d3-shape";

import GenericChartComponent from "../GenericChartComponent";
import { getAxisCanvas } from "../GenericComponent";

import { hexToRGBA, isDefined, first, functor } from "../utils";

class AreaOnlySeries extends Component<any, any> {
	static defaultProps: any;
	gradientId: string;

	constructor(props: any) {
		super(props);
		this.renderSVG = this.renderSVG.bind(this);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
		this.gradientId = `bb-fade-gradient-${Math.random().toString(36).substring(2, 9)}`;
	}
	drawOnCanvas(ctx: any, moreProps: any) {
		const { yAccessor, defined, base, canvasGradient } = this.props;
		const { fill, stroke, opacity, interpolation, canvasClip } = this.props;

		const { xScale, chartConfig: { yScale }, plotData, xAccessor } = moreProps;

		if (canvasClip) {
			ctx.save();
			canvasClip(ctx, moreProps);
		}

		if (canvasGradient != null) {
			ctx.fillStyle = canvasGradient(moreProps, ctx);
		} else {
			ctx.fillStyle = hexToRGBA(fill, opacity);
		}
		ctx.strokeStyle = stroke;

		ctx.beginPath();
		const newBase = functor(base);
		const areaSeries = d3Area()
			.defined((d: any) => defined(yAccessor(d)))
			.x((d: any) => Math.round(xScale(xAccessor(d))))
			.y0((d: any) => newBase(yScale, d, moreProps))
			.y1((d: any) => Math.round(yScale(yAccessor(d))))
			.context(ctx);

		if (isDefined(interpolation)) {
			areaSeries.curve(interpolation);
		}
		areaSeries(plotData);
		ctx.fill();

		if (canvasClip) {
			ctx.restore();
		}
	}
	renderSVG(moreProps: any) {
		const { yAccessor, defined, base, style, fillMode } = this.props;
		const { stroke, fill, className, opacity, interpolation } = this.props;

		const { xScale, chartConfig: { yScale }, plotData, xAccessor } = moreProps;

		const newBase = functor(base);
		const areaSeries = d3Area()
			.defined((d: any) => defined(yAccessor(d)))
			.x((d: any) => Math.round(xScale(xAccessor(d))))
			.y0((d: any) => newBase(yScale, d, moreProps))
			.y1((d: any) => Math.round(yScale(yAccessor(d))));

		if (isDefined(interpolation)) {
			areaSeries.curve(interpolation);
		}

		const d = areaSeries(plotData) ?? undefined;
		const newClassName = className.concat(isDefined(stroke) ? "" : " line-stroke");

		if (fillMode === "fade" && fill !== "none" && fill !== "transparent") {
			return (
				<g>
					<defs>
						<linearGradient id={this.gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
							<stop offset="0%" stopColor={fill} stopOpacity={0} />
							<stop offset="50%" stopColor={fill} stopOpacity={opacity} />
							<stop offset="100%" stopColor={fill} stopOpacity={0} />
						</linearGradient>
					</defs>
					<path
						style={style}
						d={d}
						stroke={stroke}
						fill={`url(#${this.gradientId})`}
						className={newClassName}
					/>
				</g>
			);
		}

		return (
			<path
				style={style}
				d={d}
				stroke={stroke}
				fill={hexToRGBA(fill, opacity)}
				className={newClassName}
			/>
		);
	}
	render() {
		return (
			<GenericChartComponent
				svgDraw={this.renderSVG}
				canvasDraw={this.drawOnCanvas}
				canvasToDraw={getAxisCanvas}
				drawOn={["pan"]}
			/>
		);
	}
}

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
AreaOnlySeries.propTypes = {
	className: PropTypes.string,
	yAccessor: PropTypes.func.isRequired,
	stroke: PropTypes.string,
	fill: PropTypes.string,
	opacity: PropTypes.number,
	defined: PropTypes.func,
	base: PropTypes.oneOfType([
		PropTypes.func, PropTypes.number
	]),
	interpolation: PropTypes.func,
	canvasClip: PropTypes.func,
	style: PropTypes.object,
	canvasGradient: PropTypes.func,
	fillMode: PropTypes.string,
};

AreaOnlySeries.defaultProps = {
	className: "line ",
	fill: "none",
	opacity: 1,
	defined: (d: any) => !isNaN(d),
	base: (yScale: any /* , d, moreProps */) => first(yScale.range()),
};

export default AreaOnlySeries;
