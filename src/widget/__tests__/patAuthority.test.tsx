// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
console.error = (..._args: unknown[]) => {};

let act: typeof import("react").act;
let createRoot: typeof import("react-dom/client").createRoot;
let SaaSFeatureProvider: typeof import("../contexts/SaaSFeatureContext").SaaSFeatureProvider;
let useFeatureGate: typeof import("../hooks/useFeatureGate").useFeatureGate;

beforeAll(async () => {
	({ act } = await import("react"));
	({ createRoot } = await import("react-dom/client"));
	({ SaaSFeatureProvider } = await import("../contexts/SaaSFeatureContext"));
	({ useFeatureGate } = await import("../hooks/useFeatureGate"));
});

import React from "react";

function Probe() {
	const { effectivePat, userPat } = useFeatureGate();
	return (
		<div>
			<span data-testid="effective">{effectivePat}</span>
			<span data-testid="user">{userPat}</span>
		</div>
	);
}

function Wrapper({ children, tenantPat }: { children: React.ReactNode; tenantPat?: string }) {
	return <SaaSFeatureProvider tenantPat={tenantPat}>{children}</SaaSFeatureProvider>;
}

/**
 * AUTH-02 / DEC-2026-09-25 §D-06.
 * Authority: host tenantPat > localStorage override > env.
 * A stale `vni_pat` must never override a tenant entitlement supplied by the host.
 */
describe("AUTH-02 PAT authority (tenant > local override)", () => {
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
		if (!container) {
			container = document.createElement("div");
			document.body.appendChild(container);
			root = createRoot(container);
		}
		Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
	});

	afterEach(() => {
		// The provider reads `vni_pat` in a useState initializer, so each case
		// needs a fresh mount to exercise the authority order.
		act(() => root!.unmount());
		root = createRoot(getContainer());
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	afterAll(() => {
		if (root) act(() => root!.unmount());
		if (container) container.remove();
	});

	// AC-AUTH-02-1: host tenant PAT wins over a conflicting localStorage key.
	it("host tenantPat wins over a localStorage override", () => {
		window.localStorage.setItem("vni_pat", "vni_stale_local_tier");

		act(() => {
			root!.render(
				<Wrapper tenantPat="vni_tenant_corp_token">
					<Probe />
				</Wrapper>
			);
		});
		act(() => void vi.advanceTimersByTime(0));

		expect(getContainer().querySelector('[data-testid="effective"]')?.textContent).toBe("vni_tenant_corp_token");
	});

	// AC-AUTH-02-2: with no tenant, the local override is honoured.
	it("falls back to the local override when the host supplies no tenantPat", () => {
		window.localStorage.setItem("vni_pat", "vni_local_only_token");

		act(() => {
			root!.render(
				<Wrapper>
					<Probe />
				</Wrapper>
			);
		});
		act(() => void vi.advanceTimersByTime(0));

		expect(getContainer().querySelector('[data-testid="effective"]')?.textContent).toBe("vni_local_only_token");
		expect(getContainer().querySelector('[data-testid="user"]')?.textContent).toBe("vni_local_only_token");
	});

	// AC-AUTH-02-4: nothing is resolved from storage when neither is present.
	it("resolves empty when neither tenant nor local override exists", () => {
		act(() => {
			root!.render(
				<Wrapper>
					<Probe />
				</Wrapper>
			);
		});
		act(() => void vi.advanceTimersByTime(0));

		expect(getContainer().querySelector('[data-testid="effective"]')?.textContent).toBe("");
	});
});
