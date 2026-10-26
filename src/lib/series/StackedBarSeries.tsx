
import React, { Component } from "react";
import PropTypes from "prop-types";

import { merge } from "d3-array";
import { stack as d3Stack } from "d3-shape";

import GenericChartComponent from "../GenericChartComponent";
import { getAxisCanvas } from "../GenericComponent";

import { identity, hexToRGBA, head, functor, plotDataLengthBarWidth } from "../utils";

class StackedBarSeries extends Component<any, any> {
	static defaultProps: any;

	constructor(props: any) {
		super(props);
		this.renderSVG = this.renderSVG.bind(this);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
	}
	drawOnCanvas(ctx: any, moreProps: any) {
		const { xAccessor } = moreProps;
		// var { xScale, chartConfig: { yScale }, plotData } = moreProps;

		drawOnCanvasHelper(ctx, this.props, moreProps, xAccessor, d3Stack);
	}
	renderSVG(moreProps: any) {
		const { xAccessor } = moreProps;

		return <g>{svgHelper(this.props, moreProps, xAccessor, d3Stack)}</g>;
	}
	render() {
		const { clip } = this.props;

		return <GenericChartComponent
			clip={clip}
			svgDraw={this.renderSVG}
			canvasDraw={this.drawOnCanvas}
			canvasToDraw={getAxisCanvas}
			drawOn={["pan"]}
		/>;
	}
}

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
StackedBarSeries.propTypes = {
	baseAt: PropTypes.oneOfType([
		PropTypes.number,
		PropTypes.func,
	]).isRequired,
	direction: PropTypes.oneOf(["up", "down"]).isRequired,
	stroke: PropTypes.bool.isRequired,
	width: PropTypes.oneOfType([
		PropTypes.number,
		PropTypes.func
	]).isRequired,
	opacity: PropTypes.number.isRequired,
	fill: PropTypes.oneOfType([
		PropTypes.func, PropTypes.string
	]).isRequired,
	className: PropTypes.oneOfType([
		PropTypes.func, PropTypes.string
	]).isRequired,
	clip: PropTypes.bool.isRequired,
};

StackedBarSeries.defaultProps = {
	baseAt: (xScale: any, yScale: any/* , d*/) => head(yScale.range()),
	direction: "up",
	className: "bar",
	stroke: true,
	fill: "#4682B4",
	opacity: 0.5,
	width: plotDataLengthBarWidth,
	widthRatio: 0.8,
	clip: true,
	swapScales: false,
};

export function identityStack() {
	let keys: any[] = [];
	function stack(data: any[]) {
		const response = keys.map((key, i) => {
			// eslint-disable-next-line prefer-const
			let arrays: any = data.map(d => {
				// eslint-disable-next-line prefer-const
				let array: any = [0, d[key]];
				array.data = d;
				return array;
			});
			arrays.key = key;
			arrays.index = i;
			return arrays;
		});
		return response;
	}
	stack.keys = function(x: any) {
		if (!arguments.length) {
			return keys;
		}
		keys = x;
		return stack;
	};
	return stack;
}


export function drawOnCanvasHelper(ctx: any, props: any, moreProps: any, xAccessor: any, stackFn: any, defaultPostAction: any = identity, postRotateAction: any = rotateXY) {
	const { xScale, chartConfig: { yScale }, plotData } = moreProps;

	const bars = doStuff(props, xAccessor, plotData, xScale, yScale, stackFn, postRotateAction, defaultPostAction);

	drawOnCanvas2(props, ctx, bars);
}

function convertToArray(item: any) {
	return Array.isArray(item) ? item : [item];
}

export function svgHelper(props: any, moreProps: any, xAccessor: any, stackFn: any, defaultPostAction: any = identity, postRotateAction: any = rotateXY) {
	const { xScale, chartConfig: { yScale }, plotData } = moreProps;
	const bars = doStuff(props, xAccessor, plotData, xScale, yScale, stackFn, postRotateAction, defaultPostAction);
	return getBarsSVG2(props, bars);
}

function doStuff(props: any, xAccessor: any, plotData: any[], xScale: any, yScale: any, stackFn: any, postRotateAction: any, defaultPostAction: any) {
	const { yAccessor, swapScales } = props;

	const modifiedYAccessor = swapScales ? convertToArray(props.xAccessor) : convertToArray(yAccessor);
	const modifiedXAccessor = swapScales ? yAccessor : xAccessor;

	const modifiedXScale = swapScales ? yScale : xScale;
	const modifiedYScale = swapScales ? xScale : yScale;

	const postProcessor =  swapScales ? postRotateAction : defaultPostAction;

	const bars = getBars(props, modifiedXAccessor, modifiedYAccessor, modifiedXScale, modifiedYScale, plotData, stackFn, postProcessor);

	return bars;
}

