export interface YAxisConfig {
	autoScale?: boolean;
	inverted?: boolean;
	scaleType?: "linear" | "log" | "percentage";
	tickFormat?: (value: number) => string;
}

export interface IndicatorConfig {
	name: string;
	params?: readonly unknown[];
	yAxis?: "left" | "right";
	visible?: boolean;
	style?: Record<string, unknown>;
}

export interface PaneConfig {
	id: string;
	heightPx?: number;
	heightPercent?: number;
	minHeightPx?: number;
	label?: string;
	indicators: IndicatorConfig[];
	leftAxis?: YAxisConfig;
	rightAxis?: YAxisConfig;
}