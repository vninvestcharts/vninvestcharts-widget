
import React, { Component } from "react";
import PropTypes from "prop-types";

import AreaSeries from "./AreaSeries";
import SVGComponent from "./SVGComponent";
import { strokeDashTypes } from "../utils";

class AlternatingFillAreaSeries extends Component<any, any> {
	static defaultProps: any;

	clipPathId1: string;
	clipPathId2: string;

	constructor(props: any) {
		super(props);
		this.renderClip = this.renderClip.bind(this);
		this.topClip = this.topClip.bind(this);
		this.bottomClip = this.bottomClip.bind(this);
		this.baseAt = this.baseAt.bind(this);

		const id1 = String(Math.round(Math.random() * 10000 * 10000));
		this.clipPathId1 = `alternating-area-clip-${id1}`;

		const id2 = String(Math.round(Math.random() * 10000 * 10000));
		this.clipPathId2 = `alternating-area-clip-${id2}`;
	}
	topClip(ctx: any, moreProps: any) {
		const { chartConfig } = moreProps;
		const { baseAt } = this.props;
		const { yScale, width } = chartConfig;

		ctx.beginPath();
		ctx.rect(
			0,
			0,
			width,
			yScale(baseAt)
		);
		ctx.clip();
	}
	bottomClip(ctx: any, moreProps: any) {
		const { chartConfig } = moreProps;
		const { baseAt } = this.props;
		const { yScale, width, height } = chartConfig;

		ctx.beginPath();
		ctx.rect(
			0,
			yScale(baseAt),
			width,
			height - yScale(baseAt)
		);
		ctx.clip();
	}
	renderClip(moreProps: any) {
		const { chartConfig } = moreProps;
		const { baseAt } = this.props;
		const { yScale, width, height } = chartConfig;

		return (
			<defs>
				<clipPath id={this.clipPathId1}>
					<rect
						x={0}
						y={0}
						width={width}
						height={yScale(baseAt)}
					/>
				</clipPath>
				<clipPath id={this.clipPathId2}>
					<rect
						x={0}
						y={yScale(baseAt)}
						width={width}
						height={height - yScale(baseAt)}
					/>
				</clipPath>
			</defs>
		);
	}
	baseAt(yScale: any) {
		return yScale(this.props.baseAt);
	}
	render() {
		const { className, yAccessor, interpolation } = this.props;
		const {
			stroke,
			strokeWidth,
			strokeOpacity,
			strokeDasharray,

			fill,
			fillOpacity,
		} = this.props;

		const style1 = { "clipPath": `url(#${this.clipPathId1})` };
		const style2 = { "clipPath": `url(#${this.clipPathId2})` };

		return (
			<g className={className}>
				<SVGComponent>
					{this.renderClip}
				</SVGComponent>
				<AreaSeries
					style={style1}
					canvasClip={this.topClip}

					yAccessor={yAccessor}
					interpolation={interpolation}
					baseAt={this.baseAt}

					fill={fill.top}
					opacity={fillOpacity.top}
					stroke={stroke.top}
					strokeOpacity={strokeOpacity.top}
					strokeDasharray={strokeDasharray.top}
					strokeWidth={strokeWidth.top}
				/>
				<AreaSeries
					style={style2}
					canvasClip={this.bottomClip}

					yAccessor={yAccessor}
					interpolation={interpolation}
					baseAt={this.baseAt}

					fill={fill.bottom}
					opacity={fillOpacity.bottom}
					stroke={stroke.bottom}
					strokeOpacity={strokeOpacity.bottom}
					strokeDasharray={strokeDasharray.bottom}
					strokeWidth={strokeWidth.bottom}
				/>
			</g>
		);
	}
}

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
AlternatingFillAreaSeries.propTypes = {
	stroke: PropTypes.shape({
		top: PropTypes.string,
		bottom: PropTypes.string,
	}),

	strokeWidth: PropTypes.shape({
		top: PropTypes.number,
		bottom: PropTypes.number,
	}),
	strokeOpacity: PropTypes.shape({
		top: PropTypes.number,
		bottom: PropTypes.number,
	}),
	fill: PropTypes.shape({
		top: PropTypes.string,
		bottom: PropTypes.string,
	}),
	fillOpacity: PropTypes.shape({
		top: PropTypes.number,
		bottom: PropTypes.number,
	}),
	strokeDasharray: PropTypes.shape({
		top: PropTypes.oneOf(strokeDashTypes),
		bottom: PropTypes.oneOf(strokeDashTypes),
	}).isRequired,

	className: PropTypes.string,
	yAccessor: PropTypes.func.isRequired,

	baseAt: PropTypes.number.isRequired,

	interpolation: PropTypes.func,
};

AlternatingFillAreaSeries.defaultProps = {
	stroke: {
		top: "#38C172",
		bottom: "#E3342F"
	},
	strokeWidth: {
		top: 2,
		bottom: 2,
	},
	strokeOpacity: {
		top: 1,
		bottom: 1,
	},
	fill: {
		top: "#A2F5BF",
		bottom: "#EF5753",
	},
	fillOpacity: {
		top: 0.5,
		bottom: 0.5,
	},
	strokeDasharray: {
		top: "Solid",
		bottom: "Solid",
	},
	className: "vninvestcharts-widget-alternating-area",
};

export default AlternatingFillAreaSeries;
