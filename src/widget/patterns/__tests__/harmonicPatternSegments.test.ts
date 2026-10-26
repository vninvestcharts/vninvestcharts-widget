/**
 * A10/H2 — the harmonic pattern tools draw the WRONG EDGES today.
 *
 * The segment registry (`SEGMENT_KEYS_BY_TYPE`, engine repo
 * `vn-kline-engine-drawing/src/segmentRegistry.ts`) declares the ordered
 * segment keys a primitive builder walks to emit edges. For a shape with N
 * points and a dashed closing line, the builder must be handed N keys:
 *
 *   - `seqKeys = segmentKeys.slice(0, len - 1)` drops the LAST key, which is
 *     then drawn once as the dashed closing line (`overlayPrimitiveAdapter.ts`
 *     `buildHarmonicPatternPrimitive`, the `seqKeys` slice);
 *   - so the sequential walk emits `len(seqKeys)` edges = `declared - 1`,
 *     and the closing line adds 1 more. Total drawn = `declared`.
 *
 * A 5-point shape therefore needs `declared === 5` to draw 4 sequential edges
 * plus the closing line. `trianglePattern` declares 2, so it draws ONE
 * sequential edge plus the closing line and drops three.
 *
 * ## Why this test asserts EDGES, not the registry length
 *
 * The obvious test — "the array has N entries" — stayed green the whole time
 * the chart was wrong, because the registry was never the thing that was wrong
 * in isolation: it was wrong *relative to the builder that consumes it*. Every
 * assertion below therefore reads the rendered `OverlayCanvasPrimitive.segments`
 * and compares the actual emitted edges, so the test fails if the drawn geometry
 * regresses even when the array length is untouched. `mutate` (see the bottom of
 * this file) proves that.
 *
 * ## Fixed 2026-09-30 (K1) — this file used to assert the broken state
 *
 * The registry lives in the ENGINE repo, which this slice could not touch, so
 * the four short shapes were pinned to their CURRENT (wrong) edge set and the
 * pins were called the alarm. The engine side is fixed now — `segmentRegistry.ts`
 * declares one key per emitted edge — so the pins are replaced by the correct
 * edges rather than merely relaxed. The `broken` list in the table test is
 * empty, and that empty list is itself the assertion: a shape that under-declares
 * again fails there, by name.
 *
 * Before → after, read off the table the test prints:
 *
 *   cypherPattern        points=5  declared 4→5  rendered 4→5  required 5
 *   headAndShoulders     points=7  declared 4→5  rendered 5→6  required 6
 *   trianglePattern      points=5  declared 2→5  rendered 2→5  required 5
 *   threeDrivesPattern   points=7  declared 3→6  rendered 3→6  required 6
 *
 * `headAndShoulders` reaches 6 rendered edges on 5 keys on purpose: the builder
 * draws the pixels[5]→pixels[6] neckline itself, extended past both ends, so a
 * sixth key would draw that same leg a second time. See its test below.
 */

import { describe, expect, it } from "vitest";
import {
	PATTERN_HAS_CLOSING_LINE,
	PATTERN_POINT_COUNT,
	SEGMENT_KEYS_BY_TYPE,
	createDrawingObject,
	createDraftFromTool,
	toOverlayPrimitive,
} from "@vninvestcharts/engine-drawing";
import type { ChartScales, DrawingToolType } from "@vninvestcharts/engine-drawing";

/**
 * Deterministic linear scales. Every point is anchored to a bar index and a
 * price (`xIndexFloat` / `yPrice`) — never to a pixel — which is also what the
 * production path does, so `chartPointToPixel` resolves without a real chart.
 * x = 10 + index*10 makes every emitted edge endpoint a readable number.
 */
const SCALES: ChartScales = {
	xScale: (date: Date) => 10 + date.getTime() / 1e10,
	xScaleByIndex: (index: number) => 10 + index * 10,
	xScaleInvert: (px: number) => new Date((px - 10) * 1e10),
	xScaleInvertToIndex: (px: number) => (px - 10) / 10,
	yScale: (price: number) => 100 - price,
	yScaleInvert: (px: number) => 100 - px,
};

/** n points on a rising diagonal, so no two edges are degenerate. */
function points(n: number) {
	return Array.from({ length: n }, (_, i) => ({
		x: i,
		y: 0,
		xIndexFloat: i,
		yPrice: 100 + i * 10,
	}));
}

