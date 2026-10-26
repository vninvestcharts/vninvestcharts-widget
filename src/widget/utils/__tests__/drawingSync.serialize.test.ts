/**
 * Emit-side drawing serialisation: the divergence this file was extracted to kill.
 *
 * `VNInvestCharts.tsx` used to build three `{...}` literals from one `DrawingObject`
 * — one for `onDrawingChange`, one for `create` ops, one for `update` ops. Measured
 * 2026-10-08, they already disagreed about `opacity`: it appeared in the update
 * literal only.
 *
 * The visible bug: a drawing created at 40% opacity reaches a synced peer at full
 * opacity, then the FIRST edit that produces an `update` op carries `opacity` — so the
 * peer's copy visibly changes the moment the user touches it on the origin chart.
 * Nothing throws and nothing logs. It reads as a rendering bug on the peer, which is
 * why the duplicate literal survived: no test could see it, and review has to compare
 * three blocks by eye.
 *
 * So the first test below is the regression lock for that exact divergence, and it is
 * written as a property ("every serialised style carries opacity") rather than as a
 * snapshot of one literal — a snapshot would pass again the moment someone adds a
 * fourth call site.
 */
import { describe, expect, it } from "vitest";

import {
	buildDrawingOperations,
	convertToDrawingData,
	toDrawingDataType,
	toSyncStyle,
} from "../drawingSync";

const PLOT = [{ date: new Date(1_700_000_000_000) }, { date: new Date(1_700_000_060_000) }];

/** A drawing with every style field set, so "was this one copied?" is answerable. */
function styledDrawing(overrides: Record<string, unknown> = {}) {
	return {
		id: "d1",
		type: "TrendLine",
		points: [{ x: 1_700_000_000_000, y: 10, timeMsHint: 1_700_000_000_000 }],
		style: {
			stroke: "#f00",
			strokeWidth: 2,
			strokeDasharray: "dashed",
			fill: "#00f",
			opacity: 0.4,
			fontSize: 12,
			fontFamily: "Inter",
		},
		...overrides,
	};
}

const NO_PLOT = undefined;

describe("toSyncStyle — the single mapping", () => {
	it("carries opacity, which two of the three old literals dropped", () => {
		// THE regression lock. If this fails, a synced peer will change appearance the
		// first time the origin chart emits an update op.
		expect(toSyncStyle(styledDrawing().style)?.opacity).toBe(0.4);
	});

	it("renames every field the wire type declares", () => {
		expect(toSyncStyle(styledDrawing().style)).toEqual({
			color: "#f00",
			lineWidth: 2,
			lineStyle: "dashed",
			fillColor: "#00f",
			opacity: 0.4,
			fontSize: 12,
			fontFamily: "Inter",
		});
	});

	it("returns undefined for an absent style rather than an empty object", () => {
		// An empty object is truthy, so a `data.style ? ... : undefined` consumer
		// would treat "no style" as "style with no fields" and overwrite the peer's
		// real style with nothing.
		expect(toSyncStyle(undefined)).toBeUndefined();
	});

	it("keeps an explicit opacity of 0 (falsy, but meaningful)", () => {
		expect(toSyncStyle({ opacity: 0 })?.opacity).toBe(0);
	});
});

describe("toDrawingDataType", () => {
	it.each([
		["TrendLine", "trend-line"],
		["HorizontalRay", "horizontal-ray"],
		["FibRetracement", "fib-retracement"],
		["Arrow", "arrow"],
		["ABCDExtension", "a-b-c-d-extension"],
	])("%s -> %s", (input, expected) => {
		expect(toDrawingDataType(input)).toBe(expected);
	});

	it("never emits a leading dash", () => {
		// The regex inserts a dash before each capital; a name already starting with a
		// capital would otherwise produce "-trend-line", which no receiver matches.
		for (const name of ["Arrow", "Line", "Zone"]) {
			expect(toDrawingDataType(name).startsWith("-")).toBe(false);
		}
	});
});

describe("convertToDrawingData", () => {
	const scope = { fallbackSymbol: "VNM", fallbackTimeframe: "1m", plotData: PLOT };

	it("uses the drawing's own symbol/timeframe when present", () => {
		const [d] = convertToDrawingData(
			[styledDrawing({ symbol: "HPG", timeframe: "1D" })],
			scope,
		);
		expect(d.symbol).toBe("HPG");
		expect(d.timeframe).toBe("1D");
	});

	it("falls back through symbol then timeframe then a default", () => {
		const [d] = convertToDrawingData([styledDrawing()], scope);
		expect(d.symbol).toBe("VNM");
		expect(d.timeframe).toBe("1m");

		const [bare] = convertToDrawingData([styledDrawing()], {
			fallbackSymbol: undefined,
			fallbackTimeframe: undefined,
			plotData: NO_PLOT,
		});
		expect(bare.symbol).toBe("");
		expect(bare.timeframe).toBe("1m");
	});

	it("kebab-cases the type — ops do not, and that asymmetry is deliberate", () => {
		// See the header note. Pinned so a future "cleanup" that unifies them is a
		// visible test failure rather than a silent wire change.
		expect(convertToDrawingData([styledDrawing()], scope)[0].type).toBe("trend-line");
	});
});

