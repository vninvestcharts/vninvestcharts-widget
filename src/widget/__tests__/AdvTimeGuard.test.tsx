// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

function TestAdvGuardComponent() {
	const { flags, isSaaSConfigAvailable } = useFeatureGate();
	return (
		<div data-testid="test-component">
			<span data-testid="showWidgetAds">{String(flags.showWidgetAds)}</span>
			<span data-testid="isSaaSConfigAvailable">{String(isSaaSConfigAvailable)}</span>
		</div>
	);
}

function Wrapper({ children, tenantPat, advActivationDate }: { children: React.ReactNode; tenantPat?: string; advActivationDate?: number }) {
	return <SaaSFeatureProvider tenantPat={tenantPat} advActivationDate={advActivationDate}>{children}</SaaSFeatureProvider>;
}

describe("AdvTimeGuard — Ad dialog activation date guard", () => {
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
	});

	afterEach(() => {
		root?.unmount();
		root = null;
		container?.remove();
		container = null;
		window.localStorage.clear();
		window.sessionStorage.clear();
		vi.useRealTimers();
	});

	afterAll(() => {
		console.error = originalConsoleError;
	});

	async function renderWithProvider(tenantPat?: string, advActivationDate?: number) {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<Wrapper tenantPat={tenantPat} advActivationDate={advActivationDate}>
					<TestAdvGuardComponent />
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

	describe("Before activation date (default: 2027-01-01)", () => {
		it("T01: should force showWidgetAds=false when Date < 2027-01-01, no PAT (offline)", async () => {
			// Set time to 2026-07-16 (before activation)
			vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));

			await renderWithProvider();
			await advanceTime(100);

			expect(getContainer().querySelector("[data-testid='showWidgetAds']")?.textContent).toBe("false");
			expect(getContainer().querySelector("[data-testid='isSaaSConfigAvailable']")?.textContent).toBe("false");
		});

		it("T01b: should force showWidgetAds=false when Date < 2027-01-01, with PAT (offline fallback)", async () => {
			vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));

			await renderWithProvider("vni_free_test123");
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='showWidgetAds']")?.textContent).toBe("false");
		});

		it("T01c: should force showWidgetAds=false when Date < 2027-01-01, with custom override activation in future", async () => {
			vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));
			const futureActivation = new Date("2028-01-01T00:00:00Z").getTime();

			await renderWithProvider(undefined, futureActivation);
			await advanceTime(100);

			expect(getContainer().querySelector("[data-testid='showWidgetAds']")?.textContent).toBe("false");
		});
	});

	describe("After activation date", () => {
		it("T02: should allow showWidgetAds=true when Date >= 2027-01-01, no PAT (offline)", async () => {
			vi.setSystemTime(new Date("2027-06-15T12:00:00Z"));

			await renderWithProvider();
			await advanceTime(100);

			expect(getContainer().querySelector("[data-testid='showWidgetAds']")?.textContent).toBe("true");
			expect(getContainer().querySelector("[data-testid='isSaaSConfigAvailable']")?.textContent).toBe("false");
		});

		it("T03: should allow showWidgetAds=true when Date >= 2027-01-01, PAT provided but server unreachable (offline fallback)", async () => {
			vi.setSystemTime(new Date("2027-06-15T12:00:00Z"));

			await renderWithProvider("vni_free_test123");
			await advanceTime(600);

			expect(getContainer().querySelector("[data-testid='showWidgetAds']")?.textContent).toBe("true");
			expect(getContainer().querySelector("[data-testid='isSaaSConfigAvailable']")?.textContent).toBe("false");
		});
	});

	describe("Custom activation date override", () => {
		it("T05a: should respect custom activation date (past) — showWidgetAds=true when offline", async () => {
			vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
			const pastActivation = new Date("2026-01-01T00:00:00Z").getTime();

			await renderWithProvider(undefined, pastActivation);
			await advanceTime(100);

			expect(getContainer().querySelector("[data-testid='showWidgetAds']")?.textContent).toBe("true");
		});

		it("T05b: should respect custom activation date (future) — showWidgetAds=false when offline", async () => {
			vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
			const futureActivation = new Date("2027-01-01T00:00:00Z").getTime();

			await renderWithProvider(undefined, futureActivation);
			await advanceTime(100);

			expect(getContainer().querySelector("[data-testid='showWidgetAds']")?.textContent).toBe("false");
		});
	});
});
