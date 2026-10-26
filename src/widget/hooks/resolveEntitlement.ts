/**
 * CS-2 — the single Entitlement Decision Point.
 *
 * One pure function answers "what may this user do" from two independent
 * channels: an offline signed license and a server answer. Neither channel can
 * remove the other's grants; the output names every source so support can audit
 * "why does this user have Pro?".
 *
 * SCOPE NOTE — HISTORY, READ THIS BEFORE "FIXING" IT. This module shipped first as a
 * pure function with no callers (CS-2), then got wired (CS-3). The note that used to
 * sit here said "deliberately NOT wired into the context yet" — that became **false**
 * the moment CS-3 landed, and a stale "this is dead code" comment is worse than no
 * comment: it invites deleting the single entitlement decision point.
 *
 * Verified live call sites (2026-10-08):
 *   src/widget/contexts/SaaSFeatureContext.tsx:601  server answered  -> 'live'
 *   src/widget/contexts/SaaSFeatureContext.tsx:670  no server, no net -> 'none'
 *   src/widget/contexts/SaaSFeatureContext.tsx:682  license only      -> 'none'
 *
 * What is still NOT wired: the `server-cache` source and `graceMs`. All three call
 * sites pass `live` or `none`, so the freshness arithmetic below has no production
 * caller yet. Recorded in 13.02-technical-debt-register.md rather than left as a
 * comment here, so it can be closed by a measured change.
 *
 * Client-side checks are a speed bump, not a boundary. Knowing this does not
 * weaken it; pretending otherwise is how teams burn weeks on obfuscation.
 */
import { planToTier, hasMinTier, type PatTier } from '@vninvestcharts/engine-core';

export type EntitlementSource = "license" | "server" | "server-cache" | "host" | "none";

/**
 * Where the server object came from. A boolean cannot express "the server
 * answered just now" versus "replaying a three-day-old answer", so a previous
 * draft's `graceExpired` flag contradicted its own truth table twice. Provenance
 * plus freshness, together, or the criterion is unimplementable.
 */
export type DataSourceKind = "live" | "cache" | "none";

export interface ResolveEntitlementInput {
	license: { tier: PatTier; expiresAt: number | null; serial?: string } | null;
	server: { plan: PatTier } | null;
	dataSource: DataSourceKind;
	/** Epoch seconds the cached answer was fetched. Required iff dataSource==="cache". */
	cachedAt: number | null;
	/** Cached answers older than this are ignored. Caller-owned; not in the resolver. */
	graceMs: number;
	now: number;
}

export interface ResolvedEntitlement {
	/** Union with attribution: max(licenseTier, serverTier). Nobody revokes anybody. */
	renderTier: PatTier;
	/**
	 * Server data reachable and usable. A SINGLE boolean on purpose: an earlier
	 * draft's five-key object had no consumer and duplicated SaaSFeatureFlags.
	 * Requires only a valid token at ANY plan — gating this on pro would take
	 * chart data away from free users, which is a regression, not a gate.
	 */
	dataUsable: boolean;
	/** Every grant that contributed, so "why Pro?" is answerable. Never empty. */
	sources: EntitlementSource[];
	/**
	 * Offline banner reason. `plan-limited` means the token is valid but the plan
	 * is low — never "rejected", which would lie about a valid token.
	 */
	degradedReason: "no-pat" | "plan-limited" | "offline" | "grace-expired" | null;
	/** Epoch seconds, or null when nothing grants. */
	expiresAt: number | null;
}

/**
 * Rank on the engine ordering. The engine normalises unknown strings to "none"
 * (patTier.ts), so the -1 arm below is defensive and unreachable through the
 * public input type — it exists so a future engine change that stops normalising
 * still fails toward the lower grant rather than throwing inside a max().
 */
function rankOf(tier: PatTier): number {
	const order: PatTier[] = ["none", "free", "starter", "pro", "enterprise", "custom", "internal"];
	const i = order.indexOf(planToTier(tier));
	return i === -1 ? -1 : i;
}

function higherTier(a: PatTier, b: PatTier): PatTier {
	if (rankOf(a) < 0 && rankOf(b) < 0) return "free";
	return hasMinTier(planToTier(a), planToTier(b)) ? a : b;
}

function licenseTierAt(input: ResolveEntitlementInput): PatTier {
	const { license, now } = input;
	if (!license) return "free";
	if (license.expiresAt !== null && license.expiresAt <= now) return "free";
	return planToTier(license.tier);
}

export function resolveEntitlement(input: ResolveEntitlementInput): ResolvedEntitlement {
	const { server, dataSource, cachedAt, graceMs, now } = input;

	const fresh =
		dataSource === "live" ||
		// cachedAt and now are epoch SECONDS; graceMs is milliseconds. Comparing
		// mixed units always reads fresh, which is how an expired cache silently
		// kept granting data in the first draft. Convert once, here, nowhere else.
		(dataSource === "cache" && cachedAt !== null && (now - cachedAt) * 1000 < graceMs);

	// Any valid plan, including free. dataUsable answers "is there server data",
	// not "is the plan high". The pro requirement lives in the feature flags.
	const dataUsable = fresh && server !== null;

	const licenseTier = licenseTierAt(input);
	const serverTier: PatTier = server ? planToTier(server.plan) : "free";
	const renderTier = higherTier(licenseTier, serverTier);

	const sources: EntitlementSource[] = [];
	if (rankOf(licenseTier) > rankOf("free" as PatTier)) sources.push("license");
	if (server !== null && dataSource === "live") sources.push("server");
	if (server !== null && dataSource === "cache" && fresh) sources.push("server-cache");
	if (sources.length === 0) sources.push("none");

	let degradedReason: ResolvedEntitlement["degradedReason"];
	if (dataUsable) {
		degradedReason = rankOf(serverTier) < rankOf("pro" as PatTier) ? "plan-limited" : null;
	} else if (server === null) {
		degradedReason = "no-pat";
	} else if (dataSource === "none") {
		degradedReason = "offline";
	} else {
		degradedReason = "grace-expired";
	}

	return {
		renderTier,
		dataUsable,
		sources,
		degradedReason,
		expiresAt: input.license?.expiresAt ?? null,
	};
}
