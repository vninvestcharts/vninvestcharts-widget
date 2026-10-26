import React from "react";
import { extent } from "d3-array";
import flattenDeep from "lodash.flattendeep";

import { scaleLinear } from "d3-scale";
import Chart from "../Chart";

import {
	last,
	isObject,
	getClosestItem,
	zipper,
	isDefined,
	isNotDefined,
	functor,
	mapObject,
	find,
	shallowEqual
} from "./index";

export function getChartOrigin(origin: any, contextWidth: any, contextHeight: any) {
	const originCoordinates = typeof origin === "function"
		? origin(contextWidth, contextHeight)
		: origin;
	return originCoordinates;
}

export function getDimensions({ width, height }: any, chartProps: any) {
	const chartHeight = (chartProps.height || height);

	return {
		availableHeight: height,
		width,
		height: chartHeight
	};
}

function values(func: any) {
	return (d: any) => {
		const obj = func(d);
		if (isObject(obj)) {
			return mapObject(obj);
		}
		return obj;
	};
}

function isArraySize2AndNumber(yExtentsProp: any) {
	if (Array.isArray(yExtentsProp) && yExtentsProp.length === 2) {
		const [a, b] = yExtentsProp;
		return (typeof a == "number" && typeof b == "number");
	}
	return false;
}

function findAllCharts(children: any): any[] {
	const charts: any[] = [];
	React.Children.forEach(children, (child) => {
		if (!child) return;
		const isChart = child.type && (
			child.type === Chart ||
			child.type.isChartComponent === true ||
			child.type.displayName === "Chart" ||
			(typeof child.type === "function" && child.type.name === "Chart")
		);
		if (isChart) {
			charts.push(child);
		} else if (child.props && child.props.children) {
			charts.push(...findAllCharts(child.props.children));
		}
	});
	return charts;
}

export function getNewChartConfig(innerDimension: any, children: any, existingChartConfig: any[] = []) {
	const chartElements = findAllCharts(children);
	return chartElements.map((each: any) => {
		const chartProps: any = Object.assign(
			{
				id: 0,
				origin: [0, 0],
				padding: 0,
				yScale: scaleLinear(),
				flipYScale: false,
			},
			Chart.defaultProps,
			each.props
		);
		const {
			id,
			origin,
			padding,
			yExtents: yExtentsProp,
			yScale: yScaleProp,
			flipYScale,
			yExtentsCalculator
		} = chartProps;

		const yScale = yScaleProp.copy();
		const {
			width, height, availableHeight
		} = getDimensions(innerDimension, chartProps);

		const { yPan } = chartProps;
		let { yPanEnabled } = chartProps;
		const yExtents = isDefined(yExtentsProp)
			? (Array.isArray(yExtentsProp) ? yExtentsProp : [yExtentsProp]).map(functor)
			: undefined;

		const prevChartConfig: any = find(existingChartConfig, (d: any) => d.id === id);

		if (isArraySize2AndNumber(yExtentsProp)) {
			if (
				isDefined(prevChartConfig)
				&& prevChartConfig.yPan
				&& prevChartConfig.yPanEnabled
				&& yPan
				&& yPanEnabled
				&& shallowEqual(prevChartConfig.originalYExtentsProp, yExtentsProp)
			) {
				yScale.domain(prevChartConfig.yScale.domain());
			} else {
				const [a, b] = yExtentsProp;
				yScale.domain([a, b]);
			}
		} else if (isDefined(prevChartConfig) && prevChartConfig.yPanEnabled) {
			if (isArraySize2AndNumber(prevChartConfig.originalYExtentsProp)) {
				// do nothing
			} else {
				yScale.domain(prevChartConfig.yScale.domain());
				yPanEnabled = true;
			}
		}

		return {
			id,
			paneId: chartProps.paneId,
			yScaleId: chartProps.yScaleId,
			origin: functor(origin)(width, availableHeight),
			padding,
			originalYExtentsProp: yExtentsProp,
			yExtents,
			yExtentsCalculator,
			flipYScale,
			yScale,
			yPan,
			yPanEnabled,
			width,
			height
		};
	});
}

export function getCurrentCharts(chartConfig: any[], mouseXY: any) {
	const currentCharts = chartConfig.filter(eachConfig => {
		const top = eachConfig.origin[1];
		const bottom = top + eachConfig.height;
		return (mouseXY[1] > top && mouseXY[1] < bottom);
	}).map(config => config.id);

	return currentCharts;
}

