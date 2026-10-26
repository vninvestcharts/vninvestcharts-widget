export type AnyRecord = Record<string, any>;

export type ChartDatum = any;

export type ChartAccessor<T = any, R = any> = (datum: T) => R;

export interface OHLCV {
	date: Date | number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	[key: string]: any;
}

export interface CandleWick {
	stroke: string;
	x: number;
	y1: number;
	y2: number;
	y3: number;
	y4: number;
}

export interface CandleData {
	x: number;
	y: number;
	wick: CandleWick;
	height: number;
	width: number;
	fill: string;
	stroke: string;
	className?: string;
}

export interface BarData {
	x: number;
	y: number;
	width: number;
	height: number;
	fill: string;
	stroke: string;
}

export interface CanvasContexts {
	axes?: CanvasRenderingContext2D;
	mouseCoord?: CanvasRenderingContext2D;
	bg?: CanvasRenderingContext2D;
	[key: string]: any;
}

export type MoreProps = AnyRecord;