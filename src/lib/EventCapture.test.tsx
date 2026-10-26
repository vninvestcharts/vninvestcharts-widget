// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import React, { act } from "react";

// NOTE: no d3-selection mock here on purpose — nested dynamic imports inside
// vi.mock factories silently disable interception in this repo's vitest setup.
// Real pointer coordinates are asserted instead (clientX/clientY on the event).
let EventCapture: typeof import("./EventCapture").default;

beforeAll(async () => {
	({ default: EventCapture } = await import("./EventCapture"));
});

afterEach(() => {
	vi.clearAllMocks();
	vi.useRealTimers();
});

describe("EventCapture click handling", () => {
	it("uses pointer coordinates from the capture node for clicks", () => {
		vi.useFakeTimers();

		const onClick = vi.fn();
		const onDoubleClick = vi.fn();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		act(() => {
			root.render(
				<svg>
					<EventCapture
						onClick={onClick}
						onDoubleClick={onDoubleClick}
						pan={false}
						zoom={false}
						mouseMove={false}
						panSpeedMultiplier={1}
						focus={false}
						useCrossHairStyleCursor={false}
						width={640}
						height={320}
						xScale={vi.fn()}
						xAccessor={vi.fn()}
						disableInteraction={false}
						getAllPanConditions={vi.fn(() => ({ panEnabled: false, somethingSelected: false }))}
						onPinchZoomEnd={vi.fn()}
					/>
				</svg>
			);
		});

		const rect = container.querySelector("rect");
		expect(rect).not.toBeNull();

		const event = new MouseEvent("click", {
			bubbles: true,
			cancelable: true,
			clientX: 318,
			clientY: 271,
		});

		act(() => {
			rect!.dispatchEvent(event);
		});

		expect(onClick).toHaveBeenCalledWith([318, 271], expect.objectContaining({ nativeEvent: event }));
		expect(onDoubleClick).not.toHaveBeenCalled();

		act(() => {
			root.unmount();
		});
		document.body.removeChild(container);
		vi.runAllTimers();
	});

	it("suppresses pan on mousedown when a subscriber vetoes pan for the current event", () => {
		const onMouseDown = vi.fn();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		act(() => {
			root.render(
				<svg>
					<EventCapture
						onMouseDown={onMouseDown}
						pan={true}
						zoom={false}
						mouseMove={false}
						panSpeedMultiplier={1}
						focus={false}
						useCrossHairStyleCursor={true}
						width={640}
						height={320}
						xScale={vi.fn()}
						xAccessor={vi.fn()}
						chartConfig={[{ id: 1, origin: [0, 0], height: 320 }]}
						disableInteraction={false}
						getAllPanConditions={vi.fn(() => [{
							panEnabled: true,
							draggable: false,
							shouldDisablePanOnMouseDown: (event: MouseEvent) => event.ctrlKey,
						}])}
						onPinchZoomEnd={vi.fn()}
					/>
				</svg>
			);
		});

		const rect = container.querySelector("rect");
		expect(rect).not.toBeNull();

		const event = new MouseEvent("mousedown", {
			bubbles: true,
			cancelable: true,
			button: 0,
			ctrlKey: true,
		});
		Object.defineProperty(event, "currentTarget", { value: rect });

		act(() => {
			rect!.dispatchEvent(event);
		});

		expect(rect!.getAttribute("class")).toBe("vninvestcharts-widget-crosshair-cursor");
		expect(onMouseDown).toHaveBeenCalledTimes(1);

		act(() => {
			root.unmount();
		});
		document.body.removeChild(container);
	});
});

describe("EventCapture wheel coalescing (Z2)", () => {
	function renderZoomCapture(onZoom: ReturnType<typeof vi.fn>) {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		act(() => {
			root.render(
				<svg>
					<EventCapture
						onZoom={onZoom}
						pan={false}
						zoom={true}
						mouseMove={false}
						panSpeedMultiplier={1}
						focus={false}
						useCrossHairStyleCursor={false}
						width={640}
						height={320}
						xScale={vi.fn()}
						xAccessor={vi.fn()}
						disableInteraction={false}
						getAllPanConditions={vi.fn(() => ({ panEnabled: false, somethingSelected: false }))}
						onPinchZoomEnd={vi.fn()}
					/>
				</svg>
			);
		});

		const rect = container.querySelector("rect");
		expect(rect).not.toBeNull();
		return { container, root, rect: rect! };
	}

	function fireWheel(rect: Element, deltaY: number) {
		rect.dispatchEvent(new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true }));
	}

	it("fires exactly ONE onZoom per window for a fast burst (no stacked steps)", () => {
		vi.useFakeTimers();
		const onZoom = vi.fn();
		const { container, root, rect } = renderZoomCapture(onZoom);

		fireWheel(rect, 120);
		fireWheel(rect, 120);
		fireWheel(rect, 120);
		expect(onZoom).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(30);
		});

		// Scroll down (deltaY > 0) → zoomDir 1 = zoom out (legacy mapping locked).
		expect(onZoom).toHaveBeenCalledTimes(1);
		expect(onZoom.mock.calls[0][0]).toBe(1);

		act(() => {
			vi.advanceTimersByTime(100);
			root.unmount();
		});
		document.body.removeChild(container);
	});

	it("still delivers a single slow scroll as one zoom-out/in with the right direction", () => {
		vi.useFakeTimers();
		const onZoom = vi.fn();
		const { container, root, rect } = renderZoomCapture(onZoom);

		fireWheel(rect, -120);
		act(() => {
			vi.advanceTimersByTime(30);
		});

		expect(onZoom).toHaveBeenCalledTimes(1);
		expect(onZoom.mock.calls[0][0]).toBe(-1);

		act(() => {
			root.unmount();
		});
		document.body.removeChild(container);
	});
});