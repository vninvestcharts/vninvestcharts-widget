
import React, { Component } from "react";
import PropTypes from "prop-types";
import GenericChartComponent from "../GenericChartComponent";
import { getAxisCanvas } from "../GenericComponent";

import { isDefined, functor } from "../utils";

class OHLCSeries extends Component<any, any> {
	static defaultProps: any;

	constructor(props: any) {
		super(props);
		this.renderSVG = this.renderSVG.bind(this);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
	}
	drawOnCanvas(ctx: any, moreProps: any) {
		const { yAccessor } = this.props;
		const { xAccessor } = moreProps;
		const { xScale, chartConfig: { yScale }, plotData } = moreProps;

		const barData = getOHLCBars(this.props, xAccessor, yAccessor, xScale, yScale, plotData);
		drawOnCanvas(ctx, barData);
	}
	render() {
		const { clip } = this.props;

		return <GenericChartComponent
			svgDraw={this.renderSVG}
			canvasToDraw={getAxisCanvas}
			canvasDraw={this.drawOnCanvas}
			clip={clip}
			drawOn={["pan"]}
		/>;
	}
	renderSVG(moreProps: any) {
		const { className, yAccessor } = this.props;
		const { xAccessor } = moreProps;
		const { xScale, chartConfig: { yScale }, plotData } = moreProps;


		const barData = getOHLCBars(this.props, xAccessor, yAccessor, xScale, yScale, plotData);

		const { strokeWidth, bars } = barData;

		return <g className={className}>
			{bars.map((d: any, idx: number) => <path key={idx}
				className={d.className} stroke={d.stroke} strokeWidth={strokeWidth}
				d={`M${d.openX1} ${d.openY} L${d.openX2} ${d.openY} M${d.x} ${d.y1} L${d.x} ${d.y2} M${d.closeX1} ${d.closeY} L${d.closeX2} ${d.closeY}`}/>)}
		</g>;
	}
}

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
OHLCSeries.propTypes = {
	className: PropTypes.string,
	classNames: PropTypes.oneOfType([
		PropTypes.func,
		PropTypes.string
	]).isRequired,
	stroke: PropTypes.oneOfType([
		PropTypes.func,
		PropTypes.string
	]).isRequired,
	yAccessor: PropTypes.func.isRequired,
	clip: PropTypes.bool.isRequired,
};

OHLCSeries.defaultProps = {
	className: "vninvestcharts-widget-ohlc",
	yAccessor: (d: any) => ({ open: d.open, high: d.high, low: d.low, close: d.close }),
	classNames: (d: any) => isDefined(d.absoluteChange) ? (d.absoluteChange > 0 ? "up" : "down") : "firstbar",
	stroke: (d: any) => isDefined(d.absoluteChange) ? (d.absoluteChange > 0 ? "#6BA583" : "#FF0000") : "#000000",
	clip: true,
};

function drawOnCanvas(ctx: any, barData: any) {

	const { strokeWidth, bars } = barData;
	const wickNest = Array.from(
		bars.reduce((acc: any, bar: any) => {
			if (!acc.has(bar.stroke)) {
				acc.set(bar.stroke, []);
			}
			acc.get(bar.stroke).push(bar);
			return acc;
		}, new Map()).entries()
	).map((entry: any) => ({ key: entry[0], values: entry[1] }));

	ctx.lineWidth = strokeWidth;

	wickNest.forEach((outer: any) => {
		const { key, values } = outer;
		ctx.strokeStyle = key;
		(values as any[]).forEach((d: any) => {
			ctx.beginPath();
			ctx.moveTo(d.x, d.y1);
			ctx.lineTo(d.x, d.y2);

			ctx.moveTo(d.openX1, d.openY);
			ctx.lineTo(d.openX2, d.openY);

			ctx.moveTo(d.closeX1, d.closeY);
			ctx.lineTo(d.closeX2, d.closeY);

			ctx.stroke();
		});
	});
}

function getOHLCBars(props: any, xAccessor: any, yAccessor: any, xScale: any, yScale: any, plotData: any[]) {
	const { classNames: classNamesProp, stroke: strokeProp } = props;

	const strokeFunc = functor(strokeProp);
	const classNameFunc = functor(classNamesProp);

	const width = xScale(xAccessor(plotData[plotData.length - 1]))
		- xScale(xAccessor(plotData[0]));

	const barWidth = width / (plotData.length - 1);
	const strokeWidth = Math.max(1, Math.round(barWidth / 4));

	const bars = plotData
		.filter((d: any) => isDefined(yAccessor(d).close))
		.map((d: any) => {
			const ohlc = yAccessor(d);
			const x = Math.round(xScale(xAccessor(d)));
			const y1 = yScale(ohlc.high),
				y2 = yScale(ohlc.low),
				openX1 = x - barWidth,
				openX2 = x + strokeWidth / 2,
				openY = yScale(ohlc.open),
				closeX1 = x - strokeWidth / 2,
				closeX2 = x + barWidth,
				closeY = yScale(ohlc.close),
				className = classNameFunc(d),
				stroke = strokeFunc(d);

			return { x, y1, y2, openX1, openX2, openY, closeX1, closeX2, closeY, stroke, className };
		});
	return { barWidth, strokeWidth, bars };
}

export default OHLCSeries;
