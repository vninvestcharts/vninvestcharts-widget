// S2.1: canonical shortcut SSOT (TOOL_SHORTCUT_KEYS / TOOL_SHORTCUT_LABELS).
import { describe, expect, it } from "vitest";
import { ALT_TOOL_SHORTCUTS, TOOL_SHORTCUT_KEYS, TOOL_SHORTCUT_LABELS, shortcutDisplayLabel } from "./toolShortcuts";
import { MAGNET_TOGGLE_ACTION } from "../hooks/useDrawingToolShortcuts";

describe("toolShortcuts SSOT (S2.1)", () => {
	it("lowercase letters display uppercase (badge = handler)", () => {
		expect(shortcutDisplayLabel("l")).toBe("L");
		expect(shortcutDisplayLabel("f")).toBe("F");
		expect(TOOL_SHORTCUT_LABELS["trendLine"]).toBe("L");
	});

	it("duplicate key entries do not overwrite the canonical label (first-wins)", () => {
		// `p` and `P` both map to pitchfork; the badge must show "P", not "Shift+P".
		expect(TOOL_SHORTCUT_KEYS["p"]).toBe("pitchfork");
		expect(TOOL_SHORTCUT_KEYS["P"]).toBe("pitchfork");
		expect(TOOL_SHORTCUT_LABELS["pitchfork"]).toBe("P");
	});

	it("every canonical key has a label (no missing badge)", () => {
		for (const [key, tool] of Object.entries(TOOL_SHORTCUT_KEYS)) {
			if (key === "Escape") continue;
			expect(TOOL_SHORTCUT_LABELS[tool], tool).toBeTruthy();
		}
	});

	it("no two keys silently conflict on one tool except known duplicates", () => {
		const byTool = new Map<string, string[]>();
		for (const [key, tool] of Object.entries(TOOL_SHORTCUT_KEYS)) {
			if (key === "Escape") continue;
			byTool.set(tool, [...(byTool.get(tool) ?? []), key]);
		}
		for (const [tool, keys] of byTool) {
			// Only pitchfork intentionally binds two keys (p + Shift+P).
			if (tool === "pitchfork") {
				expect(keys.sort()).toEqual(["P", "p"]);
				continue;
			}
			expect(keys, tool).toHaveLength(1);
		}
	});

	it("Alt shortcuts stay lowercase single letters (TradingView parity)", () => {
		for (const [key, tool] of Object.entries(ALT_TOOL_SHORTCUTS)) {
			expect(key).toMatch(/^[a-z]$/);
			expect(typeof tool).toBe("string");
		}
	});

	it("S4: Shift+M maps to the magnet action (not a drawing tool)", () => {
		expect(TOOL_SHORTCUT_KEYS["M"]).toBe(MAGNET_TOGGLE_ACTION);
		expect(MAGNET_TOGGLE_ACTION).toBe("toggleMagnet");
		expect(TOOL_SHORTCUT_LABELS[MAGNET_TOGGLE_ACTION]).toBe("Shift+M");
	});
});
