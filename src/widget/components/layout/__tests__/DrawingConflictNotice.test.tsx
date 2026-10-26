// @vitest-environment jsdom
// DrawingConflictNotice render + dismiss (Slice E2 — SY-06 UX).

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawingConflictNotice } from "../DrawingConflictNotice";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("DrawingConflictNotice", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	afterEach(async () => {
		await act(async () => {
			root?.unmount();
		});
		container?.remove();
		container = null;
		root = null;
	});

	it("renders localized conflict text and dismisses on button click", async () => {
		const onDismiss = vi.fn();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		await act(async () => {
			root!.render(<DrawingConflictNotice onDismiss={onDismiss} />);
		});

		const notice = container.querySelector('[data-testid="drawing-conflict-notice"]');
		expect(notice).not.toBeNull();
		expect(notice?.getAttribute("role")).toBe("status");
		// Default (no provider) locale is vi — assert via the i18n key value.
		expect(notice?.textContent).toContain("Xung đột bản vẽ");

		const button = notice?.querySelector("button");
		expect(button?.getAttribute("aria-label")).toBe("Đã hiểu");
		await act(async () => {
			button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onDismiss).toHaveBeenCalledTimes(1);
	});
});
