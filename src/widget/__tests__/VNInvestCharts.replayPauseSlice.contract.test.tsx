// @vitest-environment jsdom
import React, { act, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VNInvestCharts } from "../VNInvestCharts";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
console.error = (..._args: unknown[]) => {};

// S29 (audit 2026-10-06) made the `debugFeatures` override ask for PROVABLY
// development (`NODE_ENV === "development"`) instead of the fail-open "not
// production" it replaced, so mock entitlements can no longer leak into a
// shipped bundle. This whole file is the dev/QA harness for the replay contract
// and grants itself the entitlement via `debugFeatures` + `debugTier="pro"`, so
// it has to opt in to that exact condition. Without this the tests fail closed
// — correctly — and assert nothing about replay.
const originalNodeEnv = process.env.NODE_ENV;
beforeEach(() => {
	vi.stubEnv("NODE_ENV", "development");
});
afterEach(() => {
	vi.unstubAllEnvs();
	process.env.NODE_ENV = originalNodeEnv;
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
		scaleSlotStates: { "price-right": { side: "right", mode: "auto", visible: true, domain: [98, 120] } },
	},
] as const;

let mockVisibleRange = { from: 0, to: 2 };
const engineHostPropsHistory: Array<Record<string, unknown>> = [];
let lastOverlayStateCb: ((state: unknown) => void) | null = null;

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
	const ReactModule = await import("react");
	const actual = await importOriginal() as Record<string, unknown>;

	return {
		...actual,
		EngineHost(props: {
			className?: string;
			locale?: string;
			onEngineReady?: (engine: unknown) => void;
			onPaneSnapshotsChange?: (snapshots: readonly unknown[]) => void;
			onVisibleRangeChange?: (range: { from: number; to: number }) => void;
			onOverlayStateChange?: (state: unknown) => void;
			style?: CSSProperties;
		}) {
			engineHostPropsHistory.push(props as unknown as Record<string, unknown>);
			ReactModule.useEffect(() => {
				props.onEngineReady?.(mockEngineInstance);
				props.onPaneSnapshotsChange?.(forkEngineSnapshots);
				props.onVisibleRangeChange?.(mockVisibleRange);
				lastOverlayStateCb = props.onOverlayStateChange ?? null;
			}, []);

			return (
				<div
					data-vn-kline-engine-host="true"
					className={props.className}
					style={props.style}
				>
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

async function settle(times = 8) {
	await act(async () => {
		for (let i = 0; i < times; i += 1) {
			await flushMicrotasks();
		}
	});
}

const TOTAL_BARS = 10;

function makeReplayBars() {
	const bars = [];
	for (let i = 0; i < TOTAL_BARS; i += 1) {
		const open = 100 + i;
		bars.push({
			date: new Date(Date.UTC(2024, 0, 1, i, 0, 0)),
			open,
			high: open + 2,
			low: open - 2,
			close: open + 1,
			volume: 1000 + i * 10,
			index: i,
			dataIndex: i,
		});
	}
	return bars;
}

function lastEnrichedLength(): number {
	const calls = mockEngineInstance.setEnrichedData.mock.calls;
	expect(calls.length).toBeGreaterThan(0);
	return (calls[calls.length - 1][0] as unknown[]).length;
}

function clearCameraMocks() {
	mockEngineInstance.setCameraState.mockClear();
	mockEngineInstance.zoomToRange.mockClear();
}

async function renderReplayChart(extraProps: Record<string, unknown> = {}) {
	const adapter = createAdapter(Promise.resolve([]), "replay-pause-slice");
	const ref = React.createRef<any>();
	const container = document.createElement("div");
	container.style.width = "1200px";
	container.style.height = "720px";
	document.body.appendChild(container);
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<VNInvestCharts
				ref={ref}
				adapter={adapter as never}
				data={makeReplayBars() as never}
				engineRuntime="fork"
				// AUTH-03 / W0.5: replay cần capability `replay` (tier >= pro) **và**
				// cờ `isReplayEnabled`. Trước W0.5 chỉ cần cờ nên replay miễn phí.
				// Bộ test này kiểm tra CƠ CHẾ replay cho user có quyền ⇒ cấp cả hai.
				// Hành vi "bị khoá khi thiếu quyền" nằm ở useChartImperativeHandle.replayGate.test.ts
				// và useTierGatedFeatures (tierGating.test.ts).
				debugTier="pro"
				debugFeatures={{ isReplayEnabled: true } as never}
				{...extraProps}
			/>,
		);
		await flushMicrotasks();
	});
	await settle();

	return { container, root, ref };
}

