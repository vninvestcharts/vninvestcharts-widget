/**
 * ALERT-04/05/06 ROOT-CAUSE LOCK.
 *
 * FINDING (graded, not guessed): the alert lifecycle is SCOPED to
 * (symbol, timeframe). `AlertManager.checkAlerts` filters
 *   `a.symbol === symbol && a.timeframe === timeframe && !a.isTriggered`
 * (src/lib/alerts/AlertManager.ts:52-54) BEFORE it ever calls AlertEvaluator.
 *
 * `verify-alerts.cjs` created the alert while the standalone demo sat on its
 * initial timeframe "1h" (src/demo/StandaloneEmbedDemo.tsx:40; the modal is
 * handed `timeframe={dataResult.activeTimeframe}` at VNInvestCharts.tsx:2822)
 * and then ticked `["5m", "15m", "1m", "5m"]` — a list that does NOT contain the
 * alert's own timeframe. The alert was therefore never a candidate,
 * AlertEvaluator was never reached, `isTriggered` stayed false, and no dialog
 * could be raised. One cause, three FAILs (ALERT-04/05/06), and the tick list
 * was the SUITE's, not the product's.
 *
 * Everything below runs a real AlertManager over a stubbed localStorage, so it
 * proves persisted -> loaded -> evaluated rather than quoting the filter.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AlertManager } from "../AlertManager";
import { AlertEvaluator } from "../AlertEvaluator";
import { buildAlertDraft, buildAlertSourceB } from "../../../widget/components/settings/AlertsModal";
import type { AlertDraftInput } from "../../../widget/components/settings/AlertsModal";
import type { AlertCondition } from "../types";

const STORE = "vninvestcharts-widget_alerts";

/** The exact tick list verify-alerts.cjs used, verbatim. */
const SUITE_TICKS = ["5m", "15m", "1m", "5m"] as const;
/** The timeframe the standalone demo starts on, so the alert inherits it. */
const DEMO_INITIAL_TIMEFRAME = "1h";
const DEMO_SYMBOL = "BTCUSDT";

/**
 * A fresh localStorage per test, with the backing object returned for direct
 * inspection. Every describe MUST call this: `AlertManager`'s constructor calls
 * `loadAlerts()`, so a describe that skips the stub silently inherits the
 * previous test's persisted alerts through `vi.stubGlobal`, and `getAlerts()[0]`
 * is then a stale row rather than the one under test. (That exact trap made an
 * early draft of this file assert against the wrong alert.)
 */
const stubLocalStorage = () => {
	const store: Record<string, string> = {};
	vi.stubGlobal("localStorage", {
		getItem: (k: string) => store[k] ?? null,
		setItem: (k: string, v: string) => {
			store[k] = v;
		},
		removeItem: (k: string) => {
			delete store[k];
		},
		clear: () => {
			for (const k of Object.keys(store)) delete store[k];
		},
	});
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
	return store;
};

/** A real bar. `close` is positive, so `close > 0` holds BY CONSTRUCTION. */
const bar = (iso: string, close: number) => ({
	date: new Date(iso),
	open: close - 1,
	high: close + 1,
	low: close - 2,
	close,
	volume: 1000,
});

const prev = bar("2026-06-21T10:00:00Z", 99);
const curr = bar("2026-06-21T11:00:00Z", 101);
const CUR_BAR_TIME = Date.parse("2026-06-21T11:00:00Z");

/** The draft the E2E form produces: price.close greater_than 0, frequency once. */
const form = (over: Partial<AlertDraftInput> = {}): AlertDraftInput => ({
	id: "alert-scope",
	createdAt: 1_700_000_000_000,
	symbol: DEMO_SYMBOL,
	timeframe: DEMO_INITIAL_TIMEFRAME,
	sourceAType: "price",
	sourceAKey: "close",
	sourceAIndicatorId: "",
	condition: "greater_than",
	sourceBType: "value",
	sourceBValue: "0",
	sourceBKey: "close",
	sourceBIndicatorId: "",
	frequency: "once",
	actionPopup: true,
	actionSound: true,
	webhookUrl: "",
	message: "d3e2e once-only probe",
	...over,
});

