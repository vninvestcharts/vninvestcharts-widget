// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { vnExchangeCalendar } from "../../lib/calendars";
import type { DataAdapter, SourceSemanticsDescriptor } from "../../lib/adapters";
import type { OHLCVBar } from "../../lib/types/ohlcv";
import { computeMissingSegments } from "../../widget/history/historyWindowPlanner";
import { filterBarsForFinalityMerge } from "../../widget/history/historyDataUtils";
import { toCacheSemanticScope } from "../../widget/history/cache/LocalCacheMatrix";
import { useStockChartAdapter } from "../useStockChartAdapter";
import type { ActiveSource } from "../components/DataSourceSwitcher";

// Extended timeout for integration tests (3 minutes)
// These tests render full chart components with mocked adapters
const INTEGRATION_TIMEOUT = 3 * 60 * 1000; // 3 minutes

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

type HarnessProps = {
	activeSource: ActiveSource;
	dataAdapter: DataAdapter;
	selectedSymbol: string;
	useWidgetOwnedHistory: boolean;
	widgetData: readonly OHLCVBar[];
	backfillPageLimit: number;
	onAdapter: (adapter: ReturnType<typeof useStockChartAdapter>) => void;
};

function createWidgetBar(timestamp: string, close: number, index: number): OHLCVBar {
	return {
		date: new Date(timestamp),
		open: close - 1,
		high: close + 1,
		low: close - 2,
		close,
		volume: 1000 + index,
		index,
		dataIndex: index,
	};
}

function makeSemantics(overrides: Partial<SourceSemanticsDescriptor>): SourceSemanticsDescriptor {
	return {
		sourceId: "test-source",
		sourceContractVersion: "1.0",
		instrumentClass: "equity",
		coverageMode: "anchor-before",
		sessionModel: "continuous",
		timezone: "UTC",
		supportsExactRangeFetch: false,
		supportsBackwardAnchor: true,
		supportsForwardAnchor: false,
		supportsLiveBars: false,
		finalityMode: "immutable",
		expectedGapReasons: ["not-fetched", "boundary-exhausted"],
		...overrides,
	};
}

