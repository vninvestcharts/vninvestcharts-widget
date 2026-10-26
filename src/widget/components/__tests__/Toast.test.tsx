// @vitest-environment jsdom
// BL-10 regression lock: toast push/dismiss + error boundary retry.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ToastHost, ToastProvider, useToasts } from "../Toast";
import { WidgetErrorBoundary } from "../../WidgetErrorBoundary";
import { WidgetI18nProvider } from "../../context/WidgetI18nContext";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function renderTree(node: React.ReactElement) {
	act(() => {
		/* eslint-disable-next-line react/no-children-prop -- required prop: this provider's props type declares `children` as mandatory, so it must be passed in the config object; createElement's 3rd-argument form fails tsc. */
		root?.render(createElement(WidgetI18nProvider, { locale: "en", children: null }, node));
	});
}

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => {
		root?.unmount();
	});
	container?.remove();
	container = null;
	root = null;
});

function Pusher(): React.ReactElement {
	const { pushToast } = useToasts();
	const handleClick = () => {
		pushToast("boom", "error", 50);
	};
	return createElement("button", { onClick: handleClick }, "push");
}

describe("Toast system (BL-10)", () => {
	it("renders nothing without toasts", () => {
		/* eslint-disable-next-line react/no-children-prop -- required prop: this provider's props type declares `children` as mandatory, so it must be passed in the config object; createElement's 3rd-argument form fails tsc. */
		renderTree(createElement(ToastProvider, { children: createElement(ToastHost) }));
		expect(container?.querySelector('[role="log"]')).toBeNull();
	});

	it("pushes an error toast and dismisses on click", () => {
		/* eslint-disable-next-line react/no-children-prop -- required prop: this provider's props type declares `children` as mandatory, so it must be passed in the config object; createElement's 3rd-argument form fails tsc. */
		renderTree(createElement(
			ToastProvider,
			{ children: [createElement(Pusher, { key: "p" }), createElement(ToastHost, { key: "h" })] },
		));
		const btn = container?.querySelector("button");
		act(() => {
			btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		const alert = container?.querySelector('[role="alert"]');
		expect(alert?.textContent).toContain("boom");
		const dismiss = alert?.querySelector("button");
		act(() => {
			dismiss?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(container?.querySelector('[role="alert"]')).toBeNull();
	});
});

function Bomb(): React.ReactElement {
	throw new Error("kaboom");
}

describe("WidgetErrorBoundary retry (BL-10)", () => {
	it("shows error UI with retry and recovers on click", () => {
		const onRetry = vi.fn();
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			/* eslint-disable-next-line react/no-children-prop -- required prop: this provider's props type declares `children` as mandatory, so it must be passed in the config object; createElement's 3rd-argument form fails tsc. */
			renderTree(createElement(
				WidgetErrorBoundary,
				{ onRetry, children: createElement(Bomb) },
			));
			const alert = container?.querySelector('[role="alert"]');
			expect(alert).not.toBeNull();
			const retry = Array.from(alert?.querySelectorAll("button") ?? [])
				.find((b) => b.textContent?.toLowerCase().includes("retry"));
			expect(retry).not.toBeUndefined();
			act(() => {
				retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(onRetry).toHaveBeenCalledTimes(1);
		} finally {
			spy.mockRestore();
		}
	});
});
