import { describe, expect, it } from "vitest";
import { TOOL_GROUPS_V2 } from "../toolGroups";
import { TOOL_SHORTCUT_KEYS, TOOL_SHORTCUT_LABELS, shortcutDisplayLabel } from "../toolShortcuts";
import { drawingToolIcons } from "@vninvestcharts/engine-react";
import { widgetMessagesEn } from "../../i18n/messages.en";

describe("P4 toolbar parity SSOT", () => {
	it("covers exactly the 76 registered drawing tools (no more, no fewer)", () => {
		const all = TOOL_GROUPS_V2.flatMap((group) => group.tools);
		expect(TOOL_GROUPS_V2).toHaveLength(14);
		// 76 tools + 2 UI modes (cursor/crosshair), each exactly once.
		expect(all).toHaveLength(78);
		expect(new Set(all).size).toBe(78);
		const tools = all.filter((tool) => tool !== "cursor" && tool !== "crosshair");
		expect(tools).toHaveLength(76);
	});

	it("lists pitchfork exactly once (channels group must not duplicate it)", () => {
		const hits = TOOL_GROUPS_V2.flatMap((group) => group.tools).filter((tool) => tool === "pitchfork");
		expect(hits).toHaveLength(1);
		const owner = TOOL_GROUPS_V2.find((group) => group.tools.includes("pitchfork"))?.id;
		expect(owner).toBe("pitchfork");
	});

	it("every tool has an SVG glyph in the registry (no null ToolGlyph)", () => {
		const missing = TOOL_GROUPS_V2.flatMap((group) => group.tools).filter(
			(tool) => drawingToolIcons[tool] == null,
		);
		expect(missing).toEqual([]);
	});

	it("every group and tool has an i18n label", () => {
		for (const group of TOOL_GROUPS_V2) {
			expect(widgetMessagesEn[group.labelKey], group.id).toBeTruthy();
			for (const tool of group.tools) {
				expect(widgetMessagesEn[`tool.${tool}`], tool).toBeTruthy();
			}
		}
	});
});

describe("P4 tool shortcuts SSOT", () => {
	it("keeps every legacy binding and adds the P4 bindings", () => {
		expect(TOOL_SHORTCUT_KEYS).toMatchObject({
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
			b: "brush",
			o: "polygon",
			L: "longPosition",
			S: "shortPosition",
			P: "pitchfork",
		});
	});

	it("labels Shift-held keys explicitly (S2.1: lowercase displays uppercase)", () => {
		expect(shortcutDisplayLabel("Escape")).toBe("Esc");
		expect(shortcutDisplayLabel("l")).toBe("L");
		expect(shortcutDisplayLabel("L")).toBe("Shift+L");
		expect(TOOL_SHORTCUT_LABELS["longPosition"]).toBe("Shift+L");
		expect(TOOL_SHORTCUT_LABELS["trendLine"]).toBe("L");
	});
});
