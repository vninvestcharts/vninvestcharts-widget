import React from "react";
import PropTypes from "prop-types";
import { hexToRGBA, functor } from "../utils";

function Square(props: any) {
	const {
		className, stroke, strokeWidth,
		opacity, fill, point, width
	} = props;
	const w = functor(width)(point.datum);
	const x = point.x - (w / 2);
	const y = point.y - (w / 2);
	return (
		<rect
			className={className}
			x={x}
			y={y}
			stroke={stroke}
			strokeWidth={strokeWidth}
			fillOpacity={opacity}
			fill={fill}
			width={w}
			height={w}
		/>
	);
}

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
Square.propTypes = {
	stroke: PropTypes.string,
	fill: PropTypes.string.isRequired,
	opacity: PropTypes.number.isRequired,
	point: PropTypes.shape({
		x: PropTypes.number.isRequired,
		y: PropTypes.number.isRequired,
		datum: PropTypes.object.isRequired,
	}).isRequired,
	className: PropTypes.string,
	strokeWidth: PropTypes.number,
	width: PropTypes.oneOfType([
		PropTypes.number,
		PropTypes.func
	]).isRequired
};
Square.defaultProps = {
	stroke: "#4682B4",
	strokeWidth: 1,
	opacity: 0.5,
	fill: "#4682B4",
	className: "vninvestcharts-widget-marker-rect",
};
Square.drawOnCanvas = (props: any, point: any, ctx: any) => {
	const { stroke, fill, opacity, strokeWidth } = props;
	ctx.strokeStyle = stroke;
	ctx.lineWidth = strokeWidth;
	if (fill !== "none") {
		ctx.fillStyle = hexToRGBA(fill, opacity);
	}
	Square.drawOnCanvasWithNoStateChange(props, point, ctx);
};
Square.drawOnCanvasWithNoStateChange = (props: any, point: any, ctx: any) => {
	const { width } = props;
	const w = functor(width)(point.datum);
	const x = point.x - (w / 2);
	const y = point.y - (w / 2);
	ctx.beginPath();
	ctx.rect(x, y, w, w);
	ctx.stroke();
	ctx.fill();
};
export default Square;
