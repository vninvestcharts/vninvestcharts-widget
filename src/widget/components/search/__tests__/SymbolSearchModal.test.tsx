// @vitest-environment jsdom
// P2-c regression lock: SymbolSearchModal renders a dialog, closes on
// backdrop mousedown and on Escape.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { SymbolSearchModal } from "../SymbolSearchModal";
import { VNSymbolSearch } from "../VNSymbolSearch";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) act(() => { root?.unmount(); });
	root = null;
	container?.remove();
	container = null;
});

function renderModal(onClose: () => void) {
	act(() => { root?.render(createElement(SymbolSearchModal, { open: true, onClose }, createElement(VNSymbolSearch, {}))); });
}

describe("SymbolSearchModal", () => {
	it("renders dialog with search input when open", () => {
		renderModal(() => {});
		expect(container?.querySelector('[role="dialog"]')).not.toBeNull();
		expect(container?.querySelector('input[type="text"]')).not.toBeNull();
	});
	it("calls onClose on backdrop mousedown", () => {
		const onClose = vi.fn();
		renderModal(onClose);
		const backdrop = container?.firstElementChild as HTMLElement;
		act(() => { backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
		expect(onClose).toHaveBeenCalledTimes(1);
	});
	it("calls onClose on Escape", () => {
		const onClose = vi.fn();
		renderModal(onClose);
		act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
