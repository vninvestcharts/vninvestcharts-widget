/**
 * P4: single source of truth for drawing-tool keyboard shortcuts.
 * Merges the legacy single-letter map with the P4 additions. Uppercase keys
 * are Shift-modified (e.key arrives uppercased while Shift is held).
 *
 * NOTE: `E` stays bound to `ellipse` (existing muscle memory); the eraser is
 * toolbar-only.
 *
 * **2026-09-30:** this file is now the *only* shortcut source. The legacy
 * `DRAWING_SHORTCUTS` table in `@vninvestcharts/engine-drawing` (`shortcutMap.ts`) and
 * `SHORTCUTS` in `engine-react/adapters/KeyboardAdapter.ts` were both **deleted** as
 * breaking changes in engine 3.0.0 — they had zero consumers and were a wrong second copy
 * (bare `C`/`H`/`M` and `Ctrl+H` collided with bindings that really run). There is no
 * longer a competing table to drift from.
 */

/** KeyboardEvent.key → DrawingToolType. Uppercase = Shift-held. */
export const TOOL_SHORTCUT_KEYS: Record<string, string> = {
	l: "trendLine",
	y: "ray",
	h: "hLine",
	v: "vLine",
	f: "fibonacci",
	p: "pitchfork",
	g: "gannBox",
	r: "rectangle",
	e: "ellipse",
	x: "crosshair",
	a: "arc",
	Escape: "cursor",
	// P4 additions (no conflicts with the legacy bindings above).
	b: "brush",
	o: "polygon",
	L: "longPosition",
	S: "shortPosition",
	P: "pitchfork",
	// S4/BUG-6: magnet cycle action (Shift+M). NOT a DrawingToolType — the
	// shortcut hook branches to onMagnetCycle BEFORE the premium/tool path.
	M: "toggleMagnet",
};

/** Display label for a shortcut key (Shift-held uppercase keys shown as such). */
export function shortcutDisplayLabel(key: string): string {
	if (key === "Escape") return "Esc";
	if (key.length === 1 && key >= "A" && key <= "Z") return `Shift+${key}`;
	// S2.1: single lowercase letters display uppercase (badge shows "L", not "l").
	if (key.length === 1 && key >= "a" && key <= "z") return key.toUpperCase();
	return key;
}

/** DrawingToolType → display shortcut label (tools without a binding map to ""). */
// S2.1: first-wins — duplicate entries (e.g. `P:` after `p:` for pitchfork)
// must NOT overwrite the canonical label, so pitchfork shows "P".
export const TOOL_SHORTCUT_LABELS: Record<string, string> = (() => {
	const out: Record<string, string> = {};
	for (const [key, tool] of Object.entries(TOOL_SHORTCUT_KEYS)) {
		if (!(tool in out)) out[tool] = shortcutDisplayLabel(key);
	}
	return out;
})();

/**
 * P3: Alt-held industry bindings (TradingView parity). `KeyboardEvent.key`
 * stays lowercase for letters while Alt is held (unlike Shift), so the map
 * keys are lowercase. All four tools are free-tier — no PAT gating needed.
 */
export const ALT_TOOL_SHORTCUTS: Record<string, string> = {
	t: "trendLine",
	h: "hLine",
	f: "fibonacci",
	r: "rectangle",
};
