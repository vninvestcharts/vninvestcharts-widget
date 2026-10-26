
import React, { Component } from "react";
import PropTypes from "prop-types";
import GenericChartComponent from "../GenericChartComponent";
import { getAxisCanvas } from "../GenericComponent";

import { isDefined } from "../utils";

/**
 * Point & Figure — MỘT CỘT = MỘT X.
 *
 * LỊCH SỬ (2026-09-29, f2-pfn-linebreak). Bản trước map mỗi BAR thành một cột:
 * `getColumns` gán `xOffset = xScale(xAccessor(d))` cho từng `d`, nên một cột P&F
 * (gốm nhiều bar) bị NHOÈ ra nhiều ô cách xa nhau. Đó không phải lỗi hiển thị mà
 * là sai mô hình: engine đã có `layoutPointAndFigure` làm đúng việc này
 * (`vn-kline-engine-core/src/engine/pointAndFigureColumns.ts`), và bản này bám
 * theo đúng bất biến đó — xếp theo `pnfColumnStart`, không theo bar.
 *
 * Bản trước còn THROW: nó dò bar đầu có box hay không bằng một vòng lặp không có
 * điều kiện dừng, và trong vòng lặp đó đọc `boxes` của bar đầu để đo chiều cao
 * box ⇒ `TypeError` ngay khi producer chưa chạy, còn `plotData` rỗng thì đo bề
 * rộng trên `undefined`. Ở đây `boxes` luôn được kiểm tra qua `readBoxes` trước
 * khi đọc, và `plotData` rỗng thì trả về `[]`.
 */
class PointAndFigureSeries extends Component<any, any> {
	static defaultProps: any;

	constructor(props: any) {
		super(props);
		this.renderSVG = this.renderSVG.bind(this);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
	}
	drawOnCanvas(ctx: any, moreProps: any) {
		const columns = getPointAndFigureColumns(this.props, moreProps);
		drawOnCanvas(ctx, this.props, columns);
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
		const { className, stroke, fill, strokeWidth } = this.props;
		const columns = getPointAndFigureColumns(this.props, moreProps);

		return (
			<g className={className}>
				{columns.map((col: any, idx: number) => (
					<g key={idx} className={col.className}>
						{col.boxes.map((box: any, i: number) => (
							<rect
								key={`${idx}-${i}`}
								className={col.className}
								strokeWidth={strokeWidth}
								stroke={col.direction > 0 ? stroke.up : stroke.down}
								fill={col.direction > 0 ? fill.up : fill.down}
								x={col.x}
								y={Math.min(box.open, box.close)}
								width={col.columnWidth}
								height={Math.abs(box.close - box.open)}
							/>
						))}
					</g>
				))}
			</g>
		);
	}
}

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
PointAndFigureSeries.propTypes = {
	className: PropTypes.string,
	strokeWidth: PropTypes.number.isRequired,
	stroke: PropTypes.object.isRequired,
	fill: PropTypes.object.isRequired,
	clip: PropTypes.bool.isRequired,
};

PointAndFigureSeries.defaultProps = {
	className: "vninvestcharts-widget-point-and-figure",
	strokeWidth: 1,
	stroke: {
		up: "#6BA583",
		down: "#E60000"
	},
	fill: {
		up: "none",
		down: "none"
	},
	clip: true,
};

function drawOnCanvas(ctx: any, props: any, columns: any[]) {
	const { stroke, fill, strokeWidth } = props;

	ctx.lineWidth = strokeWidth;
	columns.forEach((col: any) => {
		col.boxes.forEach((box: any) => {
			const up = col.direction > 0;
			ctx.fillStyle = up ? fill.up : fill.down;
			ctx.strokeStyle = up ? stroke.up : stroke.down;
			ctx.beginPath();
			ctx.rect(col.x, Math.min(box.open, box.close), col.columnWidth, Math.abs(box.close - box.open));
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
		});
	});
}