describe("VNInvestCharts replay pause slice (REP-01 / R1.1)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		engineHostPropsHistory.length = 0;
		mockVisibleRange = { from: 0, to: 2 };
		mockEngineInstance.setEnrichedData.mockClear();
		clearCameraMocks();
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

	it("mounts with full data when no replay session is active", { timeout: 30_000 }, async () => {
		const rendered = await renderReplayChart();
		container = rendered.container;
		root = rendered.root;

		expect(lastEnrichedLength()).toBe(TOTAL_BARS);
	});

	it("pushes sliced data (no future leak) on paused seek + pins camera once (R1.1b)", { timeout: 30_000 }, async () => {
		const rendered = await renderReplayChart();
		container = rendered.container;
		root = rendered.root;
		clearCameraMocks();

		// Simulate a live-edge viewport of a larger chart before cutting.
		mockVisibleRange = { from: 50, to: 60 };

		await act(async () => {
			rendered.ref.current.replaySeek(3);
			await flushMicrotasks();
		});
		await settle();

		// REP-01 invariant: paused session must NOT push the full dataset.
		expect(lastEnrichedLength()).toBe(4);
		// Paused branch releases followLatest for panning.
		expect(mockEngineInstance.setCameraState).toHaveBeenCalledWith({ followLatest: false });
		// R1.1b: one pin to the cut edge (visibleBars=10 >= 4 → { from: 0, to: 4 }).
		expect(mockEngineInstance.zoomToRange).toHaveBeenCalledTimes(1);
		expect(mockEngineInstance.zoomToRange).toHaveBeenCalledWith({ from: 0, to: 4 });
	});

	it("grows the slice by one on stepForward without re-pinning (no yank)", { timeout: 30_000 }, async () => {
		const rendered = await renderReplayChart();
		container = rendered.container;
		root = rendered.root;
		clearCameraMocks();
		mockVisibleRange = { from: 50, to: 60 };

		await act(async () => {
			rendered.ref.current.replaySeek(3);
			await flushMicrotasks();
		});
		await settle();
		expect(lastEnrichedLength()).toBe(4);

		mockEngineInstance.zoomToRange.mockClear();
		await act(async () => {
			rendered.ref.current.replayStepForward();
			await flushMicrotasks();
		});
		await settle();

		// Growth while paused: new bar visible, camera untouched.
		expect(lastEnrichedLength()).toBe(5);
		expect(mockEngineInstance.zoomToRange).not.toHaveBeenCalled();
	});

	it("re-pins on stepBack (shrink) and restores full data on stop", { timeout: 30_000 }, async () => {
		const rendered = await renderReplayChart();
		container = rendered.container;
		root = rendered.root;
		clearCameraMocks();
		mockVisibleRange = { from: 50, to: 60 };

		await act(async () => {
			rendered.ref.current.replaySeek(5);
			await flushMicrotasks();
		});
		await settle();
		expect(lastEnrichedLength()).toBe(6);

		mockEngineInstance.zoomToRange.mockClear();
		await act(async () => {
			rendered.ref.current.replayStepBack();
			await flushMicrotasks();
		});
		await settle();

		expect(lastEnrichedLength()).toBe(5);
		expect(mockEngineInstance.zoomToRange).toHaveBeenCalledWith({ from: 0, to: 5 });

		await act(async () => {
			rendered.ref.current.replayStop();
			await flushMicrotasks();
		});
		await settle();

		// Session ended (cursor back at live edge) → full dataset again.
		expect(lastEnrichedLength()).toBe(TOTAL_BARS);
	});
});

