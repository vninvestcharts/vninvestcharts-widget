
import React, { Component } from "react";
import PropTypes from "prop-types";

import LineSeries from "./LineSeries";
import AreaOnlySeries from "./AreaOnlySeries";

class BollingerSeries extends Component<any, any> {
	static defaultProps: any;

	constructor(props: any) {
		super(props);
		this.yAccessorForTop = this.yAccessorForTop.bind(this);
		this.yAccessorForMiddle = this.yAccessorForMiddle.bind(this);
		this.yAccessorForBottom = this.yAccessorForBottom.bind(this);
		this.yAccessorForScalledBottom = this.yAccessorForScalledBottom.bind(this);
	}
	yAccessorForTop(d: any) {
		const { yAccessor } = this.props;
		return yAccessor(d) && yAccessor(d).top;
	}
	yAccessorForMiddle(d: any) {
		const { yAccessor } = this.props;
		return yAccessor(d) && yAccessor(d).middle;
	}
	yAccessorForBottom(d: any) {
		const { yAccessor } = this.props;
		return yAccessor(d) && yAccessor(d).bottom;
	}
	yAccessorForScalledBottom(scale: any, d: any) {
		const { yAccessor } = this.props;
		return scale(yAccessor(d) && yAccessor(d).bottom);
	}
	render() {
		const { areaClassName, className, opacity, fillMode } = this.props;
		const { stroke, strokeWidth, fill } = this.props;

		return (
			<g className={className}>
				<LineSeries yAccessor={this.yAccessorForTop}
					stroke={stroke.top} strokeWidth={strokeWidth?.top} fill="none" />
				<LineSeries yAccessor={this.yAccessorForMiddle}
					stroke={stroke.middle} strokeWidth={strokeWidth?.middle} fill="none" />
				<LineSeries yAccessor={this.yAccessorForBottom}
					stroke={stroke.bottom} strokeWidth={strokeWidth?.bottom} fill="none" />
				<AreaOnlySeries className={areaClassName}
					yAccessor={this.yAccessorForTop}
					base={this.yAccessorForScalledBottom}
					stroke="none" fill={fill}
					opacity={opacity}
					fillMode={fillMode} />
			</g>
		);
	}
}

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
BollingerSeries.propTypes = {
	yAccessor: PropTypes.func.isRequired,
	className: PropTypes.string,
	areaClassName: PropTypes.string,
	opacity: PropTypes.number,
	type: PropTypes.string,
	stroke: PropTypes.shape({
		top: PropTypes.string.isRequired,
		middle: PropTypes.string.isRequired,
		bottom: PropTypes.string.isRequired,
	}).isRequired,
	strokeWidth: PropTypes.shape({
		top: PropTypes.number,
		middle: PropTypes.number,
		bottom: PropTypes.number,
	}),
	fill: PropTypes.string.isRequired,
	fillMode: PropTypes.string,
};

BollingerSeries.defaultProps = {
	className: "vninvestcharts-widget-bollinger-band-series",
	areaClassName: "vninvestcharts-widget-bollinger-band-series-area",
	opacity: 0.2
};

export default BollingerSeries;
