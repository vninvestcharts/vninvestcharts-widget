// @vitest-environment jsdom
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
	CONTRACT_TIMEOUT,
	createAdapter,
	createDeferred,
	forkRuntimeData,
	initializeTestImports,
	renderVNInvestCharts,
	waitForEngineHost,
	clearEngineHostPropsHistory,
	flushMicrotasks,
	act,
} from "./utils";

describe("VNInvestCharts - Data Loading Contracts", () => {
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

	it("shows loading state while fetching data", { timeout: CONTRACT_TIMEOUT }, async () => {
		const fetchDeferred = createDeferred<any[]>();
		const adapter = createAdapter(fetchDeferred.promise, "loading-state");

		const result = await renderVNInvestCharts({ adapter: adapter as never });
		container = result.container;
		root = result.root;

		expect(container.textContent).toContain("Đang tải biểu đồ…");

		await act(async () => {
			fetchDeferred.resolve(forkRuntimeData);
			await flushMicrotasks();
		});

		expect(container.textContent).not.toContain("Đang tải biểu đồ…");
	});

	it("shows empty state when no data returned", { timeout: CONTRACT_TIMEOUT }, async () => {
		const fetchDeferred = createDeferred<any[]>();
		const adapter = createAdapter(fetchDeferred.promise, "empty-state");

		const result = await renderVNInvestCharts({ adapter: adapter as never });
		container = result.container;
		root = result.root;

		await act(async () => {
			fetchDeferred.resolve([]);
			await flushMicrotasks();
		});

		expect(container.textContent).toContain("Chưa có dữ liệu");
	});

	it("renders chart when data is available", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "data-available");

		const result = await renderVNInvestCharts({ adapter: adapter as never, data: forkRuntimeData as never });
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const host = await waitForEngineHost();
		expect(host).toBeTruthy();
	});

	it("handles adapter errors gracefully", { timeout: CONTRACT_TIMEOUT }, async () => {
		const fetchDeferred = createDeferred<any[]>();
		const adapter = createAdapter(fetchDeferred.promise, "adapter-error");

		const result = await renderVNInvestCharts({ adapter: adapter as never });
		container = result.container;
		root = result.root;

		await act(async () => {
			fetchDeferred.reject(new Error("Network error"));
			await flushMicrotasks();
		});

		// UX-05: the copy is the translated, coded message; the raw adapter
		// exception is no longer interpolated into the user-visible text.
		expect(container.textContent).toContain("Không tải được dữ liệu thị trường");
		expect(container.textContent).not.toContain("boom");
	});

	it("passes data prop to engine when provided", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve([]), "data-prop-passed");

		const result = await renderVNInvestCharts({ adapter: adapter as never, data: forkRuntimeData as never });
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const host = await waitForEngineHost();
		expect(host).toBeTruthy();
	});

	it("handles data updates via adapter", { timeout: CONTRACT_TIMEOUT }, async () => {
		const fetchDeferred = createDeferred<any[]>();
		const adapter = createAdapter(fetchDeferred.promise, "data-updates");

		const result = await renderVNInvestCharts({ adapter: adapter as never });
		container = result.container;
		root = result.root;

		await act(async () => {
			fetchDeferred.resolve(forkRuntimeData);
			await flushMicrotasks();
		});

		const host = await waitForEngineHost();
		expect(host).toBeTruthy();
	});

	it("passes id as chartId to adapter data fetching methods", { timeout: CONTRACT_TIMEOUT }, async () => {
		const fetchDeferred = createDeferred<any[]>();
		const adapter = createAdapter(fetchDeferred.promise, "chartId-passing");

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			id: "test-custom-chart-id"
		});
		container = result.container;
		root = result.root;

		await act(async () => {
			fetchDeferred.resolve(forkRuntimeData);
			await flushMicrotasks();
		});

		expect(adapter.fetchBarsInRange).toHaveBeenCalled();
		const calls = adapter.fetchBarsInRange.mock.calls;
		// The 5th parameter (index 4) should be the custom chartId
		expect(calls[0]?.[4]).toBe("test-custom-chart-id");
	});
});
