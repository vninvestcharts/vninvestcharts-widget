import PropTypes from "prop-types";
import BarSeries from "./BarSeries";
import LineSeries from "./LineSeries";
import StraightLine from "./StraightLine";
import { MACD as appearanceOptions } from "../indicator/defaultOptionsForAppearance";
import type { AnyRecord } from "../types";

const MACDSeries = (props: AnyRecord) => {
	const {
		className = "vninvestcharts-widget-macd-series",
		opacity = 0.85,
		divergenceStroke = false,
		widthRatio = 0.5,
		width = BarSeries.defaultProps.width,
		stroke,
		strokeWidth,
		fill,
		clip = true,
		zeroLineStroke = "#000000",
		zeroLineOpacity = 0.3,
		yAccessor,
	} = props;
	const strokeConfig = stroke ?? appearanceOptions.stroke;
	const fillConfig = fill ?? appearanceOptions.fill;

	const yAccessorForMACD = (d: any) => yAccessor(d)?.macd;
	const yAccessorForSignal = (d: any) => yAccessor(d)?.signal;
	const yAccessorForDivergence = (d: any) => yAccessor(d)?.divergence;
	const yAccessorForDivergenceBase = (_xScale: any, yScale: any) => yScale(0);

	return (
		<g className={className}>
			<BarSeries
				baseAt={yAccessorForDivergenceBase}
				className="macd-divergence"
				width={width}
				widthRatio={widthRatio}
				stroke={divergenceStroke}
				fill={fillConfig.divergence}
				opacity={opacity}
				clip={clip}
				yAccessor={yAccessorForDivergence}
			/>
			<LineSeries yAccessor={yAccessorForMACD} stroke={strokeConfig.macd} strokeWidth={strokeWidth?.macd} fill="none" />
			<LineSeries yAccessor={yAccessorForSignal} stroke={strokeConfig.signal} strokeWidth={strokeWidth?.signal} fill="none" />
			<StraightLine stroke={zeroLineStroke} opacity={zeroLineOpacity} yValue={0} />
		</g>
	);
};

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
MACDSeries.propTypes = {
	className: PropTypes.string,
	yAccessor: PropTypes.func.isRequired,
	opacity: PropTypes.number,
	divergenceStroke: PropTypes.bool,
	zeroLineStroke: PropTypes.string,
	zeroLineOpacity: PropTypes.number,
	clip: PropTypes.bool.isRequired,
	stroke: PropTypes.shape({
		macd: PropTypes.string.isRequired,
		signal: PropTypes.string.isRequired,
	}).isRequired,
	strokeWidth: PropTypes.shape({
		macd: PropTypes.number,
		signal: PropTypes.number,
	}),
	fill: PropTypes.shape({
		divergence: PropTypes.oneOfType([PropTypes.string, PropTypes.func]).isRequired,
	}).isRequired,
	widthRatio: PropTypes.number,
	width: PropTypes.oneOfType([PropTypes.number, PropTypes.func]),
};

export default MACDSeries;
