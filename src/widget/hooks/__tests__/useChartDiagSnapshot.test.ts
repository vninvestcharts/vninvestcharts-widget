/**
 * useChartDiagSnapshot unit tests.
 *
 * BL-03B S3: this hook is a verbatim move of VNInvestCharts.tsx:1586-1672
 * (BLACKSCREEN-DIAG snapshot builder). These cases pin the invariants that make
 * the overlay worth having: EMPTY paneSpecs, NaN scan first-bad index, thrown
 * engine calls, dataError stringification and the exact panes/domains
 * formatting. Mutation proof at Stage 4: `bad >= 0` -> `bad > 0` and
 * `"EMPTY"` -> `"OK"` must each break a case, or the case is vacuous.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { act, createElement } from "react";
import type { EngineInstance } from "@vninvestcharts/engine-core";
import {
	useChartDiagSnapshot,
	type UseChartDiagSnapshotParams,
} from "../useChartDiagSnapshot";
import type { ChartDiagSnapshot } from "../../components/ChartDiagOverlay";

function fauxEngine(over: Record<string, unknown> = {}): EngineInstance {
	return {
		getVisibleRange: () => ({ from: 10, to: 20 }),
		paneSpecs: [],
		getPaneSnapshots: () => [],
		enrichedData: [],
		...over,
	} as unknown as EngineInstance;
}

function baseParams(over: Partial<UseChartDiagSnapshotParams> = {}): UseChartDiagSnapshotParams {
	return {
		engineInstanceRef: { current: null },
		forkEngineInstance: null,
		isForkRuntime: true,
		bars: [],
		enrichedData: [],
		plotData: [],
		dataError: null,
		visiblePanes: [],
		chartType: "candlestick",
		effectiveToolbarTier: "free",
		diagDocument: null,
		...over,
	};
}

function mountHook(params: UseChartDiagSnapshotParams) {
	let latest: (() => ChartDiagSnapshot) | null = null;
	let current = params;
	function Harness() {
		latest = useChartDiagSnapshot(current);
		return null;
	}
	const rendered = render(createElement(Harness));
	return {
		snapshot: (): ChartDiagSnapshot => {
			if (!latest) throw new Error("hook did not run");
			return latest();
		},
		callback: (): (() => ChartDiagSnapshot) | null => latest,
		rerender: (p: UseChartDiagSnapshotParams) => {
			current = p;
			rendered.rerender(createElement(Harness));
		},
		unmount: rendered.unmount,
	};
}

beforeEach(() => {
	cleanup();
});

describe("useChartDiagSnapshot", () => {
	it("happy path: engine present, range, specs, domains, counts, panes formatting", () => {
		const engine = fauxEngine({
			paneSpecs: [{ id: "main", series: [{ type: "candlestick" }] }],
			getPaneSnapshots: () => [
				{ paneId: "main", scaleSlotStates: { price: { domain: [1, 2] } } },
			],
			enrichedData: [
				{ open: 1, high: 2, low: 0.5, close: 1.5, date: new Date("2024-01-01T00:00:00Z") },
				{ open: 2, high: 3, low: 1, close: 2.5, date: new Date("2024-01-02T00:00:00Z") },
			],
		});
		const h = mountHook(baseParams({
			engineInstanceRef: { current: engine },
			forkEngineInstance: engine,
			bars: [1, 2, 3],
			enrichedData: [1, 2],
			plotData: [1, 2, 3, 4],
			visiblePanes: [
				{ id: "main", visible: true, series: [{ type: "candlestick" }, { type: "volume" }] },
				{ id: "rsi", visible: false, series: [] },
			] as unknown as UseChartDiagSnapshotParams["visiblePanes"],
			diagDocument: {
				querySelectorAll: () => [{ width: 100, height: 50 }],
			} as unknown as Document,
		}));
		const snap = h.snapshot();
		expect(snap.enginePresent).toBe(true);
		expect(snap.forkEngineSet).toBe(true);
		expect(snap.isForkRuntime).toBe(true);
		expect(snap.bars).toBe(3);
		expect(snap.enriched).toBe(2);
		expect(snap.plot).toBe(4);
		expect(snap.engineRange).toBe("from=10 to=20");
		expect(snap.specs).toBe("main(1)");
		expect(snap.domains).toBe("main:price=[1.0,2.0]");
		expect(snap.nanScan).toBe("clean/2");
		expect(snap.lastBar).toBe("c=2.5 t=2024-01-02T00:00:00.000Z");
		expect(snap.panes).toBe("main(v):candlestick+volume | rsi(h):");
		expect(snap.chartType).toBe("candlestick");
		expect(snap.tier).toBe("free");
		expect(snap.dataError).toBe("none");
		expect(snap.canvases).toBe("1:100x50");
	});

	it("engine null: absent fields, EMPTY specs, empty domains, clean/0 + empty lastBar", () => {
		const h = mountHook(baseParams());
		const snap = h.snapshot();
		expect(snap.enginePresent).toBe(false);
		expect(snap.forkEngineSet).toBe(false);
		expect(snap.engineRange).toBe("n/a");
		expect(snap.specs).toBe("EMPTY");
		expect(snap.domains).toBe("empty");
		expect(snap.nanScan).toBe("clean/0");
		expect(snap.lastBar).toBe("empty");
		expect(snap.canvases).toBe("n/a");
	});

	it("canvases: injected document metrics, null document -> n/a, throw -> threw", () => {
		const fakeDoc = (q: () => unknown[]) => ({ querySelectorAll: q }) as unknown as Document;
		const two = mountHook(baseParams({
			diagDocument: fakeDoc(() => [{ width: 1, height: 2 }, { width: 3, height: 4 }]),
		}));
		expect(two.snapshot().canvases).toBe("2:1x2,3x4");
		expect(mountHook(baseParams({ diagDocument: null })).snapshot().canvases).toBe("n/a");
		const throwing = mountHook(baseParams({
			diagDocument: fakeDoc(() => {
				throw new Error("x");
			}),
		}));
		expect(throwing.snapshot().canvases).toBe("threw");
	});

	it("engineRange threw when getVisibleRange throws", () => {
		const engine = fauxEngine({
			getVisibleRange: () => {
				throw new Error("boom");
			},
		});
		const h = mountHook(baseParams({ engineInstanceRef: { current: engine } }));
		expect(h.snapshot().engineRange).toBe("threw");
	});

	it("paneSpecs: EMPTY when zero, id(n) joined otherwise", () => {
		const empty = mountHook(baseParams({ engineInstanceRef: { current: fauxEngine() } }));
		expect(empty.snapshot().specs).toBe("EMPTY");
		const withSpecs = mountHook(baseParams({
			engineInstanceRef: { current: fauxEngine({ paneSpecs: [{ id: "main", series: [{}, {}] }, { id: "vol" }] }) },
		}));
		expect(withSpecs.snapshot().specs).toBe("main(2) | vol(0)");
	});

	it("nanScan: index 0 -> BAD@0/n (mutation M1 anchor); index 1; clean; n=0", () => {
		const bar = (close: number) => ({ open: close - 1, high: close + 1, low: close - 2, close });
		const mk = (rows: Array<unknown>) => mountHook(baseParams({
			engineInstanceRef: { current: fauxEngine({ enrichedData: rows }) },
		}));
		expect(mk([{ ...bar(1), close: NaN }]).snapshot().nanScan).toBe("BAD@0/1");
		expect(mk([bar(1), { ...bar(2), low: NaN }]).snapshot().nanScan).toBe("BAD@1/2");
		expect(mk([bar(1), bar(2)]).snapshot().nanScan).toBe("clean/2");
		expect(mk([]).snapshot().nanScan).toBe("clean/0");
	});

	it("dataError: message, string, number, null, slice(0,120)", () => {
		const mk = (dataError: unknown) => mountHook(baseParams({ dataError }));
		expect(mk({ message: "boom" }).snapshot().dataError).toBe("boom");
		expect(mk("plain").snapshot().dataError).toBe("plain");
		expect(mk(123).snapshot().dataError).toBe("123");
		expect(mk(null).snapshot().dataError).toBe("none");
		expect(mk("x".repeat(200)).snapshot().dataError).toBe("x".repeat(120));
	});

	it("domains: bad domain -> [?], empty slot set, lastBar non-Date", () => {
		const engine = fauxEngine({
			getPaneSnapshots: () => [
				{ paneId: "main", scaleSlotStates: { price: { domain: [1, 2.5] }, vol: { domain: "bad" } } },
				{ paneId: "sub", scaleSlotStates: {} },
			],
			enrichedData: [{ open: 1, high: 1, low: 1, close: 7, date: 1700000000000 }],
		});
		const h = mountHook(baseParams({ engineInstanceRef: { current: engine } }));
		const snap = h.snapshot();
		expect(snap.domains).toBe("main:price=[1.0,2.5];vol=[?] | sub:");
		expect(snap.lastBar).toBe("c=7 t=1700000000000");
	});

	it("callback identity: stable across rerender with same deps, changes with new deps", () => {
		const params = baseParams();
		const h = mountHook(params);
		const first = h.callback();
		act(() => {
			h.rerender(params);
		});
		expect(h.callback()).toBe(first);
		act(() => {
			h.rerender({ ...params, bars: [1] });
		});
		expect(h.callback()).not.toBe(first);
	});
});
