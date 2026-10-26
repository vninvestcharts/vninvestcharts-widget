import React, { useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { scaleLinear } from "d3-scale";
import { useStockChart } from "./StockChartContext";
import { ChartProvider } from "./ChartContext";
import { isNotDefined, noop, find } from "./utils";
import type { AnyRecord } from "./types";
import type { ChartConfig } from "./StockChartContext";

const Chart = (props: AnyRecord) => {
	const { id, children, onContextMenu = noop } = props;
	const { chartConfig: allConfigs, subscribe, unsubscribe } = useStockChart();

	const chartConfig = useMemo(() => {
		return find(allConfigs, (each: ChartConfig) => each.id === id);
	}, [allConfigs, id]);

	useEffect(() => {
		const listener = (type: string, moreProps: AnyRecord, state: AnyRecord, e: unknown) => {
			if (type === "contextmenu") {
				const { currentCharts } = moreProps;
				if (currentCharts.indexOf(id) > -1) {
					onContextMenu(moreProps, e);
				}
			}
		};

		subscribe("chart_" + id, { listener });
		return () => unsubscribe("chart_" + id);
	}, [id, subscribe, unsubscribe, onContextMenu]);

	if (!chartConfig) return null;

	const [x, y] = chartConfig.origin;

	return (
		<ChartProvider value={{ chartId: id, chartConfig }}>
			<g transform={`translate(${x}, ${y})`}>
				{children}
			</g>
		</ChartProvider>
	);
};

Chart.propTypes = {
	height: PropTypes.number,
	origin: PropTypes.oneOfType([PropTypes.array, PropTypes.func]),
	id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
	yExtents: PropTypes.oneOfType([PropTypes.array, PropTypes.func]),
	onContextMenu: PropTypes.func,
	yScale: PropTypes.func,
	flipYScale: PropTypes.bool,
	padding: PropTypes.oneOfType([
		PropTypes.number,
		PropTypes.shape({
			top: PropTypes.number,
			bottom: PropTypes.number,
		})
	]),
	children: PropTypes.node,
};

Chart.defaultProps = {
	id: 0,
	origin: [0, 0],
	padding: 0,
	yScale: scaleLinear(),
	flipYScale: false,
	onContextMenu: noop,
};

Chart.displayName = "Chart";
(Chart as any).isChartComponent = true;

export default Chart;

