/**
 * licensing namespace (messages.licensing.ts) — key parity en/vi, reachability
 * trong merged catalog, và giá trị không rỗng. Thêm 2026-10-18 cùng fix SEC
 * masking (licensing.reveal/conceal) — trước đó file này không có test parity.
 */
import { describe, expect, it } from "vitest";
import { licensingMessagesEn, licensingMessagesVi } from "../messages.licensing";
import { widgetMessagesEn } from "../messages.en";
import { widgetMessagesVi } from "../messages.vi";

describe("licensing messages namespace", () => {
	it("en/vi key sets match", () => {
		expect(Object.keys(licensingMessagesVi).sort()).toEqual(Object.keys(licensingMessagesEn).sort());
	});

	it("every licensing key lands in the merged widget catalogs (tail spread)", () => {
		const keys = Object.keys(licensingMessagesEn) as Array<keyof typeof licensingMessagesEn>;
		for (const key of keys) {
			expect(widgetMessagesEn[key]).toBe(licensingMessagesEn[key]);
			expect(widgetMessagesVi[key]).toBe(licensingMessagesVi[key]);
		}
	});

	it("no empty values", () => {
		for (const [key, value] of Object.entries(licensingMessagesEn)) {
			expect(value.trim().length, key).toBeGreaterThan(0);
		}
	});
});
