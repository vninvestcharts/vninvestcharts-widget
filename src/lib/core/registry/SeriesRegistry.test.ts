import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSeriesStyleOverride, clearSeriesStyleOverrides, getSeriesStyleOverride, listSeriesStyleOverrides, overrideSeriesStyle, subscribeSeriesStyle, subscribeSeriesStyleChanges } from "./SeriesRegistry";

afterEach(() => {
	clearSeriesStyleOverrides();
	vi.restoreAllMocks();
});

describe("series style override registry", () => {
	it("sets and merges overrides per instance", () => {
		overrideSeriesStyle("ema-1", { color: "#ff0000" });
		overrideSeriesStyle("ema-1", { lineWidth: 2 });

		expect(getSeriesStyleOverride("ema-1")).toEqual({ color: "#ff0000", lineWidth: 2 });
		expect(listSeriesStyleOverrides()).toEqual({
			"ema-1": { color: "#ff0000", lineWidth: 2 },
		});
	});

	it("clears overrides and notifies subscribers", () => {
		const perInstance = vi.fn();
		const global = vi.fn();
		const unsubscribeInstance = subscribeSeriesStyle("ema-2", perInstance);
		const unsubscribeGlobal = subscribeSeriesStyleChanges(global);

		overrideSeriesStyle("ema-2", { color: "#00ff00" });
		clearSeriesStyleOverride("ema-2");

		expect(perInstance).toHaveBeenCalledTimes(2);
		expect(global).toHaveBeenCalledTimes(2);
		expect(getSeriesStyleOverride("ema-2")).toBeUndefined();

		unsubscribeInstance();
		unsubscribeGlobal();
	});

	// W-16. The registry is a module-level Map, so the only thing standing between
	// "two widgets on one page" and "chart A restyles chart B" is that every entry is
	// keyed by instanceId. That is the invariant, and nothing above tests it: the
	// existing cases use a single instanceId throughout, so a regression that dropped
	// the key - reading from a single shared slot - would still pass all of them.
	// Measured, not assumed: this is what the module does today, and the lock is what
	// keeps it true.
	it("keeps two instances isolated from each other", () => {
		overrideSeriesStyle("chart-A", { color: "#ff0000" });
		overrideSeriesStyle("chart-B", { color: "#0000ff" });

		expect(getSeriesStyleOverride("chart-A")).toEqual({ color: "#ff0000" });
		expect(getSeriesStyleOverride("chart-B")).toEqual({ color: "#0000ff" });

		// Clearing one must not touch the other. A shared-slot implementation would
		// leave both empty here.
		clearSeriesStyleOverride("chart-A");
		expect(getSeriesStyleOverride("chart-A")).toBeUndefined();
		expect(getSeriesStyleOverride("chart-B")).toEqual({ color: "#0000ff" });
	});

	it("notifies only the instance that changed", () => {
		const chartA = vi.fn();
		const chartB = vi.fn();
		const unsubscribeA = subscribeSeriesStyle("chart-A", chartA);
		const unsubscribeB = subscribeSeriesStyle("chart-B", chartB);

		overrideSeriesStyle("chart-A", { lineWidth: 3 });

		// The per-instance fan-out is the point: chart B must not re-render because
		// chart A was restyled, or a large dashboard pays N times for one user's click.
		expect(chartA).toHaveBeenCalledTimes(1);
		expect(chartB).not.toHaveBeenCalled();

		unsubscribeA();
		unsubscribeB();
	});

	it("hands out a copy, so a caller cannot mutate another instance's style", () => {
		overrideSeriesStyle("chart-A", { color: "#ff0000" });

		const leaked = getSeriesStyleOverride("chart-A")!;
		leaked.color = "#00ff00";

		// getSeriesStyleOverride clones on the way out. Without that clone, a consumer
		// mutating what it was handed would silently rewrite chart A's style with no
		// notification, so the change would not even re-render.
		expect(getSeriesStyleOverride("chart-A")).toEqual({ color: "#ff0000" });
	});
});