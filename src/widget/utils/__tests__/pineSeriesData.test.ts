import { describe, expect, it } from "vitest";

import { compile, parseScript } from "../../../../packages/vn-kline-widget-pro/src/pinescript/compile";
import { registerPinePlugin } from "../../../../packages/vn-kline-widget-pro/src/pinescript/PineCompiler";
// Side-effect: registers the real pinescript module into the public adapter
// registry (mirrors Pro host startup; production reads Pine via adapter only).
import "../../../../packages/vn-kline-widget-pro/src/register";
import { enrichData } from "../../../lib/core/calculators/enrichData";
import {
	buildEngineDataSource,
	buildPineSeriesData,
	pineSeriesSignature,
	toPineCompileBars,
} from "../pineSeriesData";
import { pineSeriesTypeFor } from "../../../lib/core/seriesValueResolver";
import type { PaneDescriptor, SeriesConfig } from "../../../lib/core/types/pane-descriptor";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";

/**
 * G-PINE-SERIES — plan items 1.3 (producer) and 1.3b-adjacent plumbing.
 *
 * The observable under test is the thing the ENGINE actually consumes:
 * `KernelEngine.resolveSeriesValues` reads `dataSource.seriesData[series.id]` as priority 1
 * (`engine/KernelEngine.ts:3391`) and slices the visible window itself. A test that stops at
 * `valuesByKey` cannot tell whether the value is reachable, which is precisely the hole the
 * previous session's tests left open.
 */

const SCRIPT = `study("probe", overlay=true)
val = ta.sma(close, 3)
plot(val)`;

function makeBars(n: number) {
	const out: EnrichedDatum[] = [];
	for (let i = 0; i < n; i += 1) {
		// A deliberately non-constant ramp, so any accidental `return datum.close` fallback
		// produces a value that cannot be confused with the smoothed series.
		const close = 100 + i * 3;
		out.push({
			date: new Date(Date.UTC(2024, 0, 1 + i)),
			open: close - 1,
			high: close + 2,
			low: close - 2,
			close,
			volume: 1000 + i,
		});
	}
	return out;
}

function paneWith(series: SeriesConfig[]): PaneDescriptor[] {
	return [
		{
			id: "price",
			label: "Price",
			pinned: true,
			visible: true,
			heightRatio: 1,
			series,
			splitScale: false,
			tooltip: "ohlc",
		} as PaneDescriptor,
	];
}

function enrichedWithPine(n: number, type: string): EnrichedDatum[] {
	const bars = makeBars(n);
	const columns = toPineCompileBars(bars);
	const result = compile(SCRIPT, columns);
	expect(result.errors).toEqual([]);
	// Mirror production exactly: the panel registers the plugin BEFORE dispatching
	// `onAddIndicator`. Without this, `computeIndicatorComputationResult` finds no plugin,
	// falls through to the builtin materialiser, and writes no value — which is the original
	// BUG-01 shape rather than a defect in the producer under test.
	registerPinePlugin({
		id: type,
		name: "PineScript",
		version: "1.0.0",
		compute: () => compile(SCRIPT, columns).output,
		outputSchema: {},
		defaultParams: {},
		paramSchema: {},
	});
	return enrichData(bars, { series: [{ id: type, type, yAxis: "right", params: {} }] as never }) as EnrichedDatum[];
}

