import { describe, expect, it } from "vitest";

import { isCleanSmokeModeEnabled } from "../runtimeQueryParams";

describe("isCleanSmokeModeEnabled", () => {
	it("returns true for the clean smoke query flag", () => {
		expect(isCleanSmokeModeEnabled("?smoke=clean")).toBe(true);
		expect(isCleanSmokeModeEnabled("?foo=bar&cleanSmoke=1")).toBe(true);
	});

	it("returns false for regular demo sessions", () => {
		expect(isCleanSmokeModeEnabled("")).toBe(false);
		expect(isCleanSmokeModeEnabled("?smoke=legacy")).toBe(false);
		expect(isCleanSmokeModeEnabled(undefined)).toBe(false);
	});
});