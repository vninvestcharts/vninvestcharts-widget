/**
 * A10 — the pattern picker, at the UI level.
 *
 * The assertions that matter are the gate ones: `auto_pattern` must be
 * `LockedFeature` at `free` (plan §9.1.8 — a locked feature, not a silent
 * hide) and must disappear entirely on a narrow device (plan §3.9.3). Both
 * come from `CapabilityResolver`, which already carries `auto_pattern` in
 * `DEVICE_HEAVY` and gates it to `pro`; this test is what proves the panel
 * actually goes through that gate instead of checking a tier of its own.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { CapabilityProvider } from "../../CapabilityGate";
import { WidgetI18nProvider } from "../../../context/WidgetI18nContext";
import { widgetMessagesEn } from "../../../i18n/messages.en";
import { capabilityMessagesEn } from "../../../i18n/capability.messages.en";
import { PatternScanPanel } from "../PatternScanPanel";
import {
	clearPatternDetectionAdapter,
	setPatternDetectionAdapter,
	type DetectedPattern,
	type PatternBar,
} from "../../../patterns/patternContract";

function headAndShouldersBars(): PatternBar[] {
	const legs: Array<[number, number]> = [
		[8, 100],
		[10, 92],
		[14, 110],
		[16, 92],
		[12, 100],
		[10, 84],
	];
	const bars: PatternBar[] = [];
	let from = 92;
	for (const [count, to] of legs) {
		const step = (to - from) / count;
		for (let i = 1; i <= count; i += 1) {
			const close = from + step * i;
			bars.push({ high: close * 1.001, low: close * 0.999, close });
		}
		from = to;
	}
	return bars;
}

const SHAPES = [
	"headAndShoulders",
	"inverseHeadAndShoulders",
	"doubleTop",
	"doubleBottom",
	"triangle",
] as const;

function stubPattern(): DetectedPattern {
	return {
		id: "hs-1",
		shape: "headAndShoulders",
		direction: "bearish",
		anchors: [
			{ role: "leftShoulder", kind: "high", barIndex: 1, price: 100 },
			{ role: "leftValley", kind: "low", barIndex: 2, price: 92 },
			{ role: "head", kind: "high", barIndex: 3, price: 110 },
			{ role: "rightValley", kind: "low", barIndex: 4, price: 92 },
			{ role: "rightShoulder", kind: "high", barIndex: 5, price: 100 },
			{ role: "necklineStart", kind: "low", barIndex: 6, price: 95 },
			{ role: "necklineEnd", kind: "low", barIndex: 7, price: 95 },
		],
		barsInPattern: 7,
		rSquared: 0.91,
		fitSamples: 6,
		degenerateFit: false,
		confidence: 0.82,
		confirmedAtIndex: 7,
		firstBarIndex: 1,
		lastBarIndex: 7,
		status: "confirmed",
	};
}

beforeEach(() => {
	setPatternDetectionAdapter({
		shapes: SHAPES,
		maxPerSeries: 12,
		detect: () => [stubPattern()],
	});
});

afterEach(() => {
	clearPatternDetectionAdapter();
});

function renderPanel(
	opts: { tier?: "none" | "free" | "starter" | "pro"; narrow?: boolean; idle?: boolean } = {},
) {
	const onDraw = vi.fn();
	const utils = render(
		<WidgetI18nProvider>
			<CapabilityProvider tier={opts.tier ?? "pro"} device={{ narrow: opts.narrow ?? false, concurrency: 2 }}>
				<PatternScanPanel bars={headAndShouldersBars()} onDraw={onDraw} idle={opts.idle ?? true} />
			</CapabilityProvider>
		</WidgetI18nProvider>,
	);
	return { ...utils, onDraw };
}

describe("PatternScanPanel", () => {
	it("renders the picker for a pro tier and forwards the adapter's result", () => {
		const { onDraw } = renderPanel({ tier: "pro" });
		const run = screen.getByTestId("pattern-scan-run");
		expect(run).toBeTruthy();
		act(() => {
			run.click();
		});
		expect(onDraw).toHaveBeenCalledTimes(1);
		expect(onDraw.mock.calls[0]![0].map((p: { shape: string }) => p.shape)).toContain("headAndShoulders");
		// Every result is confirmed — there is no dashed-unconfirmed mode.
		for (const pattern of onDraw.mock.calls[0]![0]) {
			expect(pattern.status).toBe("confirmed");
		}
	});

	it("Rule 15 — without the Pro adapter it shows an actionable state, not a dead scan", () => {
		clearPatternDetectionAdapter();
		renderPanel({ tier: "pro" });
		expect(screen.queryByTestId("pattern-scan-run")).toBeNull();
		const state = document.querySelector("[data-unavailable='pattern-detection']");
		expect(state).not.toBeNull();
		expect(state?.textContent).toContain("@vninvestcharts/widget-pro");
	});

	it("§9.1.8 — at `free` the panel is a locked feature with an upsell, not a silent hide", () => {
		renderPanel({ tier: "free" });
		expect(screen.queryByTestId("pattern-scan-run")).toBeNull();
		const locked = document.querySelector("[data-capability='auto_pattern']");
		expect(locked).not.toBeNull();
		expect(locked?.getAttribute("data-required-tier")).toBe("pro");
	});

	it("§3.9.3 — a narrow device shows the device-limited state, not the picker", () => {
		const { container } = renderPanel({ tier: "pro", narrow: true });
		expect(screen.queryByTestId("pattern-scan-run")).toBeNull();
		expect(container.querySelector("[data-reason='device_limited']")).not.toBeNull();
	});

	it("§3.9.4 — the run button is disabled while the user is panning or zooming", () => {
		renderPanel({ tier: "pro", idle: false });
		const run = screen.getByTestId("pattern-scan-run") as HTMLButtonElement;
		expect(run.disabled).toBe(true);
	});

	it("clearing every shape disables the run button", () => {
		renderPanel({ tier: "pro" });
		const boxes = Array.from(document.querySelectorAll<HTMLInputElement>("[data-shape]"))
			.filter((el) => el.tagName === "INPUT");
		expect(boxes.length).toBeGreaterThan(0);
		for (const box of boxes) {
			act(() => {
				box.click();
			});
		}
		expect((screen.getByTestId("pattern-scan-run") as HTMLButtonElement).disabled).toBe(true);
	});

	it("renders from the dictionary in both locales — nothing is hardcoded", () => {
		// The panel is a leaf component: it takes no `labels` prop, so any
		// literal it rendered would have to be a hardcoded string. Rendering
		// both locales also pins that the new keys exist in each dictionary.
		const { container } = renderPanel({ tier: "pro" });
		expect(container.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe(
			"Tự động nhận diện mô hình nến",
		);
		expect(container.textContent).toContain("Vai đầu vai");

		const en = render(
			<WidgetI18nProvider locale="en" messages={{ ...widgetMessagesEn, ...capabilityMessagesEn }}>
				<CapabilityProvider tier="pro" device={{ narrow: false, concurrency: 2 }}>
					<PatternScanPanel bars={headAndShouldersBars()} onDraw={() => {}} />
				</CapabilityProvider>
			</WidgetI18nProvider>,
		);
		expect(en.container.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe(
			"Auto pattern detection",
		);
		expect(en.container.textContent).toContain("Head and shoulders");
	});
});
