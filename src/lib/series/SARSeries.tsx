
import React, { Component } from "react";
import PropTypes from "prop-types";

import GenericChartComponent from "../GenericChartComponent";
import { getAxisCanvas, getMouseCanvas } from "../GenericComponent";

import { isDefined, first, last, hexToRGBA } from "../utils";

class SARSeries extends Component<any, any> {
	static defaultProps: any;

	constructor(props: any) {
		super(props);
		this.renderSVG = this.renderSVG.bind(this);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
		this.isHover = this.isHover.bind(this);
	}
	isHover(moreProps: any) {
		const { mouseXY, currentItem, chartConfig: { yScale } } = moreProps;
		const { yAccessor } = this.props;
		const y = mouseXY[1];
		const currentY = yScale(yAccessor(currentItem));
		return y <  currentY + 5 && y > currentY - 5;
	}
	drawOnCanvas(ctx: any, moreProps: any) {
		const { yAccessor, fill, opacity } = this.props;
		const { xAccessor, plotData, xScale, chartConfig: { yScale }, hovering } = moreProps;

		const width = xScale(xAccessor(last(plotData))) - xScale(xAccessor(first(plotData)));

		const d = (width / plotData.length) * 0.5 / 2;
		const radius = Math.min(2, Math.max(0.5,  d)) + (hovering ? 2 : 0);

		plotData.forEach((each: any) => {
			const centerX = xScale(xAccessor(each));
			const centerY = yScale(yAccessor(each));
			const color = yAccessor(each) > each.close
				? fill.falling
				: fill.rising;

			ctx.fillStyle = hexToRGBA(color, opacity);
			ctx.strokeStyle = color;

			ctx.beginPath();
			ctx.ellipse(centerX, centerY, radius, radius, 0, 0, 2 * Math.PI);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
		});
	}
	renderSVG(moreProps: any) {
		const { className, yAccessor } = this.props;
		const { xAccessor, plotData, xScale, chartConfig: { yScale } } = moreProps;

		return <g className={className}>
			{plotData
				.filter((each: any) => isDefined(yAccessor(each)))
				.map((each: any, idx: number) => {
					return <circle key={idx} cx={xScale(xAccessor(each))}
						cy={yScale(yAccessor(each))} r={3} fill="green" />;
				})}
		</g>;
	}

	render() {
		const { highlightOnHover } = this.props;
		const hoverProps = highlightOnHover
			? {
				isHover: this.isHover,
				drawOn: ["mousemove", "pan"],
				canvasToDraw: getMouseCanvas
			}
			: {
				drawOn: ["pan"],
				canvasToDraw: getAxisCanvas
			};

		return <GenericChartComponent
			svgDraw={this.renderSVG}

			canvasDraw={this.drawOnCanvas}

			onClickWhenHover={this.props.onClick}
			onDoubleClickWhenHover={this.props.onDoubleClick}
			onContextMenuWhenHover={this.props.onContextMenu}
			{...hoverProps}
		/>;
	}
}

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
SARSeries.propTypes = {
	className: PropTypes.string,
	fill: PropTypes.object.isRequired,
	yAccessor: PropTypes.func.isRequired,
	opacity: PropTypes.number.isRequired,
	onClick: PropTypes.func,
	onDoubleClick: PropTypes.func,
	onContextMenu: PropTypes.func,
	highlightOnHover: PropTypes.bool,
};

SARSeries.defaultProps = {
	className: "vninvestcharts-widget-sar",
	fill: {
		falling: "#4682B4",
		rising: "#15EC2E",
	},
	highlightOnHover: true,
	opacity: 0.2,
	onClick: function(_e: any) { },
	onDoubleClick: function(_e: any) { },
	onContextMenu: function(_e: any) { },
};

export default SARSeries;
