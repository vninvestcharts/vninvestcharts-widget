import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { minTierFor, type Capability } from "@vninvestcharts/engine-core";
import { CHART_TYPE_OPTIONS, isChartTypeComingSoon, isChartTypeLocked } from "../chartTypeOptions";
import { initRegistry } from "../../../lib/core/registry/registerAll";
import { filterAvailableSeries, getSeriesTier, isSeriesAvailableForTier } from "../../../lib/core/registry/registryCore";
import type { SeriesConfig, SeriesTypeId } from "../../../lib/core/types/pane-descriptor";
import { VNInvestCharts } from "../../VNInvestCharts";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
console.error = (..._args: unknown[]) => {};

vi.mock("../../../lib/core/hooks/useCanvasResize", () => {
	const ref = { current: null as HTMLDivElement | null };
	return {
		useCanvasResize: () => ({
			ref,
			size: { width: 1200, height: 720 },
		}),
	};
});

/** W-02 mount scaffolding: a minimal EngineHost that records every props object. */
const w02EngineHostPropsHistory: Array<Record<string, unknown>> = [];

const w02Snapshots = [
	{
		paneId: "price",
		bounds: { left: 0, top: 0, width: 1200, height: 600 },
		plotBounds: { left: 0, top: 28, width: 1200, height: 572 },
		axisBounds: {
			right: { left: 1152, top: 0, width: 48, height: 600 },
		},
		headerAnchor: { left: 0, top: 0, width: 1200 },
		labelAnchor: { left: 0, top: 0, height: 600 },
		scaleSlotBounds: { "price-right": { left: 1152, top: 0, width: 48, height: 600 } },
		scaleSlotStates: { "price-right": { side: "right", mode: "auto", visible: true, domain: [98, 107] } },
	},
] as const;

const w02MockEngineInstance = {
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
	getVisibleRange: vi.fn(() => ({ from: 0, to: 2 })),
	getPaneSnapshots: vi.fn(() => w02Snapshots),
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
			w02EngineHostPropsHistory.push(props as unknown as Record<string, unknown>);
			React.useEffect(() => {
				props.onEngineReady?.(w02MockEngineInstance);
				props.onPaneSnapshotsChange?.(w02Snapshots);
				props.onVisibleRangeChange?.({ from: 0, to: 2 });
			}, []);

			return (
				<div data-vn-kline-engine-host="true" className={props.className} style={props.style}>
					<div data-vn-kline-engine="surface" data-locale={props.locale} />
				</div>
			);
		},
	};
});

/**
 * Chart type pro có HAI cổng, và chúng phải nói cùng một điều:
 *
 *  1. CỔNG UI — `CHART_TYPE_OPTIONS[].capability` ⇒ `isChartTypeLocked` ⇒ nút bị
 *     khoá, hiện badge Pro. Đây là thứ user thấy.
 *  2. CỔNG RENDER — `RegistryEntry.tier` ⇒ `filterAvailableSeries` (gọi bởi
 *     `filterPanesBySeriesTier`, qua `renderPanes` ở `VNInvestCharts.tsx:822-828`
 *     rồi tới `forkEnginePanes` ở `:1230` → `createPaneSpecsFromDescriptors`)
 *     loại series TRƯỚC khi nó tới engine. Đây là thứ
 *     quyết định dữ liệu có thật sự được vẽ hay không.
 *
 * Nếu chỉ có (1): user Free thấy nút khoá nhưng nếu còn đường nào khác gọi
 * `updateSeriesType` thì Pro chart vẽ trên tài khoản Free. Nếu chỉ có (2): user
 * chọn được xong rồi chart trống, không hiểu vì sao.
 *
 * Test này khoá việc hai cổng cùng trỏ tới một capability, để không thể thêm
 * chart type mà chỉ khoá ở một nơi.
 */
initRegistry();

/** Chart type trong picker có gắn capability. */
const GATED_OPTIONS = CHART_TYPE_OPTIONS.filter((option) => option.capability !== undefined);

