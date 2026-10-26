/**
 * S-06: settings namespace (settings.messages.en/vi) — key parity, merged-catalog
 * reachability (tail spread trong messages.en/vi), và giá trị không rỗng.
 */
import { describe, expect, it } from "vitest";
import { settingsMessagesEn } from "../settings.messages.en";
import { settingsMessagesVi } from "../settings.messages.vi";
import { widgetMessagesEn } from "../messages.en";
import { widgetMessagesVi } from "../messages.vi";

describe("settings messages namespace (S-06)", () => {
	it("en/vi key sets match", () => {
		expect(Object.keys(settingsMessagesVi).sort()).toEqual(Object.keys(settingsMessagesEn).sort());
	});

	it("every settings key lands in the merged widget catalogs (tail spread)", () => {
		for (const key of Object.keys(settingsMessagesEn)) {
			expect(widgetMessagesEn[key]).toBe(settingsMessagesEn[key]);
			expect(widgetMessagesVi[key]).toBe(settingsMessagesVi[key]);
		}
	});

	it("no empty values", () => {
		for (const [key, value] of Object.entries(settingsMessagesEn)) {
			expect(value.trim().length, key).toBeGreaterThan(0);
		}
	});
});
