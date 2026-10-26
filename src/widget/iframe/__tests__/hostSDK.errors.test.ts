import { describe, expect, it } from "vitest";
import { EmbedError } from "../hostSDK";

describe("EmbedError (E4 taxonomy)", () => {
	it("carries code + recoverable + detail with the original message", () => {
		const err = new EmbedError("BRIDGE_TIMEOUT", "Request timeout: request:setSymbol", true, "request:setSymbol");
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("EmbedError");
		expect(err.code).toBe("BRIDGE_TIMEOUT");
		expect(err.recoverable).toBe(true);
		expect(err.detail).toBe("request:setSymbol");
		expect(err.message).toContain("Request timeout");
	});

	it("supports non-recoverable failures", () => {
		const err = new EmbedError("COMMAND_FAILED", "Widget not initialized", false);
		expect(err.recoverable).toBe(false);
		expect(err.detail).toBeUndefined();
	});
});
