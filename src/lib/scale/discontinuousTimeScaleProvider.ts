
import { timeFormat } from "d3-time-format";

import financeDiscontinuousScale from "./financeDiscontinuousScale";
import { slidingWindow, zipper, identity, isNotDefined } from "../utils";
import { defaultFormatters, levelDefinition } from "./levels";

function evaluateLevel(d: any, date: any, i: any, formatters: any) {
	return levelDefinition
		.map((eachLevel: any, idx: number) => {
			return {
				level: levelDefinition.length - idx - 1,
				format: formatters[eachLevel(d, date, i)]
			};
		})
		.find((l: any) => !!l.format);
}

const discontinuousIndexCalculator = (slidingWindow() as any)
	.windowSize(2)
	.undefinedValue((d: any, idx: any, { initialIndex, formatters }: any) => {
		const i = initialIndex;
		const row = {
			date: d.getTime(),
			startOf30Seconds: false,
			startOfMinute: false,
			startOf5Minutes: false,
			startOf15Minutes: false,
			startOf30Minutes: false,
			startOfHour: false,
			startOfEighthOfADay: false,
			startOfQuarterDay: false,
			startOfHalfDay: false,
			startOfDay: true,
			startOfWeek: false,
			startOfMonth: false,
			startOfQuarter: false,
			startOfYear: false,
		};
		const level = evaluateLevel(row, d, i, formatters);
		return { ...row, index: i, ...level };
	});

const discontinuousIndexCalculatorLocalTime = discontinuousIndexCalculator
	.accumulator(([prevDate, nowDate]: any[], i: any, idx: any, { initialIndex, formatters }: any) => {
		const startOf30Seconds = nowDate.getSeconds() % 30 === 0;

		const startOfMinute = nowDate.getMinutes() !== prevDate.getMinutes();
		const startOf5Minutes = startOfMinute && nowDate.getMinutes() % 5 <= prevDate.getMinutes() % 5;
		const startOf15Minutes = startOfMinute && nowDate.getMinutes() % 15 <= prevDate.getMinutes() % 15;
		const startOf30Minutes = startOfMinute && nowDate.getMinutes() % 30 <= prevDate.getMinutes() % 30;

		const startOfHour = nowDate.getHours() !== prevDate.getHours();

		const startOfEighthOfADay = startOfHour && nowDate.getHours() % 3 === 0;
		const startOfQuarterDay = startOfHour && nowDate.getHours() % 6 === 0;
		const startOfHalfDay = startOfHour && nowDate.getHours() % 12 === 0;

		const startOfDay = nowDate.getDay() !== prevDate.getDay();
		const startOfWeek = nowDate.getDay() < prevDate.getDay();
		const startOfMonth = nowDate.getMonth() !== prevDate.getMonth();
		const startOfQuarter = startOfMonth && (nowDate.getMonth() % 3 <= prevDate.getMonth() % 3);
		const startOfYear = nowDate.getFullYear() !== prevDate.getFullYear();

		const row = {
			date: nowDate.getTime(),
			startOf30Seconds,
			startOfMinute,
			startOf5Minutes,
			startOf15Minutes,
			startOf30Minutes,
			startOfHour,
			startOfEighthOfADay,
			startOfQuarterDay,
			startOfHalfDay,
			startOfDay,
			startOfWeek,
			startOfMonth,
			startOfQuarter,
			startOfYear,
		};
		const level = evaluateLevel(row, nowDate, i, formatters);
		if (level == null) {

		}
		return { ...row, index: i + initialIndex, ...level };
	});

function doStuff(realDateAccessor: any, inputDateAccessor: any, initialIndex: any, formatters: any) {
	return function(data: any[]) {
		const dateAccessor = realDateAccessor(inputDateAccessor);
		const calculate = discontinuousIndexCalculatorLocalTime
			.source(dateAccessor)
			.misc({ initialIndex, formatters });

		const index = calculate(data).map((each: any) => {
			const { format } = each;
			return {
				index: each.index,
				level: each.level,
				date: new Date(each.date),
				format: timeFormat(format),
			};
		});

		return { index };
	};
}

export function discontinuousTimeScaleProviderBuilder() {
	let initialIndex = 0, realDateAccessor: any = identity;
	let inputDateAccessor: any = (d: any) => d.date,
		indexAccessor: any = (d: any) => d.idx,
		indexMutator: any = (d: any, idx: any) => ({ ...d, idx }),
		withIndex: any;

	let currentFormatters: any = defaultFormatters;

	// eslint-disable-next-line prefer-const
	let discontinuousTimeScaleProvider: any = function(data: any[]) {
		let index = withIndex;

		if (isNotDefined(index)) {
			const response = doStuff(
				realDateAccessor,
				inputDateAccessor,
				initialIndex,
				currentFormatters
			)(data);

			index = response.index;
		}

		const inputIndex = index;
		const xScale = financeDiscontinuousScale(
			inputIndex,
		);

		const mergedData = (zipper() as any)
			.combine(indexMutator);

		const finalData = mergedData(data, inputIndex);

		return {
			data: finalData,
			xScale,
			xAccessor: (d: any) => d && indexAccessor(d).index,
			displayXAccessor: realDateAccessor(inputDateAccessor),
		};
	};

	discontinuousTimeScaleProvider.initialIndex = function(x: any) {
		if (!arguments.length) {
			return initialIndex;
		}
		initialIndex = x;
		return discontinuousTimeScaleProvider;
	};
	discontinuousTimeScaleProvider.inputDateAccessor = function(x: any) {
		if (!arguments.length) {
			return inputDateAccessor;
		}
		inputDateAccessor = x;
		return discontinuousTimeScaleProvider;
	};
	discontinuousTimeScaleProvider.indexAccessor = function(x: any) {
		if (!arguments.length) {
			return indexAccessor;
		}
		indexAccessor = x;
		return discontinuousTimeScaleProvider;
	};
	discontinuousTimeScaleProvider.indexMutator = function(x: any) {
		if (!arguments.length) {
			return indexMutator;
		}
		indexMutator = x;
		return discontinuousTimeScaleProvider;
	};
	discontinuousTimeScaleProvider.withIndex = function(x: any) {
		if (!arguments.length) {
			return withIndex;
		}
		withIndex = x;
		return discontinuousTimeScaleProvider;
	};
	discontinuousTimeScaleProvider.utc = function() {
		realDateAccessor = (dateAccessor: any) => (d: any) => {
			const date = dateAccessor(d);
			const offsetInMillis = date.getTimezoneOffset() * 60 * 1000;
			return new Date(date.getTime() + offsetInMillis);
		};
		return discontinuousTimeScaleProvider;
	};
	discontinuousTimeScaleProvider.locale = function(locale: any, formatters?: any) {
		// timeFormatDefaultLocale removed from d3-time-format v3+
		if (formatters) {
			currentFormatters = formatters;
		}
		return discontinuousTimeScaleProvider;
	};

	discontinuousTimeScaleProvider.indexCalculator = function() {
		return doStuff(realDateAccessor, inputDateAccessor, initialIndex, currentFormatters);
	};

	return discontinuousTimeScaleProvider;
}

export default discontinuousTimeScaleProviderBuilder();
