/**
 * storage adapter on the server — the branch that cannot be tested in jsdom.
 *
 * This file exists because the jsdom suite CANNOT reach the SSR branch, and saying so
 * in a comment is not the same as covering it. In jsdom `localStorage` is always
 * defined, so `typeof localStorage === "undefined"` is always false; every assertion
 * about the no-storage path there would be theatre.
 *
 * `@vitest-environment node` supplies a real absence: no `window`, no
 * `localStorage`, so the bare identifier genuinely fails to resolve — which is exactly
 * what happens during SSR. A `vi.stubGlobal("localStorage", undefined)` would NOT do:
 * stubbing makes the identifier resolve, so the branch under test is never taken. That
 * mistake is the reason this file is separate instead of a describe block in the jsdom
 * suite.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";

import { readJson, readString, removeKey, writeJson, writeString } from "../storage";

describe("storage adapter with no localStorage at all", () => {
	it("precondition: this environment really has no storage", () => {
		// Without this the whole file could pass while testing nothing, which is the
		// failure mode this file exists to rule out.
		expect(typeof (globalThis as { localStorage?: unknown }).localStorage).toBe("undefined");
	});

	it("reads fall back instead of throwing", () => {
		expect(readString("k")).toBeNull();
		expect(readJson("k", { fallback: true })).toEqual({ fallback: true });
		expect(readJson("k", null)).toBeNull();
	});

	it("writes report failure instead of pretending they worked", () => {
		// Returning true here would tell a caller its value is persisted when nothing
		// was written. A licensing or alert change would then look saved and vanish on
		// reload - a bug that only appears in production, where there IS no storage.
		expect(writeString("k", "v")).toBe(false);
		expect(writeJson("k", { a: 1 })).toBe(false);
		expect(removeKey("k")).toBe(false);
	});
});