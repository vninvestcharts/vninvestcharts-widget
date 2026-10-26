// @vitest-environment jsdom
/**
 * F-08 regression lock — the empty-grid-slot "add chart" button must be visible in BOTH themes.
 *
 * THE DEFECT
 * ----------
 * `GridContainer.tsx:1164` rendered this control with inline styles hardcoding WHITE:
 *   border: "2px dashed rgba(255,255,255,0.15)"
 *   glyph colour: "rgba(255,255,255,0.3)"
 * The light theme sets `--vnsc-bg-primary: #ffffff` (`injected.css:3161`), so the control was
 * white-on-white — invisible. It is the only way to fill an empty grid slot, so on light theme a
 * user could see a hole in their layout with no visible way to act on it.
 *
 * WHY THE TEST IS STRUCTURED THIS WAY
 * ----------------------------------
 * Colours are the subject, but JSDOM does not compute CSS: it cannot tell you that white text on
 * a white background is unreadable. So the assertion is made against the SOURCE, mechanically —
 * "this component must not hardcode a light-on-dark colour, it must go through the token layer".
 * That is checkable, and it is the actual root cause: the inline style bypassed the tokens, which
 * is why no theme switch could reach it.
 *
 * FAIL-BEFORE: revert `GridContainer.tsx:1164` to the inline `rgba(255,255,255,...)` version and
 * this test goes red. Verified 2026-10-15.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// This file sits in `layout/__tests__/`, so the component under test is one level up — not two.
// (First draft pointed at `layout/components/layout/…`; ENOENT on all four cases proved it.)
const LAYOUT_DIR = path.resolve(import.meta.dirname, "..");
const GRID_TSX = path.join(LAYOUT_DIR, "GridContainer.tsx");
const GRID_CSS = path.join(LAYOUT_DIR, "GridContainer.module.css");

describe("F-08: empty-slot add-chart control must be theme-aware", () => {
	it("GridContainer.tsx must not hardcode white for the empty-slot control", () => {
		const src = fs.readFileSync(GRID_TSX, "utf8");
		// White hardcodes anywhere in this file are a defect: the component has a light theme.
		const whiteHardcodes = src.match(/rgba\(255,\s*255,\s*255[^)]*\)|#fff\b|#ffffff\b/gi) ?? [];
		expect(
			whiteHardcodes,
			`GridContainer.tsx still hardcodes a light-on-dark colour (${whiteHardcodes.length} found). ` +
				"A white value is invisible under the light theme (--vnsc-bg-primary: #ffffff, injected.css:3161). " +
				"Use a token from GridContainer.module.css instead.",
		).toHaveLength(0);
	});

	it("the empty-slot control is rendered through the CSS module, not inline styles", () => {
		const src = fs.readFileSync(GRID_TSX, "utf8");
		const emptySlotCall = src.slice(src.indexOf("empty-"));
		expect(emptySlotCall.length, "expected to find the empty-slot cell branch").toBeGreaterThan(0);
		expect(
			emptySlotCall.slice(0, 600),
			"the empty-slot cell must use styles.emptySlot, not an inline border/colour",
		).toContain("styles.emptySlot");
	});

	it("the class it relies on exists and is token-driven", () => {
		const css = fs.readFileSync(GRID_CSS, "utf8");
		expect(css).toMatch(/\.emptySlot\s*\{/);
		// Borders and text must come from variables, so a theme switch can actually reach them.
		const rule = css.slice(css.indexOf(".emptySlot {"), css.indexOf(".emptySlot:hover"));
		expect(rule).toContain("var(--vnsc-border-hover");
		expect(rule).toContain("var(--vnsc-text-secondary");
		// And it must not reintroduce the white this whole change removed.
		expect(rule).not.toMatch(/rgba\(255,\s*255,\s*255|#fff\b|#ffffff\b/i);
	});

	it("the control keeps its accessible name and role", () => {
		const src = fs.readFileSync(GRID_TSX, "utf8");
		const branch = src.slice(src.indexOf("empty-"), src.indexOf("empty-") + 800);
		// F-09/F-10 territory, but this one is cheap to keep and the control is the same node.
		expect(branch).toContain('role="button"');
		expect(branch).toMatch(/aria-label=/);
	});
});