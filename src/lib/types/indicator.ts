import type { OHLCVBar } from "./ohlcv";

export interface IndicatorDefinition<
	TInput = OHLCVBar,
	TOutput = unknown,
	TParams extends readonly unknown[] = readonly unknown[],
> {
	name: string;
	compute: (bars: readonly TInput[], ...params: TParams) => TOutput;
	render?: (context: { values: TOutput; bars: readonly TInput[] }) => unknown;
	computeExtents?: (values: TOutput) => readonly [number, number] | readonly number[];
	yAxis?: "left" | "right";
}