import saveAsPng from "save-svg-as-png";
import type { PatTier } from "@vninvestcharts/engine-core";

/**
 * TIER WATERMARK ON EXPORTED PNG (plan A4: "watermark theo tier").
 *
 * The 40px band this file reserves at the top of the export has existed since
 * day one — brand on the left, "powered by + UTC date" on the right, a divider
 * at `y = watermarkHeight` — but it never said WHO produced the chart. A PNG
 * leaves the app, so that is the one fact worth stamping.
 *
 * WHY THE TIER ARRIVES AS AN ARGUMENT AND IS NEVER GUESSED. The tier authority is
 * the widget's `effectiveToolbarTier` (`usePatTierAuthentication`), funnelled
 * through `CapabilityResolver`. This helper sits in `src/lib`, has no React
 * context, and must not read storage: plan §6.1 makes an unverifiable credential
 * fail CLOSED, and a badge that stamps `PRO` on a free chart is a false claim in
 * a file the user can forward to anyone. So an absent or unrecognised tier
 * renders `NONE` rather than defaulting to the best case. Callers that have the
 * tier (both current call sites are outside this file's slice) pass it in.
 *
 * WHY THE TEXT STAYS IN THE BAND. `watermarkHeight` is load-bearing for every
 * consumer's crop: the band is added to `canvas.height` and the chart is shifted
 * down by exactly that amount before anything is painted (`relativeY = … +
 * watermarkHeight`, three call sites below). The band is therefore a strip that
 * no chart pixel can reach into. Everything drawn here stays inside it, so the
 * badge cannot overlap the price axis or the last-price label — not "is placed
 * carefully", but is geometrically incapable of doing so.
 */

/** Badge shapes — a subset of the 7 PAT levels, see {@link WATERMARK_TIER}. */
export type WatermarkTier = "none" | "free" | "starter" | "pro" | "enterprise";

/**
 * PAT has 7 levels; a badge has 5 shapes. `custom` and `internal` sit ABOVE
 * `enterprise` on the ladder, so they share its badge rather than adding a sixth
 * that nobody downstream can style. Typed as `Record<PatTier, …>` on purpose: a
 * new engine tier fails the build here instead of silently rendering `NONE`.
 */
const WATERMARK_TIER: Readonly<Record<PatTier, WatermarkTier>> = {
	none: "none",
	free: "free",
	starter: "starter",
	pro: "pro",
	enterprise: "enterprise",
	custom: "enterprise",
	internal: "enterprise",
};

/** Total, non-throwing. Anything that is not a known PAT level ⇒ `none`. */
export function normalizeWatermarkTier(tier: PatTier | string | null | undefined): WatermarkTier {
	if (typeof tier !== "string") return "none";
	return WATERMARK_TIER[tier as PatTier] ?? "none";
}

export interface TierBadgeSpec {
	tier: WatermarkTier;
	/**
	 * Short uppercase token, deliberately NOT routed through `t()`: a tier name
	 * is a product name and is not translated in any locale, and the i18n message
	 * files are on a frozen budget. `verify-ui-text-sweep` and
	 * `audit-hardcoded-text` both scan `src/widget/**` + the live DOM only, so a
	 * canvas token in `src/lib` is invisible to them by construction.
	 */
	label: string;
	/** Pill fill. `null` ⇒ outline pill (no fill pass at all). */
	background: string | null;
	foreground: string;
}

/**
 * `free` and `none` are outlined, `starter`/`pro`/`enterprise` are filled — so
 * the free-vs-paid difference survives even at 20% zoom or a bad print, where
 * five words in similar greys would not.
 */
export function tierBadgeSpec(tier: WatermarkTier, isDark: boolean): TierBadgeSpec {
	switch (tier) {
		case "pro":
			return { tier, label: "PRO", background: "#2962ff", foreground: "#ffffff" };
		case "enterprise":
			// Navy + gold: must not be mistakable for the PRO blue at a glance.
			return { tier, label: "ENTERPRISE", background: "#101a2e", foreground: "#f0b90b" };
		case "starter":
			return { tier, label: "STARTER", background: "#0e7c86", foreground: "#ffffff" };
		case "free":
			return { tier, label: "FREE", background: null, foreground: isDark ? "#a0a0a0" : "#707070" };
		default:
			return {
				tier: "none",
				label: "NONE",
				background: null,
				foreground: isDark ? "#6b7280" : "#9aa0a6",
			};
	}
}

/** One notch smaller than the brand text (12px) so it reads as an annotation. */
const BADGE_FONT = "bold 11px Arial, sans-serif";
const BADGE_FONT_PX = 11;
const BADGE_HEIGHT = 16;
const BADGE_PAD_X = 8;
/** Clear space required on each side of the pill before it is worth drawing. */
const BADGE_GUTTER = 12;

