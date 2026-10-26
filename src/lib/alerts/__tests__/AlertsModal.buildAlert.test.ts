import { describe, it, expect, vi, beforeEach } from "vitest";
import { AlertManager } from "../AlertManager";
import { AlertEvaluator } from "../AlertEvaluator";
import { buildAlertDraft, buildAlertSourceB } from "../../../widget/components/settings/AlertsModal";
import type { AlertDraftInput } from "../../../widget/components/settings/AlertsModal";

/**
 * GR1 — WHY scripts/verify-alerts.cjs step ALERT-03 was reading `undefined`.
 *
 * The suite read `persistedAlert.sourceBValue`. That key cannot exist: it is not
 * a member of `AlertCondition` (types.ts:15-33) and nothing in the repo writes
 * it. The threshold is `sourceB.value`. This file proves it end-to-end with a
 * REAL AlertManager over a stubbed localStorage — the same store the E2E reads
 * — rather than by quoting the interface.
 */

const STORE = "vninvestcharts-widget_alerts";

/** The exact fields the E2E form produces: condition=greater_than, value=0, once. */
const e2eForm = (over: Partial<AlertDraftInput> = {}): AlertDraftInput => ({
	id: "alert-1",
	createdAt: 1_700_000_000_000,
	symbol: "VN30F1M",
	timeframe: "1m",
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

describe("GR1 — the persisted threshold key", () => {
	let localStorageMock: Record<string, string> = {};

	beforeEach(() => {
		localStorageMock = {};
		vi.stubGlobal("localStorage", {
			getItem: (k: string) => localStorageMock[k] ?? null,
			setItem: (k: string, v: string) => {
				localStorageMock[k] = v;
			},
			removeItem: (k: string) => {
				delete localStorageMock[k];
			},
			clear: () => {
				localStorageMock = {};
			},
		});
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
	});

	const persisted = () => JSON.parse(localStorageMock[STORE] ?? "[]");

	it("a typed 0 survives the whole create -> persist chain at sourceB.value", () => {
		const manager = new AlertManager();
		manager.addAlert(buildAlertDraft(e2eForm()));

		const rows = persisted();
		expect(rows).toHaveLength(1);
		// This is the assertion the E2E step makes, against the real key.
		expect(rows[0].sourceB.value).toBe(0);
		expect(rows[0].sourceB.type).toBe("value");
		// And the key the suite used is absent from the raw JSON text, not merely
		// falsy — so this is a wrong-key bug, not an ordering/race bug.
		expect(localStorageMock[STORE]).toContain('"value":0');
		expect(localStorageMock[STORE]).not.toContain("sourceBValue");
	});

	it("the key the suite read can never be produced by the builder", () => {
		const built = buildAlertDraft(e2eForm()) as unknown as Record<string, unknown>;
		expect(built.sourceBValue).toBeUndefined();
		expect(Object.keys(built)).toContain("sourceB");
		expect(Object.keys(built)).not.toContain("sourceBValue");
	});

	it("the other three fields ALERT-03 checks were already at the top level", () => {
		const rows = (() => {
			const m = new AlertManager();
			m.addAlert(buildAlertDraft(e2eForm()));
			return persisted();
		})();
		expect(rows[0].condition).toBe("greater_than");
		expect(rows[0].frequency).toBe("once");
		expect(rows[0].message).toBe("d3e2e once-only probe");
		// Only the threshold was nested — which is exactly why one key was wrong
		// and the rest of the predicate read fine.
		expect(rows[0].condition === "greater_than" && rows[0].frequency === "once").toBe(true);
	});

	it("a persisted threshold is actually usable by the evaluator (not just present)", () => {
		const m = new AlertManager();
		m.addAlert(buildAlertDraft(e2eForm()));
		const stored = m.getAlerts()[0];
		expect(AlertEvaluator.evaluate({ close: 10 }, { close: 9 }, stored)).toBe(true);
		expect(AlertEvaluator.evaluate({ close: -1 }, { close: -2 }, stored)).toBe(false);
	});
});

describe("GR1 — a missing threshold is never fabricated into 0", () => {
	// The old line was `parseFloat(sourceBValue) || 0`. NaN is falsy, so every
	// unusable input below silently became a REAL threshold of 0 — an alert the
	// user never asked for, firing on any price above zero.
	const unusable = ["", "   ", "abc", "1e999", "-", "1,5", "0x10", "NaN", "Infinity"];

	for (const raw of unusable) {
		it(`sourceBValue=${JSON.stringify(raw)} stores no threshold`, () => {
			const src = buildAlertSourceB({ sourceBType: "value", sourceBValue: raw, sourceBKey: "close", sourceBIndicatorId: "" });
			expect(src.type).toBe("value");
			expect(src.value).toBeUndefined();
			// Explicitly NOT 0 — a fabricated zero is the bug this guards.
			expect(src.value).not.toBe(0);
			// And the key is absent from the object and from the persisted JSON text,
			// not stored as null or 0. (Note: the JSON DOES still contain the string
			// "value" as the *type* name, so the assertion targets the key form
			// '"value":' which only a stored value key would produce.)
			expect(Object.keys(src)).not.toContain("value");
			expect(JSON.stringify(src)).not.toContain('"value":');
		});
	}

	it("a garbage threshold makes the alert permanently inert rather than firing at 0", () => {
		const draft = buildAlertDraft(e2eForm({ sourceBValue: "abc" }));
		expect(draft.sourceB.value).toBeUndefined();
		// AlertEvaluator.getValue returns null for a non-number value, and
		// evaluate() bails on null — so this alert can NEVER fire.
		expect(AlertEvaluator.evaluate({ close: 999 }, { close: 1 }, draft)).toBe(false);
		expect(AlertEvaluator.evaluate({ close: 1e9 }, { close: -1e9 }, draft)).toBe(false);
	});

	it("a legitimate 0 is still stored as 0 — not confused with a missing one", () => {
		expect(buildAlertSourceB({ sourceBType: "value", sourceBValue: "0", sourceBKey: "close", sourceBIndicatorId: "" }).value).toBe(0);
		expect(buildAlertSourceB({ sourceBType: "value", sourceBValue: " 0 ", sourceBKey: "close", sourceBIndicatorId: "" }).value).toBe(0);
		expect(buildAlertSourceB({ sourceBType: "value", sourceBValue: "-0", sourceBKey: "close", sourceBIndicatorId: "" }).value).toBe(-0);
	});

	it("real numbers round-trip exactly, including the ones parseFloat mishandles", () => {
		const cases: [string, number][] = [
			["100", 100],
			["0.5", 0.5],
			["-1.25", -1.25],
			["1e-3", 0.001],
			["1e21", 1e21],
			["0.1", 0.1],
		];
		for (const [raw, want] of cases) {
			expect(buildAlertSourceB({ sourceBType: "value", sourceBValue: raw, sourceBKey: "close", sourceBIndicatorId: "" }).value, raw).toBe(want);
		}
	});
});

describe("GR1 — the non-value sourceB branches are untouched", () => {
	it("price branch", () => {
		expect(buildAlertSourceB({ sourceBType: "price", sourceBValue: "999", sourceBKey: "high", sourceBIndicatorId: "" })).toEqual({ type: "price", key: "high" });
	});

	it("indicator branch", () => {
		expect(buildAlertSourceB({ sourceBType: "indicator", sourceBValue: "999", sourceBKey: "macd", sourceBIndicatorId: "RSI_1" })).toEqual({ type: "indicator", indicatorId: "RSI_1", key: "macd" });
	});

	it("a price/indicator sourceB never carries a stray value field", () => {
		for (const t of ["price", "indicator"] as const) {
			const src = buildAlertSourceB({ sourceBType: t, sourceBValue: "42", sourceBKey: "close", sourceBIndicatorId: "x" });
			expect(Object.keys(src)).not.toContain("value");
		}
	});

	it("the default message still mentions the typed threshold", () => {
		const draft = buildAlertDraft(e2eForm({ message: "", sourceBValue: "0" }));
		expect(draft.message).toBe("VN30F1M (1m): Price greater_than 0");
	});

	it("an explicit message wins over the generated one", () => {
		expect(buildAlertDraft(e2eForm({ message: "mine" })).message).toBe("mine");
	});

	it("webhook is omitted, not stored as an empty string", () => {
		expect(JSON.stringify(buildAlertDraft(e2eForm()))).not.toContain("webhook");
		expect(buildAlertDraft(e2eForm({ webhookUrl: "https://x.test/h" })).actions.webhook).toBe("https://x.test/h");
	});
});