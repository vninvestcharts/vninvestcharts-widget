import { describe, expect, it } from "vitest";
import {
	ALL_CAPABILITIES,
	capabilitiesFor,
	hasCapability,
	minTierFor,
	type Capability,
} from "@vninvestcharts/engine-core";
import { resolveDockAccess } from "../components/dock/dockAccess";

/**
 * Regression lock cho tầng gate của widget (W0.1 DoD §2.1).
 *
 * Mục tiêu: đảm bảo khi thêm capability mới vào `capabilities.ts`, các gate đang
 * chạy ở widget vẫn phản ánh đúng — và ngược lại, khi hạ ngưỡng một capability
 * (ví dụ sau khi EP tới) thì gate ở widget không bị bỏ sót.
 *
 * Nguyên tắc fail-closed: `none` (chưa xác minh) chỉ được Community.
 */

const COMMUNITY: Capability[] = [
	"basic_chart", "common_indicators", "basic_drawing", "watchlist",
	"paper_market_limit", "data_window", "i18n", "theme",
];

describe("widget gate: dock phản ánh capability matrix", () => {
	it("mọi capability mới trong matrix đều phải được phản ánh ở đâu đó", () => {
		// Không phải mọi capability đều là dock tab — nhưng phải có ít nhất một
		// test cho mỗi ngưỡng "pro" để tránh thêm capability mà không ai gate.
		const proOnly = ALL_CAPABILITIES.filter((c: Capability) => minTierFor(c) === "pro");
		// 23 -> 20 on 2026-10-12: `indicator_histogram`, `indicator_advanced` and
		// `session_hours` were lowered to `none` (the promise was withdrawn because all
		// three run for every tier — same call as the six in `13.03` §2). The threshold is
		// a liveness smoke check, not a correctness invariant; the per-capability lock is
		// `audit:paid-capability`, which fails on any paid capability without a gate.
		//
		// 20 -> 19 on 2026-10-22: `smart_drawing_pro` was lowered to `none` (decision D2,
		// `PLAN_DEV_PHASE_OFFICIAL_2026-10-22.md`). The 16 TIER-16 drawing tools were
		// already shipped unminified in `engine-drawing@2.2.0`, so the Pro gate withheld
		// nothing and only removed 16 working tools from free users.
		expect(proOnly.length).toBeGreaterThanOrEqual(19);
		// dock_pro là một trong số đó và phải được kiểm bằng resolveDockAccess.
		expect(proOnly).toContain("dock_pro");
	});

	it("enterprise mở dock (bug cũ chặn tier cao)", () => {
		expect(hasCapability("enterprise", "dock_pro")).toBe(true);
		expect(resolveDockAccess("enterprise", true).mode).toBe("full");
	});
});

describe("fail-closed: chưa xác minh tier thì chỉ Community", () => {
	it("none không có capability pro/enterprise nào", () => {
		const none = new Set(capabilitiesFor("none"));
		for (const cap of ALL_CAPABILITIES) {
			const min = minTierFor(cap);
			if (min === "pro" || min === "enterprise") {
				expect(none.has(cap), `${cap} phải bị chặn ở none`).toBe(false);
			}
		}
	});

	it("null/undefined tier ⇒ chỉ Community, KHÔNG mở gì bán được", () => {
		// W0.5 quyết định: `null` (chưa xác minh) ≡ `none` (thấp nhất).
		// Fail-closed cho pro+, nhưng Community mở — AGENTS.md Rule 15.
		for (const tier of [null, undefined]) {
			for (const cap of ALL_CAPABILITIES) {
				const min = minTierFor(cap);
				const expected = min === "none";
				expect(hasCapability(tier, cap), `${String(tier)} / ${cap}`).toBe(expected);
			}
		}
	});

	it("capabilitiesFor(null) khớp capabilitiesFor('none')", () => {
		expect(capabilitiesFor(null)).toEqual(capabilitiesFor("none"));
	});

	it("Community không bao giờ bị đóng, kể cả none", () => {
		for (const cap of COMMUNITY) {
			for (const tier of ["none", "free", "starter", "pro", "enterprise", "custom", "internal"] as const) {
				expect(hasCapability(tier, cap), `${cap} @ ${tier}`).toBe(true);
			}
		}
	});
});

describe("Track A (pro) không được phụ thuộc Track B (enterprise)", () => {
	const TRACK_B: Capability[] = [
		"adjusted_bars", "cloud_alert", "webhook", "orderbook_dom", "fundamentals_full",
		"index_constituents", "deep_history", "server_pine", "server_workspace",
		"realtime_tick", "whale_campaign", "portfolio_analytics",
	];

	it("pro đóng toàn bộ Track B", () => {
		for (const cap of TRACK_B) {
			expect(hasCapability("pro", cap), `${cap} phải chờ backend`).toBe(false);
		}
	});

	it("enterprise mở toàn bộ Track B", () => {
		for (const cap of TRACK_B) {
			expect(hasCapability("enterprise", cap), `${cap} cần enterprise`).toBe(true);
		}
	});
});
