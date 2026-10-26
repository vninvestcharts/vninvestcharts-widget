// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Chart from "../../lib/Chart";
import { VNInvestCharts } from "../VNInvestCharts";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
console.error = (..._args: unknown[]) => {};

// S29 (audit 2026-10-06): the `debugFeatures` override now requires PROVABLY
// development (`NODE_ENV === "development"`) rather than the fail-open "not
// production". Two tests in this file grant that entitlement via
// `debugFeatures={{ isWhalePanelEnabled: true }}` and must therefore declare the
// environment they are testing. Left at vitest's default "test", they fail closed
// — correctly — and no longer assert the mount contract at all.
//
// Scoped PER TEST rather than in a file-wide `beforeEach`: only 2 of the 6 tests
// here use `debugFeatures`, and a blanket "development" would silently disable any
// future branch keyed on `NODE_ENV === "test"` in the four tests that do not need
// an entitlement. Opting in at the call site keeps the other four honest.
afterEach(() => {
	vi.unstubAllEnvs();
});

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

let mockVisibleRange = { from: 0, to: 2 };

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

vi.mock("@vninvestcharts/engine-react", async (importOriginal) => {
	const React = await import("react");
	const actual = await importOriginal() as Record<string, unknown>;

	return {
		...actual,
		EngineHost(props: {
			className?: string;
			locale?: string;
			onEngineReady?: (engine: unknown) => void;
			onPaneSnapshotsChange?: (snapshots: readonly unknown[]) => void;
			onVisibleRangeChange?: (range: { from: number; to: number }) => void;
			style?: React.CSSProperties;
		}) {
			React.useEffect(() => {
				props.onEngineReady?.(mockEngineInstance);
				props.onPaneSnapshotsChange?.(forkEngineSnapshots);
				props.onVisibleRangeChange?.(mockVisibleRange);
			}, []);

			return (
				<div data-vn-kline-engine-host="true" className={props.className} style={props.style}>
					<div data-vn-kline-engine="surface" data-locale={props.locale} />
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

describe("VNInvestCharts explicit fork runtime mounts", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		mockVisibleRange = { from: 0, to: 2 };
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

	it("keeps widget children mounted on explicit fork runtime", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-child-contract");

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
				>
					<div data-fork-child="true">Fork child</div>
				</VNInvestCharts>,
			);
			await flushMicrotasks();
		});

		const host = await waitForTruthyValue(() => container?.querySelector('[data-vn-kline-engine-host="true"]') as HTMLDivElement | null);
		const childSurface = await waitForTruthyValue(() => container?.querySelector('[data-rsc-fork-children="true"]') as HTMLDivElement | null);
		const child = await waitForTruthyValue(() => container?.querySelector('[data-fork-child="true"]') as HTMLDivElement | null);

		expect(host).not.toBeNull();
		expect(childSurface).not.toBeNull();
		expect(child).not.toBeNull();
		expect(child?.textContent).toContain("Fork child");
	});

	it("keeps legacy chart children mounted on explicit fork runtime", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-legacy-chart-child-contract");

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
				>
					<Chart id={0}>
						<g data-fork-legacy-chart-child="true">
							<text>Legacy chart child</text>
						</g>
					</Chart>
				</VNInvestCharts>,
			);
			await flushMicrotasks();
		});

		const child = await waitForTruthyValue(() => container?.querySelector('[data-fork-legacy-chart-child="true"]') as SVGGElement | null);
		expect(child).not.toBeNull();
		expect(child?.textContent).toContain("Legacy chart child");
	});

	it("keeps whale and cvd overlay surfaces mounted on explicit fork runtime when enabled", async () => {
		// S29: this test grants itself mock entitlements, which now requires being
		// provably in development. Opted in here rather than file-wide.
		vi.stubEnv("NODE_ENV", "development");
		const adapter = createAdapter(Promise.resolve([]), "fork-overlay-contract");
		const handleRuntimeCapabilitiesChange = vi.fn();
		const whaleOrders = [{
			ts: forkRuntimeData[0].date.toISOString(),
			price: 103,
			volume: 50_000,
			matched_value: 5_500_000,
			side: "buy" as const,
			size_class: "whale" as const,
		}];
		const externalCvdSeries = [
			{
				bucket_ts: forkRuntimeData[0].date.toISOString(),
				buy_value: 6_000_000,
				sell_value: 2_000_000,
				cvd: 4_000_000,
				cumulative_cvd: 4_000_000,
			},
			{
				bucket_ts: forkRuntimeData[1].date.toISOString(),
				buy_value: 9_000_000,
				sell_value: 3_000_000,
				cvd: 6_000_000,
				cumulative_cvd: 10_000_000,
			},
		] as const;

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
					enableWhale
					whaleOrders={whaleOrders}
					enableCVD
					externalCvdSeries={externalCvdSeries}
					debugFeatures={{ isWhalePanelEnabled: true }}
					// S1: whale là `pro_plugin` (pro) AND cờ SaaS. Test này chỉ bật cờ nên
					// tier mặc định `null` ⇒ whale đúng ra phải bị khoá. Khai báo `pro` để
					// test vẫn kiểm tra đúng thứ nó muốn: overlay CÓ mount khi đủ cả hai.
					debugTier="pro"
					onRuntimeCapabilitiesChange={handleRuntimeCapabilitiesChange}
				/>,
			);
			await flushMicrotasks();
		});

		const whaleOverlay = await waitForTruthyValue(() => container?.querySelector('[data-rsc-fork-overlay="whale"] canvas') as HTMLCanvasElement | null);
		const cvdOverlay = await waitForTruthyValue(() => container?.querySelector('[data-rsc-fork-overlay="cvd"] canvas') as HTMLCanvasElement | null);
		const externalCvdOverlay = await waitForTruthyValue(() => container?.querySelector('[data-rsc-fork-overlay="external-cvd"] canvas') as HTMLCanvasElement | null);

		expect(whaleOverlay).not.toBeNull();
		expect(cvdOverlay).not.toBeNull();
		expect(externalCvdOverlay).not.toBeNull();

		const capabilities = await waitForTruthyValue(() => handleRuntimeCapabilitiesChange.mock.calls
			.map((call) => call[0])
			.findLast((value) => value?.engineRuntime === "fork"));
		expect(capabilities).toMatchObject({
			engineRuntime: "fork",
			chartCanvasOverlays: true,
			drawingOverlays: true,
		});
	});

	it("hides whale bubbles without the whale entitlement (CR-01 tier gate)", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-whale-gate-contract");
		const whaleOrders = [{
			ts: forkRuntimeData[0].date.toISOString(),
			price: 103,
			volume: 50_000,
			matched_value: 5_500_000,
			side: "buy" as const,
			size_class: "whale" as const,
		}];

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
					enableWhale
					whaleOrders={whaleOrders}
				/>,
			);
			await flushMicrotasks();
		});

		// Wait until the chart surface settled (cvd mounts unconditionally when enabled),
		// then the whale overlay must still be absent without the entitlement.
		await act(async () => {
			await flushMicrotasks();
			await flushMicrotasks();
		});
		expect(container?.querySelector('[data-rsc-fork-overlay="whale"]')).toBeNull();
	});

	it("S1: co SaaS whale flag nhung tier thap => whale VAN khoa (gate la AND)", async () => {
		// S29: this test also grants itself the whale mock entitlement.
		vi.stubEnv("NODE_ENV", "development");
		// Test CR-01 trên xanh vì thiếu CẢ cờ lẫn tier, nên nó không chứng minh gate hoạt
		// động. Test này bật cờ (điều kiện đủ) nhưng để tier mặc định `null`
		// (thiếu `pro_plugin`) — mẫu F5 mà S1 xoá: trước đó chỉ hỏi cờ nên mở cho free.
		const adapter = createAdapter(Promise.resolve([]), "fork-whale-and-gate-contract");
		const whaleOrders = [
			{
				ts: forkRuntimeData[0].date.toISOString(),
				price: 103,
				volume: 50_000,
				matched_value: 5_500_000,
				side: "buy" as const,
				size_class: "whale" as const,
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
					data={forkRuntimeData as never}
					engineRuntime="fork"
					locale="vi"
					enableWhale
					whaleOrders={whaleOrders}
					debugFeatures={{ isWhalePanelEnabled: true }}
					// KHÔNG debugTier: tier null => pro_plugin locked.
				/>,
			);
			await flushMicrotasks();
			await flushMicrotasks();
		});

		expect(container?.querySelector('[data-rsc-fork-overlay="whale"]')).toBeNull();
	});

	it("keeps dark-flow badge and drawing chrome mounted on fork runtime", async () => {
		const adapter = createAdapter(Promise.resolve([]), "drawing-chrome");

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
					darkFlowStrength={64}
					darkFlowSignalType="iceberg"
					renderDrawingChrome={() => <div data-testid="drawing-chrome">Chrome</div>}
				/>,
			);
		});

		expect(container.querySelector('[data-testid="drawing-chrome"]')).not.toBeNull();
		expect(container.querySelector('.gc-darkflow-badge')?.textContent).toContain("64");
	});
});