describe("hai cổng của chart type pro phải cùng một capability", () => {
	it("mỗi option gắn capability đều có một `RegistryEntry` cùng tier", () => {
		const problems: string[] = [];
		for (const option of GATED_OPTIONS) {
			const seriesType = chartTypeMap()[option.value];
			if (seriesType === undefined) {
				problems.push(`${option.value}: gắn capability nhưng không có trong CHART_TYPE_MAP`);
				continue;
			}
			const registryTier = getSeriesTier(seriesType);
			const capabilityTier = minTierFor(option.capability as Capability);
			if (registryTier !== capabilityTier) {
				problems.push(`${option.value}→${seriesType}: registry tier "${registryTier}" ≠ minTierFor(${option.capability}) "${capabilityTier}"`);
			}
		}
		expect(problems, problems.join("; ")).toEqual([]);
	});

	it("không có chart type nào `comingSoon` nữa — `comingSoon` là cờ kỹ thuật, không phải chỗ để khoá tier", () => {
		// Đã có producer + case resolver + render mode cho cả ba loại, nên cờ
		// phải hạ. Để lại cờ sẽ báo cho user rằng tính năng chưa tồn tại trong khi
		// nó đã bán được.
		expect(CHART_TYPE_OPTIONS.filter(isChartTypeComingSoon)).toEqual([]);
	});

	it("Chart type không gắn capability thì ai cũng chọn được — kể cả tier chưa biết", () => {
		for (const option of CHART_TYPE_OPTIONS.filter((o) => o.capability === undefined)) {
			expect(isChartTypeLocked(option, undefined), option.value).toBe(false);
			expect(isChartTypeLocked(option, null), option.value).toBe(false);
			expect(isChartTypeLocked(option, "free"), option.value).toBe(false);
		}
	});
});

describe("isChartTypeLocked — fail-closed theo hasCapability", () => {
	it("tier chưa biết (`null`/`undefined`) khoá mọi chart type pro", () => {
		for (const option of GATED_OPTIONS) {
			expect(isChartTypeLocked(option, undefined), option.value).toBe(true);
			expect(isChartTypeLocked(option, null), option.value).toBe(true);
			expect(isChartTypeLocked(option, ""), option.value).toBe(true);
		}
	});

	it("free/starter khoá; pro và enterprise mở — `hasCapability` là quyết định duy nhất", () => {
		for (const option of GATED_OPTIONS) {
			expect(isChartTypeLocked(option, "free"), option.value).toBe(true);
			expect(isChartTypeLocked(option, "starter"), option.value).toBe(true);
			expect(isChartTypeLocked(option, "pro"), option.value).toBe(false);
			expect(isChartTypeLocked(option, "enterprise"), option.value).toBe(false);
		}
	});

	it("cổng RENDER khớp cổng UI: tier mở được trên UI thì engine cũng nhận series", () => {
		for (const option of GATED_OPTIONS) {
			const seriesType = chartTypeMap()[option.value] as SeriesTypeId;
			for (const tier of ["free", "starter", "pro", "enterprise"] as const) {
				const uiAllows = !isChartTypeLocked(option, tier);
				const renderAllows = isSeriesAvailableForTier(seriesType, tier as "free" | "pro" | "enterprise");
				expect(renderAllows, `${option.value}@${tier}: UI=${uiAllows} nhưng render=${renderAllows}`).toBe(uiAllows);
			}
		}
	});

	it("`hasCapability` vẫn là hàm quyết định — đổi ma trận capability là đổi cả hai cổng", () => {
		// Khoá bằng giá trị tier cứng (`tier === "pro"`) sẽ chặn enterprise, tức
		// mất doanh thu. Test này chỉ ra nguồn sự thật là `minTierFor`.
		for (const option of GATED_OPTIONS) {
			expect(minTierFor(option.capability as Capability)).toBe("pro");
		}
	});
});

describe("filterAvailableSeries — series bị khoá không tới được engine", () => {
	const mixed: SeriesConfig[] = [
		{ type: "Candlestick", yAxis: "right" },
		{ type: "Renko", yAxis: "right" },
		{ type: "Kagi", yAxis: "right" },
		{ type: "Baseline", yAxis: "right" },
	];

	it("ở tier free, chỉ phần primitive còn lại tới được engine", () => {
		// Đây là CỔNG RENDER thật: `VNInvestCharts.tsx:822-828` bọc hàm này trong
		// `filterPanesBySeriesTier(resolvedPanes, seriesTierGate)` thành `renderPanes`,
		// rồi `:1230` đổi nó thành `forkEnginePanes` qua `createPaneSpecsFromDescriptors`.
		// (`DynamicChart.tsx:1266` mà bản cũ chú thích ở đây đã bị xoá ở `c38ccae`.)
		// Không có cổng này thì chỉ cần gọi `updateSeriesType` là
		// user Free vẽ được chart Pro.
		expect(filterAvailableSeries(mixed, "free").map((s) => String(s.type))).toEqual(["Candlestick"]);
	});

	it("ở tier pro, cả bốn series đều tới được engine", () => {
		expect(filterAvailableSeries(mixed, "pro").map((s) => String(s.type)))
			.toEqual(["Candlestick", "Renko", "Kagi", "Baseline"]);
		expect(filterAvailableSeries(mixed, "enterprise")).toHaveLength(4);
	});

	it("type chưa đăng ký bị loại ở MỌI tier — fail-closed, không phải cho qua mặc định", () => {
		const bogus = [{ type: "Nope" as SeriesTypeId, yAxis: "right" as const }];
		for (const tier of ["free", "pro", "enterprise"] as const) {
			expect(filterAvailableSeries(bogus, tier), tier).toEqual([]);
		}
	});
});