/**
 * The rendered edge set, as `"fromX->toX"` strings.
 *
 * This is the whole point of the file: it reads what the primitive builder
 * actually emitted rather than what the registry declares. A closing line
 * shows up as an edge from the first pixel back to the last, which is why the
 * expected sets below contain e.g. `10->50` for a 5-point shape.
 */
function renderedEdges(type: DrawingToolType, pointCount: number): string[] {
	const primitive = toOverlayPrimitive(createDrawingObject(type, points(pointCount)), SCALES);
	const segments = primitive?.segments ?? [];
	return segments.map((s) => `${s.start.x}->${s.end.x}`);
}

/** How many edges the geometry demands: N-1 sequential, plus 1 if closed. */
function requiredEdgeCount(pointCount: number, hasClosingLine: boolean): number {
	return pointCount - 1 + (hasClosingLine ? 1 : 0);
}

/**
 * The sequential pairs a shape owes, in pixel space. For a 5-point shape:
 * 10->20, 20->30, 30->40, 40->50.
 */
function sequentialPairs(pointCount: number): string[] {
	return Array.from({ length: Math.max(pointCount - 1, 0) }, (_, i) => `${10 + i * 10}->${20 + i * 10}`);
}

/**
 * Every shape whose primitive builder walks the registry as a SEQUENTIAL list
 * — i.e. one key per edge, in point order. Shapes like `channel` or `gannBox`
 * declare keys too, but their builders use them as named parts rather than as
 * a per-edge walk, so a count comparison is meaningless for them; they are
 * listed in `NON_SEQUENTIAL` below to prove they were examined, not skipped.
 */
const SEQUENTIAL_SHAPES: readonly DrawingToolType[] = [
	"abcdPattern",
	"xabcdPattern",
	"cypherPattern",
	"headAndShoulders",
	"trianglePattern",
	"threeDrivesPattern",
	"elliottImpulse",
	"elliottCorrection",
	"elliottTriangle",
	"elliottDoubleCombo",
	"elliottTripleCombo",
];

/** Declares segment keys, but the builder does not walk them per-edge. */
const NON_SEQUENTIAL: readonly DrawingToolType[] = [
	"channel",
	"parallelChannel",
	"pitchfork",
	"gannFan",
	"regressionChannel",
	"pitchfan",
	"fibChannel",
	"fibSpeedResistanceFan",
	"gannBox",
	"gannSquare",
	"gannSquareFixed",
	"circle",
	"triangle",
	"callout",
	"disjointChannel",
	"flatTopBottom",
	"schiffPitchfork",
	"modifiedSchiff",
	"insidePitchfork",
	"gannFixed",
	"trendAngle",
	"infoLine",
	"rotatedRectangle",
	"datePriceRange",
	"anchoredVwap",
	"crossLine",
];

function declaredKeys(type: DrawingToolType): readonly string[] {
	return SEGMENT_KEYS_BY_TYPE[type] ?? [];
}

/**
 * The shape's own declared point count, taken from the engine geometry rather
 * than hardcoded here: `PATTERN_POINT_COUNT` for the harmonic family, and the
 * tool's own draft arity for everything else. Both are the engine's source of
 * truth, so a shape that gains a point updates this automatically.
 */
function enginePointCount(type: DrawingToolType): number {
	const harmonic = PATTERN_POINT_COUNT as Record<string, number | undefined>;
	if (harmonic[type] !== undefined) return harmonic[type]!;
	return createDraftFromTool(type, { x: 0, y: 0, xIndexFloat: 0, yPrice: 100 }).points.length;
}

/** True when the shape's builder also draws the dashed first->last line. */
function isClosed(type: DrawingToolType): boolean {
	return (PATTERN_HAS_CLOSING_LINE as Record<string, boolean | undefined>)[type] ?? false;
}

