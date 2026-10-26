// @vitest-environment jsdom
/**
 * S1 regression lock — Bug A, "the modal persists a price key that is not a price key".
 *
 * WHY THIS TEST MOUNTS THE MODAL INSTEAD OF CALLING THE BUILDER
 * ==============================================================
 * `AlertsModal.buildAlert.test.ts` drives `buildAlertDraft` with a hand-written
 * `AlertDraftInput`, so it can only ever prove the BUILDER is right. The value that
 * broke the feature was never in the builder's input: it was produced by a React
 * effect that ran on mount and overwrote `sourceAKey` with an indicator's output key
 * while `sourceAType` was still "price". RSI's first output is "line", so the modal
 * persisted `{type:"price", key:"line"}`; `AlertEvaluator.getValue` reads
 * `datum["line"]` -> undefined -> null, and the alert could never fire.
 *
 * Worse, the failure was invisible: a `<select>` whose value matches no `<option>`
 * renders its first option, so the form read "Close" while the stored alert evaluated
 * `line`. A unit test of the builder passes with that bug present, which is how the
 * feature was twice declared done on a green suite.
 *
 * So the lock below mounts the real component, with a real indicator in the pane
 * layout, and asserts the invariant end to end:
 *
 *   whatever the form PERSISTS must be a key the form was RENDERING as selected.
 *
 * Restoring the old unguarded effect turns this red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { VNInvestChartsStateProvider } from "../../../context/VNInvestChartsStateContext";
import { AlertsModal, PRICE_SOURCE_KEYS, isPriceSourceKey } from "../AlertsModal";
import type { PaneDescriptor } from "../../../../lib/core/types/pane-descriptor";

/** A pane carrying one indicator, which is all the old effect needed to misfire. */
const PANES_WITH_INDICATOR: PaneDescriptor[] = [
	{
		id: "price",
		visible: true,
		series: [{ id: "price-main", type: "Candlestick", yAxis: "right" }],
	} as unknown as PaneDescriptor,
	{
		id: "momentum",
		visible: false,
		series: [{ id: "rsi-1", type: "RSI", yAxis: "left", params: { period: 14 } }],
	} as unknown as PaneDescriptor,
];

function makeManager() {
	const added: any[] = [];
	return {
		added,
		getAlerts: () => added,
		addAlert: (a: any) => {
			added.push(a);
		},
		removeAlert: () => {},
		toggleAlert: () => {},
		onAlertTriggered: () => {},
	};
}

describe("S1: AlertsModal persists a price key the form was actually showing", () => {
	let container: HTMLDivElement;
	let portalHost: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;

	function render(manager: ReturnType<typeof makeManager>) {
		act(() => {
			root.render(
				<VNInvestChartsStateProvider initialPanes={PANES_WITH_INDICATOR}>
					<AlertsModal
						open
						onClose={() => {}}
						symbol="BTCUSDT"
						timeframe="1h"
						alertManager={manager}
						portalAdapter={{ getContainer: () => portalHost } as any}
					/>
				</VNInvestChartsStateProvider>,
			);
		});
	}

	/** The keys the price branch actually offers, read off the rendered DOM. */
	function renderedPriceKeys(): string[] {
		const selects = Array.from(portalHost.querySelectorAll("select"));
		const keySelect = selects.find((s) =>
			Array.from(s.options).some((o) => o.value === "close"),
		);
		if (!keySelect) throw new Error("price key select not rendered");
		return Array.from(keySelect.options).map((o) => o.value);
	}

	/** What the DOM reports as selected for the source-A price key. */
	function renderedSourceAKey(): string {
		const selects = Array.from(portalHost.querySelectorAll("select"));
		const keySelect = selects.find((s) =>
			Array.from(s.options).some((o) => o.value === "close"),
		);
		return (keySelect as HTMLSelectElement).value;
	}

	function createAlert() {
		const btn = portalHost.querySelector('[data-testid="alert-create"]') as HTMLButtonElement;
		act(() => {
			btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
	}

	beforeEach(() => {
		document.body.innerHTML = "";
		container = document.createElement("div");
		portalHost = document.createElement("div");
		document.body.appendChild(container);
		document.body.appendChild(portalHost);
		root = createRoot(container);
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(async () => {
		await act(async () => {
			root.unmount();
		});
		document.body.innerHTML = "";
		vi.restoreAllMocks();
	});

	it("the indicator on the pane does NOT leak into the persisted price key", () => {
		const manager = makeManager();
		render(manager);

		// The old effect wrote "line" here while the type stayed "price".
		expect(renderedSourceAKey()).toBe("close");
		expect(renderedSourceAKey()).not.toBe("line");

		createAlert();

		expect(manager.added).toHaveLength(1);
		const persisted = manager.added[0];
		expect(persisted.sourceA).toEqual({ type: "price", key: "close" });
		expect(isPriceSourceKey(persisted.sourceA.key)).toBe(true);
	});

	it("the invariant itself: persisted price key is one the form was rendering", () => {
		const manager = makeManager();
		render(manager);
		const offered = renderedPriceKeys();

		createAlert();

		const key = manager.added[0].sourceA.key;
		expect(offered).toContain(key);
	});

	it("SSOT and predicate agree — no key is offered that the evaluator cannot read", () => {
		for (const k of PRICE_SOURCE_KEYS) {
			expect(isPriceSourceKey(k)).toBe(true);
		}
		for (const k of ["line", "macd", "top", "", "CLOSE", "Close"]) {
			expect(isPriceSourceKey(k)).toBe(false);
		}
	});

	it("a price key outside the SSOT is refused at the persist boundary, not stored dead", () => {
		const manager = makeManager();
		render(manager);
		const err = vi.spyOn(console, "error").mockImplementation(() => {});

		// Simulate the state the old effect produced, then try to create.
		const selects = Array.from(portalHost.querySelectorAll("select"));
		const keySelect = selects.find((s) =>
			Array.from(s.options).some((o) => o.value === "close"),
		) as HTMLSelectElement;
		// The DOM cannot hold "line" (no matching option), which is exactly why the
		// failure was invisible. Drive React state instead of the DOM.
		const setter = Object.getOwnPropertyDescriptor(
			window.HTMLSelectElement.prototype,
			"value",
		)!.set!;
		act(() => {
			setter.call(keySelect, "line");
			keySelect.dispatchEvent(new Event("change", { bubbles: true }));
		});

		createAlert();
		// Either the state never took (the select has no such option, so React resets it
		// to the controlled value) and a valid alert is stored, or it took and the guard
		// refused. Both are correct; storing a dead "line" alert is not.
		if (manager.added.length > 0) {
			expect(isPriceSourceKey(manager.added[0].sourceA.key)).toBe(true);
		} else {
			expect(err).toHaveBeenCalled();
		}
	});
});
