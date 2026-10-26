// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, render } from "@testing-library/react";
import { useDialogFocus } from "../useDialogFocus";

/**
 * UX-02 — shared dialog focus contract.
 *
 * Every dialog previously handled focus ad hoc: initial focus only, no Tab loop,
 * and no restore. Keyboard users were trapped inside a modal and, after closing
 * it, focus fell back to <body> instead of the control that opened it.
 */
function Harness({ open, onEscape }: { open: boolean; onEscape?: () => void }) {
	const panelRef = React.useRef<HTMLDivElement>(null);
	const firstRef = React.useRef<HTMLButtonElement>(null);
	useDialogFocus(panelRef, { open, onEscape, initialFocusRef: firstRef });
	if (!open) return null;
	return (
		<div ref={panelRef} data-testid="panel">
			<button ref={firstRef} type="button" data-testid="first">
				first
			</button>
			<button type="button" data-testid="middle">
				middle
			</button>
			<button type="button" data-testid="last">
				last
			</button>
		</div>
	);
}

let ctx: { rerender: (ui: React.ReactElement) => void; unmount: () => void; container: HTMLElement } | null = null;
let doc!: Document;
let win!: Window;

function mount(ui: React.ReactElement) {
	const r = render(ui);
	doc = r.container.ownerDocument;
	win = doc.defaultView!;
	ctx = { rerender: r.rerender, unmount: r.unmount, container: r.container };
	return ctx;
}

const q = (id: string) => ctx!.container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const active = () => doc.activeElement;

const KeyboardEventCtor = (): typeof KeyboardEvent =>
	(win as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent;

/** The hook defers initial focus by one animation frame — wait it out. */
async function flushRaf() {
	await act(async () => {
		await new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()));
	});
}

/**
 * Dispatch on `document`, NOT on `window`: a capture listener registered on
 * document never receives an event dispatched directly at window.
 */
function press(key: string, shiftKey = false) {
	const Ctor = KeyboardEventCtor();
	const ev = new Ctor("keydown", { key, shiftKey, bubbles: true, cancelable: true });
	doc.dispatchEvent(ev);
	return ev;
}

describe("useDialogFocus", () => {
	afterEach(() => {
		act(() => ctx?.unmount());
		ctx = null;
	});

	it("moves focus into the dialog on open", async () => {
		mount(<Harness open={false} />);
		act(() => {
			ctx!.rerender(<Harness open />);
		});
		await flushRaf();

		expect(active()).toBe(q("first"));
	});

	it("wraps Tab from the last control back to the first", async () => {
		mount(<Harness open />);
		await flushRaf();
		q("last").focus();

		const ev = press("Tab", false);

		expect(ev.defaultPrevented).toBe(true);
		expect(active()).toBe(q("first"));
	});

	it("wraps Shift+Tab from the first control back to the last", async () => {
		mount(<Harness open />);
		await flushRaf();
		q("first").focus();

		const ev = press("Tab", true);

		expect(ev.defaultPrevented).toBe(true);
		expect(active()).toBe(q("last"));
	});

	it("does not intercept Tab in the middle of the dialog", async () => {
		mount(<Harness open />);
		await flushRaf();
		q("middle").focus();

		const ev = press("Tab", false);

		expect(ev.defaultPrevented).toBe(false);
		expect(active()).toBe(q("middle"));
	});

	it("calls onEscape when Escape is pressed", async () => {
		const onEscape = vi.fn();
		mount(<Harness open onEscape={onEscape} />);
		await flushRaf();

		press("Escape");

		expect(onEscape).toHaveBeenCalledTimes(1);
	});

	it("restores focus to the trigger when the dialog closes", async () => {
		mount(<Harness open={false} />);
		const trigger = doc.createElement("button");
		doc.body.appendChild(trigger);
		trigger.focus();
		expect(active()).toBe(trigger);

		act(() => {
			ctx!.rerender(<Harness open />);
		});
		await flushRaf();
		expect(active()).toBe(q("first"));

		act(() => {
			ctx!.rerender(<Harness open={false} />);
		});

		expect(active()).toBe(trigger);
		trigger.remove();
	});

	it("does not move focus while closed", async () => {
		mount(<Harness open={false} />);
		const outside = doc.createElement("button");
		doc.body.appendChild(outside);
		outside.focus();

		await flushRaf();

		expect(active()).toBe(outside);
		outside.remove();
	});
});

/**
 * Regression lock for the licensing-tab input that could not be clicked, typed
 * into, or pasted into.
 *
 * The hook listed `onEscape` in its effect deps. SettingsModal passes an inline
 * arrow (`onEscape: () => onClose?.()`), so every re-render of the modal tore the
 * effect down and set it up again: the teardown ran `returnFocus.focus()` and the
 * re-setup ran the deferred `focusFirst`. A click that focused the PAT input
 * therefore lost focus ~80ms later to the dialog trigger and then to the close
 * button. Caught by instrumenting focusin/focusout on a live page, not by reading
 * the code - the CSS and the `disabled` prop were both innocent.
 */
describe("useDialogFocus - focus survives re-renders (inline onEscape)", () => {
	function InlineHarness({ open, onEscape, renderKey }: { open: boolean; onEscape?: () => void; renderKey: number }) {
		const panelRef = React.useRef<HTMLDivElement>(null);
		// Deliberately inline: this is what SettingsModal.tsx:438 does.
		useDialogFocus(panelRef, { open, onEscape: () => onEscape?.() });
		if (!open) return null;
		return (
			<div ref={panelRef} data-testid="panel">
				<button type="button" data-testid="trigger-inside">
					inside
				</button>
				<input type="text" data-testid="field" defaultValue="" />
				<span data-testid="render-key">{renderKey}</span>
			</div>
		);
	}

	it("keeps focus in a text field across re-renders that pass a new onEscape identity", async () => {
		const { rerender } = render(<InlineHarness open onEscape={() => {}} renderKey={1} />);
		await flushRaf();

		const field = document.querySelector('[data-testid="field"]') as HTMLInputElement;
		field.focus();
		expect(active()).toBe(field);

		// Three re-renders with fresh inline onEscape, i.e. what any state change in
		// the modal does. Before the fix, each one stole focus back.
		for (const k of [2, 3, 4]) {
			rerender(<InlineHarness open onEscape={() => {}} renderKey={k} />);
			await flushRaf();
			expect(active(), `focus was stolen on re-render ${k}`).toBe(field);
		}
	});

	it("still returns focus to the trigger when the dialog closes", async () => {
		const trigger = document.createElement("button");
		document.body.appendChild(trigger);
		trigger.focus();

		const { rerender } = render(<InlineHarness open onEscape={() => {}} renderKey={1} />);
		await flushRaf();
		expect(active()).not.toBe(trigger);

		rerender(<InlineHarness open={false} onEscape={() => {}} renderKey={2} />);
		await flushRaf();
		expect(active()).toBe(trigger);
		trigger.remove();
	});

	it("still calls the latest onEscape on the Escape key", async () => {
		const first = vi.fn();
		const second = vi.fn();
		const { rerender } = render(<InlineHarness open onEscape={first} renderKey={1} />);
		await flushRaf();

		// A re-render swaps the handler; the keydown path must see the new one.
		rerender(<InlineHarness open onEscape={second} renderKey={2} />);
		await flushRaf();

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		expect(second).toHaveBeenCalledTimes(1);
		expect(first).not.toHaveBeenCalled();
	});
});
