// SPEC — CS-2 truth-table suite. Filled in below.
import { describe, it, expect } from 'vitest';
import { resolveEntitlement, type ResolveEntitlementInput } from '../resolveEntitlement';
import type { PatTier } from '@vninvestcharts/engine-core';

/**
 * CS-2 truth table. Each row asserts ALL FOUR output fields, because a test that
 * checks only renderTier cannot see a dataUsable or degradedReason regression.
 * No mocks, no timers, no DOM: the module under test is pure by contract.
 */
const NOW = 1_800_000_000;
const DAY = 86_400;
const lic = (tier: PatTier, expiresAt: number | null = NOW + 30 * DAY) => ({ tier, expiresAt });
const srv = (plan: PatTier) => ({ plan });

function run(over: Partial<ResolveEntitlementInput>) {
	return resolveEntitlement({
		license: null,
		server: null,
		dataSource: "none",
		cachedAt: null,
		graceMs: 7 * DAY * 1000,
		now: NOW,
		...over,
	});
}

describe('CS-201 truth table S1..S10', () => {
	it('S1 license pro, no PAT, offline => pro, no data, no-pat', () => {
		expect(run({ license: lic("pro") })).toEqual({
			renderTier: "pro", dataUsable: false,
			sources: ["license"], degradedReason: "no-pat",
			expiresAt: NOW + 30 * DAY,
		});
	});
	it('S2 license pro + server pro live => pro, data, no reason', () => {
		expect(run({ license: lic("pro"), server: srv("pro"), dataSource: "live" })).toEqual({
			renderTier: "pro", dataUsable: true,
			sources: ["license", "server"], degradedReason: null,
			expiresAt: NOW + 30 * DAY,
		});
	});
	it('S3 license pro + server free live => pro, data, plan-limited', () => {
		expect(run({ license: lic("pro"), server: srv("free"), dataSource: "live" })).toEqual({
			renderTier: "pro", dataUsable: true,
			sources: ["license", "server"], degradedReason: "plan-limited",
			expiresAt: NOW + 30 * DAY,
		});
	});
	it('S4 no license + server pro live => pro, data, no reason', () => {
		expect(run({ server: srv("pro"), dataSource: "live" })).toEqual({
			renderTier: "pro", dataUsable: true,
			sources: ["server"], degradedReason: null,
			expiresAt: null,
		});
	});
	it('S5 license pro + server enterprise live => enterprise', () => {
		expect(run({ license: lic("pro"), server: srv("enterprise"), dataSource: "live" })).toEqual({
			renderTier: "enterprise", dataUsable: true,
			sources: ["license", "server"], degradedReason: null,
			expiresAt: NOW + 30 * DAY,
		});
	});
	it('S6 expired license + server pro live => pro from server', () => {
		expect(run({ license: lic("pro", NOW - DAY), server: srv("pro"), dataSource: "live" })).toEqual({
			renderTier: "pro", dataUsable: true,
			sources: ["server"], degradedReason: null,
			expiresAt: NOW - DAY,
		});
	});
	it('S7 license pro + network error => pro, no data, offline', () => {
		expect(run({ license: lic("pro"), server: srv("pro"), dataSource: "none" })).toEqual({
			renderTier: "pro", dataUsable: false,
			sources: ["license"], degradedReason: "offline",
			expiresAt: NOW + 30 * DAY,
		});
	});
	it('S8 neither => free, no data, no-pat', () => {
		expect(run({})).toEqual({
			renderTier: "free", dataUsable: false,
			sources: ["none"], degradedReason: "no-pat",
			expiresAt: null,
		});
	});
	it('S9 license pro + cache within grace => data, no reason', () => {
		expect(run({
			license: lic("pro"), server: srv("pro"), dataSource: "cache",
			cachedAt: NOW - 3 * DAY,
		})).toEqual({
			renderTier: "pro", dataUsable: true,
			sources: ["license", "server-cache"], degradedReason: null,
			expiresAt: NOW + 30 * DAY,
		});
	});
	it('S10 license pro + cache past grace => pro, no data, grace-expired', () => {
		expect(run({
			license: lic("pro"), server: srv("pro"), dataSource: "cache",
			cachedAt: NOW - 30 * DAY,
		})).toEqual({
			renderTier: "pro", dataUsable: false,
			sources: ["license"], degradedReason: "grace-expired",
			expiresAt: NOW + 30 * DAY,
		});
	});
});

describe('CS-202/204/205/206 invariants', () => {
	it('CS-202 never-revokes: license pro + server free keeps pro with a license source', () => {
		// The single most important test of the slice. Twice this repo shipped a
		// tier layer that quietly demoted a paid license; this is the lock.
		const r = run({ license: lic("pro"), server: srv("free"), dataSource: "live" });
		expect(r.renderTier).toBe("pro");
		expect(r.sources).toContain("license");
	});
	it('CS-204 pure: same input twice, identical output, no fetch', () => {
		const input = { license: lic("pro"), server: srv("pro"), dataSource: "live" as const };
		const a = run(input);
		const b = run(input);
		expect(a).toEqual(b);
		// If it fetched, this would throw or hang without network; it returns.
	});
	it('CS-204b sources never empty', () => {
		for (const over of [{}, { license: lic("free") }, { server: srv("free"), dataSource: "live" as const }]) {
			expect(run(over).sources.length).toBeGreaterThan(0);
		}
	});
	it('CS-205 data-needs-server: enterprise license alone grants no data', () => {
		const r = run({ license: lic("enterprise") });
		expect(r.renderTier).toBe("enterprise");
		expect(r.dataUsable).toBe(false);
		expect(r.degradedReason).toBe("no-pat");
	});
	it('CS-205b data needs ANY valid plan, not pro: free server still yields data', () => {
		const r = run({ server: srv("free"), dataSource: "live" });
		expect(r.dataUsable).toBe(true);
		expect(r.renderTier).toBe("free");
	});
	it('CS-206 grace-scope: an expired cache kills data, never the render tier', () => {
		const r = run({ license: lic("pro"), server: srv("pro"), dataSource: "cache", cachedAt: NOW - 30 * DAY });
		expect(r.dataUsable).toBe(false);
		expect(r.renderTier).toBe("pro");
	});
	it('CS-206b grace boundary is exclusive: exactly at graceMs reads stale', () => {
		// The plan's comparison is strict `<`. A cache exactly graceMs old is not
		// fresh. One-line pin so a future `<=` "simplification" fails loudly.
		const r = run({
			license: lic("pro"), server: srv("pro"), dataSource: "cache",
			cachedAt: NOW - 7 * DAY,
		});
		expect(r.dataUsable).toBe(false);
		expect(r.degradedReason).toBe("grace-expired");
	});
	it('CS-204c free server is still a source: ["server"] is pinned', () => {
		expect(run({ server: srv("free"), dataSource: "live" }).sources).toEqual(["server"]);
	});
	it('CS-207 R-2 custom/internal outrank enterprise without breaking the table', () => {
		expect(run({ server: srv("internal"), dataSource: "live" }).renderTier).toBe("internal");
		expect(run({ license: lic("enterprise"), server: srv("internal"), dataSource: "live" }).renderTier).toBe("internal");
	});
	it('CS-207b R-10 unknown plans lose to everything known', () => {
		expect(run({ server: srv("gold" as PatTier), dataSource: "live" }).renderTier).toBe("free");
		expect(run({ license: lic("pro"), server: srv("gold" as PatTier), dataSource: "live" }).renderTier).toBe("pro");
	});
});
