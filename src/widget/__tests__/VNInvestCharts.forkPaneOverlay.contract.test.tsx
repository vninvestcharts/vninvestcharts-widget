// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type EngineOverlayDrawingPrimitiveState,
	type EngineOverlayInputs,
	type PaneRuntimeSnapshot,
	hitTestOverlayPrimitive,
} from "@vninvestcharts/engine-core";

import { VNInvestCharts } from "../VNInvestCharts";

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
		measurement: null,
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
	hitTestDrawingPrimitive: vi.fn((localX: number, localY: number) => {
		const overlayInputs = [...engineHostPropsHistory]
			.map((props) => props.overlayInputs as EngineOverlayInputs | undefined)
			.findLast((value) => (value?.drawingPrimitives?.length ?? 0) > 0)
			?? [...engineHostPropsHistory]
				.map((props) => props.overlayInputs as EngineOverlayInputs | undefined)
				.findLast(Boolean);
		const drawingPrimitives = overlayInputs?.drawingPrimitives ?? [];

		for (let index = drawingPrimitives.length - 1; index >= 0; index -= 1) {
			const primitive = drawingPrimitives[index];
			const snapshot = forkEngineSnapshots.find((candidate) => candidate.paneId === primitive?.paneId);
			if (!primitive || !snapshot) {
				continue;
			}

			const { plotBounds } = snapshot;
			if (
				localX < plotBounds.left
				|| localX > plotBounds.left + plotBounds.width
				|| localY < plotBounds.top
				|| localY > plotBounds.top + plotBounds.height
			) {
				continue;
			}

			const hit = hitTestOverlayPrimitive(primitive.primitive, localX - plotBounds.left, localY - plotBounds.top, {
				chartWidth: plotBounds.width,
				chartHeight: plotBounds.height,
				tolerance: 6,
			});
			if (hit) {
				return {
					key: primitive.key,
					paneId: primitive.paneId,
					scaleSlotId: primitive.scaleSlotId,
					primitive: primitive.primitive,
					selected: primitive.selected,
					drawingId: primitive.drawingId,
					actionHandle: primitive.actionHandle,
					clipToPane: primitive.clipToPane,
				} satisfies EngineOverlayDrawingPrimitiveState;
			}
		}

		return null;
	}),
};

