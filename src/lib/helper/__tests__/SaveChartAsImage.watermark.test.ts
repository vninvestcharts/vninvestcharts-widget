/**
 * A4 — tier watermark on exported PNG.
 *
 * jsdom implements no 2D context, so nothing here asserts pixels. The contract
 * under test is the set of calls made on the context: which string was drawn,
 * where, and whether a pill was filled or stroked. That is the whole behaviour —
 * a `fillText` either happened or it did not.
 *
 * Delete the `drawTierWatermark(...)` call in `save()` and the first describe
 * block fails. Delete the tier plumbing and the pure-helper block fails.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import SaveChartAsImage, {
	drawTierWatermark,
	normalizeWatermarkTier,
	tierBadgeSpec,
} from "../SaveChartAsImage";

interface Recorded {
	fillText: Array<[string, number, number]>;
	fillRect: Array<[number, number, number, number]>;
	strokeRect: Array<[number, number, number, number]>;
	drawImage: Array<[number, number]>;
	fonts: string[];
}

/**
 * `measureText` = 7px per character at whatever font is set. Deterministic and
 * font-aware: the code under test must set its own font before measuring, and a
 * test can catch it when it measures in the neighbour's 10px date font.
 */
function createSpyContext() {
	const calls: Recorded = {
		fillText: [],
		fillRect: [],
		strokeRect: [],
		drawImage: [],
		fonts: [],
	};
	let font = "";
	let textAlign: CanvasTextAlign = "left";
	const ctx = {
		fillStyle: "",
		strokeStyle: "",
		lineWidth: 1,
		beginPath: () => {},
		moveTo: () => {},
		lineTo: () => {},
		stroke: () => {},
		fillRect: (...a: [number, number, number, number]) => void calls.fillRect.push(a),
		strokeRect: (...a: [number, number, number, number]) => void calls.strokeRect.push(a),
		fillText: (t: string, x: number, y: number) => void calls.fillText.push([t, x, y]),
		drawImage: (_img: unknown, dx: number, dy: number) => void calls.drawImage.push([dx, dy]),
		measureText: (t: string) => ({ width: t.length * 7 }),
	};
	Object.defineProperties(ctx, {
		font: { get: () => font, set: (v: string) => { font = v; calls.fonts.push(v); } },
		textAlign: { get: () => textAlign, set: (v: CanvasTextAlign) => { textAlign = v; } },
	});
	return { spy: ctx as unknown as CanvasRenderingContext2D, calls, align: () => textAlign };
}