function Harness(props: HarnessProps) {
	const adapter = useStockChartAdapter({
		activeSource: props.activeSource,
		dataAdapter: props.dataAdapter,
		selectedSymbol: props.selectedSymbol,
		useWidgetOwnedHistory: props.useWidgetOwnedHistory,
		widgetData: props.widgetData,
		backfillPageLimit: props.backfillPageLimit,
	});

	useEffect(() => {
		props.onAdapter(adapter);
	}, [adapter, props.onAdapter]);

	return null;
}

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe("useStockChartAdapter integration", () => {
	let container: HTMLDivElement | null = null;
	let root: Root | null = null;

	afterEach(async () => {
		if (root) {
			await act(async () => {
				root?.unmount();
				await flushMicrotasks();
			});
		}
		root = null;
		container?.remove();
		container = null;
		window.localStorage.clear();
	});

	it("routes online exact-range sources through adapter exact-range fetch", { timeout: INTEGRATION_TIMEOUT }, async () => {
		const bars = [
			createWidgetBar("2024-01-01T00:00:00Z", 100, 0),
			createWidgetBar("2024-01-01T01:00:00Z", 101, 1),
		];
		const getBars = vi.fn().mockResolvedValue({ bars: [], coverage: [], hasMore: false });
		const fetchBarsInRange = vi.fn().mockResolvedValue([
			{ timestamp: bars[0].date.getTime(), open: 100, high: 101, low: 99, close: 100, volume: 10 },
			{ timestamp: bars[1].date.getTime(), open: 101, high: 102, low: 100, close: 101, volume: 11 },
		]);
		const dataAdapter: DataAdapter = {
			name: "binance",
			getBars,
			fetchBarsInRange,
			getSourceSemantics: () => makeSemantics({
				sourceId: "binance",
				sourceContractVersion: "binance-klines-v1",
				instrumentClass: "crypto",
				coverageMode: "exact-range",
				sessionModel: "continuous",
				timezone: "UTC",
				supportsExactRangeFetch: true,
				supportsBackwardAnchor: true,
				supportsLiveBars: true,
				finalityMode: "near-now-provisional",
				expectedGapReasons: ["not-fetched", "source-no-data", "rate-limited", "boundary-exhausted"],
			}),
		};
		const captureAdapter = vi.fn();

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<Harness
					activeSource="binance"
					backfillPageLimit={300}
					dataAdapter={dataAdapter}
					onAdapter={captureAdapter}
					selectedSymbol="BTCUSDT"
					useWidgetOwnedHistory={true}
					widgetData={bars}
				/>,
			);
			await flushMicrotasks();
		});

		const adapter = captureAdapter.mock.calls[0]?.[0] as ReturnType<typeof useStockChartAdapter>;
		expect(adapter.getSourceSemantics?.()).toMatchObject({
			sourceId: "binance",
			coverageMode: "exact-range",
			supportsExactRangeFetch: true,
			supportsBackwardAnchor: true,
		});

		const loaded = await adapter.fetchBarsInRange("BTCUSDT", "1h", new Date("2024-01-01T00:00:00Z"), new Date("2024-01-01T02:00:00Z"));
		expect(fetchBarsInRange).toHaveBeenCalledTimes(1);
		expect(fetchBarsInRange).toHaveBeenCalledWith(
			"BTCUSDT",
			"1h",
			new Date("2024-01-01T00:00:00Z"),
			new Date("2024-01-01T02:00:00Z"),
		);
		expect(getBars).not.toHaveBeenCalled();
		expect(loaded.map((bar) => bar.close)).toEqual([100, 101]);
		expect(toCacheSemanticScope(adapter.getSourceSemantics?.() as SourceSemanticsDescriptor)).toMatchObject({
			sourceContractVersion: "binance-klines-v1",
			instrumentClass: "crypto",
			sessionModel: "continuous",
			finalityMode: "near-now-provisional",
		});
	});

	it("records backward coverage for direct exact-range helper calls", { timeout: INTEGRATION_TIMEOUT }, async () => {
		const backwardBars = [
			{ timestamp: Date.parse("2024-01-01T00:00:00Z"), open: 100, high: 101, low: 99, close: 100, volume: 10 },
			{ timestamp: Date.parse("2024-01-01T01:00:00Z"), open: 101, high: 102, low: 100, close: 101, volume: 11 },
		];
		const fetchBarsBefore = vi.fn().mockResolvedValue(backwardBars);
		const dataAdapter: DataAdapter = {
			name: "binance",
			getBars: vi.fn().mockResolvedValue({ bars: [], hasMore: false }),
			fetchBarsBefore,
			getSourceSemantics: () => makeSemantics({
				sourceId: "binance",
				sourceContractVersion: "binance-klines-v1",
				instrumentClass: "crypto",
				coverageMode: "exact-range",
				sessionModel: "continuous",
				timezone: "UTC",
				supportsExactRangeFetch: true,
				supportsBackwardAnchor: true,
				supportsLiveBars: true,
				finalityMode: "near-now-provisional",
				expectedGapReasons: ["not-fetched", "source-no-data", "rate-limited", "boundary-exhausted"],
			}),
		};
		const captureAdapter = vi.fn();

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<Harness
					activeSource="binance"
					backfillPageLimit={300}
					dataAdapter={dataAdapter}
					onAdapter={captureAdapter}
					selectedSymbol="BTCUSDT"
					useWidgetOwnedHistory={true}
					widgetData={[]}
				/>,
			);
			await flushMicrotasks();
		});

		const adapter = captureAdapter.mock.calls[0]?.[0] as ReturnType<typeof useStockChartAdapter>;
		await adapter.fetchBarsBefore("BTCUSDT", "1h", new Date("2024-01-01T02:00:00Z"), 1000);

		expect(fetchBarsBefore).toHaveBeenCalledWith(
			"BTCUSDT",
			"1h",
			new Date("2024-01-01T02:00:00Z"),
			1000,
		);
		expect(adapter.getLastBackfillCoverage?.()).toEqual([
			{ fromTs: Date.parse("2024-01-01T00:00:00Z"), toTs: Date.parse("2024-01-01T01:00:00Z"), status: "covered" },
		]);
	});

	it("does not mark backward coverage as boundary-exhausted when the widget request exceeds the source page cap", async () => {
		const backwardBars = Array.from({ length: 1000 }, (_, index) => ({
			timestamp: Date.parse("2024-01-01T00:00:00Z") + index * 60 * 60 * 1000,
			open: 100 + index,
			high: 101 + index,
			low: 99 + index,
			close: 100 + index,
			volume: 10 + index,
		}));
		const fetchBarsBefore = vi.fn().mockResolvedValue(backwardBars);
		const dataAdapter: DataAdapter = {
			name: "binance",
			getBars: vi.fn().mockResolvedValue({ bars: [], hasMore: false }),
			fetchBarsBefore,
			getSourceSemantics: () => makeSemantics({
				sourceId: "binance",
				sourceContractVersion: "binance-klines-v1",
				instrumentClass: "crypto",
				coverageMode: "exact-range",
				sessionModel: "continuous",
				timezone: "UTC",
				supportsExactRangeFetch: true,
				supportsBackwardAnchor: true,
				supportsLiveBars: true,
				maxBarsPerRequest: 1000,
				finalityMode: "near-now-provisional",
				expectedGapReasons: ["not-fetched", "source-no-data", "rate-limited", "boundary-exhausted"],
			}),
		};
		const captureAdapter = vi.fn();

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<Harness
					activeSource="binance"
					backfillPageLimit={300}
					dataAdapter={dataAdapter}
					onAdapter={captureAdapter}
					selectedSymbol="BTCUSDT"
					useWidgetOwnedHistory={true}
					widgetData={[]}
				/>,
			);
			await flushMicrotasks();
		});

		const adapter = captureAdapter.mock.calls[0]?.[0] as ReturnType<typeof useStockChartAdapter>;
		await adapter.fetchBarsBefore("BTCUSDT", "1h", new Date("2024-03-01T00:00:00Z"), 3000);

		expect(fetchBarsBefore).toHaveBeenCalledWith(
			"BTCUSDT",
			"1h",
			new Date("2024-03-01T00:00:00Z"),
			3000,
		);
		expect(adapter.getLastBackfillCoverage?.()).toEqual([
			{
				fromTs: Date.parse("2024-01-01T00:00:00Z"),
				toTs: Date.parse("2024-02-11T15:00:00Z"),
				status: "covered",
			},
		]);
	});

	it("records range coverage for direct exact-range helper calls", async () => {
		const rangeBars = [
			{ timestamp: Date.parse("2024-01-01T00:00:00Z"), open: 100, high: 101, low: 99, close: 100, volume: 10 },
			{ timestamp: Date.parse("2024-01-01T01:00:00Z"), open: 101, high: 102, low: 100, close: 101, volume: 11 },
		];
		const fetchBarsInRange = vi.fn().mockResolvedValue(rangeBars);
		const dataAdapter: DataAdapter = {
			name: "binance",
			getBars: vi.fn().mockResolvedValue({ bars: [], hasMore: false }),
			fetchBarsInRange,
			getSourceSemantics: () => makeSemantics({
				sourceId: "binance",
				sourceContractVersion: "binance-klines-v1",
				instrumentClass: "crypto",
				coverageMode: "exact-range",
				sessionModel: "continuous",
				timezone: "UTC",
				supportsExactRangeFetch: true,
				supportsBackwardAnchor: true,
				supportsLiveBars: true,
				finalityMode: "near-now-provisional",
				expectedGapReasons: ["not-fetched", "source-no-data", "rate-limited", "boundary-exhausted"],
			}),
		};
		const captureAdapter = vi.fn();

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<Harness
					activeSource="binance"
					backfillPageLimit={300}
					dataAdapter={dataAdapter}
					onAdapter={captureAdapter}
					selectedSymbol="BTCUSDT"
					useWidgetOwnedHistory={true}
					widgetData={[]}
				/>,
			);
			await flushMicrotasks();
		});

		const adapter = captureAdapter.mock.calls[0]?.[0] as ReturnType<typeof useStockChartAdapter>;
		await adapter.fetchBarsInRange(
			"BTCUSDT",
			"1h",
			new Date("2024-01-01T00:00:00Z"),
			new Date("2024-01-01T02:00:00Z"),
		);

		expect(fetchBarsInRange).toHaveBeenCalledWith(
			"BTCUSDT",
			"1h",
			new Date("2024-01-01T00:00:00Z"),
			new Date("2024-01-01T02:00:00Z"),
		);
		expect(adapter.getLastRangeCoverage?.()).toEqual([
			{ fromTs: Date.parse("2024-01-01T00:00:00Z"), toTs: Date.parse("2024-01-01T01:00:00Z"), status: "covered" },
		]);
	});

	it("does not mark exact-range window coverage as boundary-exhausted when the source returns its page cap", async () => {
		const rangeBars = Array.from({ length: 1000 }, (_, index) => ({
			timestamp: Date.parse("2024-01-01T00:00:00Z") + index * 60 * 60 * 1000,
			open: 100 + index,
			high: 101 + index,
			low: 99 + index,
			close: 100 + index,
			volume: 10 + index,
		}));
		const fetchBarsInRange = vi.fn().mockResolvedValue(rangeBars);
		const dataAdapter: DataAdapter = {
			name: "binance",
			getBars: vi.fn().mockResolvedValue({ bars: [], hasMore: false }),
			fetchBarsInRange,
			getSourceSemantics: () => makeSemantics({
				sourceId: "binance",
				sourceContractVersion: "binance-klines-v1",
				instrumentClass: "crypto",
				coverageMode: "exact-range",
				sessionModel: "continuous",
				timezone: "UTC",
				supportsExactRangeFetch: true,
				supportsBackwardAnchor: true,
				supportsLiveBars: true,
				maxBarsPerRequest: 1000,
				finalityMode: "near-now-provisional",
				expectedGapReasons: ["not-fetched", "source-no-data", "rate-limited", "boundary-exhausted"],
			}),
		};
		const captureAdapter = vi.fn();

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<Harness
					activeSource="binance"
					backfillPageLimit={300}
					dataAdapter={dataAdapter}
					onAdapter={captureAdapter}
					selectedSymbol="BTCUSDT"
					useWidgetOwnedHistory={true}
					widgetData={[]}
				/>,
			);
			await flushMicrotasks();
		});

		const adapter = captureAdapter.mock.calls[0]?.[0] as ReturnType<typeof useStockChartAdapter>;
		await adapter.fetchBarsInRange(
			"BTCUSDT",
			"1h",
			new Date("2024-01-01T00:00:00Z"),
			new Date("2024-04-01T00:00:00Z"),
		);

		expect(fetchBarsInRange).toHaveBeenCalledWith(
			"BTCUSDT",
			"1h",
			new Date("2024-01-01T00:00:00Z"),
			new Date("2024-04-01T00:00:00Z"),
		);
		expect(adapter.getLastRangeCoverage?.()).toEqual([
			{
				fromTs: Date.parse("2024-01-01T00:00:00Z"),
				toTs: Date.parse("2024-02-11T15:00:00Z"),
				status: "covered",
			},
		]);
	});

	it("routes offline exchange-calendar sources through widget data and marks weekend gaps as market-closed", { timeout: INTEGRATION_TIMEOUT }, async () => {
		const widgetBars = [
			createWidgetBar("2024-11-08T07:00:00Z", 200, 0),
			createWidgetBar("2024-11-08T08:00:00Z", 201, 1),
		];
		const dataAdapter: DataAdapter = {
			name: "vnstocks",
			getBars: vi.fn(),
			getSourceSemantics: () => makeSemantics({
				sourceId: "vnstocks",
				sourceContractVersion: "vnstocks-window-v1",
				instrumentClass: "equity",
				coverageMode: "window-hint",
				sessionModel: "exchange-calendar",
				timezone: "Asia/Ho_Chi_Minh",
				sessionCalendarId: "vn-exchange-calendar",
				supportsExactRangeFetch: false,
				supportsBackwardAnchor: true,
				supportsLiveBars: true,
				finalityMode: "historically-correctable",
				correctionLookbackMs: 7 * 24 * 3_600_000,
				expectedGapReasons: ["not-fetched", "market-closed", "source-no-data", "rate-limited", "boundary-exhausted"],
			}),
		};
		const captureAdapter = vi.fn();

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<Harness
					activeSource="vninvest"
					backfillPageLimit={300}
					dataAdapter={dataAdapter}
					onAdapter={captureAdapter}
					selectedSymbol="VCB"
					useWidgetOwnedHistory={false}
					widgetData={widgetBars}
				/>,
			);
			await flushMicrotasks();
		});

		const adapter = captureAdapter.mock.calls[0]?.[0] as ReturnType<typeof useStockChartAdapter>;
		expect(adapter.getSourceSemantics?.()).toMatchObject({
			sourceId: "vnstocks",
			sessionModel: "exchange-calendar",
			sessionCalendarId: "vn-exchange-calendar",
			timezone: "Asia/Ho_Chi_Minh",
			finalityMode: "historically-correctable",
		});

		const offlineBars = await adapter.fetchBarsInRange("VCB", "1h", new Date("2024-11-08T00:00:00Z"), new Date("2024-11-11T00:00:00Z"));
		expect(offlineBars).toHaveLength(2);
		expect(offlineBars[0]).not.toBe(widgetBars[0]);
		expect(offlineBars[0].date).not.toBe(widgetBars[0].date);

		const weekendResident = { startMs: Date.UTC(2024, 10, 8, 17, 0, 0), endMs: Date.UTC(2024, 10, 9, 17, 0, 0) };
		const loadedRange = { startMs: weekendResident.startMs - 24 * 3_600_000, endMs: weekendResident.startMs };
		const weekendSegments = computeMissingSegments(weekendResident, loadedRange, adapter.getSourceSemantics?.() as SourceSemanticsDescriptor, vnExchangeCalendar);
		expect(weekendSegments).toHaveLength(1);
		expect(weekendSegments[0].reason).toBe("market-closed");
	});

	it("replays correctable source bars within lookback and rejects stale corrections outside the lookback", { timeout: INTEGRATION_TIMEOUT }, () => {
		const semantics = makeSemantics({
			sourceId: "vnstocks",
			sourceContractVersion: "vnstocks-window-v1",
			instrumentClass: "equity",
			coverageMode: "window-hint",
			sessionModel: "exchange-calendar",
			timezone: "Asia/Ho_Chi_Minh",
			sessionCalendarId: "vn-exchange-calendar",
			finalityMode: "historically-correctable",
			correctionLookbackMs: 7 * 24 * 3_600_000,
			expectedGapReasons: ["not-fetched", "market-closed", "source-no-data", "rate-limited", "boundary-exhausted"],
		});
		const nowMs = Date.UTC(2024, 10, 18, 3, 0, 0);
		const resident = [
			createWidgetBar("2024-11-12T03:00:00Z", 300, 0),
			createWidgetBar("2024-11-13T03:00:00Z", 301, 1),
		];
		const incoming = [
			createWidgetBar("2024-11-12T03:00:00Z", 399, 0),
			createWidgetBar("2024-11-01T03:00:00Z", 199, 1),
		];

		const filtered = filterBarsForFinalityMerge(incoming, resident, {
			finalityMode: semantics.finalityMode,
			nowMs,
			correctionLookbackMs: semantics.correctionLookbackMs,
		});

		expect(filtered).toHaveLength(2);
		expect(filtered.map((bar) => bar.close)).toEqual([399, 199]);

		const staleReplay = [createWidgetBar("2024-11-13T03:00:00Z", 500, 0)];
		const staleFiltered = filterBarsForFinalityMerge(staleReplay, [createWidgetBar("2024-11-13T03:00:00Z", 300, 0)], {
			finalityMode: semantics.finalityMode,
			nowMs,
			correctionLookbackMs: semantics.correctionLookbackMs,
		});
		expect(staleFiltered).toHaveLength(1);
		expect(staleFiltered[0].close).toBe(500);

		const tooOldReplay = [createWidgetBar("2024-10-01T03:00:00Z", 900, 0)];
		const tooOldFiltered = filterBarsForFinalityMerge(tooOldReplay, [createWidgetBar("2024-10-01T03:00:00Z", 300, 0)], {
			finalityMode: semantics.finalityMode,
			nowMs,
			correctionLookbackMs: semantics.correctionLookbackMs,
		});
		expect(tooOldFiltered).toHaveLength(0);
	});
});
