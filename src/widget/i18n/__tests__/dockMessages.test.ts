import { describe, expect, it } from "vitest";
import { widgetMessagesVi } from "../messages.vi";
import { widgetMessagesEn } from "../messages.en";
import { dockMessagesVi } from "../dock.messages.vi";
import { dockMessagesEn } from "../dock.messages.en";

describe("dock i18n namespace (D0 split)", () => {
	it("vi/en namespace key sets are identical and all dock.*", () => {
		const viKeys = Object.keys(dockMessagesVi).sort();
		const enKeys = Object.keys(dockMessagesEn).sort();
		expect(viKeys).toEqual(enKeys);
		expect(viKeys.length).toBeGreaterThan(0);
		for (const key of viKeys) {
			expect(key.startsWith("dock.")).toBe(true);
		}
	});

	it("main dictionaries still expose every dock key (spread intact)", () => {
		for (const key of Object.keys(dockMessagesVi)) {
			expect(typeof widgetMessagesVi[key]).toBe("string");
			expect(typeof widgetMessagesEn[key]).toBe("string");
		}
	});
});
