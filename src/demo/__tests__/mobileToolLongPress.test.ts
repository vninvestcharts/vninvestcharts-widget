import { describe, expect, it, vi } from "vitest";
import { TOOL_LONG_PRESS_DELAY_MS, TOOL_TOOLTIP_AUTO_HIDE_MS, triggerTooltipHapticFeedback } from "../mobileToolLongPress";

describe("mobileToolLongPress", () => {
	it("uses expected timing defaults", () => {
		expect(TOOL_LONG_PRESS_DELAY_MS).toBe(800);
		expect(TOOL_TOOLTIP_AUTO_HIDE_MS).toBe(1600);
	});

	it("calls navigator.vibrate when available", () => {
		const vibrate = vi.fn();
		Object.defineProperty(globalThis, "navigator", {
			value: { vibrate },
			configurable: true,
		});

		triggerTooltipHapticFeedback();
		expect(vibrate).toHaveBeenCalledWith(10);
	});

	it("is safe when vibrate is unavailable", () => {
		Object.defineProperty(globalThis, "navigator", {
			value: {},
			configurable: true,
		});

		expect(() => triggerTooltipHapticFeedback()).not.toThrow();
	});
});