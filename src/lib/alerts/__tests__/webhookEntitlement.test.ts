/**
 * P0-a regression lock — the `webhook` alert action must be entitlement-gated, fail-closed.
 *
 * THE DEFECT
 * ----------
 * `webhook` is declared at Enterprise tier in the capability matrix, but the delivery path had no
 * entitlement check anywhere: `AlertManager.triggerAlert` called `postWebhook` whenever
 * `alert.actions.webhook` was set, and `AlertsModal` rendered the URL input for anyone who could
 * open it. The enforcement gate stayed GREEN through this, because `webhook` sat in its
 * DECLARED_NOT_SHIPPED table with the reason "backend EP not delivered" — a claim that was false.
 * So a Pro-tier user could fire an Enterprise-only outbound HTTP call.
 *
 * WHAT IS LOCKED
 * --------------
 * 1. Default is fail-closed: constructing `AlertManager` with no predicate must NOT deliver. This is
 *    the property that matters — it means no existing call site can leak by accident.
 * 2. An explicit `false` predicate does not deliver.
 * 3. An explicit `true` predicate DOES deliver. Without this case the gate would be "working" by
 *    breaking the feature for everyone, which is a worse bug than the one it replaced.
 * 4. The predicate is read at TRIGGER time, so a licence that resolves after mount takes effect on
 *    the same manager instance — the widget wires it through a ref for exactly this reason.
 *
 * FAIL-BEFORE: revert the guard in `AlertManager.triggerAlert` to `if (alert.actions.webhook)` and
 * cases 1, 2 and 4 go red. Verified 2026-10-15.
 *
 * NOTE ON SCOPE: this locks DELIVERY only. `AlertManager.webhook.test.ts` remains the authority on
 * whether a delivered request is well-formed; this file is about whether it is allowed to happen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertManager } from "../AlertManager";

const BAR = new Date("2026-10-15T10:00:00Z");

/**
 * `postWebhook` is deliberately not awaited by `triggerAlert`, so delivery needs room to settle.
 * Five turns — copied from `AlertManager.webhook.test.ts`, which documents why one macrotask was
 * flaky in a full run.
 */
async function settle() {
	for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

function harness(webhookAllowed?: () => boolean, frequency: "once" | "always" = "once") {
	vi.stubGlobal("localStorage", {
		getItem: () => null,
		setItem: () => {},
		removeItem: () => {},
		clear: () => {},
	} as unknown as Storage);
	const m = webhookAllowed ? new AlertManager(webhookAllowed) : new AlertManager();
	m.addAlert({
		id: "p0a",
		symbol: "BTCUSDT",
		timeframe: "1h",
		sourceA: { type: "price", key: "close" },
		condition: "greater_than",
		sourceB: { type: "value", value: 10 },
		frequency,
		actions: { popup: false, sound: false, email: false, webhook: "https://example.invalid/hook" },
		message: "p0a",
		createdAt: 1,
		isTriggered: false,
	} as never);
	return m;
}

async function fire(m: AlertManager) {
	m.checkAlerts("BTCUSDT", "1h", { date: BAR, close: 20 }, { date: BAR, close: 19 }, []);
	await settle();
}

let calls: unknown[][];

beforeEach(() => {
	calls = [];
	vi.stubGlobal("fetch", ((url: unknown) => {
		calls.push([url]);
		return Promise.resolve({ ok: true, status: 200 });
	}) as unknown as typeof fetch);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("P0-a: webhook delivery is entitlement-gated", () => {
	it("AC-A2 — DEFAULT is fail-closed: no predicate means no delivery", async () => {
		await fire(harness());
		expect(calls, "webhook must NOT fire without an entitlement predicate").toHaveLength(0);
	});

	it("AC-A1 — an explicit false predicate does not deliver", async () => {
		await fire(harness(() => false));
		expect(calls).toHaveLength(0);
	});

	it("AC-A3 — an entitled predicate DOES deliver", async () => {
		await fire(harness(() => true));
		expect(calls, "an entitled manager must still be able to deliver").toHaveLength(1);
		expect(String(calls[0][0])).toContain("example.invalid");
	});

	it("AC-A5 — a licence that lands after mount takes effect on the SAME manager", async () => {
		let entitled = false;
		// `frequency: "always"` so the second bar re-evaluates. With the default `"once"` the
		// alert is already triggered after the first fire and the case would pass for the wrong
		// reason — a green test that proved nothing.
		const m = harness(() => entitled, "always");

		await fire(m);
		expect(calls, "locked while unlicensed").toHaveLength(0);

		// The licence resolves. No remount, no new AlertManager — the widget reassigns a ref.
		entitled = true;
		m.checkAlerts("BTCUSDT", "1h", { date: BAR, close: 30 }, { date: BAR, close: 25 }, []);
		await settle();
		expect(calls, "delivers once the licence lands on the same instance").toHaveLength(1);
	});

	it("an alert with no webhook action is unaffected by the gate", async () => {
		vi.stubGlobal("localStorage", {
			getItem: () => null,
			setItem: () => {},
			removeItem: () => {},
			clear: () => {},
		} as unknown as Storage);
		const m = new AlertManager(() => false);
		m.addAlert({
			id: "p0a-nohook",
			symbol: "BTCUSDT",
			timeframe: "1h",
			sourceA: { type: "price", key: "close" },
			condition: "greater_than",
			sourceB: { type: "value", value: 10 },
			frequency: "once",
			actions: { popup: false, sound: false, email: false },
			message: "no webhook",
			createdAt: 1,
			isTriggered: false,
		} as never);
		await fire(m);
		expect(calls).toHaveLength(0);
		expect(m.getAlerts()[0].isTriggered, "the alert itself must still fire").toBe(true);
	});
});