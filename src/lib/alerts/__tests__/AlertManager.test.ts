import { describe, it, expect, vi, beforeEach } from "vitest";
import { AlertManager } from "../AlertManager";
import type { AlertCondition } from "../types";

describe("AlertManager", () => {
	let localStorageMock: Record<string, string> = {};

	beforeEach(() => {
		localStorageMock = {};
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => localStorageMock[key] || null,
			setItem: (key: string, value: string) => {
				localStorageMock[key] = value;
			},
			removeItem: (key: string) => {
				delete localStorageMock[key];
			},
			clear: () => {
				localStorageMock = {};
			},
		});

		// Mock global fetch for webhooks
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
	});

	it("should initialize with empty alerts list if nothing in localStorage", () => {
		const manager = new AlertManager(() => true);
		expect(manager.getAlerts()).toEqual([]);
	});

	it("should load alerts from localStorage on startup", () => {
		const mockAlert: AlertCondition = {
			id: "alert-1",
			symbol: "VN30F1M",
			timeframe: "1h",
			sourceA: { type: "price", key: "close" },
			condition: "crossing_up",
			sourceB: { type: "value", value: 100 },
			frequency: "once",
			actions: { popup: true, sound: true, email: false },
			message: "Price crossed up 100",
			createdAt: Date.now(),
			isTriggered: false,
		};
		localStorageMock["vninvestcharts-widget_alerts"] = JSON.stringify([mockAlert]);

		const manager = new AlertManager(() => true);
		expect(manager.getAlerts()).toHaveLength(1);
		expect(manager.getAlerts()[0].id).toBe("alert-1");
	});

	it("should add alerts and persist them to localStorage", () => {
		const manager = new AlertManager(() => true);
		const mockAlert: AlertCondition = {
			id: "alert-2",
			symbol: "VN30F1M",
			timeframe: "1h",
			sourceA: { type: "price", key: "close" },
			condition: "crossing_up",
			sourceB: { type: "value", value: 100 },
			frequency: "once",
			actions: { popup: true, sound: true, email: false },
			message: "Price crossed up 100",
			createdAt: Date.now(),
			isTriggered: false,
		};

		manager.addAlert(mockAlert);
		expect(manager.getAlerts()).toHaveLength(1);

		const saved = JSON.parse(localStorageMock["vninvestcharts-widget_alerts"]);
		expect(saved).toHaveLength(1);
		expect(saved[0].id).toBe("alert-2");
	});

	it("should remove alerts and update localStorage", () => {
		const manager = new AlertManager(() => true);
		const mockAlert1 = { id: "alert-1" } as AlertCondition;
		const mockAlert2 = { id: "alert-2" } as AlertCondition;

		manager.addAlert(mockAlert1);
		manager.addAlert(mockAlert2);
		expect(manager.getAlerts()).toHaveLength(2);

		manager.removeAlert("alert-1");
		expect(manager.getAlerts()).toHaveLength(1);
		expect(manager.getAlerts()[0].id).toBe("alert-2");

		const saved = JSON.parse(localStorageMock["vninvestcharts-widget_alerts"]);
		expect(saved).toHaveLength(1);
		expect(saved[0].id).toBe("alert-2");
	});

	it("should toggle an alert to reset its triggered state", () => {
		const manager = new AlertManager(() => true);
		const mockAlert: AlertCondition = {
			id: "alert-1",
			symbol: "VN30F1M",
			timeframe: "1h",
			sourceA: { type: "price", key: "close" },
			condition: "crossing_up",
			sourceB: { type: "value", value: 100 },
			frequency: "once",
			actions: { popup: true, sound: true, email: false },
			message: "Price crossed up 100",
			createdAt: Date.now(),
			isTriggered: true,
			lastTriggeredBarTime: 123456789,
		};

		manager.addAlert(mockAlert);
		manager.toggleAlert("alert-1");

		expect(manager.getAlerts()[0].isTriggered).toBe(false);
		expect(manager.getAlerts()[0].lastTriggeredBarTime).toBeUndefined();
	});

	it("should trigger callbacks and webhook when conditions match during checkAlerts", () => {
		const manager = new AlertManager(() => true);
		const mockAlert: AlertCondition = {
			id: "alert-1",
			symbol: "VN30F1M",
			timeframe: "1h",
			sourceA: { type: "price", key: "close" },
			condition: "crossing_up",
			sourceB: { type: "value", value: 100 },
			frequency: "once",
			actions: { popup: true, sound: true, email: false, webhook: "https://example.com/webhook" },
			message: "Price crossed up 100",
			createdAt: Date.now(),
			isTriggered: false,
		};

		manager.addAlert(mockAlert);

		const callbackSpy = vi.fn();
		manager.onAlertTriggered(callbackSpy);

		const prev = { date: "2026-06-21T10:00:00Z", close: 99 };
		const curr = { date: "2026-06-21T11:00:00Z", close: 101 };

		manager.checkAlerts("VN30F1M", "1h", curr, prev, []);

		expect(callbackSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "alert-1" }));
		expect(manager.getAlerts()[0].isTriggered).toBe(true);
		expect(fetch).toHaveBeenCalled();
	});

	// S2 regression lock. The widget effect at VNInvestCharts.tsx had no cleanup while
	// onAlertTriggered was push-only, so under StrictMode (src/demo/index.tsx:37) one
	// firing invoked every registered listener twice — measured as DIALOG COUNT: 2 with
	// a duplicated sound. No test of a single subscribe could ever see it: the second
	// registration comes from React's double-mount, not from this class.
	describe("S2: listener subscription is reversible", () => {
		function armableManager(): { manager: AlertManager; dispose: () => void; calls: number[] } {
			const manager = new AlertManager(() => true);
			manager.addAlert({
				id: "s2",
				symbol: "VN30F1M",
				timeframe: "1h",
				sourceA: { type: "price", key: "close" },
				condition: "greater_than",
				sourceB: { type: "value", value: 0 },
				frequency: "once",
				actions: { popup: true, sound: true, email: false },
				message: "s2",
				createdAt: 1,
				isTriggered: false,
			});
			const calls: number[] = [];
			// Two registrations, as StrictMode produces, then one disposed.
			const disposeA = manager.onAlertTriggered(() => calls.push(1));
			const disposeB = manager.onAlertTriggered(() => calls.push(2));
			return { manager, dispose: disposeA, calls, _disposeB: disposeB } as any;
		}

		function fire(m: AlertManager) {
			m.checkAlerts("VN30F1M", "1h", { close: 10 }, { close: 9 }, []);
		}

		it("two registrations, one disposed => exactly one callback per firing", () => {
			const { manager, dispose, calls } = armableManager();
			dispose();
			fire(manager);
			expect(calls).toEqual([2]);
		});

		it("two live registrations => two callbacks, so the leak is observable when present", () => {
			const { manager, calls } = armableManager();
			fire(manager);
			expect(calls).toHaveLength(2);
		});

		it("disposing twice is a no-op and does not remove another listener", () => {
			const { manager, dispose, calls } = armableManager();
			dispose();
			dispose();
			fire(manager);
			expect(calls).toEqual([2]);
		});

		it("a disposed listener stays gone across later firings", () => {
			const { manager, dispose, calls } = armableManager();
			dispose();
			fire(manager);
			manager.toggleAlert("s2");
			manager.getAlerts()[0].isTriggered = false;
			fire(manager);
			expect(calls).toEqual([2, 2]);
		});
	});
});