describe("buildDrawingOperations", () => {
	const base = {
		writerKey: "chart-A",
		symbol: "VNM",
		timeframe: "1m",
		plotData: PLOT,
		now: 1_000,
		opType: (d: { type: string }) => d.type,
	};

	it("emits create for arrivals only", () => {
		const ops = buildDrawingOperations({
			...base,
			prev: [styledDrawing({ id: "keep" })],
			next: [styledDrawing({ id: "keep" }), styledDrawing({ id: "new" })],
		});
		expect(ops.map((o) => [o.type, o.drawingId])).toEqual([["create", "new"]]);
	});

	it("carries opacity on a CREATE, matching the old update behaviour", () => {
		// The bug in its sharpest form: this op is what a peer applies when the
		// drawing is first drawn.
		const [op] = buildDrawingOperations({ ...base, prev: [], next: [styledDrawing()] });
		expect(op.data?.style?.opacity).toBe(0.4);
	});

	it("emits delete with no data but keeps the symbol stamp", () => {
		// Deletes carry no payload, so the op-level `symbol` is the ONLY scope signal
		// a receiver gets (P2/D-SYNC-24). Losing it leaks a tombstone cross-symbol.
		const [op] = buildDrawingOperations({
			...base,
			prev: [styledDrawing({ id: "gone" })],
			next: [],
		});
		expect(op.type).toBe("delete");
		expect(op.data).toBeUndefined();
		expect(op.symbol).toBe("VNM");
	});

	it("orders create before delete before update", () => {
		// Load-bearing: a delete must not win over a create for the same id, and an
		// update must not be emitted for a drawing that only just appeared in `next`.
		const prev = [styledDrawing({ id: "keep" }), styledDrawing({ id: "bye" })];
		const next = [
			styledDrawing({ id: "keep", label: "changed" }),
			styledDrawing({ id: "fresh" }),
		];
		expect(buildDrawingOperations({ ...base, prev, next }).map((o) => o.type)).toEqual([
			"create",
			"delete",
			"update",
		]);
	});

	it("uses move-point when points changed, update otherwise", () => {
		const prev = [styledDrawing({ id: "moved" }), styledDrawing({ id: "restyled" })];
		const next = [
			styledDrawing({ id: "moved", points: [{ x: 1_700_000_060_000, y: 11, timeMsHint: 1_700_000_060_000 }] }),
			styledDrawing({ id: "restyled", style: { stroke: "#0f0" } }),
		];
		const ops = buildDrawingOperations({ ...base, prev, next });
		expect(ops.map((o) => o.type).sort()).toEqual(["move-point", "update"]);
	});

	it("emits nothing when nothing changed", () => {
		const prev = [styledDrawing({ id: "same" })];
		expect(buildDrawingOperations({ ...base, prev, next: [styledDrawing({ id: "same" })] })).toEqual([]);
	});

	it("detects a style-only change", () => {
		const prev = [styledDrawing({ id: "d" })];
		const next = [styledDrawing({ id: "d", style: { stroke: "#123456" } })];
		expect(buildDrawingOperations({ ...base, prev, next })).toHaveLength(1);
	});

	it("detects label / locked / zIndex changes", () => {
		for (const patch of [{ label: "x" }, { locked: true }, { zIndex: 9 }]) {
			const prev = [styledDrawing({ id: "d" })];
			const next = [styledDrawing({ id: "d", ...patch })];
			expect(buildDrawingOperations({ ...base, prev, next })).toHaveLength(1);
		}
	});

	it("stamps a version vector under the writer key", () => {
		const [op] = buildDrawingOperations({ ...base, prev: [], next: [styledDrawing()] });
		expect(op.version).toEqual({ "chart-A": 1_000 });
		expect(op.authorId).toBe("chart-A");
		expect(op.timestamp).toBe(1_000);
	});

	it("keeps the RAW type on ops (the deliberate asymmetry)", () => {
		const [op] = buildDrawingOperations({ ...base, prev: [], next: [styledDrawing()] });
		expect(op.data?.type).toBe("TrendLine");
	});

	it("is pure: the same input twice gives the same output", () => {
		// The point of extracting it. The old closure could only be exercised by
		// mounting the chart, and it mutated a ref as a side effect.
		const input = { ...base, prev: [] as never[], next: [styledDrawing()] };
		expect(buildDrawingOperations(input)).toEqual(buildDrawingOperations(input));
	});
});