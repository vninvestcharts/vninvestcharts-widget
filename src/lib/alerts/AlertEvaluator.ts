import type { AlertCondition, AlertSource } from "./types";

export class AlertEvaluator {
	static evaluate(
		current: any,
		previous: any,
		alert: AlertCondition
	): boolean {
		const valA_curr = this.getValue(current, alert.sourceA);
		const valA_prev = this.getValue(previous, alert.sourceA);
		const valB_curr = this.getValue(current, alert.sourceB);
		const valB_prev = this.getValue(previous, alert.sourceB);

		if (valA_curr === null || valB_curr === null) return false;

		switch (alert.condition) {
			case "crossing":
				if (valA_prev === null || valB_prev === null) return false;
				return (valA_prev < valB_prev && valA_curr > valB_curr) ||
				       (valA_prev > valB_prev && valA_curr < valB_curr);
			case "crossing_up":
				if (valA_prev === null || valB_prev === null) return false;
				return valA_prev <= valB_prev && valA_curr > valB_curr;
			case "crossing_down":
				if (valA_prev === null || valB_prev === null) return false;
				return valA_prev >= valB_prev && valA_curr < valB_curr;
			case "greater_than":
				return valA_curr > valB_curr;
			case "less_than":
				return valA_curr < valB_curr;
			default:
				return false;
		}
	}

	private static getValue(datum: any, source: AlertSource): number | null {
		if (!datum) return null;
		if (source.type === "value") {
			return typeof source.value === "number" ? source.value : null;
		}
		if (source.type === "price") {
			const pKey = source.key || "close";
			const val = datum[pKey];
			return typeof val === "number" && !Number.isNaN(val) ? val : null;
		}
		if (source.type === "indicator") {
			const dict = datum.indicatorValues;
			if (!dict) return null;
			// Try key from source.indicatorId (which might be the canonical key or instance ID resolved as canonical key)
			const key = source.indicatorId;
			if (!key) return null;
			const val = dict[key];
			if (val === undefined || val === null) return null;
			if (typeof val === "object") {
				const subVal = val[source.key || ""];
				return typeof subVal === "number" && !Number.isNaN(subVal) ? subVal : null;
			}
			return typeof val === "number" && !Number.isNaN(val) ? val : null;
		}
		return null;
	}
}
