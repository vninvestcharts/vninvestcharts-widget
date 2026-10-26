// @vitest-environment jsdom
import { act } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { clampWindow, TimeAxisScrollbar } from "../TimeAxisScrollbar";

describe("clampWindow", () => {
	it("keeps valid windows untouched", () => {
		expect(clampWindow(20, 120, 500)).toEqual({ from: 20, to: 120 });
	});

	it("clamps both edges into [0, dataLength]", () => {
		expect(clampWindow(-30, 120, 500)).toEqual({ from: 0, to: 150 });
		expect(clampWindow(420, 560, 500)).toEqual({ from: 360, to: 500 });
	});

	it("enforces the minimum span", () => {
		expect(clampWindow(100, 103, 500)).toEqual({ from: 100, to: 110 });
	});

	it("is total on degenerate input", () => {
		expect(clampWindow(NaN, 120, 500)).toEqual({ from: 0, to: 500 });
		expect(clampWindow(0, 0, 0)).toEqual({ from: 0, to: 0 });
	});
});

function renderScrollbar(props: Record<string, unknown>) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => {
		root.render(createElement(TimeAxisScrollbar, props as never));
	});
	return {
		container,
		cleanup: () => {
			act(() => {
				root.unmount();
			});
			container.remove();
		},
	};
}

const closes = Array.from({ length: 500 }, (_, i) => 100 + Math.sin(i / 20) * 10 + i * 0.05);

describe("TimeAxisScrollbar", () => {
	it("renders the window at the right position and jumps on track click", () => {
		const onWindowChange = vi.fn();
		const probe = renderScrollbar({
			dataLength: 500, from: 400, to: 500, closes, width: 900,
			t: (key: string) => key, onWindowChange,
		});
		try {
			const win = probe.container.querySelector('[data-testid="time-scrollbar-window"]') as HTMLElement;
			expect(win).not.toBeNull();
			expect(win.style.left).toBe("80%");
			expect(win.style.width).toBe("20%");
			expect(win.getAttribute("aria-valuenow")).toBe("400");
			// Track click at 10% recenters the 100-bar span at bar 50.
			const track = probe.container.querySelector('[data-testid="time-axis-scrollbar"]') as HTMLElement;
			const rectSpy = vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
				left: 0, top: 0, width: 900, height: 26, right: 900, bottom: 26, x: 0, y: 0, toJSON: () => {},
			});
			try {
				act(() => {
					track.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 90 }));
				});
			} finally {
				rectSpy.mockRestore();
			}
			expect(onWindowChange).toHaveBeenCalledWith(0, 100);
		} finally {
			probe.cleanup();
		}
	});

	it("moves the window with arrow keys", () => {
		const onWindowChange = vi.fn();
		const probe = renderScrollbar({
			dataLength: 500, from: 400, to: 500, closes, width: 900,
			t: (key: string) => key, onWindowChange,
		});
		try {
			const win = probe.container.querySelector('[data-testid="time-scrollbar-window"]') as HTMLElement;
			act(() => {
				win.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowLeft" }));
			});
			expect(onWindowChange).toHaveBeenCalledWith(399, 499);
			act(() => {
				win.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "End" }));
			});
			expect(onWindowChange).toHaveBeenCalledWith(400, 500);
		} finally {
			probe.cleanup();
		}
	});
});
