import noop from "./noop";
import identity from "./identity";
import { functor } from "./index";

export default function mappedSlidingWindow() {

	let undefinedValue: any = undefined,
		windowSize: any = 10,
		accumulator: any = noop,
		source: any = identity,
		skipInitial = 0;

	// eslint-disable-next-line prefer-const
	let mappedSlidingWindowFn: any = function(this: any, data: any[]) {
		const size = functor(windowSize).apply(this, arguments);
		const windowData: any[] = [];
		let accumulatorIdx = 0;
		const undef = functor(undefinedValue);
		const result: any[] = [];
		data.forEach(function(d, i) {
			let mapped;
			if (i < (skipInitial + size - 1)) {
				mapped = undef(d, i);
				result.push(mapped);
				windowData.push(mapped);
				return;
			}
			if (i >= (skipInitial + size)) {
				windowData.shift();
			}
			windowData.push(source(d, i));
			mapped = accumulator(windowData, i, accumulatorIdx++);
			result.push(mapped);
			windowData.pop();
			windowData.push(mapped);
			return;
		});
		return result;
	};

	mappedSlidingWindowFn.undefinedValue = function(x: any) {
		if (!arguments.length) {
			return undefinedValue;
		}
		undefinedValue = x;
		return mappedSlidingWindowFn;
	};
	mappedSlidingWindowFn.windowSize = function(x: any) {
		if (!arguments.length) {
			return windowSize;
		}
		windowSize = x;
		return mappedSlidingWindowFn;
	};
	mappedSlidingWindowFn.accumulator = function(x: any) {
		if (!arguments.length) {
			return accumulator;
		}
		accumulator = x;
		return mappedSlidingWindowFn;
	};
	mappedSlidingWindowFn.skipInitial = function(x: any) {
		if (!arguments.length) {
			return skipInitial;
		}
		skipInitial = x;
		return mappedSlidingWindowFn;
	};
	mappedSlidingWindowFn.source = function(x: any) {
		if (!arguments.length) {
			return source;
		}
		source = x;
		return mappedSlidingWindowFn;
	};

	return mappedSlidingWindowFn;
}