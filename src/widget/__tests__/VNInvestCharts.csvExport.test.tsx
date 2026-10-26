// @vitest-environment jsdom
// B2/A5 call-site regression lock: the CSV system-menu item must drive the
// REAL handler chain (OHLCHeader onCsvExportClick -> handleGatedCsvExport in
// VNInvestCharts -> buildBarsCsv/buildDrawingsCsv/downloadCsv) with the
// chart's ACTUAL in-memory bars — not fixtures invented inside the handler.
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
	CONTRACT_TIMEOUT,
	createAdapter,
	initializeTestImports,
	renderVNInvestCharts,
	clearEngineHostPropsHistory,
	flushMicrotasks,
	createDrawingObject,
	act,
} from "./utils";
import * as chartCsv from "../export/chartCsv";

vi.mock("../export/chartCsv", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../export/chartCsv")>();
	return {
		...actual,
		buildBarsCsv: vi.fn((...args: Parameters<typeof actual.buildBarsCsv>) => actual.buildBarsCsv(...args)),
		buildDrawingsCsv: vi.fn((...args: Parameters<typeof actual.buildDrawingsCsv>) => actual.buildDrawingsCsv(...args)),
		downloadCsv: vi.fn((...args: Parameters<typeof actual.downloadCsv>) => actual.downloadCsv(...args)),
	};
});

// Distinctive bars fed as the chart's `data` prop: they flow through the real
// pipeline (normalization -> enrich -> dataResult.plotData) into the handler.
// Assertions below match THESE values, proving the export used the chart's
// actual bars rather than anything invented at the call site.
const CSV_BARS = [
	{ date: new Date("2024-03-01T00:00:00Z"), open: 10, high: 12, low: 9, close: 11.25, volume: 100, index: 0, dataIndex: 0 },
	{ date: new Date("2024-03-02T00:00:00Z"), open: 11.25, high: 14, low: 11, close: 13.5, volume: 200, index: 1, dataIndex: 1 },
	{ date: new Date("2024-03-03T00:00:00Z"), open: 13.5, high: 13.75, low: 12, close: 12.75, volume: 300, index: 2, dataIndex: 2 },
];

const buildBarsCsvSpy = () => vi.mocked(chartCsv.buildBarsCsv);
const buildDrawingsCsvSpy = () => vi.mocked(chartCsv.buildDrawingsCsv);
const downloadCsvSpy = () => vi.mocked(chartCsv.downloadCsv);

