/**
 * Prevents the "raw i18n key in the UI" class of bug for drawing tools.
 *
 * MobileToolbar and ShortcutHelpModal both build their label key dynamically
 * (`drawingTool.${id}`), so a translation gap is invisible to TypeScript and to
 * `npm run audit:hardcoded-text` (that gate looks for hardcoded literals, not
 * missing keys). It only shows up as `drawingTool.priceLabel` rendered in the
 * toolbar — which is exactly what a real browser run caught on 2026-09-26.
 *
 * The ids are owned by the engine overlay layer and the widget builtins, so the
 * translations must follow the ids, never the other way round.
 */
import { describe, expect, it } from "vitest";
import { widgetMessagesEn } from "../messages.en";
import { widgetMessagesVi } from "../messages.vi";

// The tool ids the flyout renders, kept in sync with MobileToolbar's
// DRAWING_TOOLS list — that list is the union of ids the UI can ask for.
const TOOL_IDS = [
	"cursor", "crosshair", "trendLine", "ray", "extendedLine", "parallelChannel",
	"hLine", "vLine", "priceLabel", "fibonacci", "fibExtension", "fibChannel",
	"fibTimeZone", "pitchfork", "schiffPitchfork", "gannBox", "gannFan", "brush",
	"rectangle", "ellipse", "triangle", "arc", "text", "callout", "arrow",
	"dateAndPriceRange", "dateRange", "priceRange", "eraser",
] as const;

const LOCALES = [
	["en", widgetMessagesEn],
	["vi", widgetMessagesVi],
] as const;

describe("drawingTool i18n keys", () => {
	it.each(LOCALES)("%s has a label for every drawing tool id", (_name, messages) => {
		const missing = TOOL_IDS.filter((id) => {
			const value = messages[`drawingTool.${id}`];
			return typeof value !== "string" || value.trim().length === 0;
		});
		expect(missing, `missing drawingTool.* keys: ${missing.join(", ")}`).toEqual([]);
	});

	it.each(LOCALES)("%s never renders a raw key as the label", (_name, messages) => {
		// The signal is "the value IS the key", not "the value is one word":
		// "Cursor", "Ray", "Pitchfork", "Text" are legitimate labels that are
		// deliberately identical in both locales.
		const raw = TOOL_IDS.filter((id) => {
			const value = messages[`drawingTool.${id}`];
			return typeof value === "string" && (value === `drawingTool.${id}` || /^drawingTool\./.test(value));
		});
		expect(raw, `these labels are untranslated keys: ${raw.join(", ")}`).toEqual([]);
	});

	it("en and vi expose the same drawingTool key set", () => {
		const enKeys = Object.keys(widgetMessagesEn).filter((k) => k.startsWith("drawingTool.")).sort();
		const viKeys = Object.keys(widgetMessagesVi).filter((k) => k.startsWith("drawingTool.")).sort();
		const onlyEn = enKeys.filter((k) => !viKeys.includes(k));
		const onlyVi = viKeys.filter((k) => !enKeys.includes(k));
		expect({ onlyEn, onlyVi }).toEqual({ onlyEn: [], onlyVi: [] });
	});
});

/**
 * The same trap exists in every namespace whose key is built dynamically:
 *   tool.<id>              DrawingToolbar, FloatingFavoritesBar, SystemMenu,
 *                          FloatingDrawingInspector
 *   premium.<flag>.{title,description}
 *                          PremiumFeatureGate (feature is `keyof SaaSFeatureFlags`,
 *                          so ANY flag is a legal argument)
 *   advisory.decision.<DECISION>
 *                          AdvisoryPanel (decision is an uppercase union)
 *   systemMenu.theme.<id>  SystemMenu theme options
 */
describe("dynamically-built i18n keys", () => {
	// Only the capability flags are gateable. `hideTrademark` and
	// `showWidgetAds` are Free-tier display switches derived from the plan
	// (see SaaSFeatureContext) and are never rendered inside a
	// PremiumFeatureGate, so they legitimately have no `premium.*` copy.
	const PREMIUM_FLAGS = ["isWhalePanelEnabled", "isReplayEnabled", "isAdvisoryEnabled"] as const;

	const ADVISORY_DECISIONS = ["STRONG_BUY", "BUY", "HOLD", "SELL", "STRONG_SELL"] as const;

	const PREMIUM_TOOL_TYPES = [
		"gannBox", "gannSquareFixed", "gannSquare", "schiffPitchfork",
		"xabcdPattern", "cypherPattern", "elliottImpulse", "elliottCorrection",
		"elliottTriangle", "elliottDoubleCombo", "elliottTripleCombo",
		"fibArc", "fibCircles", "fibSpeedResistanceArcs", "fibSpiral",
		"fibSpeedResistanceFan",
	] as const;

	it.each(LOCALES)("%s labels every premium feature flag", (_name, messages) => {
		const missing = PREMIUM_FLAGS.flatMap((flag) =>
			(["title", "description"] as const)
				.filter((part) => {
					const v = messages[`premium.${flag}.${part}`];
					return typeof v !== "string" || v.trim().length === 0;
				})
				.map((part) => `premium.${flag}.${part}`),
		);
		expect(missing, `missing: ${missing.join(", ")}`).toEqual([]);
	});

	it.each(LOCALES)("%s labels every advisory decision", (_name, messages) => {
		const missing = ADVISORY_DECISIONS.filter((d) => {
			const v = messages[`advisory.decision.${d}`];
			return typeof v !== "string" || v.trim().length === 0;
		});
		expect(missing, `missing: ${missing.join(", ")}`).toEqual([]);
	});

	it.each(LOCALES)("%s labels every premium drawing tool under tool.*", (_name, messages) => {
		// These are the engine-owned premium types (SSOT mirrored in
		// drawingTierUtils.ts); the desktop rail renders them via `tool.<id>`.
		const missing = PREMIUM_TOOL_TYPES.filter((id) => {
			const v = messages[`tool.${id}`];
			return typeof v !== "string" || v.trim().length === 0;
		});
		expect(missing, `missing tool.* labels: ${missing.join(", ")}`).toEqual([]);
	});

	it.each(LOCALES)("%s never returns a raw key from a dynamic lookup", (_name, messages) => {
		const dynamicKeys = [
			...PREMIUM_FLAGS.flatMap((f) => [`premium.${f}.title`, `premium.${f}.description`]),
			...ADVISORY_DECISIONS.map((d) => `advisory.decision.${d}`),
			...PREMIUM_TOOL_TYPES.map((t2) => `tool.${t2}`),
		];
		const leaked = dynamicKeys.filter((k) => {
			const v = messages[k];
			return typeof v === "string" && (v === k || v.startsWith("tool.") || v.startsWith("premium."));
		});
		expect(leaked, `raw keys would be rendered: ${leaked.join(", ")}`).toEqual([]);
	});
});
