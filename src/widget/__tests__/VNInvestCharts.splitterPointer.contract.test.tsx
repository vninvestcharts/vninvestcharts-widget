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
	{
		paneId: "volume",
		bounds: { left: 0, top: 420, width: 1200, height: 180 },
		plotBounds: { left: 0, top: 448, width: 1200, height: 152 },
		axisBounds: {
			right: { left: 1152, top: 420, width: 48, height: 180 },
		},
		headerAnchor: { left: 0, top: 420, width: 1200 },
		labelAnchor: { left: 0, top: 420, height: 180 },
		scaleSlotBounds: { "volume-right": { left: 1152, top: 420, width: 48, height: 180 } },
		scaleSlotStates: { "volume-right": { side: "right", mode: "auto", visible: true, domain: [1200, 1500] } },
	},
] as const;
const engineHostPropsHistory: Array<Record<string, unknown>> = [];
let mockVisibleRange = { from: 0, to: 2 };

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

function mergeTestPaneSnapshotDomains(data: readonly Record<string, unknown>[]) {
	const scaleSlotDomains = computePaneScaleSlotDomains(
		DEFAULT_PANES.filter((pane) => pane.visible),
		data as never,
	);

	return forkEngineSnapshots.map((snapshot) => {
		const scaleSlotStates = Object.fromEntries(
			Object.entries(snapshot.scaleSlotStates).map(([scaleSlotId, state]) => [scaleSlotId, {
				...state,
				domain: scaleSlotDomains[scaleSlotId] ?? state.domain,
			}]),
		);

		return {
			...snapshot,
			scaleSlotStates,
		} satisfies PaneRuntimeSnapshot;
	});
}

function resolveTrendLinePointPixel(
	data: readonly { date: Date }[],
	visibleRange: { from: number; to: number },
	dataIndex: number,
	price: number,
) {
	const priceSnapshot = mergeTestPaneSnapshotDomains(data).find((snapshot) => snapshot.paneId === "price");
	if (!priceSnapshot) {
		return null;
	}

	const x = resolvePanePixelAtDataIndex(priceSnapshot, visibleRange, dataIndex + 0.5, data.length);
	const y = resolvePanePixelAtValue(priceSnapshot, "price-right", price);
	if (x === null || y === null) {
		return null;
	}

	return {
		x: Math.round(x),
		y: Math.round(y),
	};
}

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

function resolveMockForkHoveredPaneId(localX: number, localY: number) {
	const hoveredSnapshot = forkEngineSnapshots.find((snapshot) => {
		const right = snapshot.bounds.left + snapshot.bounds.width;
		const bottom = snapshot.bounds.top + snapshot.bounds.height;
		return localX >= snapshot.bounds.left && localX <= right && localY >= snapshot.bounds.top && localY <= bottom;
	});

	return hoveredSnapshot?.paneId ?? null;
}

function resolveMockForkHoveredDataIndex(localX: number, localY: number) {
	const hoveredSnapshot = forkEngineSnapshots.find((snapshot) => {
		const right = snapshot.plotBounds.left + snapshot.plotBounds.width;
		const bottom = snapshot.plotBounds.top + snapshot.plotBounds.height;
		return localX >= snapshot.plotBounds.left && localX <= right && localY >= snapshot.plotBounds.top && localY <= bottom;
	});

	if (!hoveredSnapshot) {
		return null;
	}

	const ratio = (localX - hoveredSnapshot.plotBounds.left) / Math.max(1, hoveredSnapshot.plotBounds.width);
	const dataIndex = Math.round(mockVisibleRange.from + ratio * (mockVisibleRange.to - mockVisibleRange.from));
	return Math.min(mockVisibleRange.to, Math.max(mockVisibleRange.from, dataIndex));
}

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
			engineHostPropsHistory.push(props as unknown as Record<string, unknown>);
			const lastInputsRef = React.useRef("");
			const currentInputsKey = JSON.stringify({
				measurementEnabled: props.overlayInputs?.measurementEnabled,
				selectedPriceLabels: props.overlayInputs?.selectedPriceLabels ? {
					drawingId: props.overlayInputs.selectedPriceLabels.drawingId,
					highlighted: props.overlayInputs.selectedPriceLabels.highlighted,
				} : null,
				primitives: props.overlayInputs?.drawingPrimitives?.map(p => p.key) ?? [],
			});

			React.useEffect(() => {
				props.onEngineReady?.(mockEngineInstance);
				props.onPaneSnapshotsChange?.(forkEngineSnapshots);
				props.onVisibleRangeChange?.(mockVisibleRange);
			}, []);

			React.useEffect(() => {
				if (lastInputsRef.current === currentInputsKey) {
					return;
				}
				lastInputsRef.current = currentInputsKey;
				props.onOverlayStateChange?.(createMockForkOverlayState(undefined, props.overlayInputs));
			}, [props.overlayInputs, props.onOverlayStateChange, currentInputsKey]);

			const resolvePointerContext = (
				event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
			): MockEngineHostPointerContext => {
				const rect = event.currentTarget.getBoundingClientRect();
				const localX = event.clientX - rect.left;
				const localY = event.clientY - rect.top;

				return {
					paneId: resolveMockForkHoveredPaneId(localX, localY),
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

			const emitPaneHover = (event: React.PointerEvent<HTMLDivElement>) => {
				const pointerContext = resolvePointerContext(event);
				const hoveredPaneId = pointerContext.paneId;
				const hoveredDataIndex = resolveMockForkHoveredDataIndex(pointerContext.localX, pointerContext.localY);
				props.onPaneHover?.(hoveredPaneId);
				props.onOverlayStateChange?.(createMockForkOverlayState({
					crosshair: hoveredPaneId
						? { x: pointerContext.localX, y: pointerContext.localY, paneId: hoveredPaneId, dataIndex: hoveredDataIndex }
						: null,
					hoveredPaneId,
					hoveredDataIndex,
				}, props.overlayInputs));
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
						emitPaneHover(event);
						props.onPointerMove?.(resolvePointerContext(event));
					}}
					onPointerUp={(event) => {
						props.onPointerUp?.(resolvePointerContext(event));
					}}
				>
					<div data-vn-kline-engine="surface" data-locale={props.locale}>
						<canvas data-vn-kline-engine="canvas" width={600} height={320} />
					</div>
				</div>
			);
		},
	};
});

