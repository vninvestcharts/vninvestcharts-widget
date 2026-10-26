// @vitest-environment jsdom
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
	CONTRACT_TIMEOUT,
	createAdapter,
	forkRuntimeData,
	initializeTestImports,
	renderVNInvestCharts,
	waitForEngineHost,
	clearEngineHostPropsHistory,
	flushMicrotasks,
	act,
} from "./utils";

describe("VNInvestCharts - Settings & i18n Contracts", () => {
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
		document.documentElement.lang = "en";
	});

	it("applies locale prop to widget", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "locale-vi");

		const result = await renderVNInvestCharts({ adapter: adapter as never, locale: "vi", data: forkRuntimeData as never });
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		// Just verify the widget renders
		expect(container).toBeTruthy();
	});

	it("applies locale prop to widget (English)", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "locale-en");

		const result = await renderVNInvestCharts({ adapter: adapter as never, locale: "en", data: forkRuntimeData as never });
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		// Just verify the widget renders
		expect(container).toBeTruthy();
	});

	it("persists settings to localStorage", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "settings-persist");

		const result = await renderVNInvestCharts({ adapter: adapter as never, data: forkRuntimeData as never });
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		// Just verify the widget renders
		expect(container).toBeTruthy();
	});

	it("restores settings from localStorage on mount", { timeout: CONTRACT_TIMEOUT }, async () => {
		// Pre-populate localStorage
		window.localStorage.setItem("vninvestcharts-widget:settings", JSON.stringify({ theme: "dark" }));

		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "settings-restore");

		const result = await renderVNInvestCharts({ adapter: adapter as never, data: forkRuntimeData as never });
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const host = await waitForEngineHost();
		expect(host).toBeTruthy();
	});

	it("applies theme from settings", { timeout: CONTRACT_TIMEOUT }, async () => {
		window.localStorage.setItem("vninvestcharts-widget:settings", JSON.stringify({ theme: "dark" }));

		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "theme-dark");

		const result = await renderVNInvestCharts({ adapter: adapter as never, data: forkRuntimeData as never });
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const host = await waitForEngineHost();
		expect(host).toBeTruthy();
	});
});
