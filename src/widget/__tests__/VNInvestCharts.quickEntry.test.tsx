// @vitest-environment jsdom
// User report 2026-10-12: typing a letter in the Pine editor opened symbol
// search. Root cause: quick-entry guard only knew INPUT/TEXTAREA, but Monaco
// (EditContext) types into DIV.native-edit-context inside .monaco-editor.
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
	CONTRACT_TIMEOUT,
	createAdapter,
	flushMicrotasks,
	forkRuntimeData,
	initializeTestImports,
	renderVNInvestCharts,
	clearEngineHostPropsHistory,
	act,
} from "./utils";

function pressOnTarget(key: string, target: Element): boolean {
	let prevented = false;
	const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
	target.dispatchEvent(ev);
	prevented = ev.defaultPrevented;
	return prevented;
}

describe("VNInvestCharts - symbol quick entry vs Pine editor", () => {
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

	async function mount() {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "quick-entry");
		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			locale: "en",
			showHeader: true,
			drawingUiEnabled: true,
			drawingActiveTool: "cursor",
		});
		container = result.container;
		root = result.root;
	}

	it("does NOT hijack keystrokes typed inside .monaco-editor", { timeout: CONTRACT_TIMEOUT }, async () => {
		await mount();
		const monacoRoot = document.createElement("div");
		monacoRoot.className = "monaco-editor";
		const editArea = document.createElement("div");
		editArea.className = "native-edit-context";
		monacoRoot.appendChild(editArea);
		document.body.appendChild(monacoRoot);
		try {
			let prevented = false;
			await act(async () => {
				prevented = pressOnTarget("s", editArea);
				await flushMicrotasks();
			});
			expect(prevented, "quick entry must not preventDefault inside Monaco").toBe(false);
			expect(
				document.querySelector('[role="dialog"]'),
				"symbol search must stay closed while typing in Pine",
			).toBeNull();
		} finally {
			monacoRoot.remove();
		}
	});

	it("still opens symbol search when typing on the chart surface", { timeout: CONTRACT_TIMEOUT }, async () => {
		await mount();
		await act(async () => {
			pressOnTarget("s", document.body);
			await flushMicrotasks();
		});
		expect(
			document.querySelector('[role="dialog"]'),
			"quick entry feature itself must keep working",
		).not.toBeNull();
	});
});
