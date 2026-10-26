type DateDomain = [Date, Date];

type RangeLike = {
	from: number;
	to: number;
};

export function areVisibleDomainsEqual(
	left: DateDomain | null,
	right: DateDomain | null,
): boolean {
	if (left === right) {
		return true;
	}

	if (!left || !right) {
		return false;
	}

	return left[0].getTime() === right[0].getTime() && left[1].getTime() === right[1].getTime();
}

export function isForkRangeTraceEnabled() {
	if (typeof window === "undefined") {
		return false;
	}

	return Boolean((window as unknown as { __VN_DEBUG_RANGE__?: boolean }).__VN_DEBUG_RANGE__);
}

export function traceForkRange(_event: string, _payload: Record<string, unknown>) {
	// Range tracing is disabled by default; enable via __VN_DEBUG_RANGE__ flag
}

export function areEngineVisibleRangesEqual<T extends RangeLike>(left: T | null, right: T | null): boolean {
	if (left === right) {
		return true;
	}

	if (!left || !right) {
		return false;
	}

	return left.from === right.from && left.to === right.to;
}