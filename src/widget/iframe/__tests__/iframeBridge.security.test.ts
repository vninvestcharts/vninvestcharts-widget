// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IframeBridge, matchOriginPattern } from "../iframeBridge";

/**
 * SEC-01 — iframe postMessage hardening.
 *
 * Bugs locked by this suite:
 *  1. Wildcard allowlist entries were compiled into a RegExp with unescaped `.`,
 *     so `https:` + wildcard + `vninvestcharts.com` also accepted
 *     `https://evilvninvestchartsXcom`.
 *  2. On the Host side an origin mismatch only logged a warning and let the
 *     message through.
 *  3. No payload size cap and no inbound rate limit.
 */
const ORIGIN = "https://host.example";

function makeBridge(overrides: Partial<ConstructorParameters<typeof IframeBridge>[0]> = {}) {
	const targetWindow = { postMessage: vi.fn() } as unknown as Window;
	return new IframeBridge({
		targetWindow,
		targetOrigin: ORIGIN,
		allowedOrigins: [ORIGIN],
		isHost: true,
		...overrides,
	});
}

function dispatch(bridge: IframeBridge, data: unknown, origin: string) {
	const handler = (bridge as unknown as { boundHandleMessage: (e: MessageEvent) => void }).boundHandleMessage;
	handler({ data, origin } as MessageEvent);
}

describe("SEC-01 matchOriginPattern (regex-free)", () => {
	it("matches exact origins", () => {
		expect(matchOriginPattern("https://a.vn", "https://a.vn")).toBe(true);
		expect(matchOriginPattern("https://a.vn", "https://b.vn")).toBe(false);
	});

	it("matches a leading subdomain wildcard", () => {
		expect(matchOriginPattern("https://*.vninvestcharts.com", "https://a.vninvestcharts.com")).toBe(true);
		expect(matchOriginPattern("https://*.vninvestcharts.com", "https://a.b.vninvestcharts.com")).toBe(true);
		expect(matchOriginPattern("https://*.vninvestcharts.com", "https://vninvestcharts.com")).toBe(true);
	});

	// The bypass the old RegExp implementation allowed.
	it("does NOT let unescaped dots match arbitrary hosts", () => {
		expect(matchOriginPattern("https://*.vninvestcharts.com", "https://evilvninvestchartsXcom")).toBe(false);
		expect(matchOriginPattern("https://*.vninvestcharts.com", "https://vninvestchartsXcom.attacker.net")).toBe(false);
		expect(matchOriginPattern("https://*.vninvestcharts.com", "https://a.vninvestcharts.com.evil.net")).toBe(false);
	});

	it("rejects malformed wildcard placement", () => {
		expect(matchOriginPattern("*", "https://anything")).toBe(false);
		expect(matchOriginPattern("https://*vninvestcharts.com", "https://avninvestcharts.com")).toBe(false);
		expect(matchOriginPattern("https://a.*.com", "https://a.x.com")).toBe(false);
	});
});

describe("SEC-01 bridge traffic guards", () => {
	let bridge: IframeBridge | null = null;

	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		bridge?.destroy();
		bridge = null;
		vi.restoreAllMocks();
	});

	// AC-SEC-01-1
	it("accepts a message from an allowlisted origin that matches targetOrigin", () => {
		bridge = makeBridge();
		const handler = vi.fn();
		bridge.setMessageHandler(handler);

		dispatch(bridge, { type: "event:ready", correlationId: "c1", timestamp: 1, origin: ORIGIN, payload: {} }, ORIGIN);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(bridge.stats.accepted).toBe(1);
		expect(bridge.stats.rejectedOrigin).toBe(0);
	});

	// AC-SEC-01-2
	it("rejects a look-alike origin and counts it", () => {
		bridge = makeBridge({ allowedOrigins: ["https://*.vninvestcharts.com"] });
		const handler = vi.fn();
		bridge.setMessageHandler(handler);

		dispatch(bridge, { type: "event:ready", correlationId: "c1", timestamp: 1, origin: "https://evilvninvestchartsXcom", payload: {} }, "https://evilvninvestchartsXcom");

		expect(handler).not.toHaveBeenCalled();
		expect(bridge.stats.rejectedOrigin).toBe(1);
	});

	// Regression: host side used to only warn on mismatch.
	it("rejects a host-side origin mismatch instead of only warning", () => {
		bridge = makeBridge({ allowedOrigins: [ORIGIN, "https://other.example"], targetOrigin: ORIGIN });
		const handler = vi.fn();
		bridge.setMessageHandler(handler);

		dispatch(bridge, { type: "event:ready", correlationId: "c1", timestamp: 1, origin: "https://other.example", payload: {} }, "https://other.example");

		expect(handler).not.toHaveBeenCalled();
		expect(bridge.stats.rejectedOrigin).toBe(1);
	});

	// AC-SEC-01-3
	it("rejects an oversized payload without mutating state", () => {
		bridge = makeBridge({ maxPayloadBytes: 200 });
		const handler = vi.fn();
		bridge.setMessageHandler(handler);

		dispatch(bridge, { type: "event:ready", correlationId: "c1", timestamp: 1, origin: ORIGIN, payload: { blob: "x".repeat(5_000) } }, ORIGIN);

		expect(handler).not.toHaveBeenCalled();
		expect(bridge.stats.rejectedSize).toBe(1);
	});

	it("accepts a payload under the size cap", () => {
		bridge = makeBridge({ maxPayloadBytes: 5_000 });
		const handler = vi.fn();
		bridge.setMessageHandler(handler);

		dispatch(bridge, { type: "event:ready", correlationId: "c1", timestamp: 1, origin: ORIGIN, payload: { ok: true } }, ORIGIN);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(bridge.stats.rejectedSize).toBe(0);
	});

	it("drops traffic once the rate budget is exhausted", () => {
		bridge = makeBridge({ maxMessages: 3, rateWindowMs: 60_000 });
		const handler = vi.fn();
		bridge.setMessageHandler(handler);

		for (let i = 0; i < 6; i++) {
			dispatch(bridge, { type: "event:ready", correlationId: `c${i}`, timestamp: 1, origin: ORIGIN, payload: {} }, ORIGIN);
		}

		expect(handler).toHaveBeenCalledTimes(3);
		expect(bridge.stats.rejectedRate).toBe(3);
	});

	// A hostile origin must not be able to burn the good origin's budget.
	it("does not charge rejected origins against the rate budget", () => {
		bridge = makeBridge({ allowedOrigins: [ORIGIN], maxMessages: 2, rateWindowMs: 60_000 });
		const handler = vi.fn();
		bridge.setMessageHandler(handler);

		for (let i = 0; i < 5; i++) {
			dispatch(bridge, { type: "event:ready", correlationId: `x${i}`, timestamp: 1, origin: "https://evil.test", payload: {} }, "https://evil.test");
		}
		dispatch(bridge, { type: "event:ready", correlationId: "g1", timestamp: 1, origin: ORIGIN, payload: {} }, ORIGIN);
		dispatch(bridge, { type: "event:ready", correlationId: "g2", timestamp: 1, origin: ORIGIN, payload: {} }, ORIGIN);

		expect(bridge.stats.rejectedOrigin).toBe(5);
		expect(bridge.stats.rejectedRate).toBe(0);
		expect(handler).toHaveBeenCalledTimes(2);
	});
});