function setRange(scale: any, height: any, padding: any, flipYScale: any) {
	if (scale.rangeRoundPoints || isNotDefined(scale.invert)) {
		if (isNaN(padding)) throw new Error("padding has to be a number for ordinal scale");
		if (scale.rangeRoundPoints) scale.rangeRoundPoints(flipYScale ? [0, height] : [height, 0], padding);
		if (scale.rangeRound) scale.range(flipYScale ? [0, height] : [height, 0]).padding(padding);
	} else {
		const { top, bottom } = isNaN(padding)
			? padding
			: { top: padding, bottom: padding };

		scale.range(flipYScale ? [top, height - bottom] : [height - bottom, top]);
	}
	return scale;
}

function yDomainFromYExtents(yExtents: any[], yScale: any, plotData: any[]) {
	const yValues = yExtents.map(eachExtent =>
		plotData.map(values(eachExtent)));

	const allYValues = flattenDeep(yValues);
	const realYDomain = (yScale.invert)
		? extent(allYValues)
		: Array.from(new Set(allYValues));

	return realYDomain;
}


export function getChartConfigWithUpdatedYScales(
	chartConfig: any[],
	{ plotData, xAccessor, displayXAccessor, fullData }: any,
	xDomain: any,
	dy?: any,
	chartsToPan?: any
) {
	const yDomains = chartConfig
		.map(({ yExtentsCalculator, yExtents, yScale }) => {

			const realYDomain = isDefined(yExtentsCalculator)
				? yExtentsCalculator({ plotData, xDomain, xAccessor, displayXAccessor, fullData })
				: yDomainFromYExtents(yExtents, yScale, plotData);

			const yDomainDY = isDefined(dy)
				? yScale.range().map((each: any) => each - dy).map(yScale.invert)
				: yScale.domain();
			return {
				realYDomain,
				yDomainDY,
				prevYDomain: yScale.domain(),
			};
		});

	const combine = zipper()
		.combine((config: any, { realYDomain, yDomainDY, prevYDomain }: any) => {
			const { id, padding, height, yScale, yPan, flipYScale, yPanEnabled = false } = config;

			const another = isDefined(chartsToPan)
				? chartsToPan.indexOf(id) > -1
				: true;
			const domain = yPan && yPanEnabled
				? another ? yDomainDY : prevYDomain
				: realYDomain;

			const newYScale = setRange(
				yScale.copy().domain(domain), height, padding, flipYScale
			);
			return {
				...config,
				yScale: newYScale,
				realYDomain,
			};
		});

	const updatedChartConfig = combine(chartConfig, yDomains);

	return updatedChartConfig;
}

export function getCurrentItem(xScale: any, xAccessor: any, mouseXY: any, plotData: any[]) {
	if (!plotData || plotData.length === 0) return undefined;

	let xValue, item;
	if (xScale.invert) {
		xValue = xScale.invert(mouseXY[0]);
		item = getClosestItem(plotData, xValue, xAccessor);
	} else {
		const d = xScale.range().map((d: any, idx: number) => ({ x: Math.abs(d - mouseXY[0]), idx })).reduce((a: any, b: any) => a.x < b.x ? a : b);
		item = isDefined(d) ? plotData[d.idx] : plotData[0];
	}
	return item;
}

export function getXValue(xScale: any, xAccessor: any, mouseXY: any, plotData: any[]) {
	if (!plotData || plotData.length === 0) {
		return isDefined(xScale.invert) ? xScale.invert(mouseXY[0]) : undefined;
	}

	let xValue, item;
	if (xScale.invert) {
		xValue = xScale.invert(mouseXY[0]);
		if (xValue > xAccessor(last(plotData)) && xScale.value) {
			return Math.round(xValue);
		} else {
			item = getClosestItem(plotData, xValue, xAccessor);
		}
	} else {
		const d = xScale.range().map((d: any, idx: number) => ({ x: Math.abs(d - mouseXY[0]), idx })).reduce((a: any, b: any) => a.x < b.x ? a : b);
		item = isDefined(d) ? plotData[d.idx] : plotData[0];
	}
	return xAccessor(item);
}