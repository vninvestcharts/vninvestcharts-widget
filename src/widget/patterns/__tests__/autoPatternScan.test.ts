/**
 * A10 widget slice — the scan policy and the drawing mapping.
 *
 * Public tree: this file must not import `@vninvestcharts/engine-pro`
 * (Rule 15). The detector is a stub here; the real detector is covered by
 * `packages/vn-kline-widget-pro/src/patterns/__tests__/patternAdapter.integration.test.ts`,
 * where engine-pro is a legal dependency.
 *
 * What stays here is the part that belongs to the public widget: the plan's
 * runtime constraints (when a scan may run, what it passes down, what a
 * pattern turns into) and the fail-closed path when the Pro module is absent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearPatternDetectionAdapter,
	setPatternDetectionAdapter,
	type DetectedPattern,
	type PatternBar,
	type PatternDetectionAdapter,
} from "../patternContract";
import { runAutoPatternScan, summarizePatterns, type ScanRequest } from "../autoPatternScan";
import {
	AUTO_PATTERN_GROUP_ID,
	PATTERN_ANCHOR_ORDER,
	PATTERN_DRAWING_TYPE,
	toPatternDrawing,
	toPatternDrawings,
} from "../patternDrawingFactory";

const SHAPES = [
	"headAndShoulders",
	"inverseHeadAndShoulders",
	"doubleTop",
	"doubleBottom",
	"triangle",
] as const;
const MAX_PER_SERIES = 12;

function hsPattern(overrides: Partial<DetectedPattern> = {}): DetectedPattern {
	return {
		id: "hs-1",
		shape: "headAndShoulders",
		direction: "bearish",
		anchors: [
			{ role: "leftShoulder", kind: "high", barIndex: 1, price: 100 },
			{ role: "leftValley", kind: "low", barIndex: 2, price: 92 },
			{ role: "head", kind: "high", barIndex: 3, price: 110 },
			{ role: "rightValley", kind: "low", barIndex: 4, price: 92 },
			{ role: "rightShoulder", kind: "high", barIndex: 5, price: 100 },
			{ role: "necklineStart", kind: "low", barIndex: 6, price: 95 },
			{ role: "necklineEnd", kind: "low", barIndex: 7, price: 95 },
		],
		barsInPattern: 7,
		rSquared: 0.91,
		fitSamples: 6,
		degenerateFit: false,
		confidence: 0.82,
		confirmedAtIndex: 7,
		firstBarIndex: 1,
		lastBarIndex: 7,
		status: "confirmed",
		...overrides,
	};
}

function bars(count = 10): PatternBar[] {
	return Array.from({ length: count }, (_, i) => ({
		high: 100 + i,
		low: 90 + i,
		close: 95 + i,
	}));
}

type DetectFn = PatternDetectionAdapter["detect"];
type DetectSpy = DetectFn & {
	mock: { calls: Array<[readonly PatternBar[], Parameters<DetectFn>[1]]> };
};

let detect: DetectSpy;

function registerStub(overrides: Partial<PatternDetectionAdapter> = {}): void {
	detect = vi.fn((_bars: readonly PatternBar[], _options: Parameters<DetectFn>[1]) => [hsPattern()]);
	setPatternDetectionAdapter({
		shapes: SHAPES,
		maxPerSeries: MAX_PER_SERIES,
		detect,
		...overrides,
	});
}

beforeEach(() => {
	registerStub();
});

afterEach(() => {
	clearPatternDetectionAdapter();
});

function request(overrides: Partial<ScanRequest> = {}): ScanRequest {
	return { bars: bars(), enabled: true, idle: true, ...overrides };
}

describe("runAutoPatternScan — plan §3.9 runtime constraints", () => {
	it("returns what the adapter detected", () => {
		const result = runAutoPatternScan(request());
		expect(result.skipped).toBeNull();
		expect(result.patterns.map((p) => p.shape)).toContain("headAndShoulders");
	});

	it("§3.9.3 — a disabled capability never scans, and says why", () => {
		const result = runAutoPatternScan(request({ enabled: false }));
		expect(result.patterns).toHaveLength(0);
		expect(result.skipped).toBe("disabled");
		expect(detect).not.toHaveBeenCalled();
	});

	it("§3.9.4 — a scan requested mid-gesture is skipped, not deferred", () => {
		const busy = runAutoPatternScan(request({ idle: false }));
		expect(busy.patterns).toHaveLength(0);
		expect(busy.skipped).toBe("busy");
		expect(detect).not.toHaveBeenCalled();
	});

	it("§3.9.1 — passes the last CLOSED bar as asOf, so a live bar cannot confirm", () => {
		runAutoPatternScan(request({ bars: bars(10), formingBars: 2 }));
		expect(detect).toHaveBeenCalledTimes(1);
		const options = detect.mock.calls[0]![1] as { asOf: number };
		expect(options.asOf).toBe(7);
	});

	it("§3.9.5 — defaults the cap and the shape list to the adapter", () => {
		runAutoPatternScan(request());
		const options = detect.mock.calls[0]![1] as {
			shapes: readonly string[];
			maxPatterns: number;
		};
		expect(options.shapes).toEqual(SHAPES);
		expect(options.maxPatterns).toBe(MAX_PER_SERIES);
	});

	it("an explicit subset and cap are forwarded unchanged", () => {
		runAutoPatternScan(request({ shapes: ["doubleTop"], maxPatterns: 3 }));
		const options = detect.mock.calls[0]![1] as {
			shapes: readonly string[];
			maxPatterns: number;
		};
		expect(options.shapes).toEqual(["doubleTop"]);
		expect(options.maxPatterns).toBe(3);
	});

	it("refuses to scan when there are no closed bars yet", () => {
		expect(runAutoPatternScan(request({ bars: [{ high: 1, low: 1, close: 1 }], formingBars: 1 })).skipped).toBe(
			"no-data",
		);
		expect(runAutoPatternScan(request({ bars: [], formingBars: 0 })).skipped).toBe("no-data");
		expect(detect).not.toHaveBeenCalled();
	});

	it("an empty shape selection scans nothing instead of everything", () => {
		const none = runAutoPatternScan(request({ shapes: [] }));
		expect(none.patterns).toHaveLength(0);
		expect(none.skipped).toBeNull();
		expect(detect).not.toHaveBeenCalled();
	});

	it("Rule 15 — without the Pro module it fails closed, not silently empty", () => {
		clearPatternDetectionAdapter();
		const result = runAutoPatternScan(request());
		expect(result.patterns).toHaveLength(0);
		expect(result.skipped).toBe("unavailable");
	});
});

describe("summarizePatterns", () => {
	it("carries the degenerate-fit flag through so the UI can say R² is unknown", () => {
		const pattern = hsPattern({ degenerateFit: true, rSquared: 1 });
		const [summary] = summarizePatterns([pattern]);
		expect(summary.id).toBe(pattern.id);
		expect(summary.rSquared).toBe(1);
		expect(summary.degenerateFit).toBe(true);
		expect(summary.barsInPattern).toBe(7);
		expect(summary.confidence).toBeGreaterThan(0);
		expect(summary.confidence).toBeLessThanOrEqual(1);
	});
});

const shapeLabel = (s: string) => s;
const detail = (p: DetectedPattern) => `${p.confidence.toFixed(2)}`;

describe("toPatternDrawing", () => {
	it("maps a head-and-shoulders onto the manual tool's 7 anchors", () => {
		const pattern = hsPattern();
		const drawing = toPatternDrawing(pattern, { labels: { shape: shapeLabel, detail } })!;
		expect(drawing).not.toBeNull();
		expect(drawing.type).toBe("headAndShoulders");
		expect(drawing.points).toHaveLength(7);
		expect(drawing.points.map((p) => p.xIndexFloat)).toEqual(pattern.anchors.map((a) => a.barIndex));
		expect(drawing.groupId).toBe(AUTO_PATTERN_GROUP_ID);
		expect(drawing.id).toBe(`auto-${pattern.id}`);
	});

	it("renders the other shapes as a polyline, with every edge drawn", () => {
		for (const shape of ["doubleTop", "doubleBottom", "triangle"] as const) {
			expect(PATTERN_DRAWING_TYPE[shape]).toBe("polyline");
		}
		// `trianglePattern` would be the obvious host and is wrong twice over:
		// it drops edges, and even fixed it takes five points while a detected
		// triangle has four anchors. The edge-level evidence is in
		// harmonicPatternSegments.test.ts.
		expect(PATTERN_DRAWING_TYPE.headAndShoulders).toBe("headAndShoulders");
	});

	it("anchors every point to a bar and a price, not to a pixel", () => {
		const drawing = toPatternDrawing(hsPattern(), { labels: { shape: shapeLabel, detail } })!;
		for (const point of drawing.points) {
			expect(point.xIndexFloat).toBeTypeOf("number");
			expect(point.yPrice).toBeTypeOf("number");
			expect(point.yPrice).toBe(point.y);
		}
	});

	it("refuses a pattern whose anchor roles do not match the documented layout", () => {
		const pattern = hsPattern();
		const broken: DetectedPattern = { ...pattern, anchors: pattern.anchors.slice(0, 3) };
		expect(toPatternDrawing(broken, { labels: { shape: shapeLabel, detail } })).toBeNull();
		const reordered: DetectedPattern = {
			...pattern,
			anchors: [pattern.anchors[1]!, pattern.anchors[0]!, ...pattern.anchors.slice(2)],
		};
		expect(toPatternDrawing(reordered, { labels: { shape: shapeLabel, detail } })).toBeNull();
	});

	it("the documented layout contains a repeated role, which a role map would collapse", () => {
		// The double bottom's two bottoms are both the role `trough`. This is
		// why the layout is matched as a sequence and not as a set.
		expect(PATTERN_ANCHOR_ORDER.doubleBottom.filter((r) => r === "trough")).toHaveLength(2);
	});

	it("is deterministic: the same pattern yields the same drawing id", () => {
		const pattern = hsPattern();
		const a = toPatternDrawing(pattern, { labels: { shape: shapeLabel, detail } })!;
		const b = toPatternDrawing(pattern, { labels: { shape: shapeLabel, detail } })!;
		expect(a.id).toBe(b.id);
	});

	it("deduplicates by id and drops unmappable patterns", () => {
		const pattern = hsPattern();
		const broken: DetectedPattern = { ...pattern, anchors: [] };
		const out = toPatternDrawings([pattern, pattern, broken], {
			labels: { shape: shapeLabel, detail },
		});
		expect(out).toHaveLength(1);
	});
});
