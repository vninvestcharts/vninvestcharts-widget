export type IndicatorCategory =
	| "trend"
	| "momentum"
	| "volatility"
	| "orderflow"
	| "strength"
	| "volume";

export type RepaintPolicy =
	| "no-repaint"
	| "repaint-on-close"
	| "repaint-always";

export type PanePolicy =
	| "overlay"
	| "separate"
	| "either";

export type ScalePolicy =
	| "percent"
	| "price"
	| "normalized"
	| "volume";

export interface SeriesSettingField {
	key: string;
	labelKey: string;
	type: "number" | "text" | "color" | "select";
	defaultValue: number | string;
	min?: number;
	max?: number;
	step?: number;
	options?: { value: string; labelKey: string }[];
}

export interface IndicatorCatalogEntry {
	id: string;
	displayName?: { vi: string; en: string };
	description?: { vi: string; en: string };
	category?: IndicatorCategory;
	tags?: string[];
	inputSchema?: readonly SeriesSettingField[];
	outputSchema?: {
		type: "scalar" | "band" | "histogram" | "macd" | "stochastic";
		fields?: readonly string[];
	};
	panePolicy?: PanePolicy;
	scalePolicy?: ScalePolicy;
	repaintPolicy?: RepaintPolicy;
}
