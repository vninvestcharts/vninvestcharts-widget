/**
 * Follow-up advisory V2 — SessionView unit tests (native session shapes).
 * Fixtures mirror the live backend payloads (2026-09-21): empty no_advisory_data
 * state and a GENERATED record state. No network.
 */

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import { AdvisoryPanel } from "../AdvisoryPanel";
import type { AdvisorySessionV2 } from "../../../../lib/types/vninvest";
import { WidgetI18nProvider } from "../../../context/WidgetI18nContext";

const reactActEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnv.IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY_SESSION: AdvisorySessionV2 = {
	queued: false,
	symbol: "VCB",
	contract_version: "v1",
	reason: "no_advisory_data",
	message: "Chua co du lieu.",
	advisory: null,
	aggregate: null,
	components: [],
	deleted_components: [],
	executive_summary: null,
	executive_summaries: [],
	user_ai_provider: null,
	effective_ai_provider: null,
	effective_ai_model: null,
	effective_ai_source: null,
};

const RECORD_SESSION: AdvisorySessionV2 = {
	queued: false,
	symbol: "VCB",
	contract_version: "v1",
	advisory: { advisory_id: "x", status: "generated" },
	aggregate: {
		advisory_id: "x",
		session_date: "2026-09-21",
		selected_trade_date: "2026-09-21",
		contract_version: "v1",
		decision: { action: "hold", risk: "medium", score_band: "medium", score: 0.55 },
	},
	components: [
		{ id: 1, symbol: "VCB", component_type: "indicator", indicator_name: "RSI", status: "neutral", confidence_score: 7, suggested_action: "watch", rationale_text: "RSI trung tinh.", timeframe: "30m", include_in_summary: true, is_deleted: false, created_at: "t", updated_at: "t" },
	],
	deleted_components: [],
	executive_summary: {
		symbol: "VCB", session_date: "2026-09-21", strategy_action: "hold", risk_level: "medium",
		overall_confidence: 6.5, score_band: "medium", summary_text: "Tom tat native.",
		component_ids: [1], active_components_count: 1, source: "native",
	},
	executive_summaries: [],
	user_ai_provider: null,
	effective_ai_provider: "core-native",
	effective_ai_model: "core-native",
	effective_ai_source: "native",
};

function renderSession(session: AdvisorySessionV2) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => {
		root.render(
			/* eslint-disable-next-line react/no-children-prop -- required prop: this provider's props type declares `children` as mandatory, so it must be passed in the config object; createElement's 3rd-argument form fails tsc. */
			createElement(WidgetI18nProvider, {
				locale: "vi",
				children: createElement(AdvisoryPanel, { show: true, result: null, isLoading: false, symbol: "VCB", session }),
			}),
		);
	});
	return { container, root };
}

describe("AdvisoryPanel session view (V2)", () => {
	let rendered: { container: HTMLDivElement; root: ReturnType<typeof createRoot> } | null = null;

	afterEach(() => {
		rendered?.root.unmount();
		rendered?.container.remove();
		rendered = null;
	});

	beforeEach(() => {
		window.localStorage.clear();
	});

	it("renders server message for empty no_advisory_data state", () => {
		rendered = renderSession(EMPTY_SESSION);
		expect(rendered.container.querySelector('[data-testid="advisory-empty"]')).not.toBeNull();
		expect(rendered.container.textContent).toContain("Chua co du lieu.");
	});

	it("renders decision + summary + components for record state", () => {
		rendered = renderSession(RECORD_SESSION);
		expect(rendered.container.querySelector('[data-testid="advisory-decision"]')?.textContent).toContain("HOLD");
		expect(rendered.container.textContent).toContain("Tom tat native.");
		expect(rendered.container.querySelectorAll('[data-testid="advisory-component-row"]')).toHaveLength(1);
		expect(rendered.container.textContent).toContain("RSI");
	});

	it("renders queued state", () => {
		rendered = renderSession({ ...EMPTY_SESSION, queued: true, reason: undefined, message: "queued" });
		expect(rendered.container.querySelector('[data-testid="advisory-queued"]')).not.toBeNull();
	});
});