export const rotateXY = (array: any[]) => array.map(each => {
	return {
		...each,
		x: each.y,
		y: each.x,
		height: each.width,
		width: each.height
	};
});

export function getBarsSVG2(props: any, bars: any[]) {
	/* eslint-disable react/prop-types */
	const { opacity } = props;
	/* eslint-enable react/prop-types */

	return bars.map((d: any, idx: number) => {
		if (d.width <= 1) {
			return <line key={idx} className={d.className}
				stroke={d.fill}
				x1={d.x} y1={d.y}
				x2={d.x} y2={d.y + d.height} />;
		}
		return <rect key={idx} className={d.className}
			stroke={d.stroke}
			fill={d.fill}
			x={d.x}
			y={d.y}
			width={d.width}
			fillOpacity={opacity}
			height={d.height} />;
	});
}

export function drawOnCanvas2(props: any, ctx: any, bars: any[]) {
	const { stroke } = props;
	const groupedByFill = bars.reduce((acc: any, bar: any) => {
		if (!acc.has(bar.fill)) {
			acc.set(bar.fill, []);
		}
		acc.get(bar.fill).push(bar);
		return acc;
	}, new Map());

	groupedByFill.forEach((values: any[], key: any) => {
		if (head(values).width > 1) {
			ctx.strokeStyle = key;
		}
		const fillStyle = head(values).width <= 1
			? key
			: hexToRGBA(key, props.opacity);
		ctx.fillStyle = fillStyle;

		values.forEach((d: any) => {
			if (d.width <= 1) {
				ctx.fillRect(d.x - 0.5, d.y, 1, d.height);
			} else {
				ctx.fillRect(d.x, d.y, d.width, d.height);
				if (stroke) ctx.strokeRect(d.x, d.y, d.width, d.height);
			}

		});
	});
}

export function getBars(props: any, xAccessor: any, yAccessor: any[], xScale: any, yScale: any, plotData: any[], stack: any = identityStack, after: any = identity) {
	const { baseAt, className, fill, stroke, spaceBetweenBar = 0 } = props;

	const getClassName = functor(className);
	const getFill = functor(fill);
	const getBase = functor(baseAt);

	const widthFunctor = functor(props.width);
	const width = widthFunctor(props, {
		xScale,
		xAccessor,
		plotData
	});

	const barWidth = Math.round(width);

	const eachBarWidth = (barWidth - spaceBetweenBar * (yAccessor.length - 1)) / yAccessor.length;

	const offset = (barWidth === 1 ? 0 : 0.5 * width);

	const ds = plotData
		.map(each => {
			// eslint-disable-next-line prefer-const
			let d: any = {
				appearance: {
				},
				x: xAccessor(each),
			};
			yAccessor.forEach((eachYAccessor, i) => {
				const key = `y${i}`;
				d[key] = eachYAccessor(each);
				const appearance = {
					className: getClassName(each, i),
					stroke: stroke ? getFill(each, i) : "none",
					fill: getFill(each, i),
				};
				d.appearance[key] = appearance;
			});
			return d;
		});

	const keys = yAccessor.map((_, i) => `y${i}`);

	const stackFn: any = stack();
	const data = stackFn.keys(keys)(ds);

	const newData = data.map((each: any, i: number) => {
		const key = each.key;
		return each.map((d: any) => {
			// eslint-disable-next-line prefer-const
			let array: any = [d[0], d[1]];
			array.data = {
				x: d.data.x,
				i,
				appearance: d.data.appearance[key]
			};
			return array;
		});
	});

	const bars = merge(newData)
		.map((d: any) => {
			let y = yScale(d[1]);
			let h = getBase(xScale, yScale, d.data) - yScale(d[1] - d[0]);
			if (h < 0) {
				y = y + h;
				h = -h;
			}
			return {
				...d.data.appearance,
				x: Math.round(xScale(d.data.x) - width / 2),
				y: y,
				groupOffset: Math.round(offset - (d.data.i > 0 ? (eachBarWidth + spaceBetweenBar) * d.data.i : 0)),
				groupWidth: Math.round(eachBarWidth),
				offset: Math.round(offset),
				height: h,
				width: barWidth,
			};
		})
		.filter((bar: any) => !isNaN(bar.y));

	return after(bars);
}

export default StackedBarSeries;
