// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type EngineOverlayInputs,
	type PaneRuntimeSnapshot,
	resolvePanePixelAtDataIndex,
	resolvePanePixelAtValue,
} from "@vninvestcharts/engine-core";

import { VNInvestCharts } from "../VNInvestCharts";
import { DEFAULT_PANES } from "../../lib/core";
import { computePaneScaleSlotDomains } from "../../lib/core/paneScaleSlotDomains";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
console.error = (..._args: unknown[]) => {};

vi.mock("../../lib/core/hooks/useCanvasResize", () => {
	const ref = { current: null as HTMLDivElement | null };
	return {
		useCanvasResize: () => ({
			ref,
			size: { width: 1200, height: 720 },
		}),
	};
});

const forkEngineSnapshots = [
	{
		paneId: "price",
		bounds: { left: 0, top: 0, width: 1200, height: 420 },
		plotBounds: { left: 0, top: 28, width: 1200, height: 392 },
		axisBounds: {
			right: { left: 1152, top: 0, width: 48, height: 420 },
		},
		headerAnchor: { left: 0, top: 0, width: 1200 },
		labelAnchor: { left: 0, top: 0, height: 420 },
		scaleSlotBounds: { "price-right": { left: 1152, top: 0, width: 48, height: 420 } },
		scaleSlotStates: { "price-right": { side: "right", mode: "auto", visible: true, domain: [98, 107] } },
	},
] as const;

const mockVisibleRange = { from: 0, to: 5 };

type MockEngineHostPointerContext = {
	paneId: string | null;
	clientX: number;
	clientY: number;
	localX: number;
	localY: number;
	pointerType: string;
	buttons: number;
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
};

const mockEngineInstance = {
	mount: vi.fn(),
	dispose: vi.fn(),
	setPaneSpecs: vi.fn(),
	setDataSource: vi.fn(),
	setEnrichedData: vi.fn(),
	setHistorySnapshot: vi.fn(),
	setCameraState: vi.fn(),
	setOverlayInputs: vi.fn(),
	getCameraState: vi.fn(() => ({ barSpacePx: 8, rightOffsetBars: 0, followLatest: true })),
	getDirtyMask: vi.fn(() => 0),
	getLastFlushedMask: vi.fn(() => 0),
	getAxisGridRendererCalls: vi.fn(() => 0),
	resetAxisGridRendererCalls: vi.fn(),
	isMounted: vi.fn(() => true),
	addListener: vi.fn(),
	removeListener: vi.fn(),
	setTheme: vi.fn(),
	setLocale: vi.fn(),
	setVisibleRange: vi.fn(),
	zoomToRange: vi.fn(),
	getVisibleRange: vi.fn(() => mockVisibleRange),
	getPaneSnapshots: vi.fn(() => forkEngineSnapshots),
	hitTestDrawingPrimitive: vi.fn(() => null),
};

function createMockForkOverlayState(overrides?: {
	crosshair?: { x: number; y: number; paneId: string | null; dataIndex: number | null } | null;
	hoveredPaneId?: string | null;
	hoveredDataIndex?: number | null;
}, overlayInputs?: EngineOverlayInputs) {
	return {
		crosshair: overrides?.crosshair ?? null,
		hoveredPaneId: overrides?.hoveredPaneId ?? null,
		hoveredDataIndex: overrides?.hoveredDataIndex ?? null,
		xAxisTicks: [
			{ key: "volume-0", x: 120, dataIndex: 0 },
			{ key: "volume-1", x: 1080, dataIndex: 1 },
		],
		drawingPrimitives: overlayInputs?.drawingPrimitives?.map((primitive) => ({
			key: primitive.key,
			paneId: primitive.paneId,
			scaleSlotId: primitive.scaleSlotId,
			primitive: primitive.primitive,
			selected: primitive.selected,
			drawingId: primitive.drawingId,
			actionHandle: primitive.actionHandle,
			clipToPane: primitive.clipToPane,
		})) ?? [],
	};
}

