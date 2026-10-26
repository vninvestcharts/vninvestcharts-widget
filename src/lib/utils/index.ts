import { scaleOrdinal } from "d3-scale";
import { schemeCategory10 } from "d3-scale-chromatic";
import { bisector } from "d3-array";
import noop from "./noop";
import identity from "./identity";

declare const require: any;

export { default as rebind } from "./rebind";
export { default as zipper } from "./zipper";
export { default as merge } from "./merge";
export { default as slidingWindow } from "./slidingWindow";
export { default as identity } from "./identity";
export { default as noop } from "./noop";
export { default as shallowEqual } from "./shallowEqual";
export { default as mappedSlidingWindow } from "./mappedSlidingWindow";
export { default as accumulatingWindow } from "./accumulatingWindow";
export { default as PureComponent } from "./PureComponent";

export * from "./barWidth";
export * from "./strokeDasharray";
export * from "./timezoneFormatter";

const isProduction = (globalThis as any).process?.env?.NODE_ENV === "production";

export function getLogger(prefix: string) {
	if (!isProduction) {
		// Logger is disabled in production to avoid console noise
	}
	return noop;
}

export function sign(x: number) {
	return (x > 0 ? 1 : 0) - (x < 0 ? 1 : 0);
}

export const yes = () => true;

export function path(loc: any = []) {
	const key = Array.isArray(loc) ? loc : [loc];
	const length = key.length;

	return function(obj: any, defaultValue?: any) {
		if (length === 0) return isDefined(obj) ? obj : defaultValue;

		let index = 0;
		while (obj != null && index < length) {
			obj = obj[key[index++]];
		}
		return (index === length) ? obj : defaultValue;
	};
}

export function functor(v: any) {
	return typeof v === "function" ? v : () => v;
}

export function createVerticalLinearGradient(stops: any[]) {
	return function(moreProps: any, ctx: CanvasRenderingContext2D) {
		const { chartConfig: { height } } = moreProps;

		const grd = ctx.createLinearGradient(0, height, 0, 0);
		stops.forEach(each => {
			grd.addColorStop(each.stop, each.color);
		});

		return grd;
	};
}

export function getClosestItemIndexes2(array: any[], value: any, accessor: any) {
	let left = bisector(accessor).left(array, value);
	left = Math.max(left - 1, 0);
	let right = Math.min(left + 1, array.length - 1);

	const item = accessor(array[left]);
	if (item >= value && item <= value) right = left;

	return { left, right };
}

export function degrees(radians: number) {
	return radians * 180 / Math.PI;
}

export function radians(degreesValue: number) {
	return degreesValue * Math.PI / 180;
}

export function getClosestValue(inputValue: any, currentValue: number) {
	const values = isArray(inputValue) ? inputValue : [inputValue];

	const diff = values
		.map(each => each - currentValue)
		.reduce((diff1, diff2) => Math.abs(diff1) < Math.abs(diff2) ? diff1 : diff2);
	return currentValue + diff;
}

export function find(this: any, list: any[], predicate: any, context: any = this) {
	for (let i = 0; i < list.length; ++i) {
		if (predicate.call(context, list[i], i, list)) {
			return list[i];
		}
	}
	return undefined;
}

export function d3Window(node: any) {
	const d3win = node
		&& (node.ownerDocument && node.ownerDocument.defaultView
			|| node.document && node
			|| node.defaultView);
	return d3win;
}

export const MOUSEENTER = "mouseenter.interaction";
export const MOUSELEAVE = "mouseleave.interaction";
export const MOUSEMOVE = "mousemove.pan";
export const MOUSEUP = "mouseup.pan";
export const TOUCHMOVE = "touchmove.pan";
export const TOUCHEND = "touchend.pan touchcancel.pan";

export function getTouchProps(touch: any) {
	if (!touch) return {};
	return {
		pageX: touch.pageX,
		pageY: touch.pageY,
		clientX: touch.clientX,
		clientY: touch.clientY
	};
}