/** Số nguyên `pnfColumnStart` hữu hạn, hoặc `undefined`. */
function readColumnStart(d: any): number | undefined {
	const start = d?.pnfColumnStart;
	return typeof start === "number" && Number.isFinite(start) ? start : undefined;
}

/** `boxes` là mảng khác rỗng, hoặc `undefined`. Không bao giờ ném. */
function readBoxes(d: any): Array<{ open: number; close: number }> | undefined {
	const boxes = d?.boxes;
	if (!Array.isArray(boxes) || boxes.length === 0) {
		return undefined;
	}
	return boxes.filter((box: any) => box !== null && typeof box === "object"
		&& Number.isFinite(box.open) && Number.isFinite(box.close));
}

/**
 * Gom bar theo CỘT rồi đổi sang pixel. Export để test được: đây là nơi quyết
 * định "một x cho một cột", và đó là bất biến cần khoá, không phải chi tiết hình
 * thức.
 *
 * `columnWidth` suy ra từ SỐ CỘT, không phải số bar: một cột P&F là một thanh
 * rộng, và đặt bề rộng theo bar làm nó thành sọc mảnh giữa những khoảng trống.
 */
export function getPointAndFigureColumns(props: any, moreProps: any) {
	const { xAccessor } = moreProps;
	const { xScale, chartConfig: { yScale }, plotData } = moreProps;
	const bars: any[] = Array.isArray(plotData) ? plotData : [];
	const drawable = bars.filter((d: any) => isDefined(d?.close) && readBoxes(d) !== undefined);
	if (drawable.length === 0) {
		return [];
	}

	// Group theo `pnfColumnStart`. Một Map giữ thứ tự chạm đầu tiên nên cột đầu
	// tiên của bar sớm nhất nằm bên trái, đúng như trục thời gian.
	const byStart = new Map<number, any[]>();
	for (const d of drawable) {
		const start = readColumnStart(d);
		if (start === undefined) {
			// Không đoán x từ bar kề bên: hai cột liền nhau chỉ cách nhau một bar,
			// nên đoán sai là gộp hai cột thành một — lỗi hiển thị tệ hơn bỏ trống.
			continue;
		}
		const group = byStart.get(start);
		if (group === undefined) {
			byStart.set(start, [d]);
		} else {
			group.push(d);
		}
	}
	if (byStart.size === 0) {
		return [];
	}

	// x neo theo bar ĐẦU TIÊN của cột CÓ MẶT trong `plotData`. Engine neo theo
	// chỉ số bar tuyệt đối `pnfColumnStart` (`layoutPointAndFigure`), nên khi cửa
	// sổ mở giữa cột thì engine giữ cột ở x thật còn bản mirror này dán vào mép
	// trái. `moreProps` của lớp recharts-style này không mang offset của cửa sổ
	// nên không dựng lại được; ENGINE là bản vẽ có hiệu lực, đây là mirror.
	const firstBar = drawable[0];
	const lastBar = drawable[drawable.length - 1];
	const plotWidth = xScale(xAccessor(lastBar)) - xScale(xAccessor(firstBar));
	const step = plotWidth / Math.max(1, drawable.length - 1);
	// Bề rộng cột tính từ SỐ CỘT, không phải số bar: một cột P&F là một thanh
	// rộng. Sizing theo bar làm nó thành sọc mảnh giữa những khoảng trống lớn.
	const columnWidth = Math.max(1, (plotWidth / byStart.size) * 0.9);

	return [...byStart.entries()].map(([start, group]) => {
		const head = group[0];
		const up = head.pnfDirection === "up";
		return {
			columnStart: start,
			direction: up ? 1 : -1,
			className: up ? "up" : "down",
			x: xScale(xAccessor(head)) - 0.5 * columnWidth,
			columnWidth,
			step,
			boxes: group.flatMap((d: any) => (readBoxes(d) ?? []).map((box) => ({
				open: yScale(box.open),
				close: yScale(box.close),
			}))),
		};
	});
}

export default PointAndFigureSeries;
