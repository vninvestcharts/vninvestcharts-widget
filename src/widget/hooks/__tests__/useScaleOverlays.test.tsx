// @vitest-environment jsdom
import { act } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useScaleOverlays } from "../useScaleOverlays";

const priceSnapshot: any = {
	paneId: "price",
	scaleSlotBounds: {
		"price-right": { left: 752, top: 0, width: 48, height: 500 },
	},
	scaleSlotStates: {
		"price-right": { side: "right", visible: true, domain: [90, 110] },
	},
};

function makeBars(n: number): any[] {
	const base = Date.UTC(2024, 0, 1);
	return Array.from({ length: n }, (_, i) => ({
		date: new Date(base + i * 86_400_000),
		open: 100, high: 105, low: 98, close: 103, volume: 1000,
	}));
}

function renderProbe(options: Record<string, unknown>) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	let captured: any = null;
	function Probe(props: { hookOptions: unknown }) {
		captured = useScaleOverlays(props.hookOptions as never);
		return null;
	}
	act(() => {
		root.render(createElement(Probe, { hookOptions: options }));
	});
	return {
		captured: () => captured,
		cleanup: () => {
			act(() => {
				root.unmount();
			});
			container.remove();
		},
	};
}

function baseOptions(overrides: Record<string, unknown> = {}) {
	const engine = {
		zoomToRange: vi.fn(),
		setPriceScaleMode: vi.fn(),
		setPriceScaleInverted: vi.fn(),
		setPriceAxisPosition: vi.fn(),
		resetYAxisZoom: vi.fn(),
		hitTestDrawingPrimitive: vi.fn(() => null),
	};
	const options = {
		enabled: true,
		snapshots: [priceSnapshot],
		plotData: makeBars(200),
		visibleRange: { from: 100, to: 200 },
		getEngine: () => engine,
		...overrides,
	};
	return { options, engine };
}

beforeEach(() => {
	localStorage.clear();
});