vi.mock("@vninvestcharts/engine-react", async (importOriginal) => {
	const React = await import("react");
	const actual = await importOriginal() as Record<string, unknown>;

	return {
		...actual,
		EngineHost(props: {
			className?: string;
			locale?: string;
			overlayInputs?: EngineOverlayInputs;
			onOverlayStateChange?: (overlayState: ReturnType<typeof createMockForkOverlayState>) => void;
			onEngineReady?: (engine: unknown) => void;
			onPaneHover?: (paneId: string | null) => void;
			onPaneSnapshotsChange?: (snapshots: readonly unknown[]) => void;
			onClick?: (context: MockEngineHostPointerContext) => void;
			onPointerDown?: (context: MockEngineHostPointerContext) => void;
			onPointerMove?: (context: MockEngineHostPointerContext) => void;
			onPointerUp?: (context: MockEngineHostPointerContext) => void;
			onVisibleRangeChange?: (range: { from: number; to: number }) => void;
			style?: React.CSSProperties;
		}) {
			React.useEffect(() => {
				props.onEngineReady?.(mockEngineInstance);
				props.onPaneSnapshotsChange?.(forkEngineSnapshots);
				props.onVisibleRangeChange?.(mockVisibleRange);
			}, []);

			const resolvePointerContext = (
				event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
			): MockEngineHostPointerContext => {
				const rect = event.currentTarget.getBoundingClientRect();
				const localX = event.clientX - rect.left;
				const localY = event.clientY - rect.top;

				return {
					paneId: "price",
					clientX: event.clientX,
					clientY: event.clientY,
					localX,
					localY,
					pointerType: "pointerType" in event ? event.pointerType : "mouse",
					buttons: "buttons" in event ? event.buttons : 0,
					altKey: event.altKey,
					ctrlKey: event.ctrlKey,
					metaKey: event.metaKey,
					shiftKey: event.shiftKey,
				};
			};

			return (
				<div
					data-vn-kline-engine-host="true"
					className={props.className}
					style={props.style}
					onClick={(event) => {
						props.onClick?.(resolvePointerContext(event));
					}}
					onPointerDown={(event) => {
						props.onPointerDown?.(resolvePointerContext(event));
					}}
					onPointerMove={(event) => {
						props.onPointerMove?.(resolvePointerContext(event));
					}}
					onPointerUp={(event) => {
						props.onPointerUp?.(resolvePointerContext(event));
					}}
				>
					<div data-vn-kline-engine="surface" data-locale={props.locale}>
						{props.locale}
					</div>
				</div>
			);
		},
	};
});

function createAdapter(fetchBarsPromise: Promise<any[]>, label: string) {
	return {
		fetchBarsInRange: vi.fn().mockReturnValue(fetchBarsPromise),
		fetchBarsBefore: vi.fn().mockResolvedValue([]),
		fetchBars: vi.fn().mockReturnValue(fetchBarsPromise),
		fetchMoreBars: vi.fn().mockResolvedValue([]),
		subscribeToBar: vi.fn().mockReturnValue(() => {}),
		subscribeToTrades: vi.fn().mockReturnValue(() => {}),
		subscribeToOrderbook: vi.fn().mockReturnValue(() => {}),
		searchSymbols: vi.fn().mockResolvedValue([]),
		label,
	};
}

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

const forkRuntimeData = [
	{ date: new Date("2024-01-01T09:00:00Z"), open: 100, high: 105, low: 98, close: 103, volume: 1200, index: 0, dataIndex: 0 },
	{ date: new Date("2024-01-01T10:00:00Z"), open: 103, high: 107, low: 101, close: 106, volume: 1500, index: 1, dataIndex: 1 },
	{ date: new Date("2024-01-01T11:00:00Z"), open: 104, high: 108, low: 102, close: 105, volume: 1600, index: 2, dataIndex: 2 },
	{ date: new Date("2024-01-01T12:00:00Z"), open: 105, high: 109, low: 103, close: 106, volume: 1700, index: 3, dataIndex: 3 },
	{ date: new Date("2024-01-01T13:00:00Z"), open: 106, high: 110, low: 104, close: 107, volume: 1800, index: 4, dataIndex: 4 },
];