describe("VNInvestCharts replay enter-selection (REP-03 / R1.2)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		engineHostPropsHistory.length = 0;
		mockVisibleRange = { from: 0, to: 2 };
		mockEngineInstance.setEnrichedData.mockClear();
		clearCameraMocks();
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

	function findReplayToggle(): HTMLButtonElement {
		const buttons = Array.from(container!.querySelectorAll("button"));
		const toggle = buttons.find((b) => /Replay|Phát lại|replay/i.test(`${b.textContent ?? ""} ${b.getAttribute("title") ?? ""}`));
		expect(toggle).toBeDefined();
		return toggle as HTMLButtonElement;
	}

	it("header toggle enters selection WITHOUT seeking to epoch (no magic date=0)", { timeout: 30_000 }, async () => {
		const rendered = await renderReplayChart({ showHeader: true });
		container = rendered.container;
		root = rendered.root;

		expect(rendered.ref.current.getReplayState().currentBar).toBe(TOTAL_BARS - 1);
		expect(rendered.ref.current.getReplayAwaitingStartBar()).toBe(false);

		await act(async () => {
			findReplayToggle().dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await flushMicrotasks();
		});
		await settle();

		// R1.2: awaiting selection, cursor untouched (pre-fix: currentBar reset to 0).
		expect(rendered.ref.current.getReplayAwaitingStartBar()).toBe(true);
		expect(rendered.ref.current.getReplayState().currentBar).toBe(TOTAL_BARS - 1);
		expect(lastEnrichedLength()).toBe(TOTAL_BARS);
	});

	it("imperative replaySelectStartBar enters selection WITHOUT seeking", { timeout: 30_000 }, async () => {
		const rendered = await renderReplayChart();
		container = rendered.container;
		root = rendered.root;

		await act(async () => {
			rendered.ref.current.replaySelectStartBar();
			await flushMicrotasks();
		});
		await settle();

		expect(rendered.ref.current.getReplayAwaitingStartBar()).toBe(true);
		expect(rendered.ref.current.getReplayState().currentBar).toBe(TOTAL_BARS - 1);
	});
});

describe("VNInvestCharts replay Jump-to-bar (REP-05 / R2.3)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		engineHostPropsHistory.length = 0;
		mockVisibleRange = { from: 0, to: 2 };
		mockEngineInstance.setEnrichedData.mockClear();
		clearCameraMocks();
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

	function findJumpButton(): HTMLButtonElement {
		const buttons = Array.from(container!.querySelectorAll("button"));
		const jump = buttons.find((b) => /Jump to bar|Nhảy tới nến/.test(b.getAttribute("title") ?? ""));
		expect(jump).toBeDefined();
		return jump as HTMLButtonElement;
	}

	it("toolbar Jump button pauses playback and re-enters cut selection", { timeout: 30_000 }, async () => {
		// S1 (Replay=Pro): toolbar replay bị PremiumFeatureGate khóa ở free —
		// test UI này mount với debugFeatures (đường dev/QA chính thức, non-prod).
		const rendered = await renderReplayChart({ showHeader: true, debugFeatures: { isReplayEnabled: true } });
		container = rendered.container;
		root = rendered.root;

		// Open the toolbar via the header toggle, then leave selection mode
		// and build a paused session at bar 5.
		await act(async () => {
			const buttons = Array.from(container!.querySelectorAll("button"));
			const toggle = buttons.find((b) => /Replay|Phát lại|replay/i.test(`${b.textContent ?? ""} ${b.getAttribute("title") ?? ""}`));
			toggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await flushMicrotasks();
		});
		await settle();
		await act(async () => {
			rendered.ref.current.replayCancelSelection();
			rendered.ref.current.replaySeek(5);
			rendered.ref.current.replayPlay();
			await flushMicrotasks();
		});
		await settle();
		expect(rendered.ref.current.getReplayState().playing).toBe(true);
		expect(rendered.ref.current.getReplayAwaitingStartBar()).toBe(false);

		await act(async () => {
			findJumpButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await flushMicrotasks();
		});
		await settle();

		// R2.3: paused + back in cut selection, still on the sliced session.
		expect(rendered.ref.current.getReplayState().playing).toBe(false);
		expect(rendered.ref.current.getReplayAwaitingStartBar()).toBe(true);
		expect(lastEnrichedLength()).toBe(6);
	});
});

