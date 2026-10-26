
import React, { Component } from "react";
import PropTypes from "prop-types";
import { line, curveStepBefore } from "d3-shape";

import GenericChartComponent from "../GenericChartComponent";
import { getAxisCanvas } from "../GenericComponent";
import { isDefined } from "../utils";

/**
 * Line Break — một đường bậc thang qua mức đóng của từng đoạn.
 *
 * Hình học GIỐNG kagi: trong lòng một đoạn, mức HẰNG cho tới khi đoạn kết thúc, nên
 * phải dùng `curveStepBefore` — một đoạn thẳng sẽ vẽ ra độ dốc giữa hai mức chưa
 * bao giờ cùng tồn tại. Khác kagi ở quy tắc CHIA ĐOẠN (line break dùng một `n` cho
 * cả bước lẫn đảo chiều, xem `calculators/exoticChartData.computeLineBreakLevels`),
 * không khác ở hình học.
 *
 * `drawOn={["pan"]}`: giống kagi — mức chỉ đổi khi đường kết thúc nên không cần
 * vẽ lại toàn bộ mỗi lần rê chuột, nhưng kéo ngang thì phải vẽ lại.
 */
class LineBreakSeries extends Component<any, any> {
	static defaultProps: any;

	constructor(props: any) {
		super(props);
		this.renderSVG = this.renderSVG.bind(this);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
	}
	drawOnCanvas(ctx: any, moreProps: any) {
		drawOnCanvas(ctx, this.props, moreProps);
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
		const { className, stroke, fill, strokeWidth } = this.props;
		const legs = getLineBreakLegs(moreProps);

		return (
			<g className={className}>
				{legs.map((leg: any, i: number) => (
					<path
						key={i}
						className={leg.up ? "up" : "down"}
						d={line<any>()
							.x((item: any) => moreProps.xScale(item[0]))
							.y((item: any) => moreProps.chartConfig.yScale(item[1]))
							.curve(curveStepBefore)(leg.plot) ?? undefined}
						stroke={leg.up ? stroke.up : stroke.down}
						fill={leg.up ? fill.up : fill.down}
						strokeWidth={strokeWidth}
					/>
				))}
			</g>
		);
	}
}

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
LineBreakSeries.propTypes = {
	className: PropTypes.string,
	stroke: PropTypes.object.isRequired,
	fill: PropTypes.object.isRequired,
	strokeWidth: PropTypes.number.isRequired,
};

LineBreakSeries.defaultProps = {
	className: "vninvestcharts-widget-line-break",
	strokeWidth: 2,
	stroke: {
		up: "#6BA583",
		down: "#E60000"
	},
	fill: {
		up: "none",
		down: "none"
	},
};

/**
 * Tách thành từng ĐOẠN theo lần đảo hướng, mỗi đoạn là một mảng `[x, level]`.
 *
 * Bar không có `lineBreakClose` (producer chưa chạy) bị BỎ QUA thay vì ném — cùng
 * nguyên tắc fail-closed với `seriesValueResolver`.
 */
export function getLineBreakLegs(moreProps: any) {
	const { xAccessor, plotData } = moreProps;
	const bars: any[] = Array.isArray(plotData) ? plotData : [];

	const legs: any[] = [];
	let current: any = undefined;
	for (const d of bars) {
		if (!isDefined(d?.close)) continue;
		const level = d.lineBreakClose;
		const open = d.lineBreakOpen;
		if (typeof level !== "number" || !Number.isFinite(level)) continue;
		const up = d.lineBreakUp !== false;
		const x = xAccessor(d);

		if (current === undefined || current.up !== up) {
			// Đoạn mới: bắt đầu từ MỨC MỞ của nó, không phải từ mức đóng của đoạn
			// trước — đó là chỗ nhịp nối giữa hai đường, và vẽ thẳng qua nó sẽ
			// thêm một đoạn dốc không tồn tại. Bar đầu tiên của một đường thường có
			// `open === close` (đường chưa kịp mở rộng), nên chỉ neo khi hai mức
			// thật sự khác nhau — nếu không sẽ có hai điểm trùng nhau ở cùng x.
			current = { up, plot: [] };
			legs.push(current);
			if (typeof open === "number" && Number.isFinite(open) && open !== level) {
				current.plot.push([x, open]);
			}
		}
		current.plot.push([x, level]);
	}

	return legs;
}

function drawOnCanvas(ctx: any, props: any, moreProps: any) {
	const { stroke, fill, strokeWidth } = props;
	const { xScale, chartConfig: { yScale } } = moreProps;

	for (const leg of getLineBreakLegs(moreProps)) {
		ctx.beginPath();
		ctx.strokeStyle = leg.up ? stroke.up : stroke.down;
		ctx.fillStyle = leg.up ? fill.up : fill.down;
		ctx.lineWidth = strokeWidth;

		let prevX: number | undefined;
		for (const [x, level] of leg.plot) {
			const px = xScale(x);
			const py = yScale(level);
			// `stepBefore`: giữ y CŨ tới x mới rồi mới nhảy dọc tại chính x đó.
			if (prevX !== undefined) {
				ctx.lineTo(prevX, py);
			}
			ctx.lineTo(px, py);
			prevX = px;
		}
		ctx.stroke();
	}
}

export default LineBreakSeries;
