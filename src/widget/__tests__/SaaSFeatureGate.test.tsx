// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { resetLicensePublicKey, setLicensePublicKey } from "@vninvestcharts/engine-core";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
console.error = (..._args: unknown[]) => {};

let act: typeof import("react").act;
let createRoot: typeof import("react-dom/client").createRoot;
let SaaSFeatureProvider: typeof import("../contexts/SaaSFeatureContext").SaaSFeatureProvider;
let PremiumFeatureGate: typeof import("../components/PremiumFeatureGate").PremiumFeatureGate;
let useFeatureGate: typeof import("../hooks/useFeatureGate").useFeatureGate;
let clearSessionState: typeof import("../../lib/credentials/credentialStore").clearSessionState;
type SaaSFeatureFlags = import("../types/saas").SaaSFeatureFlags;

beforeAll(async () => {
	({ act } = await import("react"));
	({ createRoot } = await import("react-dom/client"));
	({ SaaSFeatureProvider } = await import("../contexts/SaaSFeatureContext"));
	({ PremiumFeatureGate } = await import("../components/PremiumFeatureGate"));
	({ useFeatureGate } = await import("../hooks/useFeatureGate"));
	({ clearSessionState } = await import("../../lib/credentials/credentialStore"));
});

import React from "react";

function TestFeatureGateComponent() {
	const { isLoading, isValid, flags, checkFeature, error, sources, degradedReason } = useFeatureGate();
	return (
		<div data-testid="test-component">
			<span data-testid="loading">{String(isLoading)}</span>
			<span data-testid="valid">{String(isValid)}</span>
			<span data-testid="whale">{String(checkFeature("isWhalePanelEnabled"))}</span>
			<span data-testid="replay">{String(checkFeature("isReplayEnabled"))}</span>
			<span data-testid="advisory">{String(checkFeature("isAdvisoryEnabled"))}</span>
			<span data-testid="error">{error || "none"}</span>
			<span data-testid="plan">{flags.isWhalePanelEnabled ? "pro+" : "free"}</span>
			<span data-testid="sources">{(sources ?? []).join(",")}</span>
			<span data-testid="degraded">{degradedReason ?? "none"}</span>
		</div>
	);
}

function Wrapper({ children, tenantPat, debugFeatures, client, licenseKey }: { children: React.ReactNode; tenantPat?: string; debugFeatures?: Partial<SaaSFeatureFlags>; client?: unknown; licenseKey?: string }) {
	return <SaaSFeatureProvider tenantPat={tenantPat} debugFeatures={debugFeatures} client={client as never} licenseKey={licenseKey}>{children}</SaaSFeatureProvider>;
}

