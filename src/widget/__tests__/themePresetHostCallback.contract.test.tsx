// @vitest-environment jsdom
/**
 * F-07 (Stage 6, 2026-10-18): khi host pin `theme` prop, preset chọn trong Settings
 * modal bị che khỏi `resolvedTheme` (theme prop thắng) — callback `onThemePresetChange`
 * phải được route vào modal (thay vì themeState.setTheme cục bộ).
 *
 * RED tại base 00da7a8c..37495af4 (modal gọi instance cục bộ ⇒ spy 0 call),
 * GREEN sau fix (VNInvestCharts route qua callback khi prop hiện diện).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("VNInvestCharts theme preset host callback (F-07)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof import("react-dom/client").createRoot> | null = null;

	beforeAll(async () => {
		await initializeTestImports();
	}, 30_000);

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		clearEngineHostPropsHistory();
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
	});

	async function clickPresetInModal(title: string) {
		const tab = await waitForTruthyValue(() => {
			const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
			return tabs.find((el) => /(Theme|Chủ đề)/.test(el.textContent || "")) as HTMLElement | undefined;
		});
		await act(async () => {
			tab.click();
			await flushMicrotasks();
		});
		const span = await waitForTruthyValue(() => {
			const spans = Array.from(document.querySelectorAll("span"));
			return spans.find((s) => s.textContent === title);
		});
		await act(async () => {
			span.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
			await flushMicrotasks();
		});
	}

	it(
		"F-07: theme prop pinned + callback ⇒ preset click routes qua onThemePresetChange",
		{ timeout: CONTRACT_TIMEOUT },
		async () => {
			const onThemePresetChange = vi.fn();
			const adapter = createAdapter(Promise.resolve(forkRuntimeData), "theme-callback");
			const result = await renderVNInvestCharts({
				adapter: adapter as never,
				data: forkRuntimeData as never,
				theme: "classic-dark",
				settingsOpen: true,
				onThemePresetChange,
			});
			container = result.container;
			root = result.root;

			await act(async () => {
				await flushMicrotasks();
			});
			await waitForTruthyValue(() => document.querySelector('[data-testid="settings-modal"]'));

			await clickPresetInModal("Midnight Blue");
			expect(onThemePresetChange).toHaveBeenCalledWith("midnight-blue");
		},
	);

	it(
		"F-07 control: không callback ⇒ preset click vẫn đi đường cục bộ (rsc-chart-theme)",
		{ timeout: CONTRACT_TIMEOUT },
		async () => {
			const adapter = createAdapter(Promise.resolve(forkRuntimeData), "theme-local");
			const result = await renderVNInvestCharts({
				adapter: adapter as never,
				data: forkRuntimeData as never,
				settingsOpen: true,
			});
			container = result.container;
			root = result.root;

			await act(async () => {
				await flushMicrotasks();
			});
			await waitForTruthyValue(() => document.querySelector('[data-testid="settings-modal"]'));

			await clickPresetInModal("Midnight Blue");
			expect(window.localStorage.getItem("rsc-chart-theme")).toBe("midnight-blue");
		},
	);
});
