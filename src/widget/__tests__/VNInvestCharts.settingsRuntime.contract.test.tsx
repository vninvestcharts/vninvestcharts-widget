// @vitest-environment jsdom
import { type Mock, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetTimezone } from "../../lib/utils/timezoneFormatter";

const alertHub = vi.hoisted(() => ({ cb: null as null | ((alert: any) => void) }));
const tzHub = vi.hoisted(() => ({ spy: null as null | Mock<[tz: WidgetTimezone], void> }));

vi.mock("../../lib/alerts/AlertManager", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../lib/alerts/AlertManager")>();
	class StubAlertManager {
		onAlertTriggered(cb: (alert: any) => void) {
			alertHub.cb = cb;
			return () => {
				if (alertHub.cb === cb) alertHub.cb = null;
			};
		}
		checkAlerts() {}
		getAlerts() {
			return [];
		}
		addAlert() {}
		removeAlert() {}
		toggleAlert() {}
	}
	return { ...actual, AlertManager: StubAlertManager };
});

vi.mock("../../lib/utils/timezoneFormatter", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../lib/utils/timezoneFormatter")>();
	const spy = vi.fn(actual.setGlobalTimezone);
	tzHub.spy = spy;
	return { ...actual, setGlobalTimezone: spy };
});

import {
	CONTRACT_TIMEOUT,
	act,
	clearEngineHostPropsHistory,
	createAdapter,
	flushMicrotasks,
	forkRuntimeData,
	initializeTestImports,
	renderVNInvestCharts,
	waitForTruthyValue,
} from "./utils";

/**
 * D2 — PLAN_SETTINGS_FIX_2026-10-18 (F-02 + S-02 runtime).
 *
 * F-02: `VNInvestCharts.tsx:980-981` phát `playAlertSound` chỉ theo `alert.actions.sound`;
 * toggle master `alertAudioEnabled` không có consumer runtime. Test kích trigger qua
 * AlertManager stub để đo call site thật.
 *
 * S-02: effect setGlobalTimezone (:2598-2601) chỉ đọc props ⇒ tz chọn trong modal
 * (hydrate từ scoped key) không tới formatter. Test đo spy `setGlobalTimezone`.
 */

describe("VNInvestCharts settingsRuntime contract (D2)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof import("react-dom/client").createRoot> | null = null;

	beforeAll(async () => {
		await initializeTestImports();
	}, 30_000);

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		clearEngineHostPropsHistory();
		alertHub.cb = null;
		tzHub.spy?.mockClear();
	});

	afterEach(async () => {
		if (root) {
			await act(async () => {
				await flushMicrotasks();
				root!.unmount();
				await flushMicrotasks();
			});
		}
		root = null;
		container?.remove();
		container = null;
		window.localStorage.clear();
		document.documentElement.lang = "en";
		alertHub.cb = null;
	});

	it(
		"F-02: alertAudioEnabled=false → 0 playAlertSound dù alert.actions.sound=true",
		{ timeout: CONTRACT_TIMEOUT },
		async () => {
			window.localStorage.setItem("vnsc_settings_alertAudioEnabled", "false");
			const playAlertSound = vi.fn();
			const adapter = createAdapter(Promise.resolve(forkRuntimeData), "alert-gate-off");

			const result = await renderVNInvestCharts({
				adapter: adapter as never,
				data: forkRuntimeData as never,
				audioAdapter: { playAlertSound },
			});
			container = result.container;
			root = result.root;

			await act(async () => {
				await flushMicrotasks();
			});

			const cb = await waitForTruthyValue(() => alertHub.cb ?? undefined);
			act(() => {
				cb({ message: "M", actions: { popup: false, sound: true } });
			});

			expect(playAlertSound).toHaveBeenCalledTimes(0);
		},
	);

	it(
		"F-02 control: alertAudioEnabled=true → sound phát đúng 1 lần khi trigger",
		{ timeout: CONTRACT_TIMEOUT },
		async () => {
			window.localStorage.setItem("vnsc_settings_alertAudioEnabled", "true");
			const playAlertSound = vi.fn();
			const adapter = createAdapter(Promise.resolve(forkRuntimeData), "alert-gate-on");

			const result = await renderVNInvestCharts({
				adapter: adapter as never,
				data: forkRuntimeData as never,
				audioAdapter: { playAlertSound },
			});
			container = result.container;
			root = result.root;

			await act(async () => {
				await flushMicrotasks();
			});

			const cb = await waitForTruthyValue(() => alertHub.cb ?? undefined);
			act(() => {
				cb({ message: "M", actions: { popup: false, sound: true } });
			});

			expect(playAlertSound).toHaveBeenCalledTimes(1);
		},
	);

	it(
		"S-02: tz hydrate từ storage tới setGlobalTimezone khi mount (không cần prop)",
		{ timeout: CONTRACT_TIMEOUT },
		async () => {
			window.localStorage.setItem("vnsc_settings_timezone", "UTC");
			const adapter = createAdapter(Promise.resolve(forkRuntimeData), "tz-hydrate");

			const result = await renderVNInvestCharts({
				adapter: adapter as never,
				data: forkRuntimeData as never,
			});
			container = result.container;
			root = result.root;

			await act(async () => {
				await flushMicrotasks();
			});

			await waitForTruthyValue(() => (tzHub.spy && tzHub.spy.mock.calls.length > 0 ? true : undefined));
			expect(tzHub.spy!.mock.lastCall?.[0]).toBe("UTC");
		},
	);

	it(
		"S-02 control: prop timezone thắng hydrated value",
		{ timeout: CONTRACT_TIMEOUT },
		async () => {
			window.localStorage.setItem("vnsc_settings_timezone", "UTC");
			const adapter = createAdapter(Promise.resolve(forkRuntimeData), "tz-prop-wins");

			const result = await renderVNInvestCharts({
				adapter: adapter as never,
				data: forkRuntimeData as never,
				timezone: "Asia/Tokyo",
			});
			container = result.container;
			root = result.root;

			await act(async () => {
				await flushMicrotasks();
			});

			await waitForTruthyValue(() => (tzHub.spy && tzHub.spy.mock.calls.length > 0 ? true : undefined));
			expect(tzHub.spy!.mock.lastCall?.[0]).toBe("Asia/Tokyo");
		},
	);
});
