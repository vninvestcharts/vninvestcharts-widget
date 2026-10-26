
import { ascending } from "d3-array";
import { scaleLinear } from "d3-scale";

import { isDefined, isNotDefined, head, last } from "../utils";
import { levelDefinition } from "./levels";

const MAX_LEVEL = levelDefinition.length - 1;

export default function financeDiscontinuousScale(
	index: any,
	futureProvider?: any,
	backingLinearScale: any = scaleLinear()
) {

	if (isNotDefined(index))
		throw new Error("Use the discontinuousTimeScaleProvider to create financeDiscontinuousScale");

	function scale(x: any) {
		return backingLinearScale(x);
	}
	scale.invert = function(x: any) {
		const inverted = backingLinearScale.invert(x);
		return Math.round(inverted * 10000) / 10000;
	};
	scale.domain = function(x?: any) {
		if (!arguments.length) return backingLinearScale.domain();
		backingLinearScale.domain(x);
		return scale;
	};
	scale.range = function(x?: any) {
		if (!arguments.length) return backingLinearScale.range();
		backingLinearScale.range(x);
		return scale;
	};
	scale.rangeRound = function(x: any) {
		return backingLinearScale.range(x);
	};
	scale.clamp = function(x?: any) {
		if (!arguments.length) return backingLinearScale.clamp();
		backingLinearScale.clamp(x);
		return scale;
	};
	scale.interpolate = function(x?: any) {
		if (!arguments.length) return backingLinearScale.interpolate();
		backingLinearScale.interpolate(x);
		return scale;
	};
	scale.ticks = function(m: any, flexTicks?: any) {
		const backingTicks = backingLinearScale.ticks(m);
		const ticksMap = new Map();

		const [domainStart, domainEnd] = backingLinearScale.domain();

		const start = Math.max(Math.ceil(domainStart), head(index).index) + Math.abs(head(index).index);
		const end = Math.min(Math.floor(domainEnd), last(index).index) + Math.abs(head(index).index);

		const desiredTickCount = Math.ceil((end - start) / (domainEnd - domainStart) * backingTicks.length);

		for (let i = MAX_LEVEL; i >= 0; i--) {
			const ticksAtLevel = ticksMap.get(i);
			const temp = isNotDefined(ticksAtLevel)
				? []
				: ticksAtLevel.slice();

			for (let j = start; j <= end; j++) {
				const levelPoint = index[j];
				if (isDefined(levelPoint) && levelPoint.level === i) {
					temp.push(index[j]);
				}
			}

			ticksMap.set(i, temp);
		}

		let unsortedTicks: any[] = [];
		for (let i = MAX_LEVEL; i >= 0; i--) {
			if ((ticksMap.get(i).length + unsortedTicks.length) > desiredTickCount * 1.5) break;
			unsortedTicks = unsortedTicks.concat(ticksMap.get(i).map((d: any) => d.index));
		}

		const ticks = unsortedTicks.sort(ascending);

		if (!flexTicks && end - start > ticks.length) {
			const ticksSet = new Set(ticks);

			const d = Math.abs(head(index).index);

			const distance = Math.ceil(
				(backingTicks.length > 0
					? (last(backingTicks) - head(backingTicks)) / (backingTicks.length) / 4
					: 1) * 1.5);

			for (let i = 0; i < ticks.length - 1; i++) {
				for (let j = i + 1; j < ticks.length; j++) {
					if (ticks[j] - ticks[i] <= distance) {
						const leftPoint = index[ticks[i] + d];
						const rightPoint = index[ticks[j] + d];
						if (!isDefined(leftPoint) || !isDefined(rightPoint)) {
							continue;
						}
						ticksSet.delete(leftPoint.level >= rightPoint.level ? ticks[j] : ticks[i]);
					}
				}
			}

			const tickValues = Array.from(ticksSet.values()).map((d: any) => parseInt(d, 10));

			return tickValues;
		}

		return ticks;
	};
	scale.tickFormat = function() {
		return function(x: any) {
			const d = Math.abs(head(index).index);
			const point = index[Math.floor(x + d)];
			if (!isDefined(point) || typeof point.format !== "function") {
				return "";
			}
			return point.format(point.date);
		};
	};
	scale.value = function(x: any) {
		const d = Math.abs(head(index).index);
		const point = index[Math.floor(x + d)];
		if (isDefined(point)) {
			const { date } = point;
			return date;
		}
	};
	scale.nice = function(m: any) {
		backingLinearScale.nice(m);
		return scale;
	};
	scale.index = function(x?: any) {
		if (!arguments.length) return index;
		index = x;
		return scale;
	};
	scale.copy = function() {
		return financeDiscontinuousScale(index, futureProvider, backingLinearScale.copy());
	};
	return scale;
}
