import type { WidgetPaneRuntimeSnapshot, WidgetRuntimeCapabilities } from "../widget/VNInvestCharts";

type LayerDirtyMask = 0 | 1 | 2 | 3;
const LAYER_PANE_SNAPSHOTS = 1;
const LAYER_RUNTIME_CAPABILITIES = 2;

export type ScheduleFrame = (flush: () => void) => number;
export type CancelFrame = (id: number) => void;

export interface RuntimeInvalidationBatchCallbacks {
	onPaneSnapshots: (snapshots: readonly WidgetPaneRuntimeSnapshot[]) => void;
	onRuntimeCapabilities: (capabilities: WidgetRuntimeCapabilities | null) => void;
}

export interface RuntimeInvalidationBatchOptions {
	scheduleFrame?: ScheduleFrame;
	cancelFrame?: CancelFrame;
}

function defaultScheduleFrame(flush: () => void): number {
	if (typeof requestAnimationFrame === "function") {
		return requestAnimationFrame(flush);
	}

	return setTimeout(flush, 16) as unknown as number;
}

function defaultCancelFrame(id: number): void {
	if (typeof cancelAnimationFrame === "function") {
		cancelAnimationFrame(id);
		return;
	}

	clearTimeout(id);
}

export interface RuntimeInvalidationBatcher {
	queuePaneSnapshots: (snapshots: readonly WidgetPaneRuntimeSnapshot[]) => void;
	queueRuntimeCapabilities: (capabilities: WidgetRuntimeCapabilities | null) => void;
	dispose: () => void;
}

export function createRuntimeInvalidationBatcher(
	callbacks: RuntimeInvalidationBatchCallbacks,
	options: RuntimeInvalidationBatchOptions = {},
): RuntimeInvalidationBatcher {
	const scheduleFrame = options.scheduleFrame ?? defaultScheduleFrame;
	const cancelFrame = options.cancelFrame ?? defaultCancelFrame;

	let dirtyMask: LayerDirtyMask = 0;
	let frameHandle: number | null = null;
	let disposed = false;
	let latestPaneSnapshots: readonly WidgetPaneRuntimeSnapshot[] = [];
	let latestRuntimeCapabilities: WidgetRuntimeCapabilities | null = null;

	const flush = () => {
		frameHandle = null;
		if (disposed || dirtyMask === 0) {
			return;
		}

		const mask = dirtyMask;
		dirtyMask = 0;

		if (mask & LAYER_PANE_SNAPSHOTS) {
			callbacks.onPaneSnapshots(latestPaneSnapshots);
		}

		if (mask & LAYER_RUNTIME_CAPABILITIES) {
			callbacks.onRuntimeCapabilities(latestRuntimeCapabilities);
		}
	};

	const ensureFrame = () => {
		if (frameHandle !== null || disposed) {
			return;
		}

		frameHandle = scheduleFrame(flush);
	};

	return {
		queuePaneSnapshots(snapshots) {
			if (disposed) {
				return;
			}

			latestPaneSnapshots = snapshots;
			dirtyMask = (dirtyMask | LAYER_PANE_SNAPSHOTS) as LayerDirtyMask;
			ensureFrame();
		},
		queueRuntimeCapabilities(capabilities) {
			if (disposed) {
				return;
			}

			latestRuntimeCapabilities = capabilities;
			dirtyMask = (dirtyMask | LAYER_RUNTIME_CAPABILITIES) as LayerDirtyMask;
			ensureFrame();
		},
		dispose() {
			disposed = true;
			dirtyMask = 0;
			if (frameHandle !== null) {
				cancelFrame(frameHandle);
				frameHandle = null;
			}
		},
	};
}
