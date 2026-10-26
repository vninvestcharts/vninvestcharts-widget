export interface VisibleRange {
	startIndex: number;
	endIndex: number;
	startDate: Date | number;
	endDate: Date | number;
	timeRange: { from: number; to: number };
	barCount: number;
	relativePosition?: {
		startRatio: number;
		spanRatio: number;
	};
}

export type VisibleRangeSource = "pan" | "zoom" | "programmatic";

export interface ChartHandle {
	scrollToIndex(index: number, align?: "left" | "center" | "right"): void;
	zoomToRange(startIndex: number, endIndex: number): void;
	scrollToDate(date: Date, align?: "left" | "center" | "right"): void;
}
