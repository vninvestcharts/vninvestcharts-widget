// UI-P4 unit lock: flush-left legend offset, auto-shift on left axis.
import { describe, expect, it } from "vitest";
import { resolveGlobalLeftAxisWidth, resolveLeftAxisWidth } from "../useWidgetOverlays";
import { DOCKED_TOOLBAR_OFFSET_PX, RAIL_GRIP_PX, resolveHasLeftAxis, resolveRailReservePx } from "../overlays/overlayHelpers";

describe("resolveLeftAxisWidth (UI-P4)", () => {
	it("returns 0 when no left axis exists (flush legend, no 48px gap)", () => {
		expect(resolveLeftAxisWidth({})).toBe(0);
		expect(resolveLeftAxisWidth({ right: { top: 0, left: 0, width: 48, height: 100 } })).toBe(0);
		expect(resolveLeftAxisWidth(undefined)).toBe(0);
	});

	it("returns the real axis width when a left axis appears", () => {
		expect(resolveLeftAxisWidth({ left: { top: 0, left: 0, width: 64, height: 100 } })).toBe(64);
	});
});

describe("resolveGlobalLeftAxisWidth (VOL_FIX)", () => {
	const bounds = (width: number) => ({ top: 0, left: 0, width, height: 100 });
	const snapshot = (paneId: string, axisBounds: any) => ({ paneId, axisBounds }) as any;

	it("returns 0 when no pane owns a left axis (flush-left preserved)", () => {
		expect(resolveGlobalLeftAxisWidth(undefined)).toBe(0);
		expect(resolveGlobalLeftAxisWidth([])).toBe(0);
		expect(
			resolveGlobalLeftAxisWidth([
				snapshot("price", { right: bounds(48) }),
				snapshot("volume", { right: bounds(48) }),
			]),
		).toBe(0);
	});

	it("returns the max left width so a Vol pane without its own left axis still shifts", () => {
		// Regression: per-pane width left the Vol header at padding 0 inside
		// the left-axis zone (under the docked drawing toolbar) as soon as
		// the price pane gained a left axis. The header offset must follow
		// the global plot shift instead.
		expect(
			resolveGlobalLeftAxisWidth([
				snapshot("price", { left: bounds(60), right: bounds(68) }),
				snapshot("volume", { right: bounds(68) }),
			]),
		).toBe(60);
	});

	it("accepts a Map iterator (paneSnapshotMap.values())", () => {
		const map = new Map([
			["price", snapshot("price", { left: bounds(48) })],
			["volume", snapshot("volume", { right: bounds(48) })],
		]);
		expect(resolveGlobalLeftAxisWidth(map.values())).toBe(48);
	});
});

describe("resolveRailReservePx (RAIL-GUTTER)", () => {
	it("reserves full rail width only while locked, grip strip while auto-hiding", () => {
		expect(resolveRailReservePx(true, true)).toBe(DOCKED_TOOLBAR_OFFSET_PX);
		expect(resolveRailReservePx(true, true, true)).toBe(DOCKED_TOOLBAR_OFFSET_PX);
		expect(resolveRailReservePx(true, false)).toBe(RAIL_GRIP_PX);
		expect(RAIL_GRIP_PX).toBeLessThan(DOCKED_TOOLBAR_OFFSET_PX);
	});

	it("SYM-AXIS: reserves nothing while auto-hiding with a left axis (gutter hosts the grip)", () => {
		expect(resolveRailReservePx(true, false, true)).toBe(0);
	});

	it("reserves nothing without a rail", () => {
		expect(resolveRailReservePx(false, false)).toBe(0);
		expect(resolveRailReservePx(false, true)).toBe(0);
		expect(resolveRailReservePx(undefined, undefined)).toBe(0);
	});
});

describe("resolveHasLeftAxis (SYM-AXIS)", () => {
	const leftSnapshot: any = { axisBounds: { left: { width: 48 } } };
	const rightOnlySnapshot: any = { axisBounds: { right: { width: 48 } } };
	const leftPane: any = { series: [{ visible: true, yAxis: "left" }] };
	const rightPane: any = { series: [{ visible: true, yAxis: "right" }] };

	it("prefers live snapshots over descriptors", () => {
		expect(resolveHasLeftAxis([leftSnapshot], [rightPane])).toBe(true);
		expect(resolveHasLeftAxis([rightOnlySnapshot], [leftPane])).toBe(false);
	});

	it("falls back to descriptors before first paint", () => {
		expect(resolveHasLeftAxis([], [leftPane])).toBe(true);
		expect(resolveHasLeftAxis(undefined, [rightPane])).toBe(false);
		expect(resolveHasLeftAxis(undefined, undefined)).toBe(false);
	});

	it("ignores hidden series in descriptors", () => {
		expect(resolveHasLeftAxis([], [{ series: [{ visible: false, yAxis: "left" }] }])).toBe(false);
	});
});