describe("ALERT-04 — an alert is scoped to its SYMBOL, not to a timeframe", () => {
	beforeEach(() => {
		stubLocalStorage();
	});

	// INVERTED, with evidence. This test used to assert the opposite — "is NOT evaluated
	// across the tick list the suite used, so 0 firings was arithmetically forced" — and
	// passed, because it documented the bug rather than the wanted behaviour. It was
	// correct about the mechanism and wrong about the verdict.
	//
	// The evidence for calling the PRODUCT wrong, not the test:
	//   - the create form has no timeframe control. `AlertsModal.tsx:15` takes it as a
	//     prop and `VNInvestCharts.tsx:2822` fills it from whatever chart was open;
	//   - `AlertsModal.tsx:505-546` lists every alert labelled "Active" — the UI asserts
	//     armed while the code guaranteed inert;
	//   - the model has no "suspended" state, only `isTriggered: boolean`
	//     (`types.ts:15-33`), so deliberate per-timeframe suspension had nothing to render;
	//   - `timeframe` ships as webhook METADATA beside symbol/message/timestamp
	//     (`AlertManager.ts:116`), not as a routing scope.
	// Symbol stays gated, which is the point of the third case below.
	it("fires on every tick the suite used, because its timeframe is provenance not a subscription", () => {
		const m = new AlertManager();
		m.addAlert(buildAlertDraft(form()));
		const fired: AlertCondition[] = [];
		m.onAlertTriggered((a) => fired.push(a));

		// Precondition: the condition the E2E typed IS satisfied on these bars, so a
		// zero-firing result can only be the scope gate, never the data.
		expect(AlertEvaluator.evaluate(curr, prev, m.getAlerts()[0])).toBe(true);
		expect(SUITE_TICKS).not.toContain(DEMO_INITIAL_TIMEFRAME);

		for (const tf of SUITE_TICKS) m.checkAlerts(DEMO_SYMBOL, tf, curr, prev, []);

		// `once` frequency: fires on the first qualifying tick, then the frequency gate
		// holds it there. What matters is not zero.
		expect(fired.length).toBeGreaterThan(0);
		expect(m.getAlerts()).toHaveLength(1);
		expect(m.getAlerts()[0].isTriggered).toBe(true);
	});

	it("survives the chart changing timeframe: the alert is not detached by a zoom", () => {
		const m = new AlertManager();
		m.addAlert(buildAlertDraft(form()));
		const fired: AlertCondition[] = [];
		m.onAlertTriggered((a) => fired.push(a));

		m.checkAlerts(DEMO_SYMBOL, DEMO_INITIAL_TIMEFRAME, curr, prev, []);
		m.checkAlerts(DEMO_SYMBOL, "15m", curr, prev, []);
		m.checkAlerts(DEMO_SYMBOL, "1m", curr, prev, []);

		expect(fired.length).toBeGreaterThan(0);
	});

	it("DOES fire the moment the chart is on the alert's own timeframe (positive control)", () => {
		const m = new AlertManager();
		m.addAlert(buildAlertDraft(form()));
		const fired: AlertCondition[] = [];
		m.onAlertTriggered((a) => fired.push(a));

		m.checkAlerts(DEMO_SYMBOL, DEMO_INITIAL_TIMEFRAME, curr, prev, []);

		expect(fired).toHaveLength(1);
		expect(fired[0].id).toBe("alert-scope");
		expect(m.getAlerts()[0].isTriggered).toBe(true);
		expect(m.getAlerts()[0].lastTriggeredBarTime).toBe(CUR_BAR_TIME);
	});

	it("is not evaluated on a different symbol at the right timeframe", () => {
		const m = new AlertManager();
		m.addAlert(buildAlertDraft(form()));
		const fired: AlertCondition[] = [];
		m.onAlertTriggered((a) => fired.push(a));

		m.checkAlerts("VN30F1M", DEMO_INITIAL_TIMEFRAME, curr, prev, []);

		expect(fired).toHaveLength(0);
		expect(m.getAlerts()).toHaveLength(1);
		expect(m.getAlerts()[0].isTriggered).toBe(false);
	});
});

