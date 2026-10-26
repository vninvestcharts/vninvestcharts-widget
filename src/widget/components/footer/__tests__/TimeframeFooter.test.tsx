// @vitest-environment jsdom
// P5a regression lock: scale toggles, timezone badge, live clock.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { TimeframeFooter } from "../TimeframeFooter";
import { formatCountdown, parseTimeframeIntervalMs, useNow } from "../useBarCountdown";

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

describe("TimeframeFooter right controls", () => {
	it("renders three scale toggles with auto pressed by default", () => {
		act(() => { root?.render(createElement(TimeframeFooter, {})); });
		const scales = Array.from(container?.querySelectorAll("[data-scale]") ?? []);
		expect(scales.map((b) => b.getAttribute("data-scale"))).toEqual(["auto", "log", "percent"]);
		expect(container?.querySelector('[data-scale="auto"]')?.getAttribute("aria-pressed")).toBe("true");
	});
	it("clicking log calls onScaleModeChange", () => {
		const onScaleModeChange = vi.fn();
		act(() => { root?.render(createElement(TimeframeFooter, { scaleMode: "auto", onScaleModeChange })); });
		act(() => { (container?.querySelector('[data-scale="log"]') as HTMLButtonElement | null)?.click(); });
		expect(onScaleModeChange).toHaveBeenCalledWith("log");
	});
	it("shows short timezone badge with full zone as title", () => {
		act(() => { root?.render(createElement(TimeframeFooter, { timezone: "Asia/Ho_Chi_Minh" })); });
		expect(container?.textContent).toContain("UTC+7");
	});
	it("shows live clock by default and hides when disabled", () => {
		act(() => { root?.render(createElement(TimeframeFooter, {})); });
		expect(container?.querySelector('[data-testid="footer-clock"]')).not.toBeNull();
		act(() => { root?.render(createElement(TimeframeFooter, { showClock: false })); });
		expect(container?.querySelector('[data-testid="footer-clock"]')).toBeNull();
	});
});

describe("useBarCountdown utils", () => {
	it("parses minute/hour/day/week frames to interval ms", () => {
		expect(parseTimeframeIntervalMs("1m")).toBe(60_000);
		expect(parseTimeframeIntervalMs("15m")).toBe(900_000);
		expect(parseTimeframeIntervalMs("1h")).toBe(3_600_000);
		expect(parseTimeframeIntervalMs("1D")).toBe(86_400_000);
		expect(parseTimeframeIntervalMs("1W")).toBe(604_800_000);
	});
	it("rejects monthly, empty and malformed frames", () => {
		expect(parseTimeframeIntervalMs("1M")).toBeNull();
		expect(parseTimeframeIntervalMs(undefined)).toBeNull();
		expect(parseTimeframeIntervalMs("")).toBeNull();
		expect(parseTimeframeIntervalMs("abc")).toBeNull();
		expect(parseTimeframeIntervalMs("0m")).toBeNull();
	});
	it("formats mm:ss below one hour and h:mm:ss at/above one hour", () => {
		expect(formatCountdown(205_000, 900_000)).toBe("03:25");
		expect(formatCountdown(5_000, 900_000)).toBe("00:05");
		expect(formatCountdown(900_000, 900_000)).toBe("15:00");
		expect(formatCountdown(18_733_000, 86_400_000)).toBe("5:12:13");
		expect(formatCountdown(-100, 900_000)).toBe("00:00");
	});
});

describe("TimeframeFooter countdown", () => {
	it("renders countdown for clock-aligned frames", () => {
		act(() => { root?.render(createElement(TimeframeFooter, { timeframe: "15m" })); });
		const el = container?.querySelector('[data-testid="footer-countdown"]');
		expect(el).not.toBeNull();
		expect(el?.textContent).toMatch(/^◷\d{2}:\d{2}$/);
	});
	it("hides countdown for monthly/unknown frames", () => {
		act(() => { root?.render(createElement(TimeframeFooter, { timeframe: "1M" })); });
		expect(container?.querySelector('[data-testid="footer-countdown"]')).toBeNull();
		act(() => { root?.render(createElement(TimeframeFooter, {})); });
		expect(container?.querySelector('[data-testid="footer-countdown"]')).toBeNull();
	});
});

describe("useNow shared ticker (V-04)", () => {
	it("two consumers always read the same timestamp", () => {
		vi.useFakeTimers();
		try {
			const seen: number[] = [];
			function Probe() {
				seen.push(useNow());
				return null;
			}
			act(() => {
				root?.render(
					createElement("div", null, createElement(Probe, { key: "a" }), createElement(Probe, { key: "b" })),
				);
			});
			const first = seen.slice(-2);
			expect(first[0]).toBe(first[1]);
			act(() => {
				vi.advanceTimersByTime(2500);
			});
			const last = seen.slice(-2);
			expect(last[0]).toBe(last[1]);
			expect(last[0]).toBeGreaterThan(first[0]);
		} finally {
			vi.useRealTimers();
		}
	});
});