describe("VNInvestCharts Floating Draggable Drawing Inspector Dialog", () => {
	let container: HTMLDivElement | null = null;
	let root: any = null;

	beforeEach(() => {
		vi.useFakeTimers();
		window.localStorage.clear();
		document.documentElement.lang = "vi";
		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		if (root) {
			await act(async () => {
				root.unmount();
			});
		}
		root = null;
		container?.remove();
		container = null;
		window.localStorage.clear();
		vi.useRealTimers();
	});

	afterAll(() => {
		console.error = originalConsoleError;
	});

	it("renders floating inspector and handles dragging & closing", async () => {
		const adapter = createAdapter(Promise.resolve([]), "floating-inspector-test");
		const handleDrawingWorkspaceChange = vi.fn();
		const handleDrawingsChange = vi.fn();

		await act(async () => {
			root.render(
				<VNInvestCharts
					adapter={adapter as any}
					data={forkRuntimeData as any}
					engineRuntime="fork"
					drawingUiEnabled
					drawingActiveTool="trendLine"
					onDrawingWorkspaceChange={handleDrawingWorkspaceChange}
					onDrawingsChange={handleDrawingsChange}
				/>
			);
			await flushMicrotasks();
		});

		const host = await vi.waitFor(() => {
			const el = container?.querySelector('[data-vn-kline-engine-host="true"]') as HTMLDivElement | null;
			if (!el) throw new Error("engine host not ready");
			return el;
		});

		Object.defineProperty(host, "getBoundingClientRect", {
			configurable: true,
			value: () => ({
				bottom: 720,
				height: 720,
				left: 0,
				right: 1200,
				top: 0,
				width: 1200,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			}),
		});

		const PointerEventCtor = window.PointerEvent ?? window.MouseEvent;

		// 1. Draw a trend line: click P1, move to P2, click P2
		await act(async () => {
			host.dispatchEvent(new PointerEventCtor("pointerdown", { bubbles: true, clientX: 100, clientY: 100, buttons: 1 }));
			host.dispatchEvent(new PointerEventCtor("pointerup", { bubbles: true, clientX: 100, clientY: 100 }));
			host.dispatchEvent(new PointerEventCtor("click", { bubbles: true, clientX: 100, clientY: 100 }));
			await flushMicrotasks();
		});

		await act(async () => {
			host.dispatchEvent(new PointerEventCtor("pointermove", { bubbles: true, clientX: 200, clientY: 200 }));
			await flushMicrotasks();
		});

		await act(async () => {
			host.dispatchEvent(new PointerEventCtor("pointerdown", { bubbles: true, clientX: 200, clientY: 200, buttons: 1 }));
			host.dispatchEvent(new PointerEventCtor("pointerup", { bubbles: true, clientX: 200, clientY: 200 }));
			host.dispatchEvent(new PointerEventCtor("click", { bubbles: true, clientX: 200, clientY: 200 }));
			await flushMicrotasks();
		});

		// Retrieve workspace controller
		const workspace = await vi.waitFor(() => {
			const latest = handleDrawingWorkspaceChange.mock.calls.flat().find((w: any) => w && typeof w.openDock === "function");
			if (!latest) throw new Error("workspace not ready");
			return latest;
		});

		// 2. Open properties dock
		await act(async () => {
			workspace.openDock("properties");
			await flushMicrotasks();
		});

		// 3. Assert Floating Inspector Dialog is rendered
		const dialog = await vi.waitFor(() => {
			const el = container?.querySelector('[data-testid="floating-inspector"]') as HTMLDivElement | null;
			if (!el) throw new Error("floating inspector dialog not rendered");
			return el;
		});
		expect(dialog).not.toBeNull();

		// 4. Test dragging
		const header = dialog.querySelector(".vnsc-floating-inspector-header") as HTMLDivElement;
		expect(header).not.toBeNull();

		// Mock setPointerCapture/releasePointerCapture
		header.setPointerCapture = vi.fn();
		header.releasePointerCapture = vi.fn();

		Object.defineProperty(dialog, "getBoundingClientRect", {
			configurable: true,
			value: () => ({
				width: 320,
				height: 400,
				top: 60,
				left: 80,
			}),
		});

		if (dialog.parentElement) {
			Object.defineProperty(dialog.parentElement, "getBoundingClientRect", {
				configurable: true,
				value: () => ({
					bottom: 720,
					height: 720,
					left: 0,
					right: 1200,
					top: 0,
					width: 1200,
					x: 0,
					y: 0,
					toJSON: () => ({}),
				}),
			});
		}

		await act(async () => {
			header.dispatchEvent(new PointerEventCtor("pointerdown", {
				bubbles: true,
				clientX: 90,
				clientY: 70,
				buttons: 1,
			}));
			await flushMicrotasks();
		});

		await act(async () => {
			header.dispatchEvent(new PointerEventCtor("pointermove", {
				bubbles: true,
				clientX: 140, // dragged +50px
				clientY: 100, // dragged +30px
			}));
			await flushMicrotasks();
		});

		await act(async () => {
			header.dispatchEvent(new PointerEventCtor("pointerup", {
				bubbles: true,
				clientX: 140,
				clientY: 100,
			}));
			await flushMicrotasks();
		});

		// Dialog position should shift
		expect(dialog.style.left).toBe("130px"); // 80 + 50
		expect(dialog.style.top).toBe("90px");  // 60 + 30

		// 5. Test close button
		const closeBtn = dialog.querySelector('[data-testid="floating-inspector-close"]') as HTMLButtonElement;
		expect(closeBtn).not.toBeNull();

		await act(async () => {
			closeBtn.dispatchEvent(new PointerEventCtor("pointerdown", { bubbles: true }));
			closeBtn.dispatchEvent(new PointerEventCtor("pointerup", { bubbles: true }));
			closeBtn.click();
			await flushMicrotasks();
		});

		// Dialog should be hidden
		expect(container?.querySelector('[data-testid="floating-inspector"]')).toBeNull();
	});
});
