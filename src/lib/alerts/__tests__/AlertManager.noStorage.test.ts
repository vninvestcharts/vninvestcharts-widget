/**
 * Lock the no-storage path in AlertManager.
 *
 * The constructor calls loadAlerts, and both loadAlerts and saveAlerts used to read
 * `localStorage` unguarded. On the server that identifier does not resolve at all, so
 * it threw ReferenceError, and the surrounding catch swallowed it *after* logging -
 * meaning every server render printed "Failed to load alerts", once per chart.
 *
 * The loadAlerts half is already locked by
 * `src/widget/__tests__/ssrRender.contract.test.tsx`. This file covers the other
 * half. The audit found that deleting the saveAlerts guard alone left alerts 97/97
 * green and the SSR contract 6/6 green - a lock that is not a lock.
 *
 * ## Why the environment is forced rather than stubbed
 *
 * A `vi.stubGlobal("localStorage", ...)` would defeat the whole test: the guard reads
 * `typeof localStorage`, so a stub makes the identifier resolve and the no-storage
 * branch is never taken. Deleting the global is what puts the code on the server path.
 * `@vitest-environment node` supplies that (no window, no localStorage), and it is
 * declared here so the intent travels with the file instead of depending on how the
 * caller is configured.
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";
import { AlertManager } from "../AlertManager";

describe("AlertManager without browser storage", () => {
	it("starts empty and logs nothing", () => {
		const errors: unknown[][] = [];
		const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
			errors.push(args);
		});
		try {
			const manager = new AlertManager();
			expect(manager.getAlerts()).toEqual([]);
		} finally {
			spy.mockRestore();
		}
		expect(errors).toEqual([]);
	});

	it("persisting after a state change logs nothing either", () => {
		// The half that was unlocked. addAlert mutates state, which routes through
		// saveAlerts, so this is the call path that reached `localStorage` unguarded
		// even when the constructor read was already fixed.
		const errors: unknown[][] = [];
		const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
			errors.push(args);
		});
		try {
			const manager = new AlertManager();
			manager.addAlert({
				id: "a1",
				enabled: true,
				symbolId: "VIC",
				condition: "close>100",
				frequency: "continuous",
				lastConditionMet: false,
			} as never);
			manager.removeAlert("a1");
			expect(manager.getAlerts()).toEqual([]);
		} finally {
			spy.mockRestore();
		}
		expect(errors).toEqual([]);
	});

	it("keeps working with no storage at all", () => {
		// Not just quiet - functional. A guard that returned early everywhere would also
		// satisfy the two assertions above, and would have quietly broken the manager.
		const manager = new AlertManager();
		manager.addAlert({
			id: "a1",
			enabled: true,
			symbolId: "VIC",
			condition: "close>100",
			frequency: "continuous",
			lastConditionMet: false,
		} as never);
		expect(manager.getAlerts()).toHaveLength(1);
	});
});