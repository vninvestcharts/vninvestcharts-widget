/**
 * A10 — turn detected patterns into drawings.
 *
 * PLAN_FRONTEND_PROPLUS_TRACKA_2026-09-28 §3.9. The engine's detector
 * describes shapes in *data* space (bar index + price) and knows nothing
 * about renderers; this module is the seam that maps them onto drawings the
 * existing layer already knows how to draw, hit-test, persist and list.
 *
 * ## Why the shape → drawing-type map is what it is
 *
 * - `headAndShoulders` / `inverseHeadAndShoulders` → the existing manual
 *   `headAndShoulders` tool. Its 7-point layout is LS·LV·H·RV·RS·NL·NR and
 *   the detector emits exactly those seven anchors, so a detected H&S and a
 *   hand-placed one are literally the same drawing. That is the geometry
 *   reuse the brief asked for, and it also inherits the tool's dashed
 *   neckline rendering.
 * - `doubleTop` / `doubleBottom` / `triangle` → `polyline`. `polyline` has no
 *   segment-registry entry, so the generic branch walks all N-1 edges of the
 *   detected anchors with nothing dropped.
 *
 *   The manual `trianglePattern` tool is the obvious host and is wrong on two
 *   independent counts, both measured in
 *   `__tests__/harmonicPatternSegments.test.ts`:
 *
 *   1. It drops edges. Its registry entry declares 2 segment keys for a
 *      5-point closed shape, so `buildHarmonicPatternPrimitive` draws one
 *      sequential edge plus the dashed closing line and discards the other
 *      three. (Same defect class, same builder, also affects `cypherPattern`,
 *      `threeDrivesPattern` and `headAndShoulders`.)
 *   2. Fixing (1) would NOT make it a valid host, because the geometries do
 *      not match. The detector's `triangle` emits FOUR anchors
 *      (`upperA·upperB·lowerB·lowerA`); the tool takes FIVE points
 *      (`H1·L1·H2·L2·apex`). Fed four anchors, the tool emits five labels —
 *      `H1 L1 H2 L2 apex` — against four pixels, so `apex` has no coordinate
 *      at all and the shape is silently wrong. A detected triangle is an open
 *      four-point wedge; it has no apex point to give.
 *
 *   So `polyline` stays, and (2) is the reason that outlives an engine fix.
 *   Re-hosting these on the pattern primitives is a detector-side change
 *   (either emit the 5th anchor, or add a 4-point triangle tool), not a
 *   widget-side one.
 *
 * The cost of that choice is that the anchors carry no per-point role
 * badges, so the pattern's meaning travels in the drawing `label` — which
 * is also where the confidence and R² are surfaced, and what the objects
 * list shows.
 */

import { createDrawingObject } from "@vninvestcharts/engine-drawing";
import type { DrawingObject, DrawingToolType } from "@vninvestcharts/engine-drawing";
import type { DetectedPattern, PatternShapeId } from "./patternContract";

export interface PatternDrawingLabels {
	/** e.g. "Head & shoulders" — resolved through i18n by the caller. */
	shape: (shape: PatternShapeId) => string;
	/** e.g. "confirmed · 82% · R²0.91" */
	detail: (pattern: DetectedPattern) => string;
}

/** Drawing type each detected shape is rendered as. */
export const PATTERN_DRAWING_TYPE: Readonly<Record<PatternShapeId, DrawingToolType>> = {
	headAndShoulders: "headAndShoulders",
	inverseHeadAndShoulders: "headAndShoulders",
	doubleTop: "polyline",
	doubleBottom: "polyline",
	triangle: "polyline",
};

/**
 * Anchor role sequence per shape, in the order the polyline should walk.
 *
 * The detector already emits anchors in drawing order, so this is a
 * *contract* rather than a transform: a pattern whose role sequence does not
 * match is refused rather than drawn approximately. It is a sequence and not
 * a set on purpose — `doubleBottom` legitimately contains the role `trough`
 * twice (its two bottoms), which a role→anchor map would silently collapse
 * into one point and draw a broken shape.
 */