describe("harmonic pattern segments — declared keys vs rendered edges", () => {
	it("draws every edge the geometry demands, for every sequential shape", () => {
		// The audit, as a single table. Failures name the shape, so the report
		// and this test cannot drift apart.
		const rows = SEQUENTIAL_SHAPES.map((type) => {
			const pointCount = enginePointCount(type);
			const edges = renderedEdges(type, pointCount);
			return {
				type,
				pointCount,
				declared: declaredKeys(type).length,
				required: requiredEdgeCount(pointCount, isClosed(type)),
				rendered: edges.length,
			};
		});

		const broken = rows.filter((r) => r.rendered !== r.required);

		// The measured table, always printed so a regression diff is readable.
		// eslint-disable-next-line no-console
		console.log(
			rows
				.map((r) => `${r.type}: points=${r.pointCount} declared=${r.declared} required=${r.required} rendered=${r.rendered}`)
				.join("\n"),
		);

		// No shape may under-draw. The list is empty as of the K1 engine fix; a
		// regression names itself here instead of being discovered on a chart.
		expect(broken.map((r) => r.type).sort()).toEqual([]);
	});

	it("trianglePattern draws all five of its edges (the reported bug)", () => {
		// H1·L1·H2·L2·apex: H1-L1, L1-H2, H2-L2, L2-apex, then the dashed
		// apex-H1. It used to declare 2 keys and draw ONE leg plus the closing
		// line — an open triangle missing three sides.
		expect(renderedEdges("trianglePattern", 5)).toEqual([
			"10->20",
			"20->30",
			"30->40",
			"40->50",
			"10->50",
		]);
		expect(sequentialPairs(5)).toEqual(["10->20", "20->30", "30->40", "40->50"]);
		expect(declaredKeys("trianglePattern")).toEqual(["h1", "l1", "h2", "l2", "closing"]);
	});

	it("cypherPattern draws its C-D leg", () => {
		// X·A·B·C·D: the XA/AB/BC/CD legs plus the dashed X-D. The missing leg
		// was CD, the last one before the closing line.
		expect(renderedEdges("cypherPattern", 5)).toEqual([
			"10->20",
			"20->30",
			"30->40",
			"40->50",
			"10->50",
		]);
		expect(declaredKeys("cypherPattern")).toEqual(["XA", "AB", "BC", "CD", "XC"]);
	});

	it("threeDrivesPattern draws all six of its legs", () => {
		// S·1·A·2·B·3·E is an OPEN 7-point polyline: 6 legs, no closing line. It
		// used to declare 3 keys and draw only the first three.
		expect(renderedEdges("threeDrivesPattern", 7)).toEqual([
			"10->20",
			"20->30",
			"30->40",
			"40->50",
			"50->60",
			"60->70",
		]);
		expect(sequentialPairs(7)).toEqual([
			"10->20",
			"20->30",
			"30->40",
			"40->50",
			"50->60",
			"60->70",
		]);
		expect(declaredKeys("threeDrivesPattern")).toEqual(["s1", "1", "a", "2", "b", "3"]);
	});

	it("headAndShoulders draws 6 legs from 5 keys, the neckline not doubled", () => {
		// LS LV H RV RS NL NR. The builder emits the pixels[5]->pixels[6]
		// neckline itself, extended 20% past each end (60->70 becomes 58->72),
		// so a sixth key would draw that same leg a second time. Five keys stop
		// the walk at RS->NL — the leg the extended neckline does not reach —
		// and 5 named + the neckline is the 6 the geometry owes.
		expect(renderedEdges("headAndShoulders", 7)).toEqual([
			"10->20",
			"20->30",
			"30->40",
			"40->50",
			"50->60",
			"58->72",
		]);
		expect(declaredKeys("headAndShoulders")).toEqual([
			"leftShoulder",
			"neckline",
			"head",
			"rightShoulder",
			"rsToNl",
		]);

		// The neckline is drawn once. A sixth key would put "60->70" in the list
		// beside the extended "58->72" — same leg, two primitives — so this
		// counts the plain 5->6 edge at zero.
		const edges = renderedEdges("headAndShoulders", 7);
		expect(edges.filter((e) => e === "60->70")).toHaveLength(0);
	});

	it("the shapes that are correct stay correct", () => {
		// Guards against a fix for one shape over-correcting another.
		expect(renderedEdges("abcdPattern", 4)).toEqual(["10->20", "20->30", "30->40"]);
		expect(renderedEdges("xabcdPattern", 5)).toEqual(["10->20", "20->30", "30->40", "40->50", "10->50"]);
		expect(renderedEdges("elliottImpulse", 6)).toEqual(["10->20", "20->30", "30->40", "40->50", "50->60"]);
		expect(renderedEdges("elliottCorrection", 4)).toEqual(["10->20", "20->30", "30->40"]);
		expect(renderedEdges("elliottTriangle", 6)).toEqual(["10->20", "20->30", "30->40", "40->50", "50->60"]);
		expect(renderedEdges("elliottDoubleCombo", 4)).toEqual(["10->20", "20->30", "30->40"]);
		expect(renderedEdges("elliottTripleCombo", 6)).toEqual(["10->20", "20->30", "30->40", "40->50", "50->60"]);
	});

	it("covers every shape that declares segment keys", () => {
		// A shape added to the registry but not to this table would escape the
		// audit entirely — which is how the next one ships broken.
		const covered = new Set<string>([...SEQUENTIAL_SHAPES, ...NON_SEQUENTIAL]);
		const declared = Object.keys(SEGMENT_KEYS_BY_TYPE);
		expect(declared.filter((t) => !covered.has(t))).toEqual([]);
	});
});

