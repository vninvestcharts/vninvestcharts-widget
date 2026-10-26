import React, { Component } from "react";
import GenericChartComponent from "../GenericChartComponent";
import { getAxisCanvas } from "../GenericComponent";
import { hexToRGBA, plotDataLengthBarWidth } from "../utils";

interface FootprintSeriesProps {
	yAccessor: (d: any) => any;
	width?: number | ((props: FootprintSeriesProps, moreProps: any) => number);
	opacity?: number;
	fontSize?: number;
	fontFamily?: string;
	textColor?: string;
	upColor?: string;
	downColor?: string;
	neutralColor?: string;
	pocBorderColor?: string;
	viewMode?: "bidAsk" | "delta" | "deltaPercent" | "volume" | "profile";
}

export class FootprintSeries extends Component<FootprintSeriesProps> {
	static defaultProps: any = {
		width: plotDataLengthBarWidth,
		opacity: 0.7,
		fontSize: 9,
		fontFamily: "monospace",
		textColor: "#0f172a",
		upColor: "#10b981",
		downColor: "#ef4444",
		neutralColor: "#64748b",
		pocBorderColor: "#d97706",
		viewMode: "bidAsk",
	};

	constructor(props: FootprintSeriesProps) {
		super(props);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
	}

	drawOnCanvas(ctx: CanvasRenderingContext2D, moreProps: any) {
		const { xScale, chartConfig: { yScale }, plotData, xAccessor } = moreProps;
		const {
			yAccessor,
			width: widthProp,
			opacity,
			fontSize,
			fontFamily,
			textColor,
			upColor,
			downColor,
			neutralColor,
			pocBorderColor,
			viewMode,
		} = this.props;

		// Calculate bar width using width helper
		const widthFunctor = typeof widthProp === "function" ? widthProp : () => widthProp as number;
		const barWidth = widthFunctor(this.props, { xScale, xAccessor, plotData });
		const halfBarWidth = barWidth / 2;

		// Font styling
		ctx.font = `${fontSize}px ${fontFamily}`;
		ctx.textBaseline = "middle";
		ctx.textAlign = "center";

		for (const d of plotData) {
			const fpBar = yAccessor(d);
			if (!fpBar || !fpBar.priceLevels || fpBar.priceLevels.length === 0) {
				continue;
			}

			const x = xScale(xAccessor(d));
			const xStart = x - halfBarWidth;

			// Find POC price level in this bar (max totalVolume)
			let pocLevel: any = null;
			let maxVol = -1;
			for (const level of fpBar.priceLevels) {
				if (level.totalVolume > maxVol) {
					maxVol = level.totalVolume;
					pocLevel = level;
				}
			}

			// Estimate tick size or step size between price levels to determine cell height
			const levels = fpBar.priceLevels;
			let tickSize = 0.01;
			if (levels.length > 1) {
				tickSize = Math.abs(levels[1].price - levels[0].price);
			}

			for (const level of levels) {
				const { price, bidVolume, askVolume, delta, deltaPercent, totalVolume } = level;
				const yCenter = yScale(price);
				const yTop = yScale(price + tickSize / 2);
				const yBottom = yScale(price - tickSize / 2);
				const cellHeight = Math.abs(yTop - yBottom);

				// Determine cell background color intensity based on delta percent or volume
				let bgAlpha = 0.1;
				let cellBgColor = neutralColor!;

				if (delta > 0) {
					cellBgColor = upColor!;
					// Alpha scale: min 0.1, max 0.4 based on delta%
					bgAlpha = 0.1 + (Math.abs(deltaPercent) / 100) * 0.3;
				} else if (delta < 0) {
					cellBgColor = downColor!;
					bgAlpha = 0.1 + (Math.abs(deltaPercent) / 100) * 0.3;
				}

				// Draw background cell rectangle
				ctx.fillStyle = hexToRGBA(cellBgColor, bgAlpha);
				ctx.fillRect(xStart, Math.min(yTop, yBottom), barWidth, cellHeight);

				// Highlight POC cell border
				if (pocLevel && level.price === pocLevel.price) {
					ctx.strokeStyle = pocBorderColor!;
					ctx.lineWidth = 1.5;
					ctx.strokeRect(xStart + 0.5, Math.min(yTop, yBottom) + 0.5, barWidth - 1, cellHeight - 1);
				}

				// Draw text or visual overlay inside the cell
				if (barWidth >= 40 && cellHeight >= fontSize! + 2) {
					ctx.fillStyle = textColor!;
					let text = "";

					switch (viewMode) {
						case "bidAsk":
							text = `${Math.round(bidVolume)}x${Math.round(askVolume)}`;
							break;
						case "delta":
							text = `${delta > 0 ? "+" : ""}${Math.round(delta)}`;
							break;
						case "deltaPercent":
							text = `${deltaPercent > 0 ? "+" : ""}${Math.round(deltaPercent)}%`;
							break;
						case "volume":
							text = `${Math.round(totalVolume)}`;
							break;
						case "profile":
							// Render horizontal histogram bar inside cell instead of text
							const maxBarVol = Math.max(...levels.map((l: any) => l.totalVolume));
							if (maxBarVol > 0) {
								const fillWidth = (totalVolume / maxBarVol) * (barWidth - 4);
								ctx.fillStyle = hexToRGBA(cellBgColor, 0.4);
								ctx.fillRect(xStart + 2, Math.min(yTop, yBottom) + 2, fillWidth, cellHeight - 4);
							}
							break;
					}

					if (viewMode !== "profile" && text) {
						ctx.fillText(text, x, yCenter);
					}
				}
			}
		}
	}

	render() {
		return (
			<GenericChartComponent
				svgDraw={() => null}
				canvasDraw={this.drawOnCanvas}
				canvasToDraw={getAxisCanvas}
				drawOn={["pan"]}
			/>
		);
	}
}

export default FootprintSeries;
