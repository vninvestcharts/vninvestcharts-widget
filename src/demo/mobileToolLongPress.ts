export const TOOL_LONG_PRESS_DELAY_MS = 800;
export const TOOL_TOOLTIP_AUTO_HIDE_MS = 1600;

export function triggerTooltipHapticFeedback(): void {
	if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
		navigator.vibrate(10);
	}
}