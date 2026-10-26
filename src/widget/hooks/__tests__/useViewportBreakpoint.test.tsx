// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, render } from "@testing-library/react";
import { useViewportBreakpoint, type ViewportMode } from "../useViewportBreakpoint";

/**
 * UX-04 — the responsive mode must follow the WIDGET's own box.
 *
 * The old hook observed `document.documentElement`, so a workspace embedded in a
 * 600px sidebar on a 1920px screen still resolved to `desktop` and rendered the
 * full desktop chrome.
 */
class MockResizeObserver {
	static instances: MockResizeObserver[] = [];
	private callback: ResizeObserverCallback;
	observed: Element[] = [];
	disconnected = false;

	constructor(cb: ResizeObserverCallback) {
		this.callback = cb;
		MockResizeObserver.instances.push(this);
	}
	observe(el: Element) {
		this.observed.push(el);
	}
	unobserve() {}
	disconnect() {
		this.disconnected = true;
	}
	/** Drive a resize from the test. */
	emit(width: number) {
		this.callback(
			[{ contentRect: { width } } as unknown as ResizeObserverEntry],
			this as unknown as ResizeObserver
		);
	}
}

function Probe({ containerRef, onMode }: { containerRef?: React.RefObject<HTMLDivElement | null>; onMode: (m: ViewportMode) => void }) {
	const mode = useViewportBreakpoint(containerRef);
	onMode(mode);
	return <div data-testid="probe">{mode}</div>;
}

let view: { unmount: () => void; container: HTMLElement } | null = null;
let doc!: Document;
let win!: Window;

function mount(ui: React.ReactElement) {
	const r = render(ui);
	doc = r.container.ownerDocument;
	win = doc.defaultView!;
	view = { unmount: r.unmount, container: r.container };
	return view;
}

const readMode = () => view!.container.querySelector("[data-testid='probe']")?.textContent;

afterEach(() => {
	act(() => view?.unmount());
	view = null;
	MockResizeObserver.instances = [];
	vi.unstubAllGlobals();
});

describe("useViewportBreakpoint", () => {
	it("falls back to viewport width when no container ref is given", () => {
		vi.stubGlobal("ResizeObserver", MockResizeObserver);
		// jsdom viewport is 1024 → "tablet".
		mount(<Probe onMode={() => {}} />);
		expect(["mobile", "tablet", "desktop"]).toContain(readMode());
	});

	it("observes the supplied container instead of the document element", () => {
		vi.stubGlobal("ResizeObserver", MockResizeObserver);
		const containerRef = React.createRef<HTMLDivElement>();

		function Host() {
			const [, force] = React.useState(0);
			return (
				<div ref={containerRef} data-testid="host">
					<Probe containerRef={containerRef} onMode={() => {}} />
					<button type="button" onClick={() => force((n) => n + 1)}>
						rerender
					</button>
				</div>
			);
		}
		mount(<Host />);

		const observed = MockResizeObserver.instances[0]?.observed ?? [];
		expect(observed).toHaveLength(1);
		expect(observed[0]).toBe(view!.container.querySelector("[data-testid='host']"));
		expect(observed[0]).not.toBe(doc.documentElement);
	});

	it("derives the mode from the CONTAINER width, not the page width", () => {
		vi.stubGlobal("ResizeObserver", MockResizeObserver);
		const containerRef = React.createRef<HTMLDivElement>();

		function Host() {
			return (
				<div ref={containerRef} data-testid="host">
					<Probe containerRef={containerRef} onMode={() => {}} />
				</div>
			);
		}
		mount(<Host />);
		const ro = MockResizeObserver.instances[0];

		// Page is wide; the container is narrow → compact layout must win.
		act(() => ro.emit(600));
		expect(readMode()).toBe("mobile");

		act(() => ro.emit(900));
		expect(readMode()).toBe("tablet");

		act(() => ro.emit(1440));
		expect(readMode()).toBe("desktop");
	});

	it("disconnects the observer on unmount", () => {
		vi.stubGlobal("ResizeObserver", MockResizeObserver);
		const containerRef = React.createRef<HTMLDivElement>();
		mount(
			<div ref={containerRef} data-testid="host">
				<Probe containerRef={containerRef} onMode={() => {}} />
			</div>
		);
		const ro = MockResizeObserver.instances[0];
		act(() => view!.unmount());
		expect(ro.disconnected).toBe(true);
		view = null;
	});

	/**
	 * P0-5 (Batch B): the grid renders a DIFFERENT subtree in mobile mode
	 * (`GridContainer.tsx:1082-1148`) and only the desktop branch carries the
	 * measured element (`:1153`). The observer therefore keeps watching a
	 * detached node, so growing the window again never restores the desktop
	 * layout — the workspace stays stuck in the mobile carousel.
	 */
	it("recovers to desktop after the observed container is detached and the window resizes", () => {
		vi.stubGlobal("ResizeObserver", MockResizeObserver);
		const containerRef = React.createRef<HTMLDivElement>();

		function Host() {
			return (
				<div ref={containerRef} data-testid="host">
					<Probe containerRef={containerRef} onMode={() => {}} />
				</div>
			);
		}
		mount(<Host />);
		const ro = MockResizeObserver.instances[0];

		// The grid switches to the mobile branch: the measured element unmounts.
		act(() => ro.emit(600));
		expect(readMode()).toBe("mobile");

		// The window grows again while the measured element is gone.
		act(() => {
			containerRef.current = null;
			Object.defineProperty(win, "innerWidth", { configurable: true, writable: true, value: 1440 });
			win.dispatchEvent(new Event("resize"));
		});
		expect(readMode()).toBe("desktop");
	});
});
