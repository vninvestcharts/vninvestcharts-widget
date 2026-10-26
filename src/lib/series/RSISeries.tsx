import { useMemo } from "react";
import PropTypes from "prop-types";
import LineSeries from "./LineSeries";
import StraightLine from "./StraightLine";
import { strokeDashTypes } from "../utils";
import type { AnyRecord } from "../types";

const defaultStroke = {
	line: "#000000",
	top: "#B8C2CC",
	middle: "#8795A1",
	bottom: "#B8C2CC",
	outsideThreshold: "#b300b3",
	insideThreshold: "#ffccff",
};

const defaultOpacity = { top: 1, middle: 1, bottom: 1 };

const defaultStrokeDasharray = {
	line: "Solid",
	top: "ShortDash",
	middle: "ShortDash",
	bottom: "ShortDash",
};

const defaultStrokeWidth = { outsideThreshold: 1, insideThreshold: 1, top: 1, middle: 1, bottom: 1 };

const RSISeries = (props: AnyRecord) => {
	const {
		className = "vninvestcharts-widget-rsi-series",
		stroke,
		opacity,
		strokeDasharray,
		strokeWidth,
		yAccessor,
		overSold = 70,
		middle = 50,
		overBought = 30,
	} = props;
	const strokeConfig = stroke ?? defaultStroke;
	const opacityConfig = opacity ?? defaultOpacity;
	const strokeDasharrayConfig = strokeDasharray ?? defaultStrokeDasharray;
	const strokeWidthConfig = strokeWidth ?? defaultStrokeWidth;

	const clipId1 = useMemo(() => `rsi-clip-${Math.round(Math.random() * 1000000)}`, []);
	const clipId2 = useMemo(() => `rsi-clip-${Math.round(Math.random() * 1000000)}`, []);

	const renderClip = (moreProps: any) => {
		const { chartConfig: { yScale, width, height } } = moreProps;
		return (
			<defs>
				<clipPath id={clipId1}>
					<rect x={0} y={yScale(overSold)} width={width} height={yScale(overBought) - yScale(overSold)} />
				</clipPath>
				<clipPath id={clipId2}>
					<rect x={0} y={0} width={width} height={yScale(overSold)} />
					<rect x={0} y={yScale(overBought)} width={width} height={height - yScale(overBought)} />
				</clipPath>
			</defs>
		);
	};

	return (
		<g className={className}>
			<LineSeries
				className={className}
				yAccessor={yAccessor}
				stroke={strokeConfig.insideThreshold || strokeConfig.line}
				strokeWidth={strokeWidthConfig.insideThreshold}
				strokeDasharray={strokeDasharrayConfig.line}
			/>
			<StraightLine stroke={strokeConfig.top} opacity={opacityConfig.top} yValue={overSold} strokeDasharray={strokeDasharrayConfig.top} strokeWidth={strokeWidthConfig.top} />
			<StraightLine stroke={strokeConfig.middle} opacity={opacityConfig.middle} yValue={middle} strokeDasharray={strokeDasharrayConfig.middle} strokeWidth={strokeWidthConfig.middle} />
			<StraightLine stroke={strokeConfig.bottom} opacity={opacityConfig.bottom} yValue={overBought} strokeDasharray={strokeDasharrayConfig.bottom} strokeWidth={strokeWidthConfig.bottom} />
		</g>
	);
};

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
RSISeries.propTypes = {
	className: PropTypes.string,
	yAccessor: PropTypes.func.isRequired,
	stroke: PropTypes.shape({
		top: PropTypes.string.isRequired,
		middle: PropTypes.string.isRequired,
		bottom: PropTypes.string.isRequired,
		outsideThreshold: PropTypes.string.isRequired,
		insideThreshold: PropTypes.string.isRequired,
	}).isRequired,
	opacity: PropTypes.shape({
		top: PropTypes.number.isRequired,
		middle: PropTypes.number.isRequired,
		bottom: PropTypes.number.isRequired,
	}).isRequired,
	strokeDasharray: PropTypes.shape({
		line: PropTypes.oneOf(strokeDashTypes),
		top: PropTypes.oneOf(strokeDashTypes),
		middle: PropTypes.oneOf(strokeDashTypes),
		bottom: PropTypes.oneOf(strokeDashTypes),
	}).isRequired,
	strokeWidth: PropTypes.shape({
		outsideThreshold: PropTypes.number.isRequired,
		insideThreshold: PropTypes.number.isRequired,
		top: PropTypes.number.isRequired,
		middle: PropTypes.number.isRequired,
		bottom: PropTypes.number.isRequired,
	}).isRequired,
	overSold: PropTypes.number.isRequired,
	middle: PropTypes.number.isRequired,
	overBought: PropTypes.number.isRequired,
};

export default RSISeries;
