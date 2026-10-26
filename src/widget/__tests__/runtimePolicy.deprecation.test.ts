import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

import { evaluateRuntimePolicy, resolveRequestedRuntime } from "../runtimePolicy";

/**
 * G4 (2026-10-03) - the `"legacy"` deprecation is gone with the lane; the `"auto"`
 * deprecation stays.
 *
 * This file previously also covered the legacy freeze. That coverage was deleted
 * along with the lane rather than left as a test of something that no longer
 * exists. What remains is the part that is still true.
 */
describe('runtimePolicy - "auto" is still a deprecated alias of fork', () => {
	const originalEnv = process.env.NODE_ENV;
	let warn: MockInstance<any[], any>;

	beforeEach(() => {
		warn = vi.spyOn(console, "warn").mockImplementation(() => {}) as MockInstance<any[], any>;
	});

	afterEach(() => {
		warn.mockRestore();
		process.env.NODE_ENV = originalEnv;
	});

	it("warns in dev and resolves fork", () => {
		process.env.NODE_ENV = "development";
		const out = evaluateRuntimePolicy({ engineRuntime: "auto" });

		expect(out).toEqual({ resolvedRuntime: "fork", reasonCode: "AUTO_DEFAULT_FORK_RUNTIME" });
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]?.[0])).toContain('engineRuntime="auto"');
	});

	it("stays silent in production so hosts keep working without console noise", () => {
		process.env.NODE_ENV = "production";
		expect(resolveRequestedRuntime({ engineRuntime: "auto" })).toBe("fork");
		expect(warn).not.toHaveBeenCalled();
	});

	it("does not warn for fork or for the default", () => {
		process.env.NODE_ENV = "development";
		evaluateRuntimePolicy({ engineRuntime: "fork" });
		evaluateRuntimePolicy({});
		expect(warn).not.toHaveBeenCalled();
	});

	it("has no legacy branch left: a smuggled legacy resolves fork", () => {
		// The type no longer permits "legacy", but a host is JavaScript at runtime and
		// can pass the string anyway. It must not reach a legacy code path.
		process.env.NODE_ENV = "development";
		const out = evaluateRuntimePolicy({ engineRuntime: "legacy" as never });
		expect(out.resolvedRuntime).toBe("fork");
		expect(warn).not.toHaveBeenCalled();
	});
});