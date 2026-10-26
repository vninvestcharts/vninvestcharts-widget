
import React, { Component } from "react";
import PropTypes from "prop-types";
import { line, curveStepBefore } from "d3-shape";

import GenericChartComponent from "../GenericChartComponent";
import { getAxisCanvas } from "../GenericComponent";
import { isDefined, isNotDefined } from "../utils";

class KagiSeries extends Component<any, any> {
	static defaultProps: any;

	constructor(props: any) {
		super(props);
		this.renderSVG = this.renderSVG.bind(this);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
	}
	drawOnCanvas(ctx: any, moreProps: any) {
		const { xAccessor } = moreProps;

		drawOnCanvas(ctx, this.props, moreProps, xAccessor);
	}
	render() {
		return <GenericChartComponent
			svgDraw={this.renderSVG}
			canvasToDraw={getAxisCanvas}
			canvasDraw={this.drawOnCanvas}
			drawOn={["pan"]}
		/>;
	}
	renderSVG(moreProps: any) {
		const { xAccessor } = moreProps;
		const { xScale, chartConfig: { yScale }, plotData } = moreProps;

		const { className, stroke, fill, strokeWidth } = this.props;

		const paths = helper(plotData, xAccessor).map((each: any, i: number) => {
			const dataSeries = line()
				.x((item: any) => xScale(item[0]))
				.y((item: any) => yScale(item[1]))
				.curve(curveStepBefore);

			dataSeries(each.plot);

			const pathD = dataSeries(each.plot) ?? undefined;
			return (<path key={i} d={pathD} className={each.type}
				stroke={stroke[each.type]} fill={fill[each.type]} strokeWidth={strokeWidth} />);
		});
		return (
			<g className={className}>
				{paths}
			</g>
		);
	}
}

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
KagiSeries.propTypes = {
	className: PropTypes.string,
	stroke: PropTypes.object,
	fill: PropTypes.object,
	strokeWidth: PropTypes.number.isRequired,
};

KagiSeries.defaultProps = {
	className: "vninvestcharts-widget-kagi",
	strokeWidth: 2,
	stroke: {
		yang: "#6BA583",
		yin: "#E60000"
	},
	fill: {
		yang: "none",
		yin: "none"
	},
	currentValueStroke: "#000000",
};

function drawOnCanvas(ctx: any, props: any, moreProps: any, xAccessor: any) {
	const { stroke, strokeWidth, currentValueStroke } = props;
	const { xScale, chartConfig: { yScale }, plotData } = moreProps;

	const paths = helper(plotData, xAccessor);

	let begin = true;

	paths.forEach((each: any) => {
		ctx.strokeStyle = stroke[each.type];
		ctx.lineWidth = strokeWidth;

		ctx.beginPath();
		let prevX: any;
		each.plot.forEach((d: any) => {
			const [x, y] = [xScale(d[0]), yScale(d[1])];
			if (begin) {
				ctx.moveTo(x, y);
				begin = false;
			} else {
				if (isDefined(prevX)) {
					ctx.lineTo(prevX, y);
				}
				ctx.lineTo(x, y);
			}
			prevX = x;
		});
		ctx.stroke();
	});
	const lastPlot = paths[paths.length - 1].plot;
	const last = lastPlot[lastPlot.length - 1];
	ctx.beginPath();
	ctx.lineWidth = 1;

	const [x, y1, y2] = [xScale(last[0]), yScale(last[2]), yScale(last[3])];
	ctx.moveTo(x, y1);
	ctx.lineTo(x + 10, y1);
	ctx.stroke();

	ctx.beginPath();
	ctx.strokeStyle = currentValueStroke;
	ctx.moveTo(x - 10, y2);
	ctx.lineTo(x, y2);
	ctx.stroke();
}

function helper(plotData: any[], xAccessor: any) {
	const kagiLine: any[] = [];
	let kagi: any = {};
	let d = plotData[0];
	let idx = xAccessor(d);

	for (let i = 0; i < plotData.length; i++) {
		d = plotData[i];

		if (isNotDefined(d.close)) continue;
		if (isNotDefined(kagi.type)) kagi.type = d.startAs;
		if (isNotDefined(kagi.plot)) kagi.plot = [];

		idx = xAccessor(d);
		kagi.plot.push([idx, d.open]);

		if (isDefined(d.changeTo)) {
			kagi.plot.push([idx, d.changePoint]);
			kagi.added = true;
			kagiLine.push(kagi);

			kagi = {
				type: d.changeTo,
				plot: [],
				added: false,
			};
			kagi.plot.push([idx, d.changePoint]);
		}
	}

	if (!kagi.added) {
		kagi.plot.push([idx, d.close, d.current, d.reverseAt]);
		kagiLine.push(kagi);
	}

	return kagiLine;
}

export default KagiSeries;
