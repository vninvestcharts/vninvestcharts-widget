// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Splitter } from "./Splitter";

describe("Splitter S1 legacy contract", () => {
	it("mouse drag changes sizes via delta%", async () => {
		const onResize = vi.fn();
		const { container } = render(
			<Splitter direction="horizontal" minSize={10} maxSize={90} initialSizes={[50, 50]} onResize={onResize} />
		);
		const host = container.firstChild as HTMLElement;
		Object.defineProperty(host, "getBoundingClientRect", {
			value: () => ({ width: 1000, height: 500, left: 0, top: 0, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) }),
		});
		const handles = container.querySelectorAll('[role="separator"]');
		expect(handles.length).toBe(1);
		const handle = handles[0] as HTMLElement;
		fireEvent.mouseDown(handle, { clientX: 500, clientY: 250 });
		fireEvent.mouseMove(document, { clientX: 600, clientY: 250 });
		fireEvent.mouseUp(document);
		expect(onResize).toHaveBeenCalled();
		const last = onResize.mock.calls.at(-1)?.[0] as number[];
		expect(last[0] + last[1]).toBeCloseTo(100, 1);
		expect(last[0]).toBeGreaterThan(50);
	});

	it("keyboard arrows/Home/End and ARIA", () => {
		const onResize = vi.fn();
		const { container } = render(
			<Splitter direction="horizontal" minSize={10} maxSize={90} initialSizes={[30, 70]} onResize={onResize} aria-label="test-splitter" />
		);
		const handle = container.querySelector('[role="separator"]') as HTMLElement;
		expect(handle.getAttribute("role")).toBe("separator");
		expect(handle.getAttribute("aria-orientation")).toBe("horizontal");
		expect(handle.getAttribute("aria-valuenow")).toBe("30");
		handle.focus();
		fireEvent.keyDown(handle, { key: "ArrowRight" });
		expect(onResize).toHaveBeenCalled();
		const afterRight = onResize.mock.calls.at(-1)?.[0] as number[];
		expect(afterRight[0]).toBeGreaterThan(30);
		fireEvent.keyDown(handle, { key: "Home" });
		const afterHome = onResize.mock.calls.at(-1)?.[0] as number[];
		expect(afterHome[0]).toBe(10);
		fireEvent.keyDown(handle, { key: "End" });
		const afterEnd = onResize.mock.calls.at(-1)?.[0] as number[];
		expect(afterEnd[0]).toBeGreaterThanOrEqual(10);
		expect(afterEnd[0]).toBeLessThanOrEqual(90);
		expect(afterEnd[0] + afterEnd[1]).toBeCloseTo(100, 1);
	});

	it("onResize normalize total 100%", () => {
		const onResize = vi.fn();
		const { container } = render(
			<Splitter direction="vertical" minSize={5} maxSize={95} initialSizes={[20, 30, 50]} onResize={onResize} />
		);
		const handles = container.querySelectorAll('[role="separator"]');
		expect(handles.length).toBe(2);
		const h0 = handles[0] as HTMLElement;
		Object.defineProperty(container.firstChild as HTMLElement, "getBoundingClientRect", {
			value: () => ({ width: 500, height: 1000, left: 0, top: 0, right: 500, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) }),
		});
		h0.focus();
		fireEvent.keyDown(h0, { key: "ArrowDown" });
		const last = onResize.mock.calls.at(-1)?.[0] as number[];
		expect(last.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);
	});
});