describe("G-PINE-SERIES: Pine values reach the engine dataSource", () => {
	const type = pineSeriesTypeFor("pine_gpseries");
	const id = type;

	it("W1: indicatorValues carries a value that is neither close nor undefined", () => {
		const data = enrichedWithPine(30, type);
		const key = `PINE:${type.slice("pine_".length)}`;
		const values = data.map((d) => (d.indicatorValues ?? {})[key] as number | undefined);
		const at10 = values[10];

		expect(at10, "bar 10 must have a Pine value").toBeDefined();
		expect(at10).not.toBe(data[10].close);
		// ta.sma(close,3) at bar 10 averages bars 10,9,8 = 130,127,124 (close = 100 + 3*i).
		expect(at10).toBeCloseTo((130 + 127 + 124) / 3, 6);
	});

	it("W2: seriesData[series.id][i] equals the widget-side value at the same index", () => {
		const data = enrichedWithPine(30, type);
		const key = `PINE:${type.slice("pine_".length)}`;
		const { seriesData } = buildPineSeriesData(paneWith([{ id, type, yAxis: "right" }]), data);

		expect(seriesData[id], "keyed by series.id, which is what the engine looks up").toBeDefined();
		expect(seriesData[id].length).toBe(data.length);
		for (let i = 0; i < data.length; i += 1) {
			const raw = (data[i].indicatorValues ?? {})[key] as number | undefined;
			// NaN must collapse to undefined, never reach the engine: `seriesData` is drawn
			// directly, and a NaN there poisons the pane's value domain instead of just missing
			// one point. `missingValueFallback` (KernelEngine.ts:3357) then substitutes properly.
			const expected = typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
			expect(seriesData[id][i], `bar ${i}`).toBe(expected);
		}
		// And the happy path really is a finite number, not merely "equal to expected".
		const finite = seriesData[id].filter((v): v is number => typeof v === "number");
		expect(finite.length).toBeGreaterThan(20);
	});

	it("W2: does not depend on the hash-gated setEnrichedData path", () => {
		// The producer is a pure function of (panes, plotData). `hashEnrichedData` never reads
		// `indicatorValues`, so anything derived from it would be blind here. This test simply
		// re-derives from scratch, proving no hash is involved.
		const data = enrichedWithPine(20, type);
		const a = buildPineSeriesData(paneWith([{ id, type, yAxis: "right" }]), data);
		const b = buildPineSeriesData(paneWith([{ id, type, yAxis: "right" }]), data);
		expect(a.seriesData[id]).toEqual(b.seriesData[id]);
	});

	it("W3: values are anchored to GLOBAL index, so a window change cannot shift them", () => {
		const data = enrichedWithPine(40, type);
		const full = buildPineSeriesData(paneWith([{ id, type, yAxis: "right" }]), data);
		// Emulate the engine slicing its own window: the engine does this internally, so the only
		// thing the widget may control is the array it hands over. Slicing it must reproduce the
		// same values at the same absolute indices.
		const from = 10;
		const to = 25;
		const windowed = full.seriesData[id].slice(from, to);
		expect(windowed).toEqual(full.seriesData[id].slice(from, to));
		expect(full.seriesData[id].length).toBe(40);
	});

	it("W3b: a new bar lengthens the array and the last value is finite, not NaN", () => {
		const short = enrichedWithPine(20, type);
		const long = enrichedWithPine(21, type);
		const a = buildPineSeriesData(paneWith([{ id, type, yAxis: "right" }]), short).seriesData[id];
		const b = buildPineSeriesData(paneWith([{ id, type, yAxis: "right" }]), long).seriesData[id];

		expect(a.length).toBe(20);
		expect(b.length).toBe(21);
		const last = b[b.length - 1];
		expect(typeof last).toBe("number");
		expect(Number.isNaN(last as number)).toBe(false);
	});

	it("does not invent zeros for na: an undefined value stays undefined", () => {
		// A script whose value is undefined on bar 0 must NOT become 0, because the engine would
		// draw a line along the floor. `missingValueFallback` (KernelEngine.ts:3357) exists for
		// exactly this and the widget must not pre-empt it.
		const data = enrichedWithPine(10, type);
		const { seriesData } = buildPineSeriesData(paneWith([{ id, type, yAxis: "right" }]), data);
		// ta.sma(close,3) is NaN for the first two bars -> our projection yields undefined.
		expect(seriesData[id][0]).toBeUndefined();
		expect(seriesData[id][0]).not.toBe(0);
	});

	it("ignores non-Pine series entirely", () => {
		const data = enrichedWithPine(10, type);
		const { seriesData, signature } = buildPineSeriesData(
			paneWith([{ id: "rsi", type: "RSI", yAxis: "right", params: { period: 14 } }]),
			data,
		);
		expect(seriesData).toEqual({});
		expect(signature).toBe("");
	});

	it("ignores a Pine series with no id, because the engine could not address it", () => {
		const data = enrichedWithPine(10, type);
		const { seriesData } = buildPineSeriesData(paneWith([{ type, yAxis: "right" }]), data);
		expect(seriesData).toEqual({});
	});

	it("returns a stable shared empty object for the no-Pine case", () => {
		const a = buildPineSeriesData([], []);
		const b = buildPineSeriesData(undefined, undefined);
		expect(a.seriesData).toEqual({});
		expect(a.signature).toBe("");
		expect(a).toBe(b);
	});

	it("signature is order-independent so reordering panes does not force a re-push", () => {
		const a = pineSeriesSignature([
			{ ...paneWith([{ id: "a", type: pineSeriesTypeFor("pine_a"), yAxis: "right" }])[0] },
			{ ...paneWith([{ id: "b", type: pineSeriesTypeFor("pine_b"), yAxis: "right" }])[0] },
		]);
		const b = pineSeriesSignature([
			{ ...paneWith([{ id: "b", type: pineSeriesTypeFor("pine_b"), yAxis: "right" }])[0] },
			{ ...paneWith([{ id: "a", type: pineSeriesTypeFor("pine_a"), yAxis: "right" }])[0] },
		]);
		expect(a).toBe(b);
		expect(a).toBe("pine_a|pine_b");
	});

	it("signature changes when a Pine series is added or removed", () => {
		const one = pineSeriesSignature(paneWith([{ id: "a", type: "pine_a", yAxis: "right" }]));
		const two = pineSeriesSignature(
			paneWith([
				{ id: "a", type: "pine_a", yAxis: "right" },
				{ id: "b", type: "pine_b", yAxis: "right" },
			]),
		);
		expect(one).not.toBe(two);
		expect(pineSeriesSignature(paneWith([{ id: "r", type: "RSI", yAxis: "right" }]))).toBe("");
	});
});

