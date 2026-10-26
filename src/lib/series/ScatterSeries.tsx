
import React, { Component } from "react";
import PropTypes from "prop-types";

import GenericChartComponent from "../GenericChartComponent";
import { getAxisCanvas } from "../GenericComponent";

import { hexToRGBA, functor } from "../utils";

class ScatterSeries extends Component<any, any> {
	static defaultProps: any;

	constructor(props: any) {
		super(props);
		this.renderSVG = this.renderSVG.bind(this);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
	}
	drawOnCanvas(ctx: any, moreProps: any) {
		const { xAccessor } = moreProps;

		const points = helper(this.props, moreProps, xAccessor);

		drawOnCanvas(ctx, this.props, points);
	}
	renderSVG(moreProps: any) {
		const { className, markerProps } = this.props;
		const { xAccessor } = moreProps;

		const points = helper(this.props, moreProps, xAccessor);

		return <g className={className}>
			{points.map((point: any, idx: number) => {
				const { marker: Marker } = point;
				return <Marker key={idx} {...markerProps} point={point} />;
			})}
		</g>;
	}
	render() {
		return <GenericChartComponent
			svgDraw={this.renderSVG}
			canvasDraw={this.drawOnCanvas}
			canvasToDraw={getAxisCanvas}
			drawOn={["pan"]}
		/>;
	}
}

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
ScatterSeries.propTypes = {
	className: PropTypes.string,
	yAccessor: PropTypes.func.isRequired,
	marker: PropTypes.func,
	markerProvider: PropTypes.func,
	markerProps: PropTypes.object,
};

ScatterSeries.defaultProps = {
	className: "vninvestcharts-widget-scatter",
};

function helper(props: any, moreProps: any, xAccessor: any) {
	const { yAccessor, markerProvider, markerProps } = props;
	let { marker: Marker } = props;
	const { xScale, chartConfig: { yScale }, plotData } = moreProps;

	if (!(markerProvider || Marker)) throw new Error("required prop, either marker or markerProvider missing");

	return plotData.map((d: any) => {

		if (markerProvider) Marker = markerProvider(d);

		const mProps = { ...Marker.defaultProps, ...markerProps };

		const fill = functor(mProps.fill);
		const stroke = functor(mProps.stroke);

		return {
			x: xScale(xAccessor(d)),
			y: yScale(yAccessor(d)),
			fill: hexToRGBA(fill(d), mProps.opacity),
			stroke: stroke(d),
			datum: d,
			marker: Marker,
		};
	});
}

function drawOnCanvas(ctx: any, props: any, points: any[]) {
	const { markerProps } = props;

	const groupedByFill = points.reduce((acc: any, point: any) => {
		if (!acc.has(point.fill)) {
			acc.set(point.fill, []);
		}
		acc.get(point.fill).push(point);
		return acc;
	}, new Map());

	groupedByFill.forEach((fillValues: any[], fillKey: string) => {

		if (fillKey !== "none") {
			ctx.fillStyle = fillKey;
		}

		fillValues.forEach((point: any) => {
			const { marker } = point;
			marker.drawOnCanvas({ ...marker.defaultProps, ...markerProps, fill: fillKey }, point, ctx);
		});
	});
}

export default ScatterSeries;