describe("VNInvestCharts - CSV export call site (B2/A5)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof import("react-dom/client").createRoot> | null = null;

	beforeAll(async () => {
		await initializeTestImports();
	}, 30_000);

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		clearEngineHostPropsHistory();
		vi.clearAllMocks();
		// jsdom has no createObjectURL: shim it (same as chartCsv.test.ts) so
		// the REAL downloadCsv runs its DOM path instead of throwing.
		URL.createObjectURL = vi.fn(() => "blob:csv-test") as unknown as typeof URL.createObjectURL;
		URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
	});

	afterEach(async () => {
		if (root) {
			await act(async () => {
				await flushMicrotasks();
				root!.unmount();
				await flushMicrotasks();
			});
		}
		root = null;
		container?.remove();
		container = null;
		window.localStorage.clear();
		document.documentElement.lang = "en";
	});

	/** Open the mobile system menu and click the REAL "Export CSV" item. */
	async function clickCsvMenuItem(host: HTMLDivElement) {
		const header = host.querySelector('[data-testid="ohlc-header"]');
		expect(header).not.toBeNull();
		const gear = header?.querySelector('button[aria-label="Settings"]') as HTMLButtonElement | null;
		expect(gear).not.toBeNull();
		await act(async () => {
			gear!.click();
			await flushMicrotasks();
		});
		const item = Array.from(header?.querySelectorAll("button") ?? []).find(
			(b) => (b.textContent ?? "").trim() === "Export CSV",
		) as HTMLButtonElement | undefined;
		expect(item).toBeDefined();
		await act(async () => {
			item!.click();
			await flushMicrotasks();
		});
	}

	/* Tests (appended per write protocol). */
	it("menu click exports the chart's actual bars via buildBarsCsv+downloadCsv", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve([]), "csv-export-allow");
		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			data: CSV_BARS as never,
			symbol: "CSVTEST",
			timeframe: "1D" as never,
			locale: "en",
			showHeader: true,
			isMobile: true,
			debugTier: "pro",
		});
		container = result.container;
		root = result.root;
		await act(async () => {
			await flushMicrotasks();
		});

		await clickCsvMenuItem(container);

		// Gate open (pro): the REAL builder got the chart's bars.
		expect(buildBarsCsvSpy()).toHaveBeenCalledTimes(1);
		const opts = buildBarsCsvSpy().mock.calls[0][0];
		expect(opts.symbol).toBe("CSVTEST");
		expect(opts.timeframe).toBe("1D");
		expect(opts.bars).toHaveLength(CSV_BARS.length);
		expect(opts.bars.map((b) => b.close)).toEqual(CSV_BARS.map((b) => b.close));
		expect(opts.bars.map((b) => b.timestamp)).toEqual(CSV_BARS.map((b) => b.date.getTime()));
		expect(opts.bars.map((b) => b.volume)).toEqual(CSV_BARS.map((b) => b.volume));

		// And the REAL downloader saved a file scoped to this chart.
		expect(downloadCsvSpy().mock.calls.length).toBeGreaterThanOrEqual(1);
		const [filename, csv] = downloadCsvSpy().mock.calls[0];
		expect(filename).toContain("CSVTEST");
		expect(csv).toContain("loaded-in-memory");
		expect(csv).toContain("11.25");
		expect(csv).toContain(new Date("2024-03-02T00:00:00Z").toISOString());
	});

	it("blocked tier routes to upgrade and never touches CSV builders", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve([]), "csv-export-blocked");
		const UPGRADE_URL = "https://example.test/upgrade";
		const openStub = vi.spyOn(window, "open").mockImplementation(() => null);
		try {
			const result = await renderVNInvestCharts({
				adapter: adapter as never,
				data: CSV_BARS as never,
				symbol: "CSVTEST",
				timeframe: "1D" as never,
				locale: "en",
				showHeader: true,
				isMobile: true,
				// H0.5: there is no localhost fallback any more, so a test that expects
				// "routes to upgrade" must say WHERE to route — otherwise it would
				// silently assert nothing.
				upgradeUrl: UPGRADE_URL,
			});
			container = result.container;
			root = result.root;
			await act(async () => {
				await flushMicrotasks();
			});

			await clickCsvMenuItem(container);

			expect(openStub).toHaveBeenCalled();
			expect(openStub.mock.calls[0][0]).toBe(UPGRADE_URL);
			expect(buildBarsCsvSpy()).not.toHaveBeenCalled();
			expect(buildDrawingsCsvSpy()).not.toHaveBeenCalled();
			expect(downloadCsvSpy()).not.toHaveBeenCalled();
		} finally {
			openStub.mockRestore();
		}
	});

	it("menu click also exports the chart's real drawings when present", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve([]), "csv-export-drawings");
		const drawing = createDrawingObject("trendLine", [
			{ x: CSV_BARS[0].date.getTime(), y: 10 },
			{ x: CSV_BARS[1].date.getTime(), y: 12 },
		], {
			id: "csv-draw-1",
			paneId: "price",
			yScaleId: "price-right",
		});
		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			data: CSV_BARS as never,
			symbol: "CSVTEST",
			timeframe: "1D" as never,
			locale: "en",
			showHeader: true,
			isMobile: true,
			debugTier: "pro",
			drawingUiEnabled: true,
			drawings: [drawing] as never,
		});
		container = result.container;
		root = result.root;
		await act(async () => {
			await flushMicrotasks();
		});

		await clickCsvMenuItem(container);

		expect(buildDrawingsCsvSpy()).toHaveBeenCalledTimes(1);
		const drawingsArg = buildDrawingsCsvSpy().mock.calls[0][0].drawings;
		expect(drawingsArg.map((d) => d.id)).toContain("csv-draw-1");
		expect(downloadCsvSpy()).toHaveBeenCalledTimes(2);
		const [, drawingsCsv] = downloadCsvSpy().mock.calls[1];
		expect(drawingsCsv).toContain("csv-draw-1");
	});

	// ---------------------------------------------------------------------------
	// H0.9 — `debugTier` must be inert in a production build.
	//
	// CSV export is the observable because `export_csv` is a **tier-only** capability
	// (`VNInvestCharts.tsx:790` → `tierGated.allows("export_csv")`; `allows` ANDs nothing,
	// unlike `canUseReplay`/`canUseWhale` which AND a SaaS flag). The two assertions
	// above already prove both directions of that gate with this exact harness, so the
	// pair below only has to vary NODE_ENV.
	//
	// First attempt used the whale overlay and was WRONG. `canUseWhale` is
	// `allows("pro_plugin") && flags.isWhalePanelEnabled`, and `debugFeatures` is *itself*
	// production-guarded (`contexts/SaaSFeatureContext.tsx:474`) — so the overlay stayed
	// closed because the SaaS flag was suppressed, not because `debugTier` was ignored.
	// The pair passed against a build with the guard deleted outright. Confounded
	// observable, exactly the trap the S5 ledger entry warns about ("demo lặng 2 điều
	// kiện — lần đầu confounded"). Hence tier-only export.
	// ---------------------------------------------------------------------------
	async function exportCsvUnderNodeEnv(nodeEnv: string, label: string): Promise<{
		exported: boolean;
		openedUrl: string | undefined;
	}> {
		const openStub = vi.spyOn(window, "open").mockImplementation(() => null);
		try {
			// NODE_ENV must be stubbed BEFORE the render, not after: `tierGated` is computed
			// during render, and the click handler closes over that instance. Stubbing
			// afterwards leaves a stale gate and the assertion silently measures nothing.
			vi.stubEnv("NODE_ENV", nodeEnv);
			const adapter = createAdapter(Promise.resolve([]), label);
			const result = await renderVNInvestCharts({
				adapter: adapter as never,
				data: CSV_BARS as never,
				symbol: "CSVTEST",
				timeframe: "1D" as never,
				locale: "en",
				showHeader: true,
				isMobile: true,
				upgradeUrl: "https://example.test/upgrade",
				debugTier: "pro",
			});
			container = result.container;
			root = result.root;
			await act(async () => {
				await flushMicrotasks();
			});

			await clickCsvMenuItem(container);

			return {
				exported: buildBarsCsvSpy().mock.calls.length > 0,
				openedUrl: openStub.mock.calls[0]?.[0] as string | undefined,
			};
		} finally {
			vi.unstubAllEnvs();
			openStub.mockRestore();
		}
	}

	it("H0.9 non-production: debugTier still opens the export_csv gate", { timeout: CONTRACT_TIMEOUT }, async () => {
		// Guards against over-correction. Four test files and three verify-*.cjs scripts
		// depend on debugTier (csvExport:109,192 · replayPauseSlice:182 ·
		// runtimeMounts:308,405 · verify-capability-gate:13,14 · verify-export:12), so a
		// "fix" that also killed them would leave the suite green for the wrong reason.
		const { exported, openedUrl } = await exportCsvUnderNodeEnv("development", "debug-tier-dev");
		expect(exported).toBe(true);
		expect(openedUrl).toBeUndefined();
	});

	it("H0.9 production: debugTier is IGNORED and export_csv stays locked", { timeout: CONTRACT_TIMEOUT }, async () => {
		// The regression lock. Pre-H0.9 this exported with the overlay gate wide open:
		// the prop fed `useTierGatedFeatures` and `CapabilityProvider` with no production
		// guard, and simultaneously set `narrowing: undefined`, stripping the signed
		// licence's capability allowlist. AGENTS.md Rule 15 forbids exactly this
		// ("Cấm (1) Mở tính năng Pro khi chưa verify tier/license").
		const { exported, openedUrl } = await exportCsvUnderNodeEnv("production", "debug-tier-prod");
		expect(exported).toBe(false);
		expect(buildDrawingsCsvSpy()).not.toHaveBeenCalled();
		expect(downloadCsvSpy()).not.toHaveBeenCalled();
		expect(openedUrl).toBe("https://example.test/upgrade");
	});
});
