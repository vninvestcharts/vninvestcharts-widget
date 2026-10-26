import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * SSR-safety: the repo forbids direct `document`/`window` access (see
 * `.eslintrc` "no-restricted-globals"). Every DOM lookup is therefore derived
 * from the container's own `ownerDocument`, which is also more correct for
 * widgets rendered inside an iframe or a Shadow Root.
 */
function getFocusable(root: HTMLElement): HTMLElement[] {
	const view = root.ownerDocument.defaultView;
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
		if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") return false;
		if (el.hasAttribute("hidden")) return false;
		// Use computed style rather than layout APIs (`offsetParent`,
		// `getClientRects`): those are always empty in jsdom, which would make the
		// Tab loop untestable, and they are unreliable for `position: fixed`.
		if (!view) return true;
		const style = view.getComputedStyle(el);
		return style.display !== "none" && style.visibility !== "hidden";
	});
}

export interface UseDialogFocusOptions {
	/** Whether the dialog is currently open. Focus is only managed while true. */
	open: boolean;
	/** Escape key handler. */
	onEscape?: () => void;
	/** Element to focus on open. Falls back to the first focusable node. */
	initialFocusRef?: RefObject<HTMLElement | null>;
	/** Disable the Tab loop (for non-modal panels). */
	trapTab?: boolean;
}

/**
 * UX-02 — shared dialog focus contract.
 *
 * Before this hook each dialog handled focus ad hoc, so none of them trapped
 * Tab and none returned focus to the trigger: keyboard users were stranded
 * inside a modal, and after closing it focus fell back to the document root.
 *
 * Responsibilities:
 *  - move focus into the dialog on open (explicit target, else first focusable)
 *  - keep Tab / Shift+Tab inside the dialog while it is open
 *  - call `onEscape` on Escape
 *  - restore focus to the element focused before the dialog opened
 */
export function useDialogFocus(
	containerRef: RefObject<HTMLElement | null>,
	{ open, onEscape, initialFocusRef, trapTab = true }: UseDialogFocusOptions
): void {
	const returnFocusRef = useRef<HTMLElement | null>(null);

	// `onEscape` is read through a ref so a caller passing an inline arrow
	// (`onEscape: () => onClose?.()` — SettingsModal.tsx:438 does exactly this)
	// cannot re-run the focus effects below on every render.
	//
	// This was a real, reproducible bug: the single-effect version listed onEscape
	// in its deps, so ANY re-render of the modal tore the effect down and set it up
	// again. The teardown ran `returnFocusRef.current.focus()` and the re-setup ran
	// the deferred `focusFirst`, so a click that focused a text field lost focus
	// ~80ms later to the dialog trigger and then to the close button. Typing was
	// impossible in the licensing tab. Callers cannot be trusted to memoise, so the
	// hook has to be robust on its own.
	const onEscapeRef = useRef(onEscape);
	useEffect(() => {
		onEscapeRef.current = onEscape;
	});

	// Effect A: move focus in on open, and return it on close. Once per open, by
	// construction — the deps here are all identity-stable.
	useEffect(() => {
		const container = containerRef.current;
		if (!open || !container) return;
		const doc = container.ownerDocument;

		// Remember the trigger BEFORE moving focus into the dialog.
		const active = doc.activeElement as HTMLElement | null;
		returnFocusRef.current = active && active !== doc.body ? active : null;

		const focusFirst = () => {
			const target = initialFocusRef?.current ?? getFocusable(container)[0] ?? container;
			if (target === container && !container.hasAttribute("tabindex")) {
				container.setAttribute("tabindex", "-1");
			}
			target.focus();
		};
		// Defer so the dialog has been laid out before we focus.
		const view = container.ownerDocument.defaultView;
		const raf = view?.requestAnimationFrame(focusFirst);

		return () => {
			if (raf !== undefined) view?.cancelAnimationFrame(raf);
			// UX-02: return focus to the trigger, not to <body>. Only on teardown of
			// a real open dialog, which is all this cleanup can be.
			const back = returnFocusRef.current;
			returnFocusRef.current = null;
			if (back && typeof back.focus === "function" && doc.contains(back)) {
				back.focus();
			}
		};
		// `initialFocusRef` is a RefObject: its identity is stable, and `.current` is
		// read at focus time, so it is safe to omit from the deps.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, containerRef]);

	// Effect B: the Tab trap and Escape, for as long as the dialog is open. This one
	// may legitimately re-bind; it never moves focus except through the Tab loop.
	useEffect(() => {
		const container = containerRef.current;
		if (!open || !container) return;
		const doc = container.ownerDocument;

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				onEscapeRef.current?.();
				return;
			}
			if (event.key !== "Tab" || !trapTab) return;
			const focusables = getFocusable(container);
			if (focusables.length === 0) {
				event.preventDefault();
				container.focus();
				return;
			}
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			const current = doc.activeElement as HTMLElement | null;
			if (!event.shiftKey && (current === last || !container.contains(current))) {
				event.preventDefault();
				first.focus();
			} else if (event.shiftKey && (current === first || !container.contains(current))) {
				event.preventDefault();
				last.focus();
			}
		};

		doc.addEventListener("keydown", onKeyDown, true);
		return () => {
			doc.removeEventListener("keydown", onKeyDown, true);
		};
	}, [open, containerRef, trapTab]);
}
