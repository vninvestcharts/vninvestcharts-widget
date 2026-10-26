import { describe, expect, it } from "vitest";
import { resolveDockAccess, DOCK_PRO_TABS, DOCK_FREE_TABS } from "../dockAccess";

describe("resolveDockAccess (D6 tier gate)", () => {
	it("pro tier always gets full dock", () => {
		expect(resolveDockAccess("pro", true).mode).toBe("full");
		expect(resolveDockAccess("pro", undefined).mode).toBe("full");
		expect(resolveDockAccess("pro", false).mode).toBe("full");
	});

	it("free tier with gate on gets nudge (dock chunk never fetched)", () => {
		for (const tier of ["free", null, undefined, ""]) {
			expect(resolveDockAccess(tier, true).mode).toBe("nudge");
			expect(resolveDockAccess(tier, undefined).mode).toBe("nudge");
		}
	});

	it("gate off restores legacy full dock for every tier", () => {
		for (const tier of ["free", "pro", null, undefined]) {
			expect(resolveDockAccess(tier, false).mode).toBe("full");
		}
	});

	it("tab mapping is declared in one place", () => {
		expect(DOCK_PRO_TABS).toContain("tape");
		expect(DOCK_PRO_TABS).toContain("orderTicket");
		expect(DOCK_FREE_TABS).toEqual(["watchlist", "dataWindow"]);
		expect(resolveDockAccess("free", true).allowedTabs).toEqual(["watchlist", "dataWindow"]);
	});

	// W0.2 regression lock: trước đây `dockAccess.ts:24` dùng `tier === "pro"` nên
	// enterprise/custom/internal (đã trả tiền) bị chặn pro dock. Nay dùng hasCapability.
	it("mọi tier >= pro đều mở full dock (regression lock bug === 'pro')", () => {
		for (const tier of ["pro", "enterprise", "custom", "internal"]) {
			expect(resolveDockAccess(tier, true).mode, `${tier} phải có full dock`).toBe("full");
			expect(resolveDockAccess(tier, undefined).mode, `${tier} phải có full dock`).toBe("full");
			expect(resolveDockAccess(tier, true).allowedTabs).toEqual([
				...DOCK_FREE_TABS,
				...DOCK_PRO_TABS,
			]);
		}
	});

	it("tier dưới pro vẫn bị chặn (fail-closed)", () => {
		for (const tier of ["none", "free", "starter", null, undefined, "", "bogus"]) {
			expect(resolveDockAccess(tier, true).mode, `${tier} phải bị chặn`).toBe("nudge");
		}
	});

	it("starter KHÔNG được pro dock dù đã trả tiền (starter < pro)", () => {
		expect(resolveDockAccess("starter", true).mode).toBe("nudge");
	});
});
