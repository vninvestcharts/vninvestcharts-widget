import React, { Component } from "react";
import GenericChartComponent from "../GenericChartComponent";
import { getAxisCanvas } from "../GenericComponent";
import { hexToRGBA } from "../utils";

interface MarketProfileSeriesProps {
	yAccessor: (d: any) => any;
	opacity?: number;
	fontSize?: number;
	fontFamily?: string;
	textColor?: string;
	pocColor?: string;
	valueAreaColor?: string;
	initialBalanceColor?: string;
}

export class MarketProfileSeries extends Component<MarketProfileSeriesProps> {
	static defaultProps: any = {
		opacity: 0.7,
		fontSize: 10,
		fontFamily: "monospace",
		textColor: "#475569",
		pocColor: "#d97706",
		valueAreaColor: "#38bdf8",
		initialBalanceColor: "#10b981",
	};

	constructor(props: MarketProfileSeriesProps) {
		super(props);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
	}

	drawOnCanvas(ctx: CanvasRenderingContext2D, moreProps: any) {
		const { chartConfig: { yScale }, plotData } = moreProps;
		const {
			yAccessor,
			fontSize,
			fontFamily,
			textColor,
			pocColor,
			valueAreaColor,
			initialBalanceColor,
		} = this.props;

		// Find the first valid MarketProfileData in the visible plotData
		let profileData: any = null;
		for (let i = plotData.length - 1; i >= 0; i--) {
			const d = yAccessor(plotData[i]);
			if (d && d.tpoBlocks && d.tpoBlocks.length > 0) {
				profileData = d;
				break;
			}
		}

		if (!profileData) return;

		const {
			tpoBlocks,
			poc,
			valueAreaHigh,
			valueAreaLow,
			initialBalanceHigh,
			initialBalanceLow,
		} = profileData;

		const { width } = moreProps;
		// Position the profile on the right side of the chart (e.g. occupying the last 30% width)
		const profileWidthPercent = 30;
		const xStart = width * (1 - profileWidthPercent / 100);

		// Draw Value Area background shading
		const yVaHigh = yScale(valueAreaHigh);
		const yVaLow = yScale(valueAreaLow);
		ctx.fillStyle = hexToRGBA(valueAreaColor!, 0.15);
		ctx.fillRect(xStart, Math.min(yVaHigh, yVaLow), width - xStart, Math.abs(yVaHigh - yVaLow));

		// Draw Initial Balance vertical bar
		const yIbHigh = yScale(initialBalanceHigh);
		const yIbLow = yScale(initialBalanceLow);
		ctx.strokeStyle = initialBalanceColor!;
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(xStart - 5, yIbHigh);
		ctx.lineTo(xStart - 5, yIbLow);
		ctx.stroke();

		// Draw TPO letters
		ctx.font = `${fontSize}px ${fontFamily}`;
		ctx.fillStyle = textColor!;
		ctx.textBaseline = "middle";

		// Group TPOs by price to stack them
		const priceGroups = new Map<number, any[]>();
		for (const block of tpoBlocks) {
			if (!priceGroups.has(block.price)) {
				priceGroups.set(block.price, []);
			}
			priceGroups.get(block.price)!.push(block);
		}

		const letterSpacing = fontSize! * 0.8;
		for (const [price, blocks] of priceGroups.entries()) {
			const y = yScale(price);
			// Sort blocks to have stable letter stacking order
			blocks.sort((a, b) => a.letter.localeCompare(b.letter));

			blocks.forEach((block, idx) => {
				const x = xStart + idx * letterSpacing;
				ctx.fillText(block.letter, x, y);
			});
		}

		// Highlight POC (Point of Control) line
		const yPoc = yScale(poc);
		ctx.strokeStyle = pocColor!;
		ctx.lineWidth = 2;
		ctx.setLineDash([4, 4]);
		ctx.beginPath();
		ctx.moveTo(xStart, yPoc);
		ctx.lineTo(width, yPoc);
		ctx.stroke();
		ctx.setLineDash([]); // Reset line dash
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

export default MarketProfileSeries;