export const PATTERN_ANCHOR_ORDER: Readonly<Record<PatternShapeId, readonly string[]>> = {
	headAndShoulders: ["leftShoulder", "leftValley", "head", "rightValley", "rightShoulder", "necklineStart", "necklineEnd"],
	inverseHeadAndShoulders: ["leftShoulder", "leftValley", "head", "rightValley", "rightShoulder", "necklineStart", "necklineEnd"],
	doubleTop: ["necklineStart", "firstTop", "trough", "secondTop", "necklineEnd"],
	doubleBottom: ["necklineStart", "trough", "firstTop", "trough", "necklineEnd"],
	triangle: ["upperA", "upperB", "lowerB", "lowerA"],
};

/** Group id so every auto-detected pattern collapses to one tree entry. */
export const AUTO_PATTERN_GROUP_ID = "vnsc-auto-patterns";

export interface PatternDrawingOptions {
	readonly labels: PatternDrawingLabels;
	readonly stroke?: string;
	/** Existing drawings, so ids and z-order can be derived deterministically. */
	readonly existing?: readonly DrawingObject[];
	readonly zIndex?: number;
}

/**
 * Convert one detected pattern into a drawing.
 *
 * Returns `null` for a pattern whose anchors do not match the shape's
 * documented layout — a mismatch here would silently draw a wrong shape, so
 * it is refused rather than approximated.
 */
export function toPatternDrawing(
	pattern: DetectedPattern,
	options: PatternDrawingOptions,
): DrawingObject | null {
	const order = PATTERN_ANCHOR_ORDER[pattern.shape];
	const roles = pattern.anchors.map((a) => a.role);
	if (order.length !== roles.length || order.some((role, i) => roles[i] !== role)) {
		return null;
	}
	const anchors = pattern.anchors;
	if (anchors.length < 2) {
		return null;
	}

	// `xIndexFloat` anchors the point to a bar, so the drawing survives a
	// pan, a zoom and a change of viewport width. Without it the pattern
	// would slide with the pixels.
	const points = anchors.map((anchor) => ({
		x: anchor.barIndex,
		y: anchor.price,
		xIndexFloat: anchor.barIndex,
		yPrice: anchor.price,
	}));

	const existingCount = options.existing?.length ?? 0;
	return createDrawingObject(PATTERN_DRAWING_TYPE[pattern.shape], points, {
		// Deterministic and re-scan stable: the same pattern on the same bars
		// yields the same id, so a re-scan updates rather than duplicates.
		id: `auto-${pattern.id}`,
		label: `${options.labels.shape(pattern.shape)} · ${options.labels.detail(pattern)}`,
		groupId: AUTO_PATTERN_GROUP_ID,
		style: {
			stroke: options.stroke ?? "#f0b90b",
			strokeWidth: 2,
			// Auto-detected geometry is machine-derived, not the user's own
			// mark, so it is drawn dashed. This is *not* the "unconfirmed
			// pattern" style of the plan's §3.9.1 — every pattern here is
			// confirmed; the dash says "this was found for you".
			strokeDasharray: "dashed",
			opacity: 0.9,
		},
		zIndex: options.zIndex ?? existingCount,
	});
}

/** Convert a scan result, dropping anything that will not map. */
export function toPatternDrawings(
	patterns: readonly DetectedPattern[],
	options: PatternDrawingOptions,
): DrawingObject[] {
	const out: DrawingObject[] = [];
	const seen = new Set<string>();
	for (const pattern of patterns) {
		const drawing = toPatternDrawing(pattern, options);
		if (!drawing || seen.has(drawing.id)) {
			continue;
		}
		seen.add(drawing.id);
		out.push(drawing);
	}
	return out;
}