export interface TierWatermarkLayout {
	x: number;
	y: number;
	width: number;
	height: number;
	/** Absolute baseline used for `fillText`. */
	baselineY: number;
}

export interface TierWatermarkOptions {
	/** Absolute canvas width — the band spans the full width. */
	bandWidth: number;
	/** `watermarkHeight`. The band sits at the TOP of the canvas. */
	bandHeight: number;
	isDark: boolean;
	tier?: PatTier | string | null;
	/** Absolute x of the brand text's right edge. */
	leftEdge: number;
	/** Absolute x of the metadata text's left edge. */
	rightEdge: number;
}

/**
 * Draws the badge centred in whatever horizontal room is left between the brand
 * and the date. Returns `null` — having painted nothing — when the band is too
 * narrow to hold all three without overlap. Skipping is the only correct answer
 * there: shrinking the font would make the badge illegible, and overlapping the
 * brand would be a visible defect. Never throws, never resizes the canvas.
 */
export function drawTierWatermark(
	context: CanvasRenderingContext2D,
	options: TierWatermarkOptions,
): TierWatermarkLayout | null {
	const { bandWidth, bandHeight, isDark, tier, leftEdge, rightEdge } = options;
	const spec = tierBadgeSpec(normalizeWatermarkTier(tier), isDark);

	context.font = BADGE_FONT;
	const pillWidth = Math.ceil(context.measureText(spec.label).width) + BADGE_PAD_X * 2;

	// Clamp the neighbour edges into the canvas first: a caller passing
	// inconsistent edges must not be able to paint the badge off the edge.
	const left = Math.max(0, leftEdge);
	const right = Math.min(bandWidth, rightEdge);
	// `!(gap >= …)` rather than `gap < …` so a NaN width (zero-size container,
	// detached node) declines to draw instead of writing at NaN coordinates.
	const gap = right - left;
	if (!(gap >= pillWidth + BADGE_GUTTER * 2)) return null;

	const x = Math.round(left + (gap - pillWidth) / 2);
	const y = Math.round((bandHeight - BADGE_HEIGHT) / 2);
	// +0.35em ≈ optical centre of Arial cap-height, which lands the badge on the
	// same baseline (24) as the brand and the date for the default 40px band.
	const baselineY = Math.round(y + BADGE_HEIGHT / 2 + BADGE_FONT_PX * 0.35);

	if (spec.background) {
		context.fillStyle = spec.background;
		context.fillRect(x, y, pillWidth, BADGE_HEIGHT);
	} else {
		context.strokeStyle = spec.foreground;
		context.lineWidth = 1;
		// +0.5 then -1: a 1px stroke lands on a pixel boundary instead of being
		// smeared across two.
		context.strokeRect(x + 0.5, y + 0.5, pillWidth - 1, BADGE_HEIGHT - 1);
	}

	context.fillStyle = spec.foreground;
	context.textAlign = "center";
	context.fillText(spec.label, x + pillWidth / 2, baselineY);
	context.textAlign = "left"; // Reset — same convention as the band below.

	return { x, y, width: pillWidth, height: BADGE_HEIGHT, baselineY };
}

export interface SaveChartAsImageOptions {
	/**
	 * Tier to stamp, from the widget's tier SSOT (`effectiveToolbarTier`,
	 * plan §6.1). Omitted / unknown ⇒ the `none` badge.
	 */
	tier?: PatTier | string | null;
}