/** Đọc `CHART_TYPE_MAP` thật từ source, không import component nặng. */
function chartTypeMap(): Record<string, SeriesTypeId> {
	const src = readFileSync(resolve(process.cwd(), "src/widget/VNInvestCharts.tsx"), "utf8");
	const body = src.match(/CHART_TYPE_MAP: Record<string, SeriesTypeId> = \{([\s\S]*?)\n\s*\};/);
	if (!body) {
		throw new Error("không tìm thấy literal CHART_TYPE_MAP trong VNInvestCharts.tsx");
	}
	const entries = [...body[1].matchAll(/^\s*([A-Za-z_][\w]*):\s*"([^"]+)",/gm)];
	return Object.fromEntries(entries.map((m) => [m[1], m[2] as SeriesTypeId]));
}

describe("W-02 render wiring — filter OUTPUT (not input) reaches the engine", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		w02EngineHostPropsHistory.length = 0;
	});

	afterEach(async () => {
		await act(async () => {
			await Promise.resolve();
			root?.unmount();
			await Promise.resolve();
		});
		root = null;
		container?.remove();
		container = null;
		window.localStorage.clear();
		document.documentElement.lang = "en";
	});

	it("free tier mount: Renko in panes never reaches EngineHost panes (exact absence)", async () => {
		// Precondition, asserted not assumed: without W-01 this mount keeps Renko, so a
		// green run proves BOTH the tier (free drops pro) and the wiring (output reaches
		// createPaneSpecsFromDescriptors). A registry that never registered Renko would
		// drop it for the wrong reason — getSeries would throw instead of returning "pro".
		expect(getSeriesTier("Renko" as SeriesTypeId)).toBe("pro");

		const fetchBarsInRange = vi.fn().mockResolvedValue([]);
		const adapter = {
			fetchBarsInRange,
			fetchBarsBefore: vi.fn().mockResolvedValue([]),
			fetchBars: fetchBarsInRange,
			fetchMoreBars: vi.fn().mockResolvedValue([]),
			subscribeToBar: vi.fn().mockReturnValue(() => {}),
			subscribeToTrades: vi.fn().mockReturnValue(() => {}),
			subscribeToOrderbook: vi.fn().mockReturnValue(() => {}),
			searchSymbols: vi.fn().mockResolvedValue([]),
			label: "w02-renko-absent",
		};
		const data = [
			{ date: new Date("2024-01-01T09:00:00Z"), open: 100, high: 105, low: 98, close: 103, volume: 1200 },
			{ date: new Date("2024-01-01T10:00:00Z"), open: 103, high: 107, low: 101, close: 106, volume: 1500 },
		];
		const panes = [
			{
				id: "price",
				label: "Price",
				pinned: false,
				visible: true,
				heightRatio: 1,
				splitScale: false,
				tooltip: "value",
				series: [
					{ id: "candle", type: "Candlestick", yAxis: "right" },
					{ id: "renko", type: "Renko", yAxis: "right" },
				],
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
					data={data as never}
					panes={panes as never}
					engineRuntime="fork"
				/>,
			);
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});

		// The settled tree: renderPanes (VNInvestCharts.tsx:822-828) → forkEnginePanes
		// (:1230, via createPaneSpecsFromDescriptors) → EngineHost `panes`.
		const latestHostProps = w02EngineHostPropsHistory[w02EngineHostPropsHistory.length - 1];
		expect(w02EngineHostPropsHistory.length).toBeGreaterThan(0);
		const enginePanes = (latestHostProps?.panes ?? []) as Array<{
			id?: string;
			series?: Array<{ type?: unknown }>;
		}>;
		expect(enginePanes.map((pane) => pane.id)).toEqual(["price"]);
		// Exact absence AND exact survival: Renko gone, Candlestick untouched.
		expect(enginePanes[0]?.series?.map((series) => String(series.type))).toEqual(["Candlestick"]);
	});
});
