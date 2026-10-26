// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Component, type ReactNode } from "react";

import { ChartRenderContext, type ChartRenderContextValue, useChartRenderContext } from "../canvas/ChartRenderContext";
import { OverlayCanvas } from "../canvas/OverlayCanvas";
import { WhaleBubbleOverlay, type WhaleEvent } from "../../indicators/overlays/WhaleBubbleOverlay";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

let act: typeof import("react").act;
let createRoot: typeof import("react-dom/client").createRoot;

beforeAll(async () => {
	({ act } = await import("react"));
	({ createRoot } = await import("react-dom/client"));
});

type SampleBar = {
	date: Date;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
};

function createBars(count: number, startDate = new Date("2026-01-01T00:00:00.000Z")): SampleBar[] {
	return Array.from({ length: count }, (_unused, index) => {
		const date = new Date(startDate.getTime() + index * 24 * 60 * 60 * 1000);
		const open = 100 + index;
		const close = open + (index % 2 === 0 ? 3 : -2);
		return {
			date,
			open,
			high: Math.max(open, close) + 2,
			low: Math.min(open, close) - 2,
			close,
			volume: 1_000 + index * 10,
		};
	});
}

function createCanvasContextMock() {
	return {
		canvas: { width: 0, height: 0 },
		setTransform: vi.fn(),
		clearRect: vi.fn(),
		scale: vi.fn(),
		save: vi.fn(),
		restore: vi.fn(),
		translate: vi.fn(),
		rect: vi.fn(),
		clip: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		fillRect: vi.fn(),
		strokeRect: vi.fn(),
		setLineDash: vi.fn(),
		closePath: vi.fn(),
		beginPath: vi.fn(),
		arc: vi.fn(),
		fill: vi.fn(),
		stroke: vi.fn(),
		fillText: vi.fn(),
		set fillStyle(_value: string) {
			void _value;
		},
		set strokeStyle(_value: string) {
			void _value;
		},
		set lineWidth(_value: number) {
			void _value;
		},
		set font(_value: string) {
			void _value;
		},
		set textAlign(_value: string) {
			void _value;
		},
		set textBaseline(_value: string) {
			void _value;
		},
	};
}

function createRenderContext(overrides: Partial<ChartRenderContextValue> = {}): ChartRenderContextValue {
	const bars = createBars(3);
	return {
		xScale: (value: Date | number) => value instanceof Date ? value.getTime() / 1000 : value,
		yScale: (value: number) => value * 2,
		plotData: bars,
		candleWidth: 12,
		devicePixelRatio: 2,
		visibleRange: {
			startIndex: 0,
			endIndex: 2,
			startDate: bars[0]?.date ?? new Date(0),
			endDate: bars[2]?.date ?? new Date(0),
			timeRange: { from: bars[0]?.date.getTime() ?? 0, to: bars[2]?.date.getTime() ?? 0 },
			barCount: 3,
		},
		width: 480,
		height: 280,
		...overrides,
	};
}