/**
 * Mutation guard (protocol rule 7).
 *
 * The registry is a mutable exported object, so this test can temporarily
 * install a WRONG segment count and prove the edge assertions above actually
 * react. If someone reintroduces an under-declared count on `trianglePattern`,
 * `renderedEdges` changes and the expectations in the describe block fail —
 * these tests are not reading the registry length and calling it a day.
 *
 * The mutation is restored in a `finally`, so the rest of the suite sees the
 * original value even if the assertion throws.
 */
describe("mutation guard", () => {
	it("an under-declared segment count changes the rendered edges", () => {
		const original = SEGMENT_KEYS_BY_TYPE.trianglePattern;
		try {
			// The bug, reintroduced: 2 keys for a 5-point closed shape.
			SEGMENT_KEYS_BY_TYPE.trianglePattern = ["upper", "lower"];
			expect(renderedEdges("trianglePattern", 5)).toEqual(["10->20", "10->50"]);

			// One more key than before: still short, and visibly different.
			SEGMENT_KEYS_BY_TYPE.trianglePattern = ["a", "b", "c"];
			expect(renderedEdges("trianglePattern", 5)).toEqual(["10->20", "20->30", "10->50"]);

			// The correct count: 4 sequential edges plus the closing line.
			SEGMENT_KEYS_BY_TYPE.trianglePattern = ["a", "b", "c", "d", "closing"];
			expect(renderedEdges("trianglePattern", 5)).toEqual(["10->20", "20->30", "30->40", "40->50", "10->50"]);
		} finally {
			SEGMENT_KEYS_BY_TYPE.trianglePattern = original;
		}
		expect(SEGMENT_KEYS_BY_TYPE.trianglePattern).toBe(original);
	});

	it("an over-declared segment count is clamped, not silently over-drawn", () => {
		const original = SEGMENT_KEYS_BY_TYPE.trianglePattern;
		try {
			SEGMENT_KEYS_BY_TYPE.trianglePattern = ["a", "b", "c", "d", "e", "f", "g"];
			// The loop is bounded by `index + 1 < pixels.length`, so extra keys
			// add nothing. Worth pinning: it means a too-long list is not a
			// second way to misdraw the shape.
			expect(renderedEdges("trianglePattern", 5)).toEqual(["10->20", "20->30", "30->40", "40->50", "10->50"]);
		} finally {
			SEGMENT_KEYS_BY_TYPE.trianglePattern = original;
		}
	});

	it("a sixth headAndShoulders key would draw the neckline twice", () => {
		// The trap behind the 5-key decision. `headAndShoulders` owes 6 legs but
		// declares 5, because the builder emits the pixels[5]->pixels[6] neckline
		// itself, extended. Handing it six keys walks that same leg as an ordinary
		// named segment AND lets the neckline branch draw it again — two
		// primitives over one pair of points, and the un-styleable one is
		// `hitTestable: false`, so no key can switch it off.
		const original = SEGMENT_KEYS_BY_TYPE.headAndShoulders ?? [];
		try {
			expect(original).toHaveLength(5);
			SEGMENT_KEYS_BY_TYPE.headAndShoulders = [
				...original,
				"nr", // the 6th key, the one the registry must NOT declare
			];
			const doubled = renderedEdges("headAndShoulders", 7);
			// Both the plain 5->6 leg and the extended neckline are present.
			expect(doubled).toEqual([
				"10->20",
				"20->30",
				"30->40",
				"40->50",
				"50->60",
				"60->70",
				"58->72",
			]);
			// 7 primitives for a 6-leg shape: the tell the table test would
			// report as `rendered=7 required=6`.
			expect(doubled).toHaveLength(7);
		} finally {
			SEGMENT_KEYS_BY_TYPE.headAndShoulders = original;
		}
		expect(renderedEdges("headAndShoulders", 7)).toHaveLength(6);
	});
});