const SaveChartAsImage = {
	save(
		doc: Document,
		container: HTMLElement,
		background: string,
		isDark: boolean,
		cb: (dataUrl: string) => void,
		options?: SaveChartAsImageOptions,
	) {
		const containerRect = container.getBoundingClientRect();
		const watermarkHeight = 40;

		// 1. Create composite canvas
		const canvas = doc.createElement("canvas");
		canvas.width = containerRect.width;
		canvas.height = containerRect.height + watermarkHeight;
		const context = canvas.getContext("2d", { willReadFrequently: true })!;

		// 2. Draw watermark background
		context.fillStyle = background;
		context.fillRect(0, 0, canvas.width, canvas.height);

		// Divider line
		context.strokeStyle = isDark ? "#2a2a2a" : "#e0e3eb";
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(0, watermarkHeight);
		context.lineTo(canvas.width, watermarkHeight);
		context.stroke();

		// Brand logo (left)
		context.font = "bold 12px Arial, sans-serif";
		context.fillStyle = "#2962ff";
		context.fillText("VNINVESTCHARTS", 12, 24);
		const brandRight = 12 + context.measureText("VNINVESTCHARTS").width;

		// Metadata (right)
		const metadataText = `Charts powered by VNInvestCharts • ${new Date().toUTCString()}`;
		context.font = "10px Arial, sans-serif";
		const metadataLeft = canvas.width - 12 - context.measureText(metadataText).width;

		// Tier badge, centred in the gap between the two. Both neighbours are drawn
		// unconditionally, so they define the available room; the badge yields rather
		// than the other way round. `watermarkHeight` is the whole band — the chart
		// starts below it, so this cannot reach the price axis or the last-price tag.
		drawTierWatermark(context, {
			bandWidth: canvas.width,
			bandHeight: watermarkHeight,
			isDark,
			tier: options?.tier,
			leftEdge: brandRight + BADGE_GUTTER,
			rightEdge: metadataLeft - BADGE_GUTTER,
		});

		context.fillStyle = isDark ? "#a0a0a0" : "#707070";
		context.textAlign = "right";
		context.fillText(metadataText, canvas.width - 12, 24);
		context.textAlign = "left"; // Reset

		// 3. Draw HTML text elements (OHLC Header)
		const ohlcEl = container.querySelector(".vnsc-ohlc-header");
		if (ohlcEl) {
			const ohlcRect = ohlcEl.getBoundingClientRect();
			const relativeY = ohlcRect.top - containerRect.top + watermarkHeight;

			context.fillStyle = isDark ? "#111820" : "#f8f9fa";
			context.fillRect(0, relativeY, containerRect.width, ohlcRect.height);

			const symbolText = ohlcEl.querySelector("strong")?.textContent || "";
			const timeframeText = ohlcEl.querySelector(".vnsc-ohlc-header__timeframe")?.textContent || "";
			const valuesText = ohlcEl.querySelector(".vnsc-ohlc-header__values")?.textContent || ohlcEl.childNodes[1]?.textContent || "";

			let startX = 12;
			context.font = "bold 13px Arial, sans-serif";
			context.fillStyle = isDark ? "#e0e0e0" : "#131722";
			context.fillText(symbolText, startX, relativeY + 20);
			startX += context.measureText(symbolText).width + 8;

			if (timeframeText) {
				context.font = "bold 11px Arial, sans-serif";
				context.fillStyle = "#2962ff";
				context.fillText(`(${timeframeText})`, startX, relativeY + 20);
				startX += context.measureText(`(${timeframeText})`).width + 12;
			}

			context.font = "12px Arial, sans-serif";
			context.fillStyle = isDark ? "#a0a0a0" : "#707070";
			context.fillText(valuesText, startX, relativeY + 20);
		}

		// 4. Draw canvases using root-relative offsets
		const canvasList = container.getElementsByTagName("canvas");
		for (let i = 0; i < canvasList.length; i++) {
			const each = canvasList[i];
			if (each) {
				const rect = each.getBoundingClientRect();
				const relativeX = rect.left - containerRect.left;
				const relativeY = rect.top - containerRect.top + watermarkHeight;
				context.drawImage(each, relativeX, relativeY);
			}
		}

		// 5. Draw SVGs (e.g. drawings)
		const svgList = container.getElementsByTagName("svg");
		let pendingSvgs = 0;

		const drawImageOnCanvas = (url: string, rx: number, ry: number) => {
			const img = new Image();
			img.onload = () => {
				context.drawImage(img, rx, ry);
				URL.revokeObjectURL(url);
				pendingSvgs--;
				if (pendingSvgs === 0) cb(canvas.toDataURL("image/png"));
			};
			img.src = url;
		};

		const svgElementsToDraw: { url: string; rx: number; ry: number }[] = [];
		for (let i = 0; i < svgList.length; i++) {
			const svg = svgList[i];
			if (svg && svg.getAttribute("data-rsc-fork-children") !== "true") {
				const rect = svg.getBoundingClientRect();
				const rx = rect.left - containerRect.left;
				const ry = rect.top - containerRect.top + watermarkHeight;

				const svgString = new XMLSerializer().serializeToString(svg);
				const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
				const url = URL.createObjectURL(svgBlob);
				svgElementsToDraw.push({ url, rx, ry });
			}
		}

		if (svgElementsToDraw.length === 0) {
			cb(canvas.toDataURL("image/png"));
		} else {
			pendingSvgs = svgElementsToDraw.length;
			svgElementsToDraw.forEach(({ url, rx, ry }) => drawImageOnCanvas(url, rx, ry));
		}
	},
	saveChartAsImage(container: HTMLElement, isDark: boolean, options?: SaveChartAsImageOptions) {
		const bg = isDark ? "#0a0e14" : "#ffffff";
		this.save(document, container, bg, isDark, (src: string) => {
			const a = document.createElement("a");
			a.setAttribute("href", src);
			a.setAttribute("download", "Chart-Viewport.png");
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		}, options);
	}
};

export default SaveChartAsImage;
