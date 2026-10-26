import type { IframeBridge } from "./iframeBridge";
import { generateCorrelationId, type WidgetConfig } from "./messageProtocol";

/**
 * E1 (split from iframeEntry): frame sizing controller.
 * Fill mode (default) = 100%/100%, host owns the frame, zero resize
 * messages. Card mode (numeric height) pins the height and reports guarded
 * `event:resized` for bottom-panel expansion only.
 */
export interface FrameResizeReporter {
	onResize?: (height: number) => void;
}

export function createFrameController(
	container: HTMLElement,
	getBridge: () => IframeBridge | null,
): {
	applyFrameHeight: (config: WidgetConfig) => void;
	stopFrameResizeReporter: () => void;
} {
	let frameResizeObserver: ResizeObserver | null = null;
	let lastReportedHeight = -1;
	let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	function stopFrameResizeReporter(): void {
		if (resizeDebounceTimer) {
			clearTimeout(resizeDebounceTimer);
			resizeDebounceTimer = null;
		}
		if (frameResizeObserver) {
			frameResizeObserver.disconnect();
			frameResizeObserver = null;
		}
		lastReportedHeight = -1;
	}

	function startFrameResizeReporter(): void {
		const bridge = getBridge();
		if (typeof ResizeObserver === "undefined" || !bridge) return;
		frameResizeObserver = new ResizeObserver(() => {
			if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
			resizeDebounceTimer = setTimeout(() => {
				const height = Math.round(document.documentElement.scrollHeight || container.scrollHeight || 0);
				// Loop guard: ignore sub-2px jitter and repeats of the last value.
				if (height <= 0 || Math.abs(height - lastReportedHeight) < 2) return;
				lastReportedHeight = height;
				try {
					bridge?.sendEvent({
						type: "event:resized",
						correlationId: generateCorrelationId(),
						timestamp: Date.now(),
						origin: window.location.origin,
						payload: { height },
					});
				} catch {
					// ignore send errors
				}
			}, 150);
		});
		frameResizeObserver.observe(document.documentElement);
	}

	function applyFrameHeight(config: WidgetConfig): void {
		stopFrameResizeReporter();
		if (typeof config.height === "number" && Number.isFinite(config.height) && config.height > 0) {
			container.style.height = `${config.height}px`;
			startFrameResizeReporter();
			return;
		}
		container.style.height = "100%";
	}

	return { applyFrameHeight, stopFrameResizeReporter };
}