export function getClosestItemIndexes(array: any[], value: any, accessor: any, log: any) {
	let lo = 0, hi = array.length - 1;
	while (hi - lo > 1) {
		const mid = Math.round((lo + hi) / 2);
		if (accessor(array[mid]) <= value) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	if (accessor(array[lo]).valueOf() === value.valueOf()) hi = lo;
	if (accessor(array[hi]).valueOf() === value.valueOf()) lo = hi;

	if (accessor(array[lo]) < value && accessor(array[hi]) < value) lo = hi;
	if (accessor(array[lo]) > value && accessor(array[hi]) > value) hi = lo;

	if (log) {
		// console.log(lo, accessor(array[lo]), value, accessor(array[hi]), hi);
		// console.log(accessor(array[lo]), lo, value, accessor(array[lo]) >= value);
		// console.log(value, hi, accessor(array[hi]), accessor(array[lo]) <= value);
	}
	return { left: lo, right: hi };
}

export function getClosestItem(array: any[], value: any, accessor: any, log?: any) {
	const { left, right } = getClosestItemIndexes(array, value, accessor, log);

	if (left === right) {
		return array[left];
	}

	const closest = (Math.abs(accessor(array[left]) - value) < Math.abs(accessor(array[right]) - value))
		? array[left]
		: array[right];
	if (log) {

	}
	return closest;
}

export const overlayColors = scaleOrdinal(schemeCategory10);

export function head(array: any[], accessor?: any) {
	if (accessor && array) {
		let value;
		for (let i = 0; i < array.length; i++) {
			value = array[i];
			if (isDefined(accessor(value))) return value;
		}
		return undefined;
	}
	return array ? array[0] : undefined;
}

export function tail(array: any[], accessor?: any) {
	if (accessor && array) {
		return array.map(accessor).slice(1);
	}
	return array ? array.slice(1) : undefined;
}

export const first = head;

export function last(array: any[], accessor?: any) {
	if (accessor && array) {
		let value;
		for (let i = array.length - 1; i >= 0; i--) {
			value = array[i];
			if (isDefined(accessor(value))) return value;
		}
		return undefined;
	}
	const length = array ? array.length : 0;
	return length ? array[length - 1] : undefined;
}

export function isDefined(d: any) {
	return d !== null && typeof d != "undefined";
}

export function isNotDefined(d: any) {
	return !isDefined(d);
}

export function isObject(d: any) {
	return isDefined(d) && typeof d === "object" && !Array.isArray(d);
}

export const isArray = Array.isArray;

export function touchPosition(touch: any, e: any) {
	const container = e.target,
		rect = container.getBoundingClientRect(),
		x = touch.clientX - rect.left - container.clientLeft,
		y = touch.clientY - rect.top - container.clientTop,
		xy = [Math.round(x), Math.round(y)];
	return xy;
}

export function mousePosition(e: any, defaultRect?: any) {
	const container = e.currentTarget;
	const rect = defaultRect || container.getBoundingClientRect(),
		x = e.clientX - rect.left - container.clientLeft,
		y = e.clientY - rect.top - container.clientTop,
		xy = [Math.round(x), Math.round(y)];
	return xy;
}

export function clearCanvas(canvasList: any[], ratio: any) {
	canvasList.forEach((each: any) => {
		each.setTransform(1, 0, 0, 1, 0, 0);
		each.clearRect(-1, -1, each.canvas.width + 2, each.canvas.height + 2);
		each.scale(ratio, ratio);
	});
}

export function capitalizeFirst(str: string) {
	return str.charAt(0).toUpperCase() + str.substring(1);
}

export function hexToRGBA(inputHex: string | undefined, opacity: number): string {
	if (!inputHex) {
		return "transparent";
	}

	const rgbaMatch = inputHex.match(/^rgba?\(([^)]+)\)$/i);
	if (rgbaMatch) {
		const parts = rgbaMatch[1].split(",").map((part) => part.trim());
		if (parts.length >= 3) {
			return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${opacity})`;
		}
	}

	let hex = inputHex.replace("#", "");
	if (inputHex.indexOf("#") > -1 && (hex.length === 3 || hex.length === 6 || hex.length === 8)) {
		if (hex.length === 3) {
			hex = hex.split("").map((char) => `${char}${char}`).join("");
		}

		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);

		return `rgba(${r}, ${g}, ${b}, ${opacity})`;
	}
	return inputHex;
}

export function toObject(array: any[], iteratee: any = identity) {
	return array.reduce((returnObj, a) => {
		const [key, value] = iteratee(a);
		return {
			...returnObj,
			[key]: value
		};
	}, {});
}

// copied from https://github.com/lodash/lodash/blob/master/mapValue.js
export function mapValue(object: any, iteratee: any) {
	object = Object(object);
	// eslint-disable-next-line prefer-const
	let result: any = {};

	Object.keys(object).forEach(key => {
		const mappedValue = iteratee(object[key], key, object);

		if (isDefined(mappedValue)) {
			result[key] = mappedValue;
		}
	});
	return result;
}

// copied from https://github.com/lodash/lodash/blob/master/mapObject.js
export function mapObject(object: any = {}, iteratee: any = identity) {
	const props = Object.keys(object);

	// eslint-disable-next-line prefer-const
	let result: any[] = new Array(props.length);

	props.forEach((key, index) => {
		result[index] = iteratee(object[key], key, object);
	});
	return result;
}

export function replaceAtIndex(array: any[], index: number, value: any) {
	if (isDefined(array) && array.length > index) {
		return array.slice(0, index)
			.concat(value)
			.concat(array.slice(index + 1));
	}
	return array;
}

// copied from https://github.com/lodash/lodash/blob/master/forOwn.js
export function forOwn(obj: any, iteratee: any) {
	const object = Object(obj);
	Object.keys(object)
		.forEach(key => iteratee(object[key], key, object));
}