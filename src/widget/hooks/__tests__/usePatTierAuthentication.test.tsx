/**
 * usePatTierAuthentication regression lock (Step 1: fail-closed + standalone mode).
 *
 * Locks:
 * - SEC-01: `vni_pro_hack` prefix grants NOTHING without a server (standalone).
 * - Standalone mode performs ZERO network requests (no placeholder-base spam).
 * - Backend configured + server plan=pro -> pro tier + gated PAT forwarded to engine.
 * - Backend 403/unreachable -> free (fail-closed).
 * - debugFeatures mock applies in non-production, ignored in production.
 */
import { webcrypto } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { act, createElement } from "react";
import { setLicensePublicKey, resetLicensePublicKey } from "@vninvestcharts/engine-core";
import { SaaSFeatureProvider } from "../../contexts/SaaSFeatureContext";
import { hasExplicitBackend, usePatTierAuthentication, type PatTierAuth } from "../usePatTierAuthentication";
import { useFeatureGate } from "../useFeatureGate";
import type { SaaSFeatureFlags } from "../../types/saas";
import type { VNInvestClient } from "../../adapters/VNInvestClient";

const GLOBAL_BASE_KEY = "__VNI_API_BASE__";
const STORAGE_BASE_KEY = "vni_api_base";

// LIC-FIRST: real ECDSA P-256 keypair + sign helper (same harness as licenseActivation.test).
const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const FUTURE = Math.floor(Date.now() / 1000) + 86400 * 30;

function b64url(bytes: Uint8Array): string {
	let s = "";
	bytes.forEach((b) => { s += String.fromCharCode(b); });
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function makeSignedLicense(tier: "pro" | "enterprise"): Promise<string> {
	const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
	const pub = (await subtle.exportKey("jwk", pair.publicKey)) as { x: string; y: string };
	setLicensePublicKey({ kty: "EC", crv: "P-256", x: pub.x, y: pub.y });
	const payload = new TextEncoder().encode(JSON.stringify({ t: tier, e: FUTURE }));
	const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, payload);
	return `vni1.${b64url(payload)}.${b64url(new Uint8Array(sig))}`;
}

interface MountOpts {
	tenantPat?: string;
	debugFeatures?: Partial<SaaSFeatureFlags>;
	client?: VNInvestClient | null;
}

function mountAuth(opts?: MountOpts): { auth: () => PatTierAuth; whale: () => boolean; unmount: () => void } {
	let latestAuth: PatTierAuth | null = null;
	let latestWhale = false;
	function Harness() {
		latestAuth = usePatTierAuthentication({ client: opts?.client });
		latestWhale = useFeatureGate().checkFeature("isWhalePanelEnabled");
		return null;
	}
	const rendered = render(
		/* eslint-disable-next-line react/no-children-prop -- required prop: this provider's props type declares `children` as mandatory, so it must be passed in the config object; createElement's 3rd-argument form fails tsc. */
		createElement(SaaSFeatureProvider, {
			tenantPat: opts?.tenantPat,
			debugFeatures: opts?.debugFeatures,
			client: opts?.client ?? undefined,
			children: createElement(Harness),
		}),
	);
	return {
		auth: () => {
			if (!latestAuth) throw new Error("hook did not run");
			return latestAuth;
		},
		whale: () => latestWhale,
		unmount: rendered.unmount,
	};
}

async function flush() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

function stubFetch(plan: string | null, ok = true) {
	const fn = vi.fn(async () => ({
		ok,
		status: ok ? 200 : 403,
		json: async () => ({ plan }),
	}));
	vi.stubGlobal("fetch", fn);
	return fn;
}

function clearBackendSignals() {
	try { delete (globalThis as Record<string, unknown>)[GLOBAL_BASE_KEY]; } catch { /* ignore */ }
	try { localStorage.removeItem(STORAGE_BASE_KEY); } catch { /* ignore */ }
	try { localStorage.removeItem("vni_pat"); } catch { /* ignore */ }
}

beforeEach(() => {
	cleanup();
	localStorage.clear();
	sessionStorage.clear();
	clearBackendSignals();
});

