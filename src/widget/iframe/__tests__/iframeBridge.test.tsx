/**
 * IframeBridge origin-pinning regression lock (SEC-01).
 *
 * The iframe side must not broadcast widget data with targetOrigin "*" once
 * the host origin is known: the first allowlisted incoming message pins the
 * send origin, and later sends use it.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

import { IframeBridge, createHostBridge } from "../iframeBridge";

const HOST_ORIGIN = "https://host.example";
const EVIL_ORIGIN = "https://evil.example";

let bridges: IframeBridge[] = [];

afterEach(() => {
	bridges.forEach((bridge) => bridge.destroy());
	bridges = [];
	vi.unstubAllGlobals();
});

function createIframeSideBridge(): { bridge: IframeBridge; postMessage: ReturnType<typeof vi.fn> } {
	const postMessage = vi.fn();
	const bridge = new IframeBridge({
		targetWindow: { postMessage } as unknown as Window,
		targetOrigin: "*",
		allowedOrigins: [HOST_ORIGIN],
		isHost: false,
	});
	bridges.push(bridge);
	return { bridge, postMessage };
}

function incoming(origin: string, data: unknown): void {
	window.dispatchEvent(
		new MessageEvent("message", { origin, data } as MessageEventInit),
	);
}

describe("origin pinning (SEC-01)", () => {
	it("uses '*' only before the first validated message, then the pinned origin", () => {
		const { bridge, postMessage } = createIframeSideBridge();

		bridge.sendEvent({ type: "event:ready", correlationId: "c1", timestamp: 1, origin: "x", payload: {} } as never);
		expect(postMessage).toHaveBeenCalledTimes(1);
		expect(postMessage.mock.calls[0]?.[1]).toBe("*");

		incoming(HOST_ORIGIN, { type: "event:ping", correlationId: "c2", timestamp: 2, origin: HOST_ORIGIN, payload: {} });

		bridge.sendEvent({ type: "event:ready", correlationId: "c3", timestamp: 3, origin: "x", payload: {} } as never);
		expect(postMessage).toHaveBeenCalledTimes(2);
		expect(postMessage.mock.calls[1]?.[1]).toBe(HOST_ORIGIN);
	});

	it("ignores messages from non-allowlisted origins (pin unchanged)", () => {
		const { bridge, postMessage } = createIframeSideBridge();

		incoming(EVIL_ORIGIN, { type: "event:ping", correlationId: "c1", timestamp: 1, origin: EVIL_ORIGIN, payload: {} });
		bridge.sendEvent({ type: "event:ready", correlationId: "c2", timestamp: 2, origin: "x", payload: {} } as never);
		expect(postMessage.mock.calls[0]?.[1]).toBe("*");

		incoming(HOST_ORIGIN, { type: "event:ping", correlationId: "c3", timestamp: 3, origin: HOST_ORIGIN, payload: {} });
		bridge.sendEvent({ type: "event:ready", correlationId: "c4", timestamp: 4, origin: "x", payload: {} } as never);
		expect(postMessage.mock.calls[1]?.[1]).toBe(HOST_ORIGIN);
	});
});

describe("command timeout override (E4)", () => {
	it("rejects with a timeout error after the override elapses", async () => {
		vi.useFakeTimers();
		try {
			const { bridge } = createIframeSideBridge();
			const pending = bridge.sendCommand({
				type: "request:getVisibleRange",
				correlationId: "t1",
				timestamp: 1,
				origin: HOST_ORIGIN,
				payload: {},
			} as never, 50);
			const assertion = expect(pending).rejects.toThrow(/Request timeout/);
			vi.runAllTimers();
			await assertion;
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("createHostBridge (SEC-02)", () => {
	it("throws when the iframe has no src (no silent '*' fallback)", () => {
		const iframe = document.createElement("iframe");
		expect(iframe.src).toBe("");
		expect(() => createHostBridge(iframe, [HOST_ORIGIN])).toThrow(/no src/);
	});

	it("derives the expected origin from src", () => {
		const iframe = document.createElement("iframe");
		iframe.setAttribute("src", "https://charts.example/embed");
		const postMessage = vi.fn();
		Object.defineProperty(iframe, "contentWindow", { value: { postMessage }, configurable: true });
		const bridge = createHostBridge(iframe, [HOST_ORIGIN]);
		bridges.push(bridge);
		bridge.sendEvent({ type: "event:ready", correlationId: "c1", timestamp: 1, origin: "x", payload: {} } as never);
		expect(postMessage).toHaveBeenCalledTimes(1);
		expect(postMessage.mock.calls[0]?.[1]).toBe("https://charts.example");
	});
});