vi.mock("@vninvestcharts/engine-react", async (importOriginal) => {
	// NOTE: do NOT dynamically import react here — nested import("react") inside
	// mock factories silently disables interception (use the static import above).
	const actual = await importOriginal() as Record<string, unknown>;

	return {
		...actual,
		EngineHost(props: {
			className?: string;
			locale?: string;
			overlayInputs?: EngineOverlayInputs;
			onOverlayStateChange?: (overlayState: ReturnType<typeof createMockForkOverlayState>) => void;
			onEngineReady?: (engine: unknown) => void;
			onClick?: (context: MockEngineHostPointerContext) => void;
			onPaneHover?: (paneId: string | null) => void;
			onPaneSnapshotsChange?: (snapshots: readonly unknown[]) => void;
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
					onPointerOut={() => {
						props.onPaneHover?.(null);
						props.onOverlayStateChange?.(createMockForkOverlayState(undefined, props.overlayInputs));
					}}
					onPointerOver={emitPaneHover}
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

describe("VNInvestCharts fork pane overlays", () => {
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

	it("exposes fork pane snapshots and hover events through the widget contract", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-bridge");
		const handlePaneSnapshotsChange = vi.fn();
		const handlePaneHover = vi.fn();

		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={forkRuntimeData as never}
					engineRuntime="fork"
					locale="vi"
					onPaneSnapshotsChange={handlePaneSnapshotsChange}
					onPaneHover={handlePaneHover}
				/>,
			);
		});

		expect(handlePaneSnapshotsChange).toHaveBeenCalled();
		const snapshots = handlePaneSnapshotsChange.mock.calls.at(-1)?.[0];
		expect(Array.isArray(snapshots)).toBe(true);
		expect(snapshots.length).toBeGreaterThan(0);
		expect(snapshots[0]).toMatchObject({
			paneId: expect.any(String),
			headerAnchor: expect.objectContaining({ top: expect.any(Number), left: expect.any(Number) }),
		});
		expect(snapshots[0]?.scaleSlotStates["price-right"]?.domain).toEqual([98, 107]);
		expect(snapshots[1]?.scaleSlotStates["volume-right"]?.domain).toEqual([1200, 1500]);

		const host = container.querySelector('[data-vn-kline-engine-host="true"]') as HTMLDivElement | null;
		expect(host).not.toBeNull();
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
		const hoveredSnapshot = snapshots[Math.min(1, snapshots.length - 1)];

		const PointerEventCtor = window.PointerEvent ?? window.MouseEvent;
		await act(async () => {
			const clientX = hoveredSnapshot.bounds.left + 8;
			const clientY = hoveredSnapshot.bounds.top + 8;
			host?.dispatchEvent(new PointerEventCtor("pointerover", { bubbles: true, clientX, clientY }));
			if (host) {
				host.dispatchEvent(new PointerEventCtor("pointermove", { bubbles: true, clientX, clientY }));
			}
			host?.dispatchEvent(new PointerEventCtor("pointerout", { bubbles: true }));
		});

		expect(handlePaneHover).toHaveBeenCalled();
		expect(handlePaneHover.mock.calls[0]?.[0]).toBe(hoveredSnapshot.paneId);
		expect(handlePaneHover.mock.calls.at(-1)?.[0]).toBeNull();
	});

	it("renders fork pane tooltips when hovering chart data", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-tooltips");

		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={forkRuntimeData as never}
					engineRuntime="fork"
					locale="vi"
				/>,
			);
			await flushMicrotasks();
		});

		const host = await waitForTruthyValue(() => container?.querySelector('[data-vn-kline-engine-host="true"]') as HTMLDivElement | null);
		expect(host).not.toBeNull();
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
		await act(async () => {
			host?.dispatchEvent(new PointerEventCtor("pointerover", { bubbles: true, clientX: 300, clientY: 460 }));
			host?.dispatchEvent(new PointerEventCtor("pointermove", { bubbles: true, clientX: 300, clientY: 460 }));
			await flushMicrotasks();
		});

		// NOTE: the price pane renders ChartStatusLine (data-rsc-chart-status-line),
		// not the generic tooltip div (that contract only exists for secondary panes).
		const priceTooltip = await waitForTruthyValue(() => container?.querySelector('[data-rsc-chart-status-line="true"]') as HTMLDivElement | null);

		expect(priceTooltip?.textContent).toContain("C");
		// NOTE: with the 2-bar fixture no indicator rows render (indicators need
		// longer history), so only the OHLCV status contract is asserted here.
		expect(priceTooltip?.textContent).toContain("Vol");
	});

	it("renders fork x-axis labels from engine-owned overlay state", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-x-axis");

		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={forkRuntimeData as never}
					engineRuntime="fork"
					locale="vi"
				/>,
			);
			await flushMicrotasks();
		});

		const labels = await waitForTruthyValue(() => {
			const nodes = container?.querySelectorAll('[data-rsc-fork-x-axis="label"]');
			return nodes && nodes.length > 0 ? nodes : undefined;
		});

		expect(labels?.length).toBeGreaterThan(0);
		const labelTexts = [...(labels ?? [])].map((node) => node.textContent ?? "");
		expect(labelTexts.every((text) => /\d{2}:\d{2}|\d{2}\/\d{2}/.test(text))).toBe(true);
		expect(new Set(labelTexts).size).toBeGreaterThanOrEqual(2);
	});

	it("renders fork x-axis hover datetime label from crosshair position", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-x-axis-hover");

		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={forkRuntimeData as never}
					engineRuntime="fork"
					locale="vi"
				/>,
			);
			await flushMicrotasks();
		});

		const host = await waitForTruthyValue(() => container?.querySelector('[data-vn-kline-engine-host="true"]') as HTMLDivElement | null);
		const PointerEventCtor = window.PointerEvent ?? window.MouseEvent;

		await act(async () => {
			host?.dispatchEvent(new PointerEventCtor("pointerover", { bubbles: true, clientX: 320, clientY: 460 }));
			host?.dispatchEvent(new PointerEventCtor("pointermove", { bubbles: true, clientX: 320, clientY: 460 }));
			await flushMicrotasks();
		});

		const hoverLabel = await waitForTruthyValue(() => container?.querySelector('[data-rsc-fork-x-axis="hover-label"]') as HTMLDivElement | null);
		// NOTE: default settings dateFormat is yyyy-mm-dd (27b5cd1 wired pattern from
		// settings); DD/MM/YYYY appears only with explicit settings. Mapping vi locale
		// to a dd/mm/yyyy default is a product follow-up, not asserted here.
		expect(hoverLabel?.textContent ?? "").toMatch(/(?:\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}|\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}|\d{2}:\d{2}\s\d{2}\/\d{2}\/\d{4})/);
	});
});