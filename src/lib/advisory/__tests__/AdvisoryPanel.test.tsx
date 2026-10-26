/**
 * I-T01 → I-T08 — AdvisoryPanel unit tests
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import { AdvisoryPanel } from "../AdvisoryPanel";
import type { AdvisoryResult } from "../../types/vninvest";

const reactActEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnv.IS_REACT_ACT_ENVIRONMENT = true;

const MOCK_AGENTS = [
	{ name: "whale", weight: 0.40, score: 75, signal: "BUY" as const, explanation: "Cá mập đang mua mạnh." },
	{ name: "tech", weight: 0.30, score: -50, signal: "SELL" as const, explanation: "Kỹ thuật giảm." },
	{ name: "risk", weight: 0.20, score: 10, signal: "HOLD" as const, explanation: "Rủi ro trung bình." },
	{ name: "sentiment", weight: 0.10, score: 60, signal: "BUY" as const, explanation: "Tâm lý tích cực." },
] as const;

const MOCK_RESULT: AdvisoryResult = {
	decision: "STRONG_BUY",
	confidence: 0.83,
	weighted_score: 42,
	agents: MOCK_AGENTS,
	explanation: "Đây là tóm tắt AI.",
	triggered_at: "2025-01-01T12:00:00Z",
};

function renderPanel(props: Parameters<typeof AdvisoryPanel>[0], container: HTMLDivElement) {
	const root = createRoot(container);
	act(() => { root.render(createElement(AdvisoryPanel, props)); });
	return root;
}

describe("AdvisoryPanel", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		document.body.removeChild(container);
	});

	// I-T01: Renders decision badge with correct label
	it("I-T01: renders STRONG_BUY decision badge text", () => {
		renderPanel({ show: true, result: MOCK_RESULT, isLoading: false }, container);
		const badge = container.querySelector("[data-testid='advisory-decision']");
		expect(badge).toBeTruthy();
		expect(badge?.textContent).toBe("MUA MẠNH");
	});

	// I-T02: Decision badge has green styling
	it("I-T02: STRONG_BUY badge has green background style", () => {
		renderPanel({ show: true, result: MOCK_RESULT, isLoading: false }, container);
		const badge = container.querySelector<HTMLElement>("[data-testid='advisory-decision']");
		// In JSDOM, CSS Modules classes are mapped. Check the class name rather than computed background color.
		expect(badge?.className.includes("STRONG_BUY") || badge?.className.includes("Buy")).toBe(true);
	});

	// I-T03: Loading skeleton visible when isLoading=true
	it("I-T03: shows panel but no decision badge when isLoading=true", () => {
		renderPanel({ show: true, result: null, isLoading: true }, container);
		const panel = container.querySelector("[data-testid='advisory-panel']");
		expect(panel).toBeTruthy();
		const badge = container.querySelector("[data-testid='advisory-decision']");
		expect(badge).toBeNull();
	});

	// I-T04: Agent scorecards render
	it("I-T04: renders all 4 agent name labels", () => {
		renderPanel({ show: true, result: MOCK_RESULT, isLoading: false }, container);
		expect(container.textContent).toContain("Cá Mập");
		expect(container.textContent).toContain("Kỹ Thuật");
		expect(container.textContent).toContain("Rủi Ro");
		expect(container.textContent).toContain("Tâm Lý");
	});

	// I-T05: Agent weights display correctly
	it("I-T05: shows agent weight percentages 40/30/20/10", () => {
		renderPanel({ show: true, result: MOCK_RESULT, isLoading: false }, container);
		expect(container.textContent).toContain("(40%)");
		expect(container.textContent).toContain("(30%)");
		expect(container.textContent).toContain("(20%)");
		expect(container.textContent).toContain("(10%)");
	});

	// I-T06: onRefresh callback fires
	it("I-T06: onRefresh callback fires on refresh button click", () => {
		const onRefresh = vi.fn();
		renderPanel({ show: true, result: MOCK_RESULT, isLoading: false, onRefresh }, container);
		const btn = container.querySelector<HTMLButtonElement>("[title='Làm mới phân tích']");
		expect(btn).toBeTruthy();
		act(() => { btn?.click(); });
		expect(onRefresh).toHaveBeenCalledTimes(1);
	});

	// I-T07: null result + not loading = empty state
	it("I-T07: renders empty state when result=null and isLoading=false", () => {
		renderPanel({ show: true, result: null, isLoading: false }, container);
		const empty = container.querySelector("[data-testid='advisory-empty']");
		expect(empty).toBeTruthy();
	});

	// I-T08: SELL decision badge text
	it("I-T08: SELL decision badge renders BÁN text", () => {
		const sellResult: AdvisoryResult = { ...MOCK_RESULT, decision: "SELL" };
		renderPanel({ show: true, result: sellResult, isLoading: false }, container);
		const badge = container.querySelector("[data-testid='advisory-decision']");
		expect(badge?.textContent).toBe("BÁN");
	});
});
