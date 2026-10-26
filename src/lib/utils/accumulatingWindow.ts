/*

Taken from https://github.com/ScottLogic/d3fc/blob/master/src/indicator/algorithm/calculator/slidingWindow.js

The MIT License (MIT)

Copyright (c) 2014-2015 Scott Logic Ltd.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/

import noop from "./noop";
import identity from "./identity";
import { functor } from "./index";

export default function accumulatingWindow() {
	let accumulateTill: any = functor(false),
		accumulator: any = noop,
		value: any = identity,
		discardTillStart = false,
		discardTillEnd = false;

	// eslint-disable-next-line prefer-const
	let accumulatingWindowFn: any = function(data: any[]) {
		let accumulatedWindow: any[] | undefined = discardTillStart ? undefined : [];
		const response: any[] = [];
		let accumulatorIdx = 0;
		let i = 0;
		for (i = 0; i < data.length; i++) {
			const d = data[i];
			if (accumulateTill(d, i, (accumulatedWindow || []))) {
				if (accumulatedWindow && accumulatedWindow.length > 0) response.push(accumulator(accumulatedWindow, i, accumulatorIdx++));
				accumulatedWindow = [value(d)];
			} else {
				if (accumulatedWindow) accumulatedWindow.push(value(d));
			}
		}
		if (!discardTillEnd) response.push(accumulator(accumulatedWindow, i, accumulatorIdx));
		return response;
	};

	accumulatingWindowFn.accumulateTill = function(x: any) {
		if (!arguments.length) {
			return accumulateTill;
		}
		accumulateTill = functor(x);
		return accumulatingWindowFn;
	};
	accumulatingWindowFn.accumulator = function(x: any) {
		if (!arguments.length) {
			return accumulator;
		}
		accumulator = x;
		return accumulatingWindowFn;
	};
	accumulatingWindowFn.value = function(x: any) {
		if (!arguments.length) {
			return value;
		}
		value = x;
		return accumulatingWindowFn;
	};
	accumulatingWindowFn.discardTillStart = function(x: any) {
		if (!arguments.length) {
			return discardTillStart;
		}
		discardTillStart = x;
		return accumulatingWindowFn;
	};
	accumulatingWindowFn.discardTillEnd = function(x: any) {
		if (!arguments.length) {
			return discardTillEnd;
		}
		discardTillEnd = x;
		return accumulatingWindowFn;
	};
	return accumulatingWindowFn;
}