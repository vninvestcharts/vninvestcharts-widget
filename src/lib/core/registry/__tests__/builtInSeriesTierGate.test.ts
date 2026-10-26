import { describe, expect, it } from "vitest";

import { initRegistry } from "../registerAll";
import { filterPanesBySeriesTier } from "../filterPanesBySeriesTier";
import { getSeriesTier } from "../registryCore";
import type { PaneDescriptor } from "../../types/pane-descriptor";

/**
 * W-01 — the render gate covers ALL series types, not just Pine (PINE STAGE 2).
 *
 * Stage 1 item 1.7 gated only runtime-generated Pine types; the 9 paid BUILT-IN
 * types passed `filterPanesBySeriesTier` untouched at every tier (PROBE B: 10/10
 * kept by identity at "free"). This file locks the restoration: every assertion is
 * an EXACT equality, never a subset, so a registration that silently changes tier
 * breaks the value it breaks — not some nearby count.
 *
 * PROBE C (the reason no paying customer needs notice): pro keeps 7/7, enterprise
 * keeps 9/9. Only Free loses anything, and Free was never entitled (Rule 15).
 */
initRegistry();

/** The remaining pro + 1 enterprise built-ins. P0-b (2026-10-15) moved VolumeProfile and
 *  Footprint out of these lists to Community; see `P0B_MOVED_TO_FREE` below. */
const PRO_TYPES = [
	"Baseline",
	"Renko",
	"Kagi",
	"PointAndFigure",
	"LineBreak",
	"MarketProfile",
] as const;
const ENTERPRISE_TYPES = ["DeltaProfile"] as const;
/**
 * Moved to Community by P0-b (2026-10-15). Engine `capabilities.ts:138-139` declares
 * `volume_profile` and `volume_footprint` as `"none"`; gating a feature that already runs
 * for free is a Rule 15 violation, not a revenue gain. Listed separately so the change is
 * visible in this file rather than silently reshaping FREE_TYPES.
 */
const P0B_MOVED_TO_FREE = ["VolumeProfile", "Footprint"] as const;
/** Free controls: registered, and free by default (no `tier` field). */
const FREE_TYPES = ["Candlestick", "Line", "EMA"] as const;
const ALL_FREE_TYPES = [...FREE_TYPES, ...P0B_MOVED_TO_FREE] as const;

/** One pane holding every paid type plus the free controls, in a fixed order. */
function fullPane(): PaneDescriptor {
	const types = [...ALL_FREE_TYPES, ...PRO_TYPES, ...ENTERPRISE_TYPES];
	return {
		id: "price",
		series: types.map((type, index) => ({ id: `${type}-${index}`, type, yAxis: "right" })),
	} as unknown as PaneDescriptor;
}

function survivingTypes(panes: readonly PaneDescriptor[], tier: "free" | "pro" | "enterprise"): string[] {
	return filterPanesBySeriesTier(panes, tier).flatMap((pane) =>
		(pane.series ?? []).map((s) => String(s.type)),
	);
}

describe("W-01 built-in series tier gate", () => {
	it("pins the mutant target: paid registrations carry their tier, free types carry none", () => {
		for (const type of PRO_TYPES) {
			expect(getSeriesTier(type as never), type).toBe("pro");
		}
		for (const type of ENTERPRISE_TYPES) {
			expect(getSeriesTier(type as never), type).toBe("enterprise");
		}
		for (const type of FREE_TYPES) {
			expect(getSeriesTier(type as never), type).toBe("free");
		}
	});

	it("free keeps 0 paid and every free type (exact equality, not subset)", () => {
		// "0 paid" no longer means "no VolumeProfile/Footprint" — P0-b moved those to Community.
		expect(survivingTypes([fullPane()], "free")).toEqual([...ALL_FREE_TYPES]);
	});

	it("pro keeps every pro type and drops enterprise", () => {
		expect(survivingTypes([fullPane()], "pro")).toEqual([...ALL_FREE_TYPES, ...PRO_TYPES]);
	});

	it("enterprise keeps every remaining paid type", () => {
		expect(survivingTypes([fullPane()], "enterprise")).toEqual([
			...ALL_FREE_TYPES,
			...PRO_TYPES,
			...ENTERPRISE_TYPES,
		]);
	});

	it("P0-b: VolumeProfile and Footprint are reachable at free — the point of the change", () => {
		for (const type of P0B_MOVED_TO_FREE) {
			expect(getSeriesTier(type as never), `${type} must be Community after P0-b`).toBe("free");
		}
		// And the types P0-b deliberately left alone keep their paid tier.
		expect(getSeriesTier("MarketProfile" as never)).toBe("pro");
		expect(getSeriesTier("DeltaProfile" as never)).toBe("enterprise");
	});

	it("returns the input array by identity when nothing is dropped (memo fast-path)", () => {
		const panes = [fullPane()];
		expect(filterPanesBySeriesTier(panes, "enterprise")).toBe(panes);
		const freeOnly: PaneDescriptor[] = [
			{
				id: "price",
				series: [...FREE_TYPES].map((type, index) => ({ id: `${type}-${index}`, type, yAxis: "right" })),
			} as unknown as PaneDescriptor,
		];
		expect(filterPanesBySeriesTier(freeOnly, "free")).toBe(freeOnly);
	});

	it("allocates a new array when something IS dropped (and keeps the length contract)", () => {
		const panes = [fullPane()];
		const gated = filterPanesBySeriesTier(panes, "free");
		expect(gated).not.toBe(panes);
		expect(gated).toHaveLength(panes.length);
	});

	it("unregistered (orphan Pine) types are dropped at EVERY tier — fail-closed", () => {
		const orphan: PaneDescriptor[] = [
			{ id: "price", series: [{ id: "x", type: "pine_deletedid", yAxis: "right" }] } as unknown as PaneDescriptor,
		];
		for (const tier of ["free", "pro", "enterprise"] as const) {
			expect(survivingTypes(orphan, tier), tier).toEqual([]);
		}
	});
});
