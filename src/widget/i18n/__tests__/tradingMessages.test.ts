import { describe, expect, it } from "vitest";
import { widgetMessagesVi } from "../messages.vi";
import { widgetMessagesEn } from "../messages.en";
import { tradingMessagesVi } from "../trading.messages.vi";
import { tradingMessagesEn } from "../trading.messages.en";

describe("trading i18n namespace (S0)", () => {
	it("vi/en namespace key sets are identical", () => {
		expect(Object.keys(tradingMessagesVi).sort()).toEqual(Object.keys(tradingMessagesEn).sort());
	});

	it("main dictionaries expose every trading key (spread intact)", () => {
		for (const key of Object.keys(tradingMessagesVi)) {
			expect(typeof widgetMessagesVi[key]).toBe("string");
			expect(typeof widgetMessagesEn[key]).toBe("string");
		}
	});
});