describe("ALERT-04/05/07 — persisted -> loaded -> evaluated -> acked", () => {
	let store: Record<string, string>;
	beforeEach(() => {
		store = stubLocalStorage();
	});

	it("survives a reload: a NEW manager loaded from localStorage fires on its own timeframe", () => {
		// Session 1: the form creates the alert. This is what ALERT-03 grades.
		new AlertManager().addAlert(buildAlertDraft(form()));
		expect(JSON.parse(store[STORE])).toHaveLength(1);

		// Session 2: a fresh manager, i.e. `loadAlerts()` in the constructor.
		const reloaded = new AlertManager();
		expect(reloaded.getAlerts()).toHaveLength(1);
		expect(reloaded.getAlerts()[0].sourceB).toStrictEqual({ type: "value", value: 0 });

		const fired: AlertCondition[] = [];
		reloaded.onAlertTriggered((a) => fired.push(a));
		reloaded.checkAlerts(DEMO_SYMBOL, DEMO_INITIAL_TIMEFRAME, curr, prev, []);

		expect(fired).toHaveLength(1);
		// The ack is durable, not in-memory: it is what ALERT-05 re-reads.
		expect(JSON.parse(store[STORE])[0].isTriggered).toBe(true);
		expect(JSON.parse(store[STORE])[0].lastTriggeredBarTime).toBe(CUR_BAR_TIME);
	});

	it("fires EXACTLY once across repeated ticks, and the ack blocks every refire", () => {
		const m = new AlertManager();
		m.addAlert(buildAlertDraft(form()));
		const fired: AlertCondition[] = [];
		m.onAlertTriggered((a) => fired.push(a));

		for (let i = 0; i < 5; i++) m.checkAlerts(DEMO_SYMBOL, DEMO_INITIAL_TIMEFRAME, curr, prev, []);

		expect(fired).toHaveLength(1);
		expect(m.getAlerts()[0].isTriggered).toBe(true);
	});

	it("resets the ack via toggleAlert, which re-arms the alert", () => {
		const m = new AlertManager();
		m.addAlert(buildAlertDraft(form()));
		m.checkAlerts(DEMO_SYMBOL, DEMO_INITIAL_TIMEFRAME, curr, prev, []);
		expect(m.getAlerts()[0].isTriggered).toBe(true);

		m.toggleAlert("alert-scope");
		expect(m.getAlerts()[0].isTriggered).toBe(false);
		expect(m.getAlerts()[0].lastTriggeredBarTime).toBeUndefined();

		const fired: AlertCondition[] = [];
		m.onAlertTriggered((a) => fired.push(a));
		m.checkAlerts(DEMO_SYMBOL, DEMO_INITIAL_TIMEFRAME, curr, prev, []);
		expect(fired).toHaveLength(1);
	});
});

describe("NaN/null never read as 0 at the evaluator (the repo's third-strike rule)", () => {
	beforeEach(() => {
		stubLocalStorage();
	});

	const base = (sourceB: AlertCondition["sourceB"]): AlertCondition => ({
		id: "a",
		symbol: DEMO_SYMBOL,
		timeframe: DEMO_INITIAL_TIMEFRAME,
		sourceA: { type: "price", key: "close" },
		condition: "greater_than",
		sourceB,
		frequency: "once",
		actions: { popup: true, sound: true, email: false },
		message: "m",
		createdAt: 0,
		isTriggered: false,
	});

	// close > 0 holds on every bar below. A fabricated 0 threshold would make each
	// of these fire; the correct answer for a missing/NaN threshold is "never
	// fires", which is the fail-closed half of the rule.
	it("a genuinely stored 0 DOES fire, so the rule is not a blanket refusal", () => {
		expect(AlertEvaluator.evaluate(curr, prev, base({ type: "value", value: 0 }))).toBe(true);
	});

	for (const [label, sourceB] of [
		["absent", { type: "value" } as AlertCondition["sourceB"]],
		["null", { type: "value", value: null } as unknown as AlertCondition["sourceB"]],
		["undefined", { type: "value", value: undefined } as AlertCondition["sourceB"]],
		["NaN", { type: "value", value: NaN } as AlertCondition["sourceB"]],
		["stringly-typed", { type: "value", value: "0" } as unknown as AlertCondition["sourceB"]],
	] as const) {
		it(`an ${label} threshold never fires, even though close > 0`, () => {
			expect(AlertEvaluator.evaluate(curr, prev, base(sourceB))).toBe(false);
			expect(AlertEvaluator.evaluate({ close: 1e9 }, { close: 1 }, base(sourceB))).toBe(false);
		});
	}

	it("an unusable form input stores no threshold key at all", () => {
		expect(buildAlertSourceB({ sourceBType: "value", sourceBValue: "", sourceBKey: "close", sourceBIndicatorId: "" })).toStrictEqual({ type: "value" });
	});

	it("a threshold the manager never wrote leaves the alert permanently inert on its OWN timeframe", () => {
		// The load-bearing counterpart to the scope fix: reaching the alert's
		// timeframe is necessary but not sufficient. With no threshold there is
		// nothing to compare against, so this still yields zero firings — which is
		// why the fix cannot be a fabricated zero.
		const m = new AlertManager();
		m.addAlert(buildAlertDraft(form({ sourceBValue: "" })));

		expect(m.getAlerts()).toHaveLength(1);
		expect(m.getAlerts()[0].sourceB).toStrictEqual({ type: "value" });

		const fired: AlertCondition[] = [];
		m.onAlertTriggered((a) => fired.push(a));
		m.checkAlerts(DEMO_SYMBOL, DEMO_INITIAL_TIMEFRAME, curr, prev, []);

		expect(fired).toHaveLength(0);
		expect(m.getAlerts()[0].isTriggered).toBe(false);
	});
});