function createAdapter(fetchBarsPromise: Promise<any[]>, label: string) {
	const fetchBarsInRange = vi.fn().mockReturnValue(fetchBarsPromise);
	const fetchBarsBefore = vi.fn().mockResolvedValue([]);
	return {
		fetchBarsInRange,
		fetchBarsBefore,
		fetchBars: fetchBarsInRange,
		fetchMoreBars: fetchBarsBefore,
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

async function waitForTruthyValue<T>(resolveValue: () => T | undefined, attempts = 6) {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const value = resolveValue();
		if (value) {
			return value;
		}
		await act(async () => {
			await flushMicrotasks();
		});
	}

	throw new Error("Expected truthy value before timeout");
}

const forkRuntimeData = [
	{
		date: new Date("2024-01-01T09:00:00Z"),
		open: 100,
		high: 105,
		low: 98,
		close: 103,
		volume: 1200,
		index: 0,
		dataIndex: 0,
	},
	{
		date: new Date("2024-01-01T10:00:00Z"),
		open: 103,
		high: 107,
		low: 101,
		close: 106,
		volume: 1500,
		index: 1,
		dataIndex: 1,
	},
];

describe("VNInvestCharts pane splitter pointer arbitration", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		mockVisibleRange = { from: 0, to: 2 };
		engineHostPropsHistory.length = 0;
	});

	afterEach(async () => {
		await act(async () => {
			await flushMicrotasks();
			root?.unmount();
			await flushMicrotasks();
		});
		root = null;
		container?.remove();
		container = null;
		window.localStorage.clear();
		document.documentElement.lang = "en";
	});

	afterAll(() => {
		console.error = originalConsoleError;
	});

	it("suppresses fork drawing authoring while a pane splitter owns the pointer stream", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-splitter-pointer-arbitration");
		const handleDrawingsChange = vi.fn();
		const handleDrawingWorkspaceChange = vi.fn();

		const authoringData = [
			...forkRuntimeData,
			{
				date: new Date("2024-01-01T11:00:00Z"),
				open: 104,
				high: 107,
				low: 102,
				close: 105,
				volume: 1400,
				index: 2,
				dataIndex: 2,
			},
			{
				date: new Date("2024-01-01T12:00:00Z"),
				open: 105,
				high: 108,
				low: 103,
				close: 106,
				volume: 1500,
				index: 3,
				dataIndex: 3,
			},
		];

		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={authoringData as never}
					engineRuntime="fork"
					drawingUiEnabled
					onDrawingWorkspaceChange={handleDrawingWorkspaceChange}
					onDrawingsChange={handleDrawingsChange}
					renderPaneSplitter={({ pane, splitterIndex, top }) => (
						<div
							key={`${pane.id}-splitter`}
							data-pane-splitter={splitterIndex}
							data-pane-splitter-top={String(top)}
							style={{ position: "absolute", left: 0, right: 0, top, height: 8, pointerEvents: "auto" }}
						/>
					)}
				/>,
			);
			await flushMicrotasks();
		});

		const workspace = await waitForTruthyValue(() => handleDrawingWorkspaceChange.mock.calls
			.map((call) => call[0] as { setActiveTool?: (tool: string) => void } | null)
			.find((value) => value && typeof value.setActiveTool === "function") ?? undefined);

		await act(async () => {
			workspace.setActiveTool?.("trendLine");
			await flushMicrotasks();
		});

		const host = await waitForTruthyValue(() => container?.querySelector('[data-vn-kline-engine-host="true"]') as HTMLDivElement | null);
		const splitterOwner = await waitForTruthyValue(() => container?.querySelector('[data-rsc-fork-pointer-owner="pane-splitter"]') as HTMLDivElement | null);
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

		const startPoint = resolveTrendLinePointPixel(authoringData, mockVisibleRange, 0, 100);
		const endPoint = resolveTrendLinePointPixel(authoringData, mockVisibleRange, 2, 105);
		if (!startPoint || !endPoint) {
			throw new Error("Expected deterministic fork trend-line authoring points");
		}

		const PointerEventCtor = window.PointerEvent ?? window.MouseEvent;
		await act(async () => {
			splitterOwner.dispatchEvent(new PointerEventCtor("pointerdown", {
				bubbles: true,
				clientX: 400,
				clientY: 420,
			}));
			host.dispatchEvent(new PointerEventCtor("pointerdown", {
				bubbles: true,
				buttons: 1,
				clientX: startPoint.x,
				clientY: startPoint.y,
			}));
			host.dispatchEvent(new PointerEventCtor("pointerup", {
				bubbles: true,
				clientX: startPoint.x,
				clientY: startPoint.y,
			}));
			host.dispatchEvent(new MouseEvent("click", {
				bubbles: true,
				clientX: startPoint.x,
				clientY: startPoint.y,
			}));
			host.dispatchEvent(new PointerEventCtor("pointermove", {
				bubbles: true,
				clientX: endPoint.x,
				clientY: endPoint.y,
			}));
			host.dispatchEvent(new PointerEventCtor("pointerdown", {
				bubbles: true,
				buttons: 1,
				clientX: endPoint.x,
				clientY: endPoint.y,
			}));
			host.dispatchEvent(new PointerEventCtor("pointerup", {
				bubbles: true,
				clientX: endPoint.x,
				clientY: endPoint.y,
			}));
			host.dispatchEvent(new MouseEvent("click", {
				bubbles: true,
				clientX: endPoint.x,
				clientY: endPoint.y,
			}));
			await flushMicrotasks();
		});

		expect(handleDrawingsChange.mock.calls.some((call) => {
			const drawings = call[0] as Array<{ type?: string }> | undefined;
			return Array.isArray(drawings) && drawings.some((drawing) => drawing.type === "trendLine");
		})).toBe(false);

		await act(async () => {
			splitterOwner.dispatchEvent(new PointerEventCtor("pointerup", {
				bubbles: true,
				clientX: 400,
				clientY: 420,
			}));
			host.dispatchEvent(new PointerEventCtor("pointerdown", {
				bubbles: true,
				buttons: 1,
				clientX: startPoint.x,
				clientY: startPoint.y,
			}));
			host.dispatchEvent(new PointerEventCtor("pointerup", {
				bubbles: true,
				clientX: startPoint.x,
				clientY: startPoint.y,
			}));
			host.dispatchEvent(new MouseEvent("click", {
				bubbles: true,
				clientX: startPoint.x,
				clientY: startPoint.y,
			}));
			host.dispatchEvent(new PointerEventCtor("pointermove", {
				bubbles: true,
				clientX: endPoint.x,
				clientY: endPoint.y,
			}));
			host.dispatchEvent(new PointerEventCtor("pointerdown", {
				bubbles: true,
				buttons: 1,
				clientX: endPoint.x,
				clientY: endPoint.y,
			}));
			host.dispatchEvent(new PointerEventCtor("pointerup", {
				bubbles: true,
				clientX: endPoint.x,
				clientY: endPoint.y,
			}));
			host.dispatchEvent(new MouseEvent("click", {
				bubbles: true,
				clientX: endPoint.x,
				clientY: endPoint.y,
			}));
			await flushMicrotasks();
		});

		const createdDrawings = await waitForTruthyValue(() => handleDrawingsChange.mock.calls
			.map((call) => call[0] as Array<{ type: string }> | undefined)
			.findLast((value) => value?.length === 1 && value[0]?.type === "trendLine"));

		expect(createdDrawings[0]?.type).toBe("trendLine");
	});
});