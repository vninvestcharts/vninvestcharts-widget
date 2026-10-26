/**
 * S3 regression lock — C1/C2/C3. The indicator branch of price alerts.
 *
 * WHAT WAS BROKEN, MEASURED
 * =========================
 * `VNInvestCharts.tsx` built the list of series an alert may reference from
 * `settings.visiblePanes` and then excluded chart types with an eight-entry blacklist.
 * The demo's six indicators live in `momentum`, `orderflow` and `strength`, all three
 * `visible: false`, so the list came back EMPTY on every tick (the resolver logged
 * `seriesCount: 0`). Consequence: an alert created through the modal persisted an
 * instance id that nothing could turn into a canonical key, `getValue` returned null,
 * and 100% of indicator-sourced alerts were inert. No E2E had ever touched that branch,
 * and `AlertManager`'s own tests pass either way — they call `checkAlerts` with
 * `activeSeries: []` against a PRICE alert, so the mismatch was structurally invisible.
 *
 * WHY THESE TESTS EXIST RATHER THAN ANOTHER BUILDER TEST
 * ======================================================
 * The bug lived in the wiring — the predicate that decides which series exist — not in
 * any pure function. So the predicate itself is exported (`selectAlertableSeries`) and
 * tested against a layout shaped like the real one, and the wiring is locked end to end
 * by the E2E step `verify-alerts.cjs` now runs.
 *
 * Restoring the old blacklist + `visiblePanes` turns the first case red.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertManager, selectAlertableSeries } from "../AlertManager";
import type { PaneDescriptor, SeriesConfig } from "../../core/types/pane-descriptor";

function s(id: string, type: string, params?: Record<string, unknown>): SeriesConfig {
	return { id, type, yAxis: "right", params } as unknown as SeriesConfig;
}

/** The demo's real shape, including the three panes that are collapsed. */
const DEMO_PANES = [
	{ id: "price", visible: true, series: [s("price-main", "Candlestick")] },
	{ id: "volume", visible: true, series: [s("vol-main", "Volume")] },
	{
		id: "momentum",
		visible: false,
		series: [s("rsi-1", "RSI", { period: 14 }), s("macd-1", "MACD", { fast: 12, slow: 26, signal: 9 })],
	},
	{
		id: "orderflow",
		visible: false,
		series: [s("whale-1", "Whale", { threshold: 50000 }), s("cvd-1", "CVDApprox")],
	},
	{ id: "strength", visible: false, series: [s("se-1", "StrengthElder")] },
] as unknown as PaneDescriptor[];

function indicatorAlert(over: Partial<any> = {}, sourceAOver: Record<string, unknown> = {}): any {
	return {
		id: "ind-1",
		symbol: "BTCUSDT",
		timeframe: "1h",
		sourceA: { type: "indicator", indicatorId: "rsi-1", key: "line", ...sourceAOver },
		condition: "greater_than",
		sourceB: { type: "value", value: -1 },
		frequency: "once",
		actions: { popup: true, sound: true, email: false },
		message: "rsi above -1",
		createdAt: 1,
		isTriggered: false,
		...over,
	};
}

describe("S3 / C1: selectAlertableSeries", () => {
	it("keeps indicators from COLLAPSED panes — this is the fix", () => {
		const got = selectAlertableSeries(DEMO_PANES).map((x) => x.id);
		// Every indicator, including the five in hidden panes.
		expect(got).toEqual(["rsi-1", "macd-1", "whale-1", "cvd-1", "se-1"]);
	});

	it("drops series with no canonical key (the chart types), without a type blacklist", () => {
		const got = selectAlertableSeries(DEMO_PANES).map((x) => x.id);
		expect(got).not.toContain("price-main");
		expect(got).not.toContain("vol-main");
	});

	it("is not empty on a layout whose only indicators are hidden", () => {
		// The exact regression: visiblePanes of this layout holds only the two chart
		// series, and the old type blacklist removed those too, yielding [].
		const hiddenOnly = [DEMO_PANES[2]];
		expect(selectAlertableSeries(hiddenOnly)).toHaveLength(2);
	});

	it("returns [] for a layout with no indicators at all", () => {
		expect(selectAlertableSeries([DEMO_PANES[0], DEMO_PANES[1]])).toEqual([]);
	});
});

