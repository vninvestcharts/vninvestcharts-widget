/**
 * Regression lock — webhook delivery.
 *
 * THE THREE HOLES, ALL OF WHICH LOOKED LIKE SUCCESS
 * ==================================================
 * The old call was `fetch(url, {...}).catch(console.error)`:
 *
 *   1. `fetch` only REJECTS on a network error. A webhook answering 404 or 500 resolved
 *      normally, so delivery was treated as done and nothing was logged. Worst of the three:
 *      a mistyped or dead endpoint fails silently for the life of the alert, while the alert
 *      list keeps reading "Active".
 *   2. No timeout. An endpoint that accepts the connection and never responds left the
 *      promise pending forever, accumulating one per alert.
 *   3. No `keepalive`, so a page unloading right after firing cancelled the request — exactly
 *      when the user most expects delivery.
 *
 * The negative cases below matter more than the positive one: "does it POST" passes against
 * the old code too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertManager } from "../AlertManager";

const BAR = new Date("2026-09-30T10:00:00Z");

function harness(webhook: string) {
	vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} } as any);
	// P0-a: delivery now requires entitlement. This suite is about whether a DELIVERED
	// request is well-formed, so it grants it; the gate itself is locked in
	// `webhookEntitlement.test.ts`, including the default-deny case.
	const m = new AlertManager(() => true);
	m.addAlert({
		id: "w1", symbol: "BTCUSDT", timeframe: "1h",
		sourceA: { type: "price", key: "close" },
		condition: "greater_than",
		sourceB: { type: "value", value: 10 },
		frequency: "once",
		actions: { popup: false, sound: false, email: false, webhook },
		message: "w", createdAt: 1, isTriggered: false,
	} as any);
	return m;
}

/**
 * Let the fire-and-forget delivery settle.
 *
 * `postWebhook` is deliberately NOT awaited by `triggerAlert` — a slow endpoint must never
 * stall the tick loop — so a test has to give the promise chain room. A single
 * `setTimeout(0)` is not enough and made this file flaky: it passes in isolation and fails in
 * a full run, because one macrotask does not reliably drain the fetch continuation plus the
 * `fail()` bookkeeping behind it. Five turns costs microseconds and is deterministic.
 */
async function settle() {
	for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}
/** Fire the alert and let the un-awaited delivery promise settle. */
async function fire(m: AlertManager) {
	m.checkAlerts("BTCUSDT", "1h", { date: BAR, close: 20 }, { date: BAR, close: 19 }, []);
	await settle();
}

let logged: string[];
/** Every fetch invocation: [url, init]. A plain array rather than a mock — the assertions only
 *  ever read these two, and it keeps the recorder's shape obvious. */
let calls: [unknown, any][];
/** Swapped per test to decide how the endpoint answers. */
let respond: () => Promise<unknown>;

beforeEach(() => {
	logged = [];
	calls = [];
	respond = async () => ({ ok: true, status: 200 });
	// localStorage MUST be stubbed per test, not left to jsdom. `AlertManager`'s constructor
	// calls `loadAlerts()`, so a manager built here reads whatever a PREVIOUS test persisted
	// through `saveAlerts()`. Without this, the manager starts with a leftover alert and
	// `getAlerts()[0]` is that stale one rather than the alert under test — which is exactly
	// how this file failed for a while: the delivery assertions all passed, but one test
	// reading `getAlerts()[0].lastDeliveryError` saw `undefined` and only in a full run.
	vi.stubGlobal("localStorage", {
		getItem: () => null,
		setItem: () => {},
		removeItem: () => {},
		clear: () => {},
	} as any);
	vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
		logged.push(args.map(String).join(" "));
	});
	vi.stubGlobal("fetch", (url: unknown, init: unknown) => {
		calls.push([url, init]);
		return respond();
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("webhook delivery", () => {
	it("a 2xx delivery logs nothing", async () => {
		await fire(harness("https://example.com/hook"));
		expect(calls).toHaveLength(1);
		expect(logged).toEqual([]);
	});

	it("THE SILENT ONE: a 500 is reported, not treated as delivered", async () => {
		respond = async () => ({ ok: false, status: 500 });
		await fire(harness("https://example.com/hook"));
		expect(logged.join("\n")).toContain("HTTP 500");
	});

	it("a 404 is reported too", async () => {
		respond = async () => ({ ok: false, status: 404 });
		await fire(harness("https://example.com/hook"));
		expect(logged.join("\n")).toContain("HTTP 404");
	});

	it("sends keepalive so an unload right after firing does not cancel delivery", async () => {
		await fire(harness("https://example.com/hook"));
		expect(calls[0][1]).toMatchObject({ keepalive: true });
	});

	it("sends an AbortSignal, so a hung endpoint is bounded", async () => {
		await fire(harness("https://example.com/hook"));
		expect(calls[0][1]).toHaveProperty("signal");
	});

	it("an invalid URL is refused immediately and NOTHING is sent", async () => {
		await fire(harness("not-a-url"));
		expect(calls).toHaveLength(0);
		expect(logged.join("\n")).toContain("not a valid absolute URL");
	});

	it("a non-http scheme is refused — a webhook must not be able to POST to file: or data:", async () => {
		await fire(harness("file:///etc/passwd"));
		expect(calls).toHaveLength(0);
		expect(logged.join("\n")).toContain("not http(s)");
	});

	it("a network rejection is still reported", async () => {
		respond = async () => { throw new Error("ECONNREFUSED"); };
		await fire(harness("https://example.com/hook"));
		expect(logged.join("\n")).toContain("Webhook failed");
	});

	it("does not send twice for one firing", async () => {
		await fire(harness("https://example.com/hook"));
		expect(calls).toHaveLength(1);
	});

	it("an alert with no webhook sends nothing", async () => {
		// P0-a: delivery now requires entitlement. This suite is about whether a DELIVERED
		// request is well-formed, so it grants it; the gate itself is locked in
		// `webhookEntitlement.test.ts`, including the default-deny case.
		const m = new AlertManager(() => true);
		m.addAlert({
			id: "w2", symbol: "BTCUSDT", timeframe: "1h",
			sourceA: { type: "price", key: "close" },
			condition: "greater_than",
			sourceB: { type: "value", value: 10 },
			frequency: "once",
			actions: { popup: false, sound: false, email: false },
			message: "w2", createdAt: 1, isTriggered: false,
		} as any);
		await fire(m);
		expect(calls).toHaveLength(0);
	});

	it("delivery is not awaited — a slow endpoint cannot stall the tick loop", async () => {
		let resolveFetch: (r: unknown) => void = () => {};
		respond = () => new Promise<unknown>((res) => { resolveFetch = res; });
		// The firing must complete even though the webhook is still pending.
		const m = harness("https://example.com/hook");
		await fire(m);
		expect(m.getAlerts()[0].isTriggered).toBe(true);
		expect(logged).toEqual([]);
		resolveFetch({ ok: true, status: 200 });
		await settle();
	});
});

/**
 * The UI half of the same defect: a delivery failure the user cannot see is a failure they
 * cannot act on. `lastDeliveryError` is what the alerts list renders, so these cases grade
 * the state the UI reads — including that it SURVIVES a reload and that a repaired endpoint
 * stops showing stale red text.
 */
describe("webhook delivery state for the UI", () => {
	it("a non-2xx records the status on the alert", async () => {
		respond = async () => ({ ok: false, status: 503 });
		const m = harness("https://example.com/hook");
		await fire(m);
		expect(m.getAlerts()[0].lastDeliveryError).toMatchObject({ status: 503 });
		expect(m.getAlerts()[0].lastDeliveryError?.reason).toContain("503");
	});

	it("an invalid URL records a failure WITHOUT a status", async () => {
		const m = harness("not-a-url");
		await fire(m);
		const err = m.getAlerts()[0].lastDeliveryError;
		expect(err).toBeTruthy();
		expect(err?.status).toBeUndefined();
		expect(err?.reason).toContain("not a valid absolute URL");
	});

	it("a non-http scheme records a failure", async () => {
		const m = harness("file:///etc/passwd");
		await fire(m);
		expect(m.getAlerts()[0].lastDeliveryError?.reason).toContain("not http(s)");
	});

	it("a network rejection records a failure", async () => {
		respond = async () => { throw new Error("ECONNREFUSED"); };
		const m = harness("https://example.com/hook");
		await fire(m).catch(() => {});
		expect(m.getAlerts()[0].lastDeliveryError?.reason).toContain("ECONNREFUSED");
	});

	it("is PERSISTED, so the alerts list still shows it after a reload", async () => {
		respond = async () => ({ ok: false, status: 500 });
		let written = "";
		vi.stubGlobal("localStorage", {
			getItem: () => null,
			setItem: (_k: string, v: string) => { written = v; },
			removeItem: () => {},
			clear: () => {},
		} as any);
		// P0-a: delivery now requires entitlement. This suite is about whether a DELIVERED
		// request is well-formed, so it grants it; the gate itself is locked in
		// `webhookEntitlement.test.ts`, including the default-deny case.
		const m = new AlertManager(() => true);
		m.addAlert({
			id: "p1", symbol: "BTCUSDT", timeframe: "1h",
			sourceA: { type: "price", key: "close" },
			condition: "greater_than",
			sourceB: { type: "value", value: 10 },
			frequency: "continuous",
			actions: { popup: false, sound: false, email: false, webhook: "https://example.com/hook" },
			message: "p", createdAt: 1, isTriggered: false,
		} as any);
		m.checkAlerts("BTCUSDT", "1h", { date: BAR, close: 20 }, { date: BAR, close: 19 }, []);
		await settle();
		const stored = JSON.parse(written);
		expect(stored[0].lastDeliveryError).toBeTruthy();
		expect(stored[0].lastDeliveryError.status).toBe(500);
	});

	it("a SUCCESSFUL delivery clears a previous failure — no stale red text", async () => {
		// Must be `continuous`: `once` acks on the first firing and is then filtered out of
		// `activeAlerts`, so there is no second delivery and nothing could clear the failure.
		// P0-a: delivery now requires entitlement. This suite is about whether a DELIVERED
		// request is well-formed, so it grants it; the gate itself is locked in
		// `webhookEntitlement.test.ts`, including the default-deny case.
		const m = new AlertManager(() => true);
		m.addAlert({
			id: "c1", symbol: "BTCUSDT", timeframe: "1h",
			sourceA: { type: "price", key: "close" },
			condition: "greater_than",
			sourceB: { type: "value", value: 10 },
			frequency: "continuous",
			actions: { popup: false, sound: false, email: false, webhook: "https://example.com/hook" },
			message: "c", createdAt: 1, isTriggered: false,
		} as any);

		respond = async () => ({ ok: false, status: 500 });
		m.checkAlerts("BTCUSDT", "1h", { date: BAR, close: 20 }, { date: BAR, close: 19 }, []);
		await settle();
		expect(m.getAlerts()[0].lastDeliveryError).toBeTruthy();

		// The endpoint recovers. The alert re-fires on a fresh bar and the stale
		// failure must disappear, or the list shows red for a working endpoint.
		respond = async () => ({ ok: true, status: 200 });
		m.checkAlerts("BTCUSDT", "1h", { date: new Date("2026-09-30T11:00:00Z"), close: 5 }, { date: BAR, close: 20 }, []);
		await settle();
		m.checkAlerts("BTCUSDT", "1h", { date: new Date("2026-09-30T12:00:00Z"), close: 30 }, { date: BAR, close: 20 }, []);
		await settle();
		expect(m.getAlerts()[0].lastDeliveryError).toBeUndefined();
	});

	it("an alert with no webhook NEVER has a delivery error, so the UI has nothing to show", async () => {
		// P0-a: delivery now requires entitlement. This suite is about whether a DELIVERED
		// request is well-formed, so it grants it; the gate itself is locked in
		// `webhookEntitlement.test.ts`, including the default-deny case.
		const m = new AlertManager(() => true);
		m.addAlert({
			id: "n1", symbol: "BTCUSDT", timeframe: "1h",
			sourceA: { type: "price", key: "close" },
			condition: "greater_than",
			sourceB: { type: "value", value: 10 },
			frequency: "once",
			actions: { popup: false, sound: false, email: false },
			message: "n", createdAt: 1, isTriggered: false,
		} as any);
		await fire(m);
		expect(m.getAlerts()[0].lastDeliveryError).toBeUndefined();
	});

	it("a healthy delivery writes no extra state (no needless localStorage churn)", async () => {
		let writes = 0;
		vi.stubGlobal("localStorage", {
			getItem: () => null,
			setItem: () => { writes++; },
			removeItem: () => {},
			clear: () => {},
		} as any);
		// P0-a: delivery now requires entitlement. This suite is about whether a DELIVERED
		// request is well-formed, so it grants it; the gate itself is locked in
		// `webhookEntitlement.test.ts`, including the default-deny case.
		const m = new AlertManager(() => true);
		m.addAlert({
			id: "h1", symbol: "BTCUSDT", timeframe: "1h",
			sourceA: { type: "price", key: "close" },
			condition: "greater_than",
			sourceB: { type: "value", value: 10 },
			frequency: "once",
			actions: { popup: false, sound: false, email: false, webhook: "https://example.com/hook" },
			message: "h", createdAt: 1, isTriggered: false,
		} as any);
		await fire(m);
		// `addAlert` writes once and the ack in triggerAlert writes once, so the baseline is
		// already 2 before the webhook is even reached. What must not happen is a THIRD
		// write to clear a failure that does not exist — this path runs on every firing and
		// localStorage writes are not free.
		expect(writes).toBe(2);
		expect(m.getAlerts()[0].lastDeliveryError).toBeUndefined();
	});
});