describe("useScaleOverlays", () => {
	it("opens the price menu on axis right-click coordinates, ignores plot", () => {
		const { options } = baseOptions();
		const probe = renderProbe(options);
		try {
			let opened = false;
			act(() => {
				opened = probe.captured().openMenuAt(760, 250, 760, 250);
			});
			expect(opened).toBe(true);
			const menu = probe.captured().priceMenu;
			expect(menu).toMatchObject({ paneId: "price", scaleSlotId: "price-right", mode: "linear", logAvailable: true });
			act(() => {
				expect(probe.captured().openMenuAt(400, 250, 400, 250)).toBe(false);
			});
		} finally {
			probe.cleanup();
		}
	});

	it("carries the owning chart box for menu clamping (CHART_CLAMP)", () => {
		const { options } = baseOptions();
		const probe = renderProbe(options);
		try {
			const fallback = vi.fn();
			const fakeEvent = {
				altKey: false,
				clientX: 760,
				clientY: 250,
				currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 900, bottom: 700 }) },
				preventDefault: vi.fn(),
			} as never;
			act(() => {
				probe.captured().handleSurfaceContextMenu(fakeEvent, fallback);
			});
			expect(fallback).not.toHaveBeenCalled();
			expect(probe.captured().priceMenu).toMatchObject({ flipRight: 900, flipBottom: 700 });
		} finally {
			probe.cleanup();
		}
	});

	it("applies a menu mode to the engine and persists per pane", () => {
		const { options, engine } = baseOptions();
		const probe = renderProbe(options);
		try {
			act(() => {
				probe.captured().openMenuAt(760, 250, 760, 250);
			});
			act(() => {
				probe.captured().applyMenuMode("log");
			});
			expect(engine.setPriceScaleMode).toHaveBeenCalledWith("log", "price-right");
			expect(localStorage.getItem("vnsc_priceScaleMode:price")).toBe("log");
			act(() => {
				probe.captured().resetMenuZoom();
			});
			expect(engine.resetYAxisZoom).toHaveBeenCalledWith("price-right");
		} finally {
			probe.cleanup();
		}
	});

	it("computes scrollbar props and forwards window changes to zoomToRange", () => {
		const { options, engine } = baseOptions();
		const probe = renderProbe(options);
		try {
			const scrollbar = probe.captured().scrollbar;
			expect(scrollbar).toMatchObject({ dataLength: 200, from: 100, to: 200 });
			act(() => {
				scrollbar.onWindowChange(50, 150);
			});
			expect(engine.zoomToRange).toHaveBeenCalledWith({ from: 50, to: 150 });
		} finally {
			probe.cleanup();
		}
	});

	it("lets Alt+right-click fall through (replay-shortcut contract)", () => {
		const { options } = baseOptions();
		const probe = renderProbe(options);
		try {
			const fallback = vi.fn();
			const fakeEvent = {
				altKey: true,
				clientX: 760,
				clientY: 250,
				currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
				preventDefault: vi.fn(),
			} as never;
			act(() => {
				probe.captured().handleSurfaceContextMenu(fakeEvent, fallback);
			});
			expect(fallback).toHaveBeenCalledTimes(1);
			expect(probe.captured().priceMenu).toBeNull();
		} finally {
			probe.cleanup();
		}
	});

	it("lets a drawing under the cursor own the menu (object precedence)", () => {
		const { options, engine } = baseOptions();
		engine.hitTestDrawingPrimitive.mockReturnValue({ drawingId: "d1", key: "k1" } as never);
		const probe = renderProbe(options);
		try {
			const fallback = vi.fn();
			const fakeEvent = {
				altKey: false,
				clientX: 760,
				clientY: 250,
				currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
				preventDefault: vi.fn(),
			} as never;
			act(() => {
				probe.captured().handleSurfaceContextMenu(fakeEvent, fallback);
			});
			expect(fallback).toHaveBeenCalledTimes(1);
			expect(probe.captured().priceMenu).toBeNull();
		} finally {
			probe.cleanup();
		}
	});

	it("lets the Alt latch fall through even on an axis (replay contract)", () => {
		const altPressedRef = { current: true };
		const { options } = baseOptions({ altPressedRef });
		const probe = renderProbe(options);
		try {
			const fallback = vi.fn();
			const fakeEvent = {
				altKey: false,
				clientX: 760,
				clientY: 250,
				currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
				preventDefault: vi.fn(),
			} as never;
			act(() => {
				probe.captured().handleSurfaceContextMenu(fakeEvent, fallback);
			});
			expect(fallback).toHaveBeenCalledTimes(1);
			expect(probe.captured().priceMenu).toBeNull();
		} finally {
			probe.cleanup();
		}
	});

	it("returns null scrollbar when disabled or empty", () => {
		const disabled = renderProbe(baseOptions({ enabled: false }).options);
		try {
			expect(disabled.captured().scrollbar).toBeNull();
		} finally {
			disabled.cleanup();
		}
		const empty = renderProbe(baseOptions({ plotData: [] }).options);
		try {
			expect(empty.captured().scrollbar).toBeNull();
		} finally {
			empty.cleanup();
		}
	});

	it("re-applies persisted invertScale from localStorage on mount", () => {
		localStorage.setItem("vnsc_priceScaleInverted:price", "true");
		const { options, engine } = baseOptions();
		const probe = renderProbe(options);
		try {
			expect(engine.setPriceScaleInverted).toHaveBeenCalledWith(true, "price-right");
		} finally {
			probe.cleanup();
		}
	});

	it("handles vnsc-settings-sync event for invertScale", () => {
		const { options, engine } = baseOptions();
		const probe = renderProbe(options);
		try {
			act(() => {
				window.dispatchEvent(
					new CustomEvent("vnsc-settings-sync", {
						detail: { state: { scales: { invertScale: true } } },
					}),
				);
			});
			expect(engine.setPriceScaleInverted).toHaveBeenCalledWith(true, "price-right");
		} finally {
			probe.cleanup();
		}
	});

	it("handles vnsc-settings-sync event for priceAxisPosition (W0 Task 0.3)", () => {
		const { options, engine } = baseOptions();
		const probe = renderProbe(options);
		try {
			act(() => {
				window.dispatchEvent(
					new CustomEvent("vnsc-settings-sync", {
						detail: { state: { scales: { priceAxisPosition: "left" } } },
					}),
				);
			});
			expect(engine.setPriceAxisPosition).toHaveBeenCalledWith("left", "price-right");
		} finally {
			probe.cleanup();
		}
	});

	it("ignores invalid priceAxisPosition values (W0 Task 0.3)", () => {
		const { options, engine } = baseOptions();
		const probe = renderProbe(options);
		try {
			act(() => {
				window.dispatchEvent(
					new CustomEvent("vnsc-settings-sync", {
						detail: { state: { scales: { priceAxisPosition: "top" } } },
					}),
				);
			});
			const spy = (engine as unknown as { setPriceAxisPosition?: unknown }).setPriceAxisPosition;
			// Old engine/mock without the API: nothing to assert (no crash is the contract).
			if (typeof spy === "function") {
				expect(spy).not.toHaveBeenCalled();
			}
		} finally {
			probe.cleanup();
		}
	});
});
