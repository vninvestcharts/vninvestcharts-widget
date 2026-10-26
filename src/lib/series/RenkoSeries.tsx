
import React, { Component } from "react";
import PropTypes from "prop-types";
import GenericChartComponent from "../GenericChartComponent";
import { getAxisCanvas } from "../GenericComponent";

import { isDefined } from "../utils";

class RenkoSeries extends Component<any, any> {
	static defaultProps: any;

	constructor(props: any) {
		super(props);
		this.renderSVG = this.renderSVG.bind(this);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
	}
	drawOnCanvas(ctx: any, moreProps: any) {
		const { xAccessor } = moreProps;
		const { xScale, chartConfig: { yScale }, plotData } = moreProps;

		const { yAccessor } = this.props;

		const candles = getRenko(this.props, plotData, xScale, xAccessor, yScale, yAccessor);

		drawOnCanvas(ctx, candles);
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
	renderSVG(moreProps: any) {
		const { xAccessor } = moreProps;
		const { xScale, chartConfig: { yScale }, plotData } = moreProps;

		const { yAccessor } = this.props;

		const candles = getRenko(this.props, plotData, xScale, xAccessor, yScale, yAccessor)
			.map((each: any, idx: number) => (<rect key={idx} className={each.className}
				fill={each.fill}
				x={each.x}
				y={each.y}
				width={each.width}
				height={each.height} />));

		return (
			<g>
				<g className="candle">
					{candles}
				</g>
			</g>
		);
	}
}

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
RenkoSeries.propTypes = {
	classNames: PropTypes.shape({
		up: PropTypes.string,
		down: PropTypes.string
	}),
	stroke: PropTypes.shape({
		up: PropTypes.string,
		down: PropTypes.string
	}),
	fill: PropTypes.shape({
		up: PropTypes.string,
		down: PropTypes.string,
		partial: PropTypes.string
	}),
	yAccessor: PropTypes.func.isRequired,
	clip: PropTypes.bool.isRequired,
};

RenkoSeries.defaultProps = {
	classNames: {
		up: "up",
		down: "down"
	},
	stroke: {
		up: "none",
		down: "none"
	},
	fill: {
		up: "#6BA583",
		down: "#E60000",
		partial: "#4682B4",
	},
	yAccessor: (d: any) => ({ open: d.open, high: d.high, low: d.low, close: d.close }),
	clip: true,
};

function drawOnCanvas(ctx: any, renko: any[]) {
	renko.forEach((d: any) => {
		ctx.beginPath();

		ctx.strokeStyle = d.stroke;
		ctx.fillStyle = d.fill;

		ctx.rect(d.x, d.y, d.width, d.height);
		ctx.closePath();
		ctx.fill();
	});
}

function getRenko(props: any, plotData: any[], xScale: any, xAccessor: any, yScale: any, yAccessor: any) {
	const { classNames, fill } = props;
	const width = xScale(xAccessor(plotData[plotData.length - 1]))
		- xScale(xAccessor(plotData[0]));

	const candleWidth = (width / (plotData.length - 1));
	const candles = plotData
		.filter((d: any) => isDefined(yAccessor(d).close))
		.map((d: any) => {
			const ohlc = yAccessor(d);
			const x = xScale(xAccessor(d)) - 0.5 * candleWidth,
				y = yScale(Math.max(ohlc.open, ohlc.close)),
				height = Math.abs(yScale(ohlc.open) - yScale(ohlc.close)),
				className = (ohlc.open <= ohlc.close) ? classNames.up : classNames.down;

			const svgfill = d.fullyFormed
				? (ohlc.open <= ohlc.close ? fill.up : fill.down)
				: fill.partial;

			return {
				className: className,
				fill: svgfill,
				x: x,
				y: y,
				height: height,
				width: candleWidth,
			};
		});
	return candles;
}

export default RenkoSeries;