describe("Gap 2 — canvas overlay system", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;
	let getContextSpy: any = null;
	let canvasContext: ReturnType<typeof createCanvasContextMock>;
	let consoleErrorSpy: any;

	beforeEach(() => {
		canvasContext = createCanvasContextMock();
		getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => canvasContext as never);
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root?.unmount();
		root = null;
		container?.remove();
		container = null;
		getContextSpy?.mockRestore();
		getContextSpy = null;
		consoleErrorSpy.mockRestore();
	});

	afterAll(() => {
		void 0;
	});

	it("renders inside the chart render context and calls draw", async () => {
		const draw = vi.fn();
		const contextValue = createRenderContext();

		await act(async () => {
			root?.render(
				<ChartRenderContext.Provider value={contextValue}>
					<OverlayCanvas draw={draw} />
				</ChartRenderContext.Provider>,
			);
		});

		expect(draw).toHaveBeenCalledTimes(1);
		expect(draw).toHaveBeenCalledWith(expect.objectContaining({
			ctx: canvasContext,
			width: 480,
			height: 280,
			candleWidth: 12,
			devicePixelRatio: 2,
		}));
	});

	it("throws when useChartRenderContext is used outside the provider", async () => {
		let caughtError: Error | null = null;

		class Boundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
			state = { hasError: false };

			static getDerivedStateFromError() {
				return { hasError: true };
			}

			componentDidCatch(error: Error) {
				caughtError = error;
			}

			render() {
				return this.state.hasError ? <div>fallback</div> : this.props.children;
			}
		}

		function Probe() {
			useChartRenderContext();
			return <div />;
		}

		await act(async () => {
			root?.render(<Boundary><Probe /></Boundary>);
		});

		expect(caughtError).not.toBeNull();
		if (!caughtError) {
			throw new Error("Expected useChartRenderContext to throw outside the provider");
		}
		expect((caughtError as Error).message).toMatch(/useChartRenderContext/);
	});

	it("keeps the overlay canvas pointer-events disabled", async () => {
		const draw = vi.fn();
		const contextValue = createRenderContext();

		await act(async () => {
			root?.render(
				<ChartRenderContext.Provider value={contextValue}>
					<OverlayCanvas draw={draw} zIndex={7} />
				</ChartRenderContext.Provider>,
			);
		});

		const canvas = container?.querySelector("canvas");
		expect(canvas?.style.pointerEvents).toBe("none");
	});

	it("logs draw errors without rethrowing them", async () => {
		const draw = vi.fn(() => {
			throw new Error("draw boom");
		});
		const contextValue = createRenderContext();

		await act(async () => {
			root?.render(
				<ChartRenderContext.Provider value={contextValue}>
					<OverlayCanvas draw={draw} />
				</ChartRenderContext.Provider>,
			);
		});

		expect(consoleErrorSpy).toHaveBeenCalledWith("OverlayCanvas draw failed:", expect.any(Error));
	});

	it("renders whale bubbles for matching events", async () => {
		const contextValue = createRenderContext();
		const events: readonly WhaleEvent[] = [
			{ ts: new Date("2026-01-01T00:00:00.000Z"), price: 101, side: "BUY", matchedValue: 8_000_000_000, severity: "HIGH" },
			{ ts: new Date("2026-01-03T00:00:00.000Z"), price: 103, side: "SELL", matchedValue: 15_000_000_000, severity: "EXTREME" },
		];

		await act(async () => {
			root?.render(
				<ChartRenderContext.Provider value={contextValue}>
					<WhaleBubbleOverlay events={events} />
				</ChartRenderContext.Provider>,
			);
		});

		expect(canvasContext.arc).toHaveBeenCalledTimes(2);
		expect(canvasContext.fillText).toHaveBeenCalledWith("▼", expect.any(Number), expect.any(Number));
	});

	it("skips whale events without matching bars", async () => {
		const contextValue = createRenderContext();
		const events: readonly WhaleEvent[] = [
			{ ts: new Date("1900-01-01T00:00:00.000Z"), price: 50, side: "BUY", matchedValue: 9_000_000_000, severity: "HIGH" },
		];

		await act(async () => {
			root?.render(
				<ChartRenderContext.Provider value={contextValue}>
					<WhaleBubbleOverlay events={events} />
				</ChartRenderContext.Provider>,
			);
		});

		expect(canvasContext.arc).not.toHaveBeenCalled();
	});

	it("scales extreme whale bubbles and labels them", async () => {
		const contextValue = createRenderContext();
		const events: readonly WhaleEvent[] = [
			{ ts: new Date("2026-01-02T00:00:00.000Z"), price: 102, side: "BUY", matchedValue: 20_000_000_000, severity: "EXTREME" },
		];

		await act(async () => {
			root?.render(
				<ChartRenderContext.Provider value={contextValue}>
					<WhaleBubbleOverlay events={events} />
				</ChartRenderContext.Provider>,
			);
		});

		expect(canvasContext.arc).toHaveBeenCalledTimes(1);
		expect(canvasContext.arc).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.any(Number), 0, Math.PI * 2);
		expect(canvasContext.fillText).toHaveBeenCalledWith("▲", expect.any(Number), expect.any(Number));
	});
});