describe("S3 / C1: an indicator alert resolves and fires", () => {
	let saved: string[];
	beforeEach(() => {
		saved = [];
		vi.stubGlobal("localStorage", {
			getItem: () => null,
			setItem: (_k: string, v: string) => saved.push(v),
			removeItem: () => {},
			clear: () => {},
		} as any);
	});

	it("resolves the instance id to a canonical key and fires on real indicator data", () => {
		const m = new AlertManager();
		m.addAlert(indicatorAlert());
		const fired: any[] = [];
		m.onAlertTriggered((a) => fired.push(a));

		// Only reachable if the resolver rewrote the id to `RSI:period=14`, because that
		// is the key indicatorValues uses. An unrewritten uuid yields null and no fire.
		m.checkAlerts("BTCUSDT", "1h", { close: 100, indicatorValues: { "RSI:period=14": 55 } }, { close: 99, indicatorValues: { "RSI:period=14": 54 } }, selectAlertableSeries(DEMO_PANES));

		expect(fired).toHaveLength(1);
		expect(m.getAlerts()[0].isTriggered).toBe(true);
	});

	it("resolution is per-tick and NON-destructive: the stored alert keeps the instance id", () => {
		// The clone is resolved each tick, the stored record is not rewritten. That is
		// deliberate ("Clone alert to avoid modifying original stored states"), and it is
		// also what makes C2 meaningful: if the pane layout changes, the stored uuid stops
		// resolving and the mismatch is reported instead of being papered over by a
		// one-time migration to a key that may not exist.
		const m = new AlertManager();
		m.addAlert(indicatorAlert({ frequency: "continuous" }));
		m.checkAlerts("BTCUSDT", "1h", { close: 100, indicatorValues: { "RSI:period=14": 55 } }, { close: 99, indicatorValues: { "RSI:period=14": 54 } }, selectAlertableSeries(DEMO_PANES));
		expect(m.getAlerts()[0].sourceA.indicatorId).toBe("rsi-1");
	});

	it("the canonical key is what reaches the evaluator", () => {
		// Same tick, but keyed on the CANONICAL name. Fires only if the resolver rewrote
		// the uuid to `RSI:period=14`; an unrewritten id would read null and not fire.
		const m = new AlertManager();
		m.addAlert(indicatorAlert({ frequency: "continuous" }));
		const fired: any[] = [];
		m.onAlertTriggered((a) => fired.push(a));
		m.checkAlerts("BTCUSDT", "1h", { close: 100, indicatorValues: { "RSI:period=14": 55 } }, { close: 99, indicatorValues: { "RSI:period=14": 54 } }, selectAlertableSeries(DEMO_PANES));
		expect(fired).toHaveLength(1);
	});
});

describe("S3 / C2 + C3: unresolvable sources are reported, not swallowed", () => {
	beforeEach(() => {
		vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} } as any);
	});

	it("C2: an id absent from the given series logs an error and does not fire", () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		const m = new AlertManager();
		m.addAlert(indicatorAlert({}, { indicatorId: "series-that-no-longer-exists" }));
		const fired: any[] = [];
		m.onAlertTriggered((a) => fired.push(a));

		m.checkAlerts("BTCUSDT", "1h", { close: 100, indicatorValues: { "RSI:period=14": 55 } }, { close: 99 }, selectAlertableSeries(DEMO_PANES));

		expect(fired).toHaveLength(0);
		expect(err).toHaveBeenCalled();
		expect(String(err.mock.calls[0][0])).toContain("series-that-no-longer-exists");
	});

	it("C2: the stored alert is left intact, not corrupted by a failed resolve", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const m = new AlertManager();
		m.addAlert(indicatorAlert({}, { indicatorId: "ghost" }));
		m.checkAlerts("BTCUSDT", "1h", { close: 100 }, { close: 99 }, []);
		expect(m.getAlerts()[0].sourceA.indicatorId).toBe("ghost");
	});

	it("C3: a series with no canonical key reports instead of assigning undefined", () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		const m = new AlertManager();
		// A Candlestick has no canonical key, but force it in the given series anyway,
		// which is the case that used to assign `undefined` to indicatorId.
		m.addAlert(indicatorAlert({}, { indicatorId: "price-main" }));
		const fired: any[] = [];
		m.onAlertTriggered((a) => fired.push(a));

		m.checkAlerts("BTCUSDT", "1h", { close: 100, indicatorValues: { close: 100 } }, { close: 99 }, [
			{ id: "price-main", type: "Candlestick", yAxis: "right" } as unknown as SeriesConfig,
		]);

		expect(fired).toHaveLength(0);
		expect(err).toHaveBeenCalled();
		expect(String(err.mock.calls[0][0])).toContain("no canonical");
		expect(m.getAlerts()[0].sourceA.indicatorId).toBe("price-main");
	});

	it("C3: indicatorId is never assigned undefined", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const m = new AlertManager();
		m.addAlert(indicatorAlert({}, { indicatorId: "price-main" }));
		m.checkAlerts("BTCUSDT", "1h", { close: 1 }, { close: 0 }, [
			{ id: "price-main", type: "Candlestick", yAxis: "right" } as unknown as SeriesConfig,
		]);
		expect(m.getAlerts()[0].sourceA.indicatorId).not.toBeUndefined();
	});
});