describe("SaaS Feature Gate System", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	function getContainer(): HTMLDivElement {
		if (!container) throw new Error("Container not initialized");
		return container;
	}

	beforeEach(() => {
		vi.useFakeTimers();
		window.localStorage.clear();
		window.sessionStorage.clear();
		// Module-level session memory is NOT storage: without this, a writePat from
		// one test leaks into the next test's readPat even though storage was cleared.
		clearSessionState();
		document.documentElement.lang = "en";
	});

	afterEach(() => {
		root?.unmount();
		root = null;
		container?.remove();
		container = null;
		window.localStorage.clear();
		window.sessionStorage.clear();
		clearSessionState();
		document.documentElement.lang = "en";
		vi.useRealTimers();
	});

	afterAll(() => {
		console.error = originalConsoleError;
	});

	async function renderWithProvider(tenantPat?: string, debugFeatures?: Partial<SaaSFeatureFlags>, client?: unknown, licenseKey?: string) {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<Wrapper tenantPat={tenantPat} debugFeatures={debugFeatures} client={client} licenseKey={licenseKey}>
					<TestFeatureGateComponent />
				</Wrapper>
			);
		});
	}

	async function advanceTime(ms: number) {
		await act(async () => {
			vi.advanceTimersByTime(ms);
			await Promise.resolve();
		});
	}

	/**
	 * Poll until validation settles instead of advancing a fixed amount.
	 * crypto.subtle runs on libuv's threadpool (real time), not on the fake-timer
	 * queue, so a fixed advance passes while validation is still in flight whenever
	 * the worker is loaded — the license tests flaked ONLY in full-suite runs for
	 * exactly this reason. Every license-path test below must use this, never a
	 * fixed advance.
	 */
	async function waitSettled() {
		await vi.waitFor(async () => {
			await vi.advanceTimersByTimeAsync(300);
			expect(getContainer().querySelector("[data-testid='loading']")?.textContent).toBe("false");
		}, { timeout: 8000 });
	}

	describe("Token Validation", () => {
		it("should resolve vni_free_ token as FREE plan (offline fallback)", async () => {
			await renderWithProvider("vni_free_test123");
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='loading']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='valid']")?.textContent).toBe("true");
			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");
			// S1: Replay=Pro — free offline không còn replay (was "true" pre-S1).
			expect(getContainer().querySelector("[data-testid='replay']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='advisory']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("free");
		});

		it("should default to FREE plan for any PAT prefix when offline (no server)", async () => {
			await renderWithProvider("vni_starter_test123");
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='replay']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='advisory']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("free");
		});

		it("should default to FREE plan for pro token when offline", async () => {
			await renderWithProvider("vni_pro_test123");
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='replay']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='advisory']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("free");
		});

		it("should default to FREE plan for enterprise token when offline", async () => {
			await renderWithProvider("vni_enterprise_test123");
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='replay']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='advisory']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("free");
		});

		it("should default to FREE plan for custom token when offline", async () => {
			await renderWithProvider("vni_custom_test123");
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='replay']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='advisory']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("free");
		});

		it("should default to FREE plan for internal token when offline", async () => {
			await renderWithProvider("vni_internal_test123");
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='replay']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='advisory']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("free");
		});

		it("should handle invalid/unknown token prefix", async () => {
			await renderWithProvider("invalid_token");
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='loading']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='valid']")?.textContent).toBe("true");
			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='replay']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("free");
		});

		it("should handle empty token (no token provided)", async () => {
			await renderWithProvider("");

			expect(getContainer().querySelector("[data-testid='loading']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='valid']")?.textContent).toBe("true");
			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='replay']")?.textContent).toBe("false");
		});

		it("should handle undefined token", async () => {
			await renderWithProvider(undefined as any);

			expect(getContainer().querySelector("[data-testid='loading']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='valid']")?.textContent).toBe("true");
			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='replay']")?.textContent).toBe("false");
		});
	});

	describe("Debug Features Override", () => {
		// S29 made the guard ask "PROVABLY development" (`NODE_ENV === "development"`)
		// instead of the fail-open "not production" it replaced. Under vitest NODE_ENV
		// is "test", so the override is correctly refused unless a test says otherwise.
		// The security claim being locked here is that the override cannot be reached by
		// accident; the dev path has to be turned on deliberately.
		//
		// `vi.stubEnv` rather than assigning `process.env` directly, so vitest tracks
		// and restores the value for us - the same mechanism the sibling contract files
		// use, and the one that survives a test throwing before its own cleanup.
		afterEach(() => {
			vi.unstubAllEnvs();
		});

		it("refuses the debugFeatures override when NODE_ENV is not development", async () => {
			vi.stubEnv("NODE_ENV", "production");
			await renderWithProvider("vni_free_test123", {
				isWhalePanelEnabled: true,
				isReplayEnabled: true,
			});
			await advanceTime(600);

			// The whole point of S29: no tenant string + no NODE_ENV reaches the override.
			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='replay']")?.textContent).toBe("false");
		});

		it("refuses the debugFeatures override when NODE_ENV is anything but development", async () => {
			// Named for what it asserts: an ambient NODE_ENV that is neither
			// "development" nor "production" must not unlock mock entitlements. The value
			// is set explicitly rather than relied upon, so the assertion does not depend
			// on what vitest happens to set - and so it keeps working if that default
			// ever changes.
			vi.stubEnv("NODE_ENV", "test");
			await renderWithProvider("vni_free_test123", {
				isWhalePanelEnabled: true,
				isReplayEnabled: true,
			});
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");
		});

		it("applies the debugFeatures override in development", async () => {
			vi.stubEnv("NODE_ENV", "development");
			await renderWithProvider("vni_free_test123", {
				isWhalePanelEnabled: true,
				isReplayEnabled: true,
			});
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("true");
			expect(getContainer().querySelector("[data-testid='replay']")?.textContent).toBe("true");
		});
	});

	describe("Offline signed license (LIC-ACTIVATION)", () => {
		const subtle = webcrypto.subtle as unknown as SubtleCrypto;

		async function issueSignedPro(): Promise<string> {
			const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
			const pub = (await subtle.exportKey("jwk", pair.publicKey)) as { x: string; y: string };
			setLicensePublicKey({ kty: "EC", crv: "P-256", x: pub.x, y: pub.y });
			const payload = new TextEncoder().encode(JSON.stringify({ t: "pro", e: Math.floor(Date.now() / 1000) + 86400 }));
			const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, payload);
			const b64 = (b: Uint8Array) => {
				let s = "";
				b.forEach((x) => { s += String.fromCharCode(x); });
				return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
			};
			return `vni1.${b64(payload)}.${b64(new Uint8Array(sig))}`;
		}

		afterEach(() => { resetLicensePublicKey(); });

		it("signed pro key activates pro offline (plan + replay)", async () => {
			const key = await issueSignedPro();
			await renderWithProvider(key);
			await waitSettled();

			expect(getContainer().querySelector("[data-testid='loading']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("pro+");
			expect(getContainer().querySelector("[data-testid='replay']")?.textContent).toBe("true");
			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("true");
		});

		it("tampered signed key stays free", async () => {
			const key = await issueSignedPro();
			const tampered = key.slice(0, -2) + (key.endsWith("AA") ? "BB" : "AA");
			await renderWithProvider(tampered);
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("free");
			expect(getContainer().querySelector("[data-testid='replay']")?.textContent).toBe("false");
		});

		/**
		 * The path a real customer takes. Every test above injects the key as a PROP
		 * (tenantPat), so none of them exercise the license sitting in storage — which
		 * is the only place a pasted key ever lives. CS-1 moved the blob out of
		 * `vni_pat` and into `vni_license_key`, and nothing read the new slot yet, so
		 * this path silently dropped to free while the whole suite stayed green.
		 * A green suite is not evidence; this test is.
		 */
		it("signed pro key in STORAGE activates pro offline (CS-1 regression lock)", async () => {
			const key = await issueSignedPro();
			localStorage.setItem("vni_license_key", key);
			try {
				await renderWithProvider(undefined);
				await waitSettled();

				expect(getContainer().querySelector("[data-testid='loading']")?.textContent).toBe("false");
				expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("pro+");
				expect(getContainer().querySelector("[data-testid='replay']")?.textContent).toBe("true");
			} finally {
				localStorage.removeItem("vni_license_key");
			}
		});

		/**
		 * UNION (option A, chosen 2026-09-27): renderTier = max(license, server).
		 *
		 * Before this, the server branch NEVER consulted the license channel: when
		 * `client && effectivePat` and the server answered 200, a paid offline Pro
		 * was silently dropped in favour of a free server plan. Behaviour flipped
		 * with server reachability, which is the same bug class as
		 * LICENSE_FIRST_BEATS_BACKEND in reverse.
		 *
		 * Fails on the old code ("expected 'free' to be 'pro+'") because the license
		 * was never verified when a client existed.
		 */
		it("license Pro in storage + server free => Pro (union, server does not downgrade)", async () => {
			const key = await issueSignedPro();
			localStorage.setItem("vni_license_key", key);
			localStorage.setItem("vni_pat", "vni_pat_free_user");
			const client = {
				validateMe: async () => ({
					plan: "free",
					tenant: { tenant_code: "free-tenant", display_name: "Free User", status: "active" },
					entitlements: {},
				}),
			};
			// Poll instead of a fixed timer advance: crypto.subtle runs on libuv's
			// threadpool (real time), not on the fake-timer queue, so a fixed 1200ms
			// advance passes while validation is still in flight whenever the worker
			// is loaded — exactly what made this test flake only in full-suite runs.
			try {
				await renderWithProvider(undefined, undefined, client);
				await vi.waitFor(async () => {
					await vi.advanceTimersByTimeAsync(300);
					expect(getContainer().querySelector("[data-testid='loading']")?.textContent).toBe("false");
				}, { timeout: 8000 });

				expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("pro+");
			} finally {
				localStorage.removeItem("vni_license_key");
				localStorage.removeItem("vni_pat");
			}
		});

		it("server enterprise + license Pro => enterprise (union keeps the higher)", async () => {
			const key = await issueSignedPro();
			localStorage.setItem("vni_license_key", key);
			localStorage.setItem("vni_pat", "vni_pat_enterprise_user");
			const client = {
				validateMe: async () => ({
					plan: "enterprise",
					tenant: { tenant_code: "ent-tenant", display_name: "Ent User", status: "active" },
					entitlements: {},
				}),
			};
			// NOTE: the "plan" testid only renders "pro+" (whale on) or "free" (whale off),
			// so enterprise is distinguished by isAdvisoryEnabled, which is true for
			// enterprise and false for pro. The paired test above proves the license is
			// consulted when it is the higher of the two; this one proves the server is
			// not downgraded when it is the higher.
			try {
				await renderWithProvider(undefined, undefined, client);
				await vi.waitFor(async () => {
					await vi.advanceTimersByTimeAsync(300);
					expect(getContainer().querySelector("[data-testid='advisory']")?.textContent).toBe("true");
				}, { timeout: 8000 });
			} finally {
				localStorage.removeItem("vni_license_key");
				localStorage.removeItem("vni_pat");
			}
		});

		it("CS-301 licenseKey prop activates Pro with empty storage", async () => {
			const key = await issueSignedPro();
			try {
				await renderWithProvider(undefined, undefined, undefined, key);
				await waitSettled();

				expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("pro+");
				expect(getContainer().querySelector("[data-testid='sources']")?.textContent).toBe("license");
			} finally {
				localStorage.removeItem("vni_license_key");
				localStorage.removeItem("vni_pat");
			}
		});

		it("CS-304 tenantPat free does not shadow a stored pro license", async () => {
			const key = await issueSignedPro();
			localStorage.setItem("vni_license_key", key);
			try {
				// Host injects a free tenant PAT; the user holds a pro license.
				await renderWithProvider("vni_tenant_free");
				await waitSettled();

				expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("pro+");
				const sources = getContainer().querySelector("[data-testid='sources']")?.textContent ?? "";
				expect(sources.split(",")).toContain("license");
			} finally {
				localStorage.removeItem("vni_license_key");
			}
		});

		it("CS-302 DATA-01 rotating the license busts the cache (D1+D2)", async () => {
			// D2: the previous version of this test started from empty storage, so it
			// passed with or without the clear — vacuous. Worse, its second render had
			// no PAT at all, so it took the free-mode early return and never touched
			// the cache either. This version keeps the SAME pat across both renders and
			// only removes the license: with a pat-blind cache key the second render
			// walks into the first render's entry and serves stale pro.
			const key = await issueSignedPro();
			localStorage.setItem("vni_license_key", key);
			localStorage.setItem("vni_pat", "vni_pat_same_both_renders");
			try {
				await renderWithProvider(undefined);
				await waitSettled();
				expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("pro+");
			} finally {
				localStorage.removeItem("vni_license_key");
			}
			// Same session, same PAT, license gone. A pat-blind cache still says pro.
			root?.unmount();
			root = null;
			container?.remove();
			container = null;
			try {
				await renderWithProvider(undefined);
				await waitSettled();
				expect(getContainer().querySelector("[data-testid='plan']")?.textContent).toBe("free");
				expect(getContainer().querySelector("[data-testid='sources']")?.textContent).toBe("none");
			} finally {
				localStorage.removeItem("vni_pat");
			}
		});

		it("CS-202b attribution: server-only pro names the server, degraded is null", async () => {
			localStorage.setItem("vni_pat", "vni_pat_pro_user");
			const client = {
				validateMe: async () => ({
					plan: "pro",
					tenant: { tenant_code: "t", display_name: "P", status: "active" },
					entitlements: {},
				}),
			};
			try {
				await renderWithProvider(undefined, undefined, client);
				await waitSettled();

				expect(getContainer().querySelector("[data-testid='sources']")?.textContent).toBe("server");
				expect(getContainer().querySelector("[data-testid='degraded']")?.textContent).toBe("none");
			} finally {
				localStorage.removeItem("vni_pat");
			}
		});
	});

	describe("Cache Behavior", () => {
		it("should use cached data on subsequent renders", async () => {
			await renderWithProvider("vni_pro_test123");
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");

			// Unmount and remount with same token
			root?.unmount();
			root = null;
			container?.remove();
			container = null;

			await renderWithProvider("vni_pro_test123");

			// Should not show loading (uses cache)
			expect(getContainer().querySelector("[data-testid='loading']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");
		});

		it("should not use expired cache", async () => {
			await renderWithProvider("vni_pro_test123");
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");

			// Advance time past cache TTL (20 minutes)
			vi.advanceTimersByTime(21 * 60 * 1000);

			// Remount - cache expired, will re-run fallback (synchronous)
			root?.unmount();
			root = null;
			container?.remove();
			container = null;

			await renderWithProvider("vni_pro_test123");

			expect(getContainer().querySelector("[data-testid='whale']")?.textContent).toBe("false");
		});
	});

	describe("PremiumFeatureGate Component", () => {
		let PremiumGateContainer: HTMLDivElement | null = null;
		let PremiumGateRoot: ReturnType<typeof createRoot> | null = null;

		function getPremiumContainer(): HTMLDivElement {
			if (!PremiumGateContainer) throw new Error("PremiumGateContainer not initialized");
			return PremiumGateContainer;
		}

		/** H0.5: the CTA only renders with an explicit target — no localhost fallback. */
		const UPGRADE_URL = "https://example.test/upgrade";

		async function renderPremiumGate(
			tenantPat?: string,
			feature: keyof SaaSFeatureFlags = "isWhalePanelEnabled",
			fallback?: React.ReactNode,
			upgradeUrl?: string,
			mode?: "blur" | "unmount"
		) {
			PremiumGateContainer = document.createElement("div");
			document.body.appendChild(PremiumGateContainer);
			PremiumGateRoot = createRoot(PremiumGateContainer);

			await act(async () => {
				PremiumGateRoot?.render(
					<Wrapper tenantPat={tenantPat}>
						<PremiumFeatureGate feature={feature} fallback={fallback} upgradeUrl={upgradeUrl} mode={mode}>
							<div data-testid="content">Whale Content</div>
						</PremiumFeatureGate>
					</Wrapper>
				);
			});
		}

		afterEach(() => {
			PremiumGateRoot?.unmount();
			PremiumGateRoot = null;
			PremiumGateContainer?.remove();
			PremiumGateContainer = null;
		});

		it("should show lock overlay when feature is disabled (offline fallback = free)", async () => {
			await renderPremiumGate("vni_pro_test123", undefined, undefined, UPGRADE_URL);
			await advanceTime(600);

			expect(getPremiumContainer().querySelector("[data-testid='premium-gate-locked-isWhalePanelEnabled']")).not.toBeNull();
			expect(getPremiumContainer().textContent).toContain("🔒");
			expect(getPremiumContainer().textContent).toContain("Nâng cấp ngay");
		});

		it("should show lock overlay when feature is disabled (default unmount mode)", async () => {
			await renderPremiumGate("vni_free_test123", undefined, undefined, UPGRADE_URL);
			await advanceTime(600);

			expect(getPremiumContainer().querySelector("[data-testid='premium-gate-locked-isWhalePanelEnabled']")).not.toBeNull();
			expect(getPremiumContainer().textContent).toContain("🔒");
			expect(getPremiumContainer().textContent).toContain("Nâng cấp ngay");
			// Mặc định unmount: children không được render, do đó blur container phải là null
			expect(getPremiumContainer().querySelector("[data-testid='premium-content-blur']")).toBeNull();
		});

		it("should render blurred content when feature is disabled in blur mode", async () => {
			await renderPremiumGate("vni_free_test123", "isWhalePanelEnabled", undefined, UPGRADE_URL, "blur");
			await advanceTime(600);

			expect(getPremiumContainer().querySelector("[data-testid='premium-gate-locked-isWhalePanelEnabled']")).not.toBeNull();
			expect(getPremiumContainer().textContent).toContain("🔒");
			expect(getPremiumContainer().textContent).toContain("Nâng cấp ngay");
			// Ở chế độ blur: children phải được render mờ
			expect(getPremiumContainer().querySelector("[data-testid='premium-content-blur']")).not.toBeNull();
		});


		it("should show locked state for disabled premium feature on free tier", async () => {
			await renderPremiumGate("vni_free_test123", "isWhalePanelEnabled", undefined, UPGRADE_URL);
			await advanceTime(600);
			expect(getPremiumContainer().querySelector("[data-testid='premium-gate-locked-isWhalePanelEnabled']")).not.toBeNull();
			expect(getPremiumContainer().textContent).toContain("🔒");
			expect(getPremiumContainer().textContent).toContain("Nâng cấp ngay");
		});

		it("should render custom fallback when provided", async () => {
			await renderPremiumGate("vni_free_test123", "isWhalePanelEnabled", <div data-testid="custom-fallback">Custom Locked UI</div>);
			await advanceTime(600);

			expect(getPremiumContainer().querySelector("[data-testid='custom-fallback']")).not.toBeNull();
			expect(getPremiumContainer().textContent).not.toContain("Nâng cấp ngay");
		});

		it("should use custom upgrade URL", async () => {
			const customUrl = "https://custom.upgrade.url";
			await renderPremiumGate("vni_free_test123", "isWhalePanelEnabled", undefined, customUrl);
			await advanceTime(600);

			const link = getPremiumContainer().querySelector("[data-testid='premium-upgrade-btn']");
			expect(link?.getAttribute("href")).toBe(customUrl);
		});

		it("H0.5: renders NO upgrade CTA when upgradeUrl is omitted", async () => {
			// Pre-H0.5 `PremiumFeatureGate` defaulted to `http://localhost:8080`, so an
			// embed that passed nothing still shipped a link back to a local backend.
			await renderPremiumGate("vni_free_test123", "isWhalePanelEnabled");
			await advanceTime(600);

			const link = getPremiumContainer().querySelector("[data-testid='premium-upgrade-btn']");
			expect(link, "an upgrade CTA rendered without an upgradeUrl being passed").toBeNull();

			const localhostLinks = Array.from(getPremiumContainer().querySelectorAll("a")).filter((a) =>
				(a.getAttribute("href") ?? "").includes("localhost"),
			);
			expect(localhostLinks.map((a) => a.outerHTML)).toEqual([]);
		});
	});

	describe("User PAT Override", () => {
		function TestUserPatComponent() {
			const { userPat, setUserPat, effectivePat, tenantMetadata, isLoading } = useFeatureGate();
			return (
				<div data-testid="user-pat-component">
					<span data-testid="user-pat">{userPat}</span>
					<span data-testid="effective-pat">{effectivePat}</span>
					<span data-testid="tenant-name">{tenantMetadata?.tenantName || "none"}</span>
					<span data-testid="loading">{String(isLoading)}</span>
					<button data-testid="set-pat-btn" onClick={() => setUserPat("vni_pro_newpat")}>Set PAT</button>
					<button data-testid="clear-pat-btn" onClick={() => setUserPat("")}>Clear PAT</button>
				</div>
			);
		}

		async function renderUserPatTest(tenantPat?: string) {
			container = document.createElement("div");
			document.body.appendChild(container);
			root = createRoot(container);

			await act(async () => {
				root?.render(
					<Wrapper tenantPat={tenantPat}>
						<TestUserPatComponent />
					</Wrapper>
				);
			});
		}

		it("should read initial state from prop when no localStorage override exists", async () => {
			await renderUserPatTest("vni_free_test");
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='user-pat']")?.textContent).toBe("");
			expect(getContainer().querySelector("[data-testid='effective-pat']")?.textContent).toBe("vni_free_test");
			expect(getContainer().querySelector("[data-testid='tenant-name']")?.textContent).toBe("Offline Unknown");
		});

		// AUTH-02 / DEC-2026-09-25 §D-06: host tenantPat has AUTHORITY over a
		// localStorage override. Previously local won, which let a stale or
		// user-edited `vni_pat` downgrade (or upgrade) a tenant entitlement.
		it("should keep tenantPat authoritative when localStorage has userPat", async () => {
			window.localStorage.setItem("vni_pat", "vni_pro_localoverride");
			await renderUserPatTest("vni_free_test");
			await advanceTime(600);

			// The local value is still visible for diagnostics…
			expect(getContainer().querySelector("[data-testid='user-pat']")?.textContent).toBe("vni_pro_localoverride");
			// …but it does NOT decide the effective entitlement.
			expect(getContainer().querySelector("[data-testid='effective-pat']")?.textContent).toBe("vni_free_test");
			expect(getContainer().querySelector("[data-testid='tenant-name']")?.textContent).toBe("Offline Unknown");
		});

		// Without a tenant, the local override is still the source of truth.
		it("should switch to loading and trigger revalidation when setUserPat is called (no tenant)", async () => {
			await renderUserPatTest(undefined);
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='effective-pat']")?.textContent).toBe("");
			// No PAT at all → no tenant metadata resolved yet.
			expect(getContainer().querySelector("[data-testid='tenant-name']")?.textContent).toBe("none");

			// Trigger setUserPat
			await act(async () => {
				getContainer().querySelector("[data-testid='set-pat-btn']")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			// effectivePat cập nhật ngay lập tức
			expect(getContainer().querySelector("[data-testid='user-pat']")?.textContent).toBe("vni_pro_newpat");
			expect(getContainer().querySelector("[data-testid='effective-pat']")?.textContent).toBe("vni_pro_newpat");
			expect(window.localStorage.getItem("vni_pat")).toBe("vni_pro_newpat");

			// Chờ fallback validation hoàn tất
			await advanceTime(600);
			expect(getContainer().querySelector("[data-testid='tenant-name']")?.textContent).toBe("Offline Unknown");
		});

		it("should keep tenantPat authoritative after setUserPat is cleared", async () => {
			window.localStorage.setItem("vni_pat", "vni_pro_localoverride");
			await renderUserPatTest("vni_free_test");
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='effective-pat']")?.textContent).toBe("vni_free_test");

			// Clear PAT
			await act(async () => {
				getContainer().querySelector("[data-testid='clear-pat-btn']")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			expect(getContainer().querySelector("[data-testid='user-pat']")?.textContent).toBe("");
			expect(getContainer().querySelector("[data-testid='effective-pat']")?.textContent).toBe("vni_free_test");
			expect(window.localStorage.getItem("vni_pat")).toBeNull();

			await advanceTime(600);
			expect(getContainer().querySelector("[data-testid='tenant-name']")?.textContent).toBe("Offline Unknown");
		});
	});
});
