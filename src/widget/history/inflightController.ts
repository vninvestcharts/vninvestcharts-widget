export interface AdaptiveInflightControllerState {
	maxInflight: number;
	debounceMs: number;
	chunkBars: number;
	retentionFactor: number;
	highFrameTimeCount: number;
	lowFrameTimeCount: number;
	highOverfetchCount: number;
}

export interface AdaptiveInflightTelemetry {
	frameP95Ms: number;
	queueDepth: number;
	overfetchRatio: number;
}

const MAX_INFLIGHT_MIN = 1;
const MAX_INFLIGHT_MAX = 3;
const OVERFETCH_INFLIGHT_CAP = 2;
const DEBOUNCE_MIN_MS = 80;
const DEBOUNCE_MAX_MS = 240;
const CHUNK_BARS_MIN = 2500;
const CHUNK_BARS_MAX = 10000;
const RETENTION_FACTOR_MIN = 1.15;

export function computeAdaptiveInflightControllerState(
	current: AdaptiveInflightControllerState,
	telemetry: AdaptiveInflightTelemetry,
	baseRetentionFactor: number,
): AdaptiveInflightControllerState {
	let highFrameTimeCount = current.highFrameTimeCount;
	let lowFrameTimeCount = current.lowFrameTimeCount;
	let highOverfetchCount = current.highOverfetchCount;
	let maxInflight = current.maxInflight;
	let debounceMs = current.debounceMs;
	let chunkBars = current.chunkBars;
	let retentionFactor = current.retentionFactor;

	if (telemetry.frameP95Ms > 28) {
		highFrameTimeCount += 1;
		lowFrameTimeCount = 0;
	} else if (telemetry.frameP95Ms < 16) {
		lowFrameTimeCount += 1;
		highFrameTimeCount = 0;
	} else {
		highFrameTimeCount = 0;
		lowFrameTimeCount = 0;
	}

	if (highFrameTimeCount === 2) {
		maxInflight = MAX_INFLIGHT_MIN;
		debounceMs = Math.min(debounceMs + 40, DEBOUNCE_MAX_MS);
		chunkBars = Math.max(chunkBars - 500, CHUNK_BARS_MIN);
	}

	if (lowFrameTimeCount >= 2 && telemetry.queueDepth > 0) {
		maxInflight = Math.min(maxInflight + 1, MAX_INFLIGHT_MAX);
		debounceMs = Math.max(debounceMs - 20, DEBOUNCE_MIN_MS);
		chunkBars = Math.min(chunkBars + 500, CHUNK_BARS_MAX);
	}

	if (telemetry.overfetchRatio > 1.8) {
		highOverfetchCount += 1;
	} else {
		highOverfetchCount = 0;
	}

	if (highOverfetchCount === 2) {
		retentionFactor = Math.max(retentionFactor - 0.15, RETENTION_FACTOR_MIN);
		maxInflight = Math.min(maxInflight, OVERFETCH_INFLIGHT_CAP);
	} else if (telemetry.overfetchRatio <= 1.5) {
		retentionFactor = baseRetentionFactor;
	}

	return {
		maxInflight,
		debounceMs,
		chunkBars,
		retentionFactor,
		highFrameTimeCount,
		lowFrameTimeCount,
		highOverfetchCount,
	};
}