/** A container of the given size, with no canvases and no SVGs inside it. */
function createContainer(width: number, height: number): HTMLElement {
	const el = document.createElement("div");
	el.getBoundingClientRect = () =>
		({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
	return el;
}

/** `watermarkHeight` — the reserved band. Hardcoded on purpose: AC3 locks it. */
const WATERMARK_HEIGHT = 40;

describe("A4 tier watermark — exported PNG", () => {
	let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
	let originalToDataURL: typeof HTMLCanvasElement.prototype.toDataURL;

	beforeEach(() => {
		originalGetContext = HTMLCanvasElement.prototype.getContext;
		originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
	});

	afterEach(() => {
		HTMLCanvasElement.prototype.getContext = originalGetContext;
		HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
	});

	/** Run the real `save()` end-to-end against a spy context. */
	function exportPng(container: HTMLElement, tier?: string) {
		const { spy, calls, align } = createSpyContext();
		let canvasHeight = -1;
		let canvasWidth = -1;
		let dataUrl: string | null = null;
		// `this` is the canvas — that is how the created canvas is inspected.
		HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
			canvasHeight = this.height;
			canvasWidth = this.width;
			return spy;
		} as unknown as typeof HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,STUB";
		const cb = (src: string) => {
			dataUrl = src;
		};
		if (tier === undefined) {
			SaveChartAsImage.save(document, container, "#ffffff", false, cb);
		} else {
			SaveChartAsImage.save(document, container, "#ffffff", false, cb, { tier });
		}
		return { calls, dataUrl, canvasHeight, canvasWidth, align };
	}

	const badgeText = (calls: Recorded) =>
		calls.fillText.map((c) => c[0]).filter((t) => t !== "VNINVESTCHARTS" && !t.startsWith("Charts powered by"));

	it("AC1 — the exported PNG is stamped with the current tier", () => {
		expect(badgeText(exportPng(createContainer(900, 400), "pro").calls)).toContain("PRO");
	});

	it("AC2 — free/none render differently from pro/enterprise", () => {
		expect(badgeText(exportPng(createContainer(900, 400), "free").calls)).toEqual(["FREE"]);
		expect(badgeText(exportPng(createContainer(900, 400), "none").calls)).toEqual(["NONE"]);
		expect(badgeText(exportPng(createContainer(900, 400), "pro").calls)).toEqual(["PRO"]);
		expect(badgeText(exportPng(createContainer(900, 400), "enterprise").calls)).toEqual(["ENTERPRISE"]);
		// Not merely a different word: paid tiers get a FILLED pill, free ones are
		// outlined — the difference survives a greyscale print. The band divider uses
		// beginPath/moveTo/stroke, not strokeRect, so `strokeRect` counts pills only.
		const outlinedPills = (tier: string) =>
			exportPng(createContainer(900, 400), tier).calls.strokeRect.length;
		expect(outlinedPills("free")).toBe(1);
		expect(outlinedPills("none")).toBe(1);
		expect(outlinedPills("pro")).toBe(0);
		expect(outlinedPills("enterprise")).toBe(0);
	});

	it("AC3 — the badge is drawn inside the reserved 40px band, band height untouched", () => {
		const { calls, canvasHeight } = exportPng(createContainer(900, 400), "enterprise");
		const badge = calls.fillText.find(([t]) => t === "ENTERPRISE");
		expect(badge).toBeDefined();
		// Baseline sits inside the band; an 11px bold cap sits above it.
		expect(badge![2]).toBeGreaterThan(0);
		expect(badge![2]).toBeLessThan(WATERMARK_HEIGHT);
		// The filled pill must not poke below the divider line either.
		const pill = calls.fillRect.find(([, y, , h]) => h === 16 && y < WATERMARK_HEIGHT);
		expect(pill).toBeDefined();
		expect(pill![1] + pill![3]).toBeLessThanOrEqual(WATERMARK_HEIGHT);
		// The band is still exactly 40px on top of the container — unchanged logic.
		expect(canvasHeight).toBe(400 + WATERMARK_HEIGHT);
	});

	it("AC4 — the badge cannot reach the price axis or the last-price label", () => {
		// The chart is shifted DOWN by `watermarkHeight` before painting, so the axis
		// begins at y = 40. Every badge primitive is inside the band, and the chart
		// primitives start at the band edge — nothing straddles it.
		const container = createContainer(900, 400);
		const chart = document.createElement("canvas");
		chart.getBoundingClientRect = () =>
			({ left: 0, top: 0, right: 900, bottom: 360, width: 900, height: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
		container.appendChild(chart);

		const { calls } = exportPng(container, "pro");
		const pill = calls.fillRect.find(([, y, , h]) => h === 16);
		expect(pill).toBeDefined();
		expect(pill![1]).toBeGreaterThanOrEqual(0);
		expect(pill![1] + pill![3]).toBeLessThanOrEqual(WATERMARK_HEIGHT);
		// The chart canvas is composited at the shifted offset, never above it.
		expect(calls.drawImage).toHaveLength(1);
		expect(calls.drawImage[0][1]).toBeGreaterThanOrEqual(WATERMARK_HEIGHT);
	});

	it("AC5 — absent / unknown tier degrades to the `none` badge and never throws", () => {
		expect(badgeText(exportPng(createContainer(900, 400)).calls)).toEqual(["NONE"]);
		expect(badgeText(exportPng(createContainer(900, 400), "").calls)).toEqual(["NONE"]);
		expect(badgeText(exportPng(createContainer(900, 400), "platinum").calls)).toEqual(["NONE"]);
		// Zero-size container (detached / display:none) must not throw either.
		expect(() => exportPng(createContainer(0, 0), "pro")).not.toThrow();
	});

	it("AC5 — the export still produces a data URL whatever the tier", () => {
		for (const tier of ["free", "pro", "enterprise", "bogus"]) {
			expect(exportPng(createContainer(900, 400), tier).dataUrl).toContain("data:image/png");
		}
	});

	it("AC6 — a narrow band drops the badge instead of overlapping brand and date", () => {
		// 220px cannot hold brand + badge + date. The two pre-existing texts survive.
		const { calls } = exportPng(createContainer(220, 300), "enterprise");
		const texts = calls.fillText.map((c) => c[0]);
		expect(texts).toContain("VNINVESTCHARTS");
		expect(texts.some((t) => t.startsWith("Charts powered by"))).toBe(true);
		expect(texts).not.toContain("ENTERPRISE");
	});

	it("the badge leaves textAlign as the date needs it (no bleed into the right-aligned text)", () => {
		expect(exportPng(createContainer(900, 400), "pro").align()).toBe("left");
	});
});

describe("A4 tier watermark — pure helpers", () => {
	it("ladders the 7 PAT levels onto 5 badges, fail-closed to `none`", () => {
		expect(normalizeWatermarkTier("none")).toBe("none");
		expect(normalizeWatermarkTier("free")).toBe("free");
		expect(normalizeWatermarkTier("starter")).toBe("starter");
		expect(normalizeWatermarkTier("pro")).toBe("pro");
		expect(normalizeWatermarkTier("enterprise")).toBe("enterprise");
		expect(normalizeWatermarkTier("custom")).toBe("enterprise");
		expect(normalizeWatermarkTier("internal")).toBe("enterprise");
		expect(normalizeWatermarkTier(null)).toBe("none");
		expect(normalizeWatermarkTier(undefined)).toBe("none");
		expect(normalizeWatermarkTier("")).toBe("none");
		expect(normalizeWatermarkTier("platinum")).toBe("none");
		expect(normalizeWatermarkTier(42 as unknown as string)).toBe("none");
	});

	it("gives every badge a distinct label and a distinct treatment", () => {
		const tiers = ["none", "free", "starter", "pro", "enterprise"] as const;
		const labels = tiers.map((t) => tierBadgeSpec(t, false).label);
		expect(new Set(labels).size).toBe(tiers.length);
		const filled = tiers.filter((t) => tierBadgeSpec(t, false).background !== null);
		expect(filled).toEqual(["starter", "pro", "enterprise"]);
		expect(tierBadgeSpec("pro", false).background).not.toBe(tierBadgeSpec("enterprise", false).background);
	});

	it("draws the pill and the label, and returns the geometry", () => {
		const { spy, calls } = createSpyContext();
		const layout = drawTierWatermark(spy, {
			bandWidth: 900,
			bandHeight: WATERMARK_HEIGHT,
			isDark: false,
			tier: "pro",
			leftEdge: 150,
			rightEdge: 750,
		});
		expect(layout).not.toBeNull();
		expect(calls.fillRect).toHaveLength(1);
		expect(calls.fillText).toEqual([["PRO", expect.any(Number), 24]]);
		// Centred in the gap, not pinned to an edge.
		expect(layout!.x).toBeGreaterThan(150);
		expect(layout!.x + layout!.width).toBeLessThan(750);
		expect(layout!.y).toBeGreaterThanOrEqual(0);
		expect(layout!.y + layout!.height).toBeLessThanOrEqual(WATERMARK_HEIGHT);
		// Measured with the badge font, never a neighbour's font.
		expect(calls.fonts[0]).toContain("11px");
	});

	it("outlines free badges and resets textAlign so the date is unaffected", () => {
		const { spy, calls, align } = createSpyContext();
		drawTierWatermark(spy, {
			bandWidth: 900,
			bandHeight: WATERMARK_HEIGHT,
			isDark: false,
			tier: "free",
			leftEdge: 150,
			rightEdge: 750,
		});
		expect(calls.fillRect).toHaveLength(0);
		expect(calls.strokeRect).toHaveLength(1);
		expect(calls.fillText[0][0]).toBe("FREE");
		expect(align()).toBe("left");
	});

	it("declines to draw — returning null — when the gap is too small", () => {
		const { spy, calls } = createSpyContext();
		const layout = drawTierWatermark(spy, {
			bandWidth: 200,
			bandHeight: WATERMARK_HEIGHT,
			isDark: false,
			tier: "enterprise",
			leftEdge: 150,
			rightEdge: 180,
		});
		expect(layout).toBeNull();
		expect(calls.fillRect).toHaveLength(0);
		expect(calls.fillText).toHaveLength(0);
	});

	it("declines on NaN geometry instead of writing NaN coordinates", () => {
		const { spy, calls } = createSpyContext();
		expect(
			drawTierWatermark(spy, {
				bandWidth: Number.NaN,
				bandHeight: Number.NaN,
				isDark: false,
				tier: "pro",
				leftEdge: 10,
				rightEdge: 900,
			}),
		).toBeNull();
		expect(calls.fillRect).toHaveLength(0);
		expect(calls.fillText).toHaveLength(0);
	});

	it("keeps the pill inside the canvas even when the caller passes bad edges", () => {
		const { spy, calls } = createSpyContext();
		const layout = drawTierWatermark(spy, {
			bandWidth: 400,
			bandHeight: WATERMARK_HEIGHT,
			isDark: false,
			tier: "pro",
			leftEdge: -500, // caller bug: negative
			rightEdge: 5000, // caller bug: past the canvas
		});
		expect(layout).not.toBeNull();
		expect(layout!.x).toBeGreaterThanOrEqual(0);
		expect(layout!.x + layout!.width).toBeLessThanOrEqual(400);
		expect(calls.fillText).toHaveLength(1);
	});
});