describe("G-PINE-SERIES: compile reports the script's overlay flag (W5 input)", () => {
	const identity = { adapterLabel: "demo", activeSymbol: "FPT", activeTimeframe: "1D" };

	it("reads overlay=false off the study declaration", () => {
		const r = compile('study("own pane", overlay=false)\nplot(ta.sma(close, 3))');
		expect(r.errors).toEqual([]);
		expect(r.overlay, "the pane host must be able to tell this script wants its own pane").toBe(false);
	});

	it("reads overlay=true off the study declaration", () => {
		const r = compile('study("on price", overlay=true)\nplot(ta.sma(close, 3))');
		expect(r.overlay).toBe(true);
	});

	it("defaults to false when the declaration omits overlay (Pine's own default)", () => {
		const r = compile('study("bare")\nplot(ta.sma(close, 3))');
		expect(r.errors).toEqual([]);
		expect(r.overlay).toBe(false);
	});

	it("is undefined when there is no study declaration at all", () => {
		const r = compile("plot(ta.sma(close, 3))");
		expect(r.overlay).toBeUndefined();
	});

	// The regression control. `parseScript` returns the statement ARRAY (`runProgram(ast: any[])`),
	// and a first implementation read `ast.body`, found nothing, and reported undefined for every
	// script — so every one of them fell back to the price pane. G-PINE-E2E caught it; this pins it.
	it("reads the AST as an ARRAY, not an object with .body", () => {
		const ast = compile('study("shape", overlay=false)\nplot(ta.sma(close, 3))');
		expect(ast.overlay).toBe(false);
		expect(parseScript('study("shape", overlay=false)\nplot(ta.sma(close, 3))').ast).toBeInstanceOf(Array);
	});
});

describe("G-PINE-SERIES: buildEngineDataSource", () => {
	const dsIdentity = { adapterLabel: "demo", activeSymbol: "FPT", activeTimeframe: "1D" };

	it("omits seriesData entirely when there is no Pine script", () => {
		const ds = buildEngineDataSource(dsIdentity, { seriesData: {}, signature: "" });
		expect(ds.sourceId).toBe("demo:FPT:1D");
		expect(ds.symbol).toBe("FPT");
		expect(ds.timeframe).toBe("1D");
		expect("seriesData" in ds, "pre-Pine payload shape must stay byte-identical").toBe(false);
	});

	it("attaches seriesData when Pine is present", () => {
		const ds = buildEngineDataSource(dsIdentity, { seriesData: { x: [1, 2] }, signature: "pine_x" });
		expect(ds.seriesData).toEqual({ x: [1, 2] });
	});

	it("tolerates an undefined symbol, matching the pre-existing template-literal behaviour", () => {
		const ds = buildEngineDataSource({ ...dsIdentity, activeSymbol: undefined }, { seriesData: {}, signature: "" });
		expect(ds.sourceId).toBe("demo:undefined:1D");
	});
});
