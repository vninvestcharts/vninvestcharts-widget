import { hasCapability, type PatTier } from "@vninvestcharts/engine-core";
import type { DockTabId } from "./RightSidebarDockHost";

export type DockAccessMode = "full" | "nudge";

/** Tabs reserved for pro tier when the dock gate is on. */
export const DOCK_PRO_TABS: readonly DockTabId[] = ["tape", "advisory", "orderTicket", "objects"];

/** Tabs visible without pro (informational for hosts; free tier sees the nudge instead). */
export const DOCK_FREE_TABS: readonly DockTabId[] = ["watchlist", "dataWindow"];

/**
 * Resolve right-dock access.
 * - `dockTierGate === false` → legacy full dock for every tier (host opt-out).
 * - có capability `dock_pro` → full dock.
 * - otherwise (free/none + gate on) → upgrade nudge, dock chunk never fetched.
 *
 * W0.2: trước đây dùng `tier === "pro"` — `enterprise`/`custom`/`internal` bị chặn
 * pro dock dù đã trả tiền (bug mất doanh thu). Nay dùng `hasCapability` (SSOT
 * `capabilities.ts`), nên mọi tier ≥ pro đều mở.
 */
export function resolveDockAccess(
	tier: string | null | undefined,
	dockTierGate: boolean | undefined,
): { mode: DockAccessMode; allowedTabs: readonly DockTabId[] } {
	if (dockTierGate === false) {
		return { mode: "full", allowedTabs: [...DOCK_FREE_TABS, ...DOCK_PRO_TABS] };
	}
	if (hasCapability(tier as PatTier, "dock_pro")) {
		return { mode: "full", allowedTabs: [...DOCK_FREE_TABS, ...DOCK_PRO_TABS] };
	}
	return { mode: "nudge", allowedTabs: DOCK_FREE_TABS };
}
