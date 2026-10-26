// @vitest-environment jsdom
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
	CONTRACT_TIMEOUT,
	createAdapter,
	createDeferred,
	flushMicrotasks,
	forkRuntimeData,
	initializeTestImports,
	renderVNInvestCharts,
	waitForEngineHost,
	getLatestHostProps,
	clearEngineHostPropsHistory,
	act,
	VNInvestCharts,
} from "./utils";

describe("VNInvestCharts - Core Widget Contracts", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof import("react-dom/client").createRoot> | null = null;
	let abortSpy: any = null;

	beforeAll(async () => {
		await initializeTestImports();
	}, 30_000);

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		abortSpy = vi.spyOn(AbortController.prototype, "abort");
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
		abortSpy?.mockRestore();
		abortSpy = null;
		window.localStorage.clear();
		document.documentElement.lang = "en";
	});

	it("shows the loading and empty states when no bars are available", { timeout: CONTRACT_TIMEOUT }, async () => {
		const fetchDeferred = createDeferred<any[]>();
		const adapter = createAdapter(fetchDeferred.promise, "empty");

		const result = await renderVNInvestCharts({ adapter: adapter as never, locale: "vi" });
		container = result.container;
		root = result.root;

		expect(container.textContent).toContain("Đang tải biểu đồ…");

		await act(async () => {
			fetchDeferred.resolve([]);
			await flushMicrotasks();
		});

		expect(container.textContent).toContain("Chưa có dữ liệu");
		expect(adapter.fetchBars).toHaveBeenCalledTimes(1);
	});

	it("aborts the in-flight fetch when adapter changes", { timeout: CONTRACT_TIMEOUT }, async () => {
		const fetchDeferred = createDeferred<any[]>();
		const adapter = createAdapter(fetchDeferred.promise, "abort-on-adapter-change");

		const result = await renderVNInvestCharts({ adapter: adapter as never });
		container = result.container;
		root = result.root;

		await act(async () => {
			const newAdapter = createAdapter(Promise.resolve(forkRuntimeData), "new-adapter");
			result.root.render(<VNInvestCharts adapter={newAdapter as never} />);
			await flushMicrotasks();
		});

		expect(abortSpy).toHaveBeenCalled();
	});

	it("reloads bars when symbol or timeframe props change", { timeout: CONTRACT_TIMEOUT }, async () => {
		const fetchDeferred = createDeferred<any[]>();
		const adapter = createAdapter(fetchDeferred.promise, "reload-on-prop-change");

		const result = await renderVNInvestCharts({ adapter: adapter as never });
		container = result.container;
		root = result.root;

		await act(async () => {
			fetchDeferred.resolve(forkRuntimeData);
			await flushMicrotasks();
		});

		// fetchBars may be called multiple times due to internal retries
		expect(adapter.fetchBars).toHaveBeenCalled();

		const newFetchDeferred = createDeferred<any[]>();
		const newAdapter = createAdapter(newFetchDeferred.promise, "new-adapter-after-reload");

		await act(async () => {
			result.root.render(<VNInvestCharts adapter={newAdapter as never} />);
			await flushMicrotasks();
		});

		await act(async () => {
			newFetchDeferred.resolve(forkRuntimeData);
			await flushMicrotasks();
		});

		expect(newAdapter.fetchBars).toHaveBeenCalled();
	});

	it("renders the error boundary fallback when the chart subtree throws", { timeout: CONTRACT_TIMEOUT }, async () => {
		const fetchDeferred = createDeferred<any[]>();
		const throwingAdapter = createAdapter(fetchDeferred.promise, "throwing-adapter");

		const result = await renderVNInvestCharts({ adapter: throwingAdapter as never });
		container = result.container;
		root = result.root;

		await act(async () => {
			fetchDeferred.reject(new Error("boom"));
			await flushMicrotasks();
		});

		// UX-05: the copy is the translated, coded message; the raw adapter
		// exception is no longer interpolated into the user-visible text.
		expect(container.textContent).toContain("Không tải được dữ liệu thị trường");
		expect(container.textContent).not.toContain("boom");
	});

	it("does not emit a null drawing workspace during internal workspace updates", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "no-null-workspace");
		const handleDrawingWorkspaceChange = vi.fn();

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "fork",
			drawingUiEnabled: true,
			onDrawingWorkspaceChange: handleDrawingWorkspaceChange,
			data: forkRuntimeData as never,
		});
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const nullCalls = handleDrawingWorkspaceChange.mock.calls.filter((call) => call[0] === null);
		expect(nullCalls.length).toBe(0);
	});
});