describe("VNInvestCharts replay cut overlay (REP-04 / R2.2)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		engineHostPropsHistory.length = 0;
		mockVisibleRange = { from: 0, to: 2 };
		lastOverlayStateCb = null;
		mockEngineInstance.setEnrichedData.mockClear();
		clearCameraMocks();
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

	function emitCrosshair(dataIndex: number | null, x: number) {
		expect(lastOverlayStateCb).not.toBeNull();
		act(() => {
			lastOverlayStateCb!({
				crosshair: dataIndex === null ? null : { x, y: 100, paneId: "price", dataIndex, xIndexFloat: dataIndex },
				hoveredPaneId: dataIndex === null ? null : "price",
				hoveredDataIndex: dataIndex,
				xAxisTicks: [],
				measurement: null,
				drawingPriceLabels: null,
				drawingPrimitives: [],
			});
		});
	}

	it("shows the red cut guide + time badge on hover during CutMode, hides on exit", { timeout: 30_000 }, async () => {
		const rendered = await renderReplayChart({ showHeader: true });
		container = rendered.container;
		root = rendered.root;

		// No overlay before entering selection.
		expect(container!.querySelector('[data-testid="replay-cut-overlay"]')).toBeNull();

		await act(async () => {
			const buttons = Array.from(container!.querySelectorAll("button"));
			const toggle = buttons.find((b) => /Replay|Phát lại|replay/i.test(`${b.textContent ?? ""} ${b.getAttribute("title") ?? ""}`));
			toggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await flushMicrotasks();
		});
		await settle();
		expect(rendered.ref.current.getReplayAwaitingStartBar()).toBe(true);

		// Still hidden: cut guide follows the cursor, no cursor yet.
		expect(container!.querySelector('[data-testid="replay-cut-overlay"]')).toBeNull();

		emitCrosshair(5, 320);
		await settle();

		// R2.2: red dashed guide at cursor X + badge with bar-5 time.
		// (Expected text computed with the same Intl call — TZ-proof.)
		const overlay = container!.querySelector('[data-testid="replay-cut-overlay"]');
		expect(overlay).not.toBeNull();
		const html = overlay!.innerHTML;
		expect(html).toContain("translate3d(320px");
		const barDate = new Date(Date.UTC(2024, 0, 1, 5, 0, 0));
		const fmt = { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" } as const;
		const text = overlay!.textContent ?? "";
		const ok = text === `Cắt tại ${new Intl.DateTimeFormat("vi-VN", fmt).format(barDate)}`
			|| text === `Cut at ${new Intl.DateTimeFormat("en-US", fmt).format(barDate)}`;
		expect(ok).toBe(true);

		await act(async () => {
			rendered.ref.current.replayCancelSelection();
			await flushMicrotasks();
		});
		await settle();

		// Exiting CutMode unmounts the overlay.
		expect(container!.querySelector('[data-testid="replay-cut-overlay"]')).toBeNull();
	});
});

describe("VNInvestCharts replay exit camera restore (BUG-3 / Phase 1)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		engineHostPropsHistory.length = 0;
		mockVisibleRange = { from: 0, to: 2 };
		mockEngineInstance.setEnrichedData.mockClear();
		clearCameraMocks();
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

	it("restores followLatest on stop so live ticks scroll again", { timeout: 30_000 }, async () => {
		const rendered = await renderReplayChart();
		container = rendered.container;
		root = rendered.root;

		await act(async () => {
			rendered.ref.current.replaySeek(5);
			await flushMicrotasks();
		});
		await settle();
		expect(lastEnrichedLength()).toBe(6);
		// Paused branch released followLatest for free panning.
		expect(mockEngineInstance.setCameraState).toHaveBeenCalledWith({ followLatest: false });

		clearCameraMocks();
		await act(async () => {
			rendered.ref.current.replayStop();
			await flushMicrotasks();
		});
		await settle();

		// BUG-3: exit must resume the live edge (camera BEFORE data) and push full data.
		expect(mockEngineInstance.setCameraState).toHaveBeenCalledWith({ followLatest: true, rightOffsetBars: 0 });
		expect(lastEnrichedLength()).toBe(TOTAL_BARS);
	});
});
