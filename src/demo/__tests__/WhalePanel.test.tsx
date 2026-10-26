// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { WhaleFeedResponse } from "../vninvest/types";

vi.mock("../../widget/hooks/useFeatureGate", () => ({
	useFeatureGate: () => ({
		isLoading: false,
		isValid: true,
		flags: { isWhalePanelEnabled: true, isReplayEnabled: false, isAdvisoryEnabled: false },
		tenantMetadata: { tenantCode: "mock_pro", plan: "pro" },
		checkFeature: (feature: string) => feature === "isWhalePanelEnabled",
		invalidateCache: () => {},
	}),
}));

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

let act: typeof import("react").act;
let createRoot: typeof import("react-dom/client").createRoot;
let WhalePanel: typeof import("../components").WhalePanel;
let WidgetI18nProvider: typeof import("../../widget/context/WidgetI18nContext").WidgetI18nProvider;

const sampleWhaleData: WhaleFeedResponse = {
	symbol: "TCB",
	whale_orders: [],
	summary: {
		buy_value: 3_000_000_000,
		sell_value: 1_000_000_000,
		shark_buy: 1_200_000_000,
		shark_sell: 600_000_000,
		whale_buy: 1_500_000_000,
		whale_sell: 300_000_000,
		small_buy: 300_000_000,
		small_sell: 100_000_000,
	},
};

describe("WhalePanel", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;
	let consoleErrorSpy: {
		mockImplementation: (implementation: (...args: unknown[]) => unknown) => unknown;
		mockRestore: () => void;
	};

	beforeAll(async () => {
		({ act } = await import("react"));
		({ createRoot } = await import("react-dom/client"));
		({ WhalePanel } = await import("../components"));
		({ WidgetI18nProvider } = await import("../../widget/context/WidgetI18nContext"));
	});

	beforeEach(() => {
		window.localStorage.clear();
		consoleErrorSpy = vi.spyOn(console, "error");
		consoleErrorSpy.mockImplementation(() => {});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root?.unmount();
		root = null;
		container?.remove();
		container = null;
		consoleErrorSpy.mockRestore();
		window.localStorage.clear();
	});

	it("renders nothing when whale flow data is missing", async () => {
		await act(async () => {
			root?.render(
				<WidgetI18nProvider locale="vi">
					<WhalePanel data={null} />
				</WidgetI18nProvider>,
			);
		});

		expect(container?.querySelector('[data-testid="whale-panel"]')).toBeNull();
		expect(container?.textContent?.trim()).toBe("");
	});

	it("renders the whale summary when data is available", async () => {
		await act(async () => {
			root?.render(
				<WidgetI18nProvider locale="vi">
					<WhalePanel data={sampleWhaleData} />
				</WidgetI18nProvider>,
			);
		});

		expect(container?.querySelector('[data-testid="whale-panel"]')).not.toBeNull();
		expect(container?.textContent).toContain("2.00");
		expect(container?.textContent).not.toContain("Chưa có dữ liệu dòng tiền.");
	});

	it("renders native alerts list when alerts are present (follow-up)", async () => {
		const alertsData: WhaleFeedResponse = {
			symbol: "VCB",
			whale_orders: [],
			summary: {
				buy_value: 0, sell_value: 0, shark_buy: 0, shark_sell: 0,
				whale_buy: 0, whale_sell: 0, small_buy: 0, small_sell: 0,
			},
			alerts: [
				{ id: "a1", alert_type: "signal", severity: "low", title: "Bien dong VCB", value: "2.32", direction: "sell", triggered_at: "2026-09-21T05:08:57+00:00" },
			],
		};
		await act(async () => {
			root?.render(
				<WidgetI18nProvider locale="vi">
					<WhalePanel data={alertsData} />
				</WidgetI18nProvider>,
			);
		});

		expect(container?.querySelector('[data-testid="whale-panel"]')).not.toBeNull();
		expect(container?.querySelectorAll('[data-testid="whale-alert-row"]')).toHaveLength(1);
		expect(container?.textContent).toContain("Bien dong VCB");
	});
});