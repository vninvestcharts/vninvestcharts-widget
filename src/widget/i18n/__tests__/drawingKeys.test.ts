// @vitest-environment node
// P5/Rule 1: every static drawing/toolbar/tool key referenced via t("…") in
// drawing surfaces must exist in BOTH widget dictionaries (no silent key
// fallback, no mixed-locale UI).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { widgetMessagesEn } from "../messages.en";
import { widgetMessagesVi } from "../messages.vi";
import { tOr } from "../../context/WidgetI18nContext";
import { TOOL_CAPABILITY_REGISTRY } from "@vninvestcharts/engine-drawing";

const SURFACE_DIRS = [
	"src/widget/hooks",
	"src/widget/components/drawing",
	"src/widget/components/toolbar",
];

function collectSourceFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === "__tests__" || entry === "node_modules") continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			collectSourceFiles(full, out);
		} else if (/\.(ts|tsx)$/.test(entry)) {
			out.push(full);
		}
	}
	return out;
}

function collectStaticKeys(): string[] {
	const keys = new Set<string>();
	const pattern = /\bt\(\s*(['"])((?:drawing|toolbar|tool)\.[A-Za-z0-9_.]+)\1\s*[,)]/g;
	for (const dir of SURFACE_DIRS) {
		for (const file of collectSourceFiles(dir)) {
			const content = readFileSync(file, "utf8");
			let match: RegExpExecArray | null;
			pattern.lastIndex = 0;
			while ((match = pattern.exec(content)) !== null) {
				keys.add(match[2]);
			}
		}
	}
	return [...keys].sort();
}

describe("P5 drawing i18n key parity", () => {
	it("every referenced drawing/toolbar/tool key exists in en + vi", () => {
		const missing: string[] = [];
		for (const key of collectStaticKeys()) {
			if (!(key in widgetMessagesEn)) missing.push(`en:${key}`);
			if (!(key in widgetMessagesVi)) missing.push(`vi:${key}`);
		}
		expect(missing).toEqual([]);
	});

	it("toolbar selection labels resolve (no key fallback)", () => {
		for (const key of [
			"drawing.toolbar.deleteAll",
			"drawing.toolbar.selectedCount",
			"drawing.list.title",
			"drawing.edit",
			"tool.premiumLocked",
			"toolbar.favoriteTools",
		] as const) {
			expect(typeof widgetMessagesEn[key], `en:${key}`).toBe("string");
			expect(typeof widgetMessagesVi[key], `vi:${key}`).toBe("string");
		}
	});

	it("S3: all 76 tool keys exist in both dictionaries (no raw-key UI)", () => {
		const tools = Object.keys(TOOL_CAPABILITY_REGISTRY);
		expect(tools.length).toBeGreaterThanOrEqual(70);
		const missing: string[] = [];
		for (const tool of tools) {
			const key = `tool.${tool}`;
			if (typeof widgetMessagesEn[key] !== "string" || typeof widgetMessagesVi[key] !== "string") {
				missing.push(key);
			}
		}
		expect(missing, `missing tool keys: ${missing.join(",")}`).toEqual([]);
	});

	it("S3: tOr falls back only when the key is missing (BUG-4)", () => {
		expect(tOr((k) => k, "tool.nope", "FB")).toBe("FB");
		expect(tOr((k) => (k === "tool.ok" ? "OK!" : k), "tool.ok", "FB")).toBe("OK!");
		expect(tOr((k) => (k === "tool.ok" ? "OK!" : k), "tool.nope", "FB")).toBe("FB");
	});

	it("S1.3: catches single-quoted keys too (quote-agnostic parity)", () => {
		// The 10 toolbar keys formerly rendered raw via t('...') must exist.
		for (const key of [
			"toolbar.drawingTools",
			"toolbar.selectChart",
			"toolbar.lock",
			"toolbar.unlock",
			"toolbar.expand",
			"toolbar.collapse",
			"toolbar.collapseGroup",
			"toolbar.expandGroup",
			"toolbar.actions",
			"toolbar.dangerousActions",
			"drawing.resourcesSuspended",
			"drawing.selection.duplicate",
			"drawing.selection.group",
		] as const) {
			expect(typeof widgetMessagesEn[key], `en:${key}`).toBe("string");
			expect(typeof widgetMessagesVi[key], `vi:${key}`).toBe("string");
		}
	});
});
