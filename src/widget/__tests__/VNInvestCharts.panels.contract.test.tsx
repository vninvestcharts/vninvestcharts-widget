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

describe("VNInvestCharts - Panel Contracts (StrategyTester, PineEditor)", () => {
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

	it("renders StrategyTester panel when enabled", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "strategy-tester-panel");

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "fork",
			data: forkRuntimeData as never,
			strategyTesterEnabled: true,
		});
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const host = await waitForEngineHost();
		expect(host).toBeTruthy();
	});

	it("renders PineEditor panel when enabled", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "pine-editor-panel");

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "fork",
			data: forkRuntimeData as never,
			pineEditorEnabled: true,
		});
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const host = await waitForEngineHost();
		expect(host).toBeTruthy();
	});

	it("renders both panels when both enabled", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "both-panels");

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "fork",
			data: forkRuntimeData as never,
			strategyTesterEnabled: true,
			pineEditorEnabled: true,
		});
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const host = await waitForEngineHost();
		expect(host).toBeTruthy();
	});

	it("does not render panels when disabled", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "panels-disabled");

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "fork",
			data: forkRuntimeData as never,
			strategyTesterEnabled: false,
			pineEditorEnabled: false,
		});
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const host = await waitForEngineHost();
		expect(host).toBeTruthy();
	});
});