/**
 * The third failure mode: the id resolves, the value IS an object, and the requested
 * member is not a number on it. Neither C2 nor C3 can see this, and `getValue` just
 * returns undefined, so the alert was dead forever with nothing logged.
 */
describe("S3: an unreadable SUB-KEY is reported, not silently dead", () => {
	// Collected into an array rather than asserted on a spy reference. A `vi.spyOn` in the
	// describe body is installed at COLLECTION time, and the blocks above install their own
	// spies per test — so by the time these tests run, `console.error` points at whichever
	// spy that block installed last, and a reference captured here records nothing. Writing
	// into a per-test array sidesteps the ordering entirely.
	let logged: unknown[][] = [];
	const unreadableReports = () => logged.filter((c) => /no sub-key|not a number/.test(String(c[0])));

	const tick = (m: AlertManager, values: Record<string, unknown>, series = selectAlertableSeries(DEMO_PANES)) =>
		m.checkAlerts("BTCUSDT", "1h", { close: 100, indicatorValues: values }, { close: 99, indicatorValues: values }, series);

	beforeEach(() => {
		logged = [];
		vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} } as any);
		vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
			logged.push(args);
		});
	});

	it("reports a member that does not exist on the object", () => {
		const m = new AlertManager();
		// The old map's StrengthElder bug, verbatim.
		m.addAlert(indicatorAlert({}, { indicatorId: "se-1", key: "bull" }));
		tick(m, { StrengthElder: { bullPower: 1, bearPower: -1 } });
		expect(logged.length).toBeGreaterThan(0);
		const msg = String(logged[0][0]);
		expect(msg).toContain("not a number");
		expect(msg).toContain("bullPower, bearPower");
	});

	it("reports a BLANK sub-key on an object — the old `|| [\"\"]` fallback's outcome", () => {
		const m = new AlertManager();
		m.addAlert(indicatorAlert({ frequency: "continuous" }, { indicatorId: "se-1", key: "" }));
		tick(m, { StrengthElder: { bullPower: 1, bearPower: -1 } });
		expect(logged.length).toBeGreaterThan(0);
		expect(String(logged[0][0])).toContain("no sub-key");
	});

	it("reports an ARRAY member, which compares as NaN and so can never satisfy a condition", () => {
		const m = new AlertManager();
		m.addAlert(indicatorAlert({ frequency: "continuous" }, { indicatorId: "se-1", key: "levels" }));
		tick(m, { StrengthElder: { bullPower: 1, bearPower: -1, levels: [1, 2, 3] } });
		expect(logged.length).toBeGreaterThan(0);
		expect(String(logged[0][0])).toContain("not a number");
	});

	it("does NOT report a readable numeric member", () => {
		const m = new AlertManager();
		m.addAlert(indicatorAlert({}, { indicatorId: "se-1", key: "bullPower" }));
		tick(m, { StrengthElder: { bullPower: 1, bearPower: -1 } });
		expect(logged).toHaveLength(0);
	});

	it("does NOT report a scalar with a blank sub-key — getValue ignores it, so nothing is broken", () => {
		const m = new AlertManager();
		m.addAlert(indicatorAlert({ frequency: "continuous" }, { indicatorId: "rsi-1", key: "" }));
		tick(m, { "RSI:period=14": 55 });
		expect(logged).toHaveLength(0);
	});

	it("does NOT report when the indicator key is absent entirely — that is the id-resolution path", () => {
		const m = new AlertManager();
		m.addAlert(indicatorAlert({ frequency: "continuous" }, { indicatorId: "ghost" }));
		tick(m, { "RSI:period=14": 55 });
		// One report, from C2's branch only — not a second one from here.
		expect(unreadableReports()).toHaveLength(0);
		expect(logged.filter((c: unknown[]) => /is not among/.test(String(c[0])))).toHaveLength(1);
	});

	it("reports ONCE per alert, not once per bar", () => {
		const m = new AlertManager();
		m.addAlert(indicatorAlert({ frequency: "continuous" }, { indicatorId: "se-1", key: "bull" }));
		for (let i = 0; i < 25; i++) {
			tick(m, { StrengthElder: { bullPower: i, bearPower: -i } });
		}
		expect(unreadableReports()).toHaveLength(1);
	});

	it("still fails closed: an unreadable alert never fires", () => {
		const m = new AlertManager();
		m.addAlert(indicatorAlert({}, { indicatorId: "se-1", key: "bull" }));
		const fired: any[] = [];
		m.onAlertTriggered((a) => fired.push(a));
		tick(m, { StrengthElder: { bullPower: 1, bearPower: -1 } });
		expect(fired).toHaveLength(0);
		expect(m.getAlerts()[0].isTriggered).toBe(false);
	});
});
