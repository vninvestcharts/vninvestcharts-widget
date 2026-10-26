import { describe, expect, it } from "vitest";
import { resolvePriceHeaderWrapStyle } from "../GridContainer";

describe("resolvePriceHeaderWrapStyle (TRADEMARK_FIX)", () => {
	it("keeps the left axis clearance but forces a full-bleed right side", () => {
		expect(resolvePriceHeaderWrapStyle({
			paddingLeft: "calc(48px + 4px)",
			paddingRight: "calc(48px + 4px)",
		})).toEqual({
			paddingLeft: "calc(48px + 4px)",
			paddingRight: 0,
			width: "100%",
			boxSizing: "border-box",
		});
	});

	it("handles a missing paneHeaderStyle without dropping the box contract", () => {
		expect(resolvePriceHeaderWrapStyle(undefined)).toEqual({
			paddingRight: 0,
			width: "100%",
			boxSizing: "border-box",
		});
	});
});