afterEach(() => {
	cleanup();
	localStorage.clear();
	sessionStorage.clear();
	clearBackendSignals();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("hasExplicitBackend", () => {
	it("T1: standalone by default (no client, no overrides)", () => {
		expect(hasExplicitBackend()).toBe(false);
		expect(hasExplicitBackend(null)).toBe(false);
	});

	it("T2: operator-injected client counts as backend", () => {
		const client = { getBase: () => "https://backend.example" } as unknown as VNInvestClient;
		expect(hasExplicitBackend(client)).toBe(true);
	});

	it("T3: global base override counts as backend", () => {
		(globalThis as Record<string, unknown>)[GLOBAL_BASE_KEY] = "https://backend.example";
		expect(hasExplicitBackend()).toBe(true);
	});

	it("T4: stored base override counts as backend", () => {
		localStorage.setItem(STORAGE_BASE_KEY, "https://backend.example");
		expect(hasExplicitBackend()).toBe(true);
	});
});

describe("standalone fail-closed (SEC-01 lock)", () => {
	it("T5: vni_pro_hack resolves free with ZERO fetch", async () => {
		const fetchMock = stubFetch("pro");
		const mounted = mountAuth();
		const tier = await mounted.auth().validatePat("vni_pro_hack");
		expect(tier).toBe("free");
		expect(fetchMock).not.toHaveBeenCalled();
		mounted.unmount();
	});

	it("T6: toolbar + engine PAT stay free/empty for pro-prefix token", async () => {
		const fetchMock = stubFetch("pro");
		const mounted = mountAuth({ tenantPat: "vni_pro_bypass" });
		await flush();
		expect(mounted.auth().effectiveToolbarTier).toBe("free");
		expect(mounted.auth().enginePat).toBe("");
		expect(mounted.auth().isStandalone).toBe(true);
		expect(fetchMock).not.toHaveBeenCalled();
		mounted.unmount();
	});
});

describe("backend-configured validation", () => {
	it("T7: server plan=pro unlocks toolbar + forwards PAT to engine", async () => {
		(globalThis as Record<string, unknown>)[GLOBAL_BASE_KEY] = "https://backend.example";
		const fetchMock = stubFetch("pro");
		const mounted = mountAuth({ tenantPat: "vni_pro_real" });
		await flush();
		expect(mounted.auth().effectiveToolbarTier).toBe("pro");
		expect(mounted.auth().enginePat).toBe("vni_pro_real");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const rawCalls = fetchMock.mock.calls as unknown as Array<[unknown, { headers?: Record<string, string> }]>;
		const first = rawCalls[0];
		expect(first).toBeDefined();
		expect(String(first?.[0] ?? "")).toContain("/core/v1/auth/me");
		expect(first?.[1]?.headers?.Authorization).toBe("Bearer vni_pro_real");
		mounted.unmount();
	});

	it("T8: server 403 fails closed to free", async () => {
		(globalThis as Record<string, unknown>)[GLOBAL_BASE_KEY] = "https://backend.example";
		stubFetch(null, false);
		const mounted = mountAuth({ tenantPat: "vni_pro_real" });
		await flush();
		expect(mounted.auth().effectiveToolbarTier).toBe("free");
		expect(mounted.auth().enginePat).toBe("");
		mounted.unmount();
	});
});

describe("LIC-FIRST: signed license keys beat backend config (singlechart report)", () => {
	// Root cause: validatePat gated offline license behind `!hasExplicitBackend`.
	// With vni_api_base / __VNI_API_BASE__ present the license went to
	// `/core/v1/auth/me` → 401 → free, while SaaSFeatureContext settings still
	// resolve PRO offline → "settings PRO nhưng toolbar free".
	beforeEach(() => { resetLicensePublicKey(); });
	afterEach(() => { resetLicensePublicKey(); });

	it("L1: no backend + valid signed license -> pro, key forwarded, ZERO fetch", async () => {
		const key = await makeSignedLicense("pro");
		const fetchMock = stubFetch("free");
		const mounted = mountAuth({ tenantPat: key });
		await flush();
		expect(mounted.auth().effectiveToolbarTier).toBe("pro");
		expect(mounted.auth().enginePat).toBe(key);
		expect(mounted.auth().isStandalone).toBe(true);
		expect(fetchMock).not.toHaveBeenCalled();
		mounted.unmount();
	});

	it("L2 (THE BUG): backend configured + valid signed license -> pro, ZERO fetch", async () => {
		(globalThis as Record<string, unknown>)[GLOBAL_BASE_KEY] = "https://backend.example";
		const key = await makeSignedLicense("pro");
		const fetchMock = stubFetch("pro");
		const mounted = mountAuth({ tenantPat: key });
		await flush();
		expect(mounted.auth().effectiveToolbarTier).toBe("pro");
		expect(mounted.auth().enginePat).toBe(key);
		expect(fetchMock).not.toHaveBeenCalled();
		mounted.unmount();
	});

	it("L3: license is authoritative over what the server would say (server=free)", async () => {
		(globalThis as Record<string, unknown>)[GLOBAL_BASE_KEY] = "https://backend.example";
		const key = await makeSignedLicense("enterprise");
		const fetchMock = stubFetch("free");
		const mounted = mountAuth({ tenantPat: key });
		await flush();
		expect(mounted.auth().effectiveToolbarTier).toBe("enterprise");
		expect(mounted.auth().enginePat).toBe(key);
		expect(fetchMock).not.toHaveBeenCalled();
		mounted.unmount();
	});

	it("L4: backend configured + invalid-sig structural key -> free fail-closed, ZERO fetch", async () => {
		(globalThis as Record<string, unknown>)[GLOBAL_BASE_KEY] = "https://backend.example";
		// Registration needed so signature identity matters; structural key is unsigned.
		await makeSignedLicense("pro");
		const STRUCTURAL = `vni1.${b64url(new TextEncoder().encode(JSON.stringify({ t: "pro", e: FUTURE })))}.${b64url(new TextEncoder().encode("sig"))}`;
		const fetchMock = stubFetch("pro");
		const mounted = mountAuth({ tenantPat: STRUCTURAL });
		await flush();
		expect(mounted.auth().effectiveToolbarTier).toBe("free");
		expect(mounted.auth().enginePat).toBe("");
		expect(fetchMock).not.toHaveBeenCalled();
		mounted.unmount();
	});

	it("L5: valid license in storage (no PAT, no backend) -> toolbar tier pro, enginePat gated", async () => {
		// Regression lock: after the CS-1 storage split, effectivePat can never hold
		// a license, so a hook that only validates effectivePat reports free for a
		// license-only customer — settings PRO, toolbar free, "plan allows 2" banner.
		const key = await makeSignedLicense("pro");
		localStorage.setItem("vni_license_key", key);
		const mounted = mountAuth();
		await flush();
		expect(mounted.auth().effectiveToolbarTier).toBe("pro");
		// The validated license MUST reach the engine, otherwise toolbar says pro
		// while premium drawings stay locked. Gated means: the real credential when
		// validated, "" when not — never an unvalidated token.
		expect(mounted.auth().enginePat).toBe(key);
		mounted.unmount();
		localStorage.removeItem("vni_license_key");
	});
});

describe("downgrade banner + prod guard", () => {
	it("T9: pro -> free transition raises the downgrade banner", async () => {
		const mounted = mountAuth();
		act(() => { mounted.auth().handleTierValidated("pro"); });
		expect(mounted.auth().effectiveToolbarTier).toBe("pro");
		act(() => { mounted.auth().handleTierValidated("free"); });
		expect(mounted.auth().effectiveToolbarTier).toBe("free");
		expect(mounted.auth().showDowngradeBanner).toBe(true);
		act(() => { mounted.auth().handleDismissDowngrade(); });
		expect(mounted.auth().showDowngradeBanner).toBe(false);
		mounted.unmount();
	});

	it("T10: debugFeatures mock applies in development", async () => {
		// S29 replaced the fail-open "not production" test with a fail-closed
		// "PROVABLY development" one. Under vitest NODE_ENV is "test", which is
		// neither, so this test has to opt in explicitly. T11 below pins the
		// production side; the pair together is the actual security claim.
		vi.stubEnv("NODE_ENV", "development");
		const mounted = mountAuth({ debugFeatures: { isWhalePanelEnabled: true } });
		await flush();
		expect(mounted.whale()).toBe(true);
		mounted.unmount();
	});

	it("T10b: debugFeatures mock ignored outside development (fail-closed default)", async () => {
		// The regression S29 exists to prevent: an ambient NODE_ENV that is neither
		// "development" nor "production" must NOT unlock the mock entitlements.
		vi.stubEnv("NODE_ENV", "test");
		const mounted = mountAuth({ debugFeatures: { isWhalePanelEnabled: true } });
		await flush();
		expect(mounted.whale()).toBe(false);
		mounted.unmount();
	});

	it("T11: debugFeatures mock ignored in production", async () => {
		vi.stubEnv("NODE_ENV", "production");
		const mounted = mountAuth({ debugFeatures: { isWhalePanelEnabled: true } });
		await flush();
		expect(mounted.whale()).toBe(false);
		mounted.unmount();
	});
});
