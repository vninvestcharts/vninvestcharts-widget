import { scaleLinear, type ScaleLinear } from "d3-scale";
import { getIndicator } from "../../indicators";
import type { OHLCVBar } from "../../types/ohlcv";
import type { PaneConfig } from "../../types/pane";

export interface PaneScales {
	leftScale: ScaleLinear<number, number>;
	rightScale?: ScaleLinear<number, number>;
}

function finiteExtent(values: readonly number[]): [number, number] {
	const finiteValues = values.filter((value) => Number.isFinite(value));
	if (finiteValues.length === 0) {
		return [0, 1];
	}

	const minValue = Math.min(...finiteValues);
	const maxValue = Math.max(...finiteValues);
	if (minValue === maxValue) {
		return [minValue - 1, maxValue + 1];
	}
	return [minValue, maxValue];
}

function mergeExtents(extents: readonly [number, number][]): [number, number] {
	if (extents.length === 0) {
		return [0, 1];
	}

	const flattened = extents.flatMap(([minValue, maxValue]) => [minValue, maxValue]);
	return finiteExtent(flattened);
}

function collectAxisExtents(pane: PaneConfig, data: readonly OHLCVBar[], axis: "left" | "right") {
	return pane.indicators
		.filter((indicator) => (indicator.yAxis ?? "left") === axis)
		.map((indicator) => {
			const definition = getIndicator(indicator.name);
			if (!definition?.computeExtents) {
				return undefined;
			}

			const computed = definition.compute(data, ...(indicator.params ?? []));
			const extents = definition.computeExtents(computed);
			return finiteExtent(Array.isArray(extents) ? [...extents] : []);
		})
		.filter((extent): extent is [number, number] => Boolean(extent));
}

export function computeScales(pane: PaneConfig, data: readonly OHLCVBar[], canvasHeight: number): PaneScales {
	const leftSeriesExtents = collectAxisExtents(pane, data, "left");
	const leftValues = leftSeriesExtents.length > 0
		? mergeExtents(leftSeriesExtents)
		: finiteExtent(data.flatMap((bar) => [bar.low, bar.high]));
	const leftScale = scaleLinear()
		.domain(leftValues)
		.range([canvasHeight, 0])
		.nice();

	const hasRightAxis = Boolean(pane.rightAxis) || pane.indicators.some((indicator) => indicator.yAxis === "right");
	if (!hasRightAxis) {
		return { leftScale };
	}

	const rightSeriesExtents = collectAxisExtents(pane, data, "right");
	const rightValues = rightSeriesExtents.length > 0
		? mergeExtents(rightSeriesExtents)
		: finiteExtent(data.map((bar) => bar.volume));
	const rightScale = scaleLinear()
		.domain(rightValues)
		.range([canvasHeight, canvasHeight * 0.75])
		.nice();

	return { leftScale, rightScale };
}