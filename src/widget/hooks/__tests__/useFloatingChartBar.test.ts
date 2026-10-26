/**
 * useFloatingChartBar unit tests (S4: TC-9..TC-12).
 * Pan math against a mock scrollbar; hook exercised via a capture harness.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { useFloatingChartBar, type UseFloatingChartBarInput, type UseFloatingChartBarOutput, type FloatingBarScrollbar } from "../useFloatingChartBar";

function makeScrollbar(from: number, to: number, dataLength = 1000): FloatingBarScrollbar & { onWindowChange: ReturnType<typeof vi.fn> } {
	return { dataLength, from, to, onWindowChange: vi.fn() };
}

function makeInput(scrollbar: FloatingBarScrollbar | null): UseFloatingChartBarInput {
	return {
		zoomIn: vi.fn(),
		zoomOut: vi.fn(),
		fitToData: vi.fn(),
		scrollbar,
		onToggleLayout: vi.fn(),
		isSoloMode: false,
	};
}

function capture(input: UseFloatingChartBarInput): UseFloatingChartBarOutput {
	let latest: UseFloatingChartBarOutput | null = null;
	function Harness() {
		latest = useFloatingChartBar(input);
		return null;
	}
	render(createElement(Harness));
	if (!latest) throw new Error("hook did not run");
	return latest;
}

describe("useFloatingChartBar", () => {
	it("TC-9: panLeft shifts window down by 20% of span", () => {
		const scrollbar = makeScrollbar(100, 200);
		const out = capture(makeInput(scrollbar));
		expect(out.panDisabled).toBe(false);
		out.onPanLeft();
		expect(scrollbar.onWindowChange).toHaveBeenCalledTimes(1);
		expect(scrollbar.onWindowChange).toHaveBeenCalledWith(80, 180);
	});

	it("TC-10: panRight shifts window up by 20% of span", () => {
		const scrollbar = makeScrollbar(100, 200);
		const out = capture(makeInput(scrollbar));
		out.onPanRight();
		expect(scrollbar.onWindowChange).toHaveBeenCalledTimes(1);
		expect(scrollbar.onWindowChange).toHaveBeenCalledWith(120, 220);
	});

	it("TC-11: pan is no-op + panDisabled when scrollbar null", () => {
		const input = makeInput(null);
		const out = capture(input);
		expect(out.panDisabled).toBe(true);
		out.onPanLeft();
		out.onPanRight();
		expect(input.zoomIn).not.toHaveBeenCalled();
		expect(out.onToggleLayout).toBe(input.onToggleLayout);
		expect(out.isSoloMode).toBe(false);
	});

	it("TC-12: boundary clamp holds [0, dataLength]; tiny span still steps", () => {
		const left = makeScrollbar(0, 100, 1000);
		capture(makeInput(left)).onPanLeft();
		expect(left.onWindowChange).toHaveBeenCalledWith(0, 100);
		const right = makeScrollbar(900, 1000, 1000);
		capture(makeInput(right)).onPanRight();
		expect(right.onWindowChange).toHaveBeenCalledWith(900, 1000);
		const tiny = makeScrollbar(100, 101, 1000);
		capture(makeInput(tiny)).onPanLeft();
		// step = max(1, round(0.2)) = 1 (moved, not a dead click); clampWindow then
		// expands to SCROLLBAR_MIN_SPAN (10) -> (99, 109) per TimeAxisScrollbar.ts:25-27.
		expect(tiny.onWindowChange).toHaveBeenCalledWith(99, 109);
	});
});
