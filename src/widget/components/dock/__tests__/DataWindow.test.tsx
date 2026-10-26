import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { DataWindow } from "../DataWindow";
import { WidgetI18nProvider } from "../../../context/WidgetI18nContext";
import { getGlobalTimezone, setGlobalTimezone } from "../../../../lib/utils/timezoneFormatter";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	// The timezone tests move a module-level global. Leaving it set would make this
	// file's result depend on test order - and, since the SSOT is shared, leak into
	// whatever file runs next in the same worker.
	setGlobalTimezone("Asia/Ho_Chi_Minh");
	act(() => { root?.unmount(); });
	container?.remove();
	container = null;
	root = null;
});

// Kept as a concrete object type rather than `as never`, because the timezone tests
// below derive new fixtures by spreading it. `as never` collapsed the type to
// nothing and made `{ ...datum }` a type error.
const datum = {
	open: 100,
	high: 110,
	low: 90,
	close: 105,
	volume: 1000,
	date: new Date(2026, 8, 21, 8, 52, 1),
	indicatorValues: {
		"EMA:period=13": 101,
		"MACD:fast=12:slow=26:signal=9": 0.07,
	},
};

function renderDw(locale: "vi" | "en") {
	act(() => {
		root?.render(createElement(
			WidgetI18nProvider as (props: { locale: "vi" | "en"; children?: React.ReactNode }) => React.ReactElement,
			{ locale },
			createElement(DataWindow, { symbol: "VIC", timeframe: "1h", datum }),
		));
	});
}

describe("DataWindow commercial polish", () => {
	it("shows one indicators section (no duplicate panel title) with ellipsis titles", () => {
		renderDw("vi");
		const text = container?.textContent ?? "";
		const occurrences = text.split("Chỉ báo").length - 1;
		expect(occurrences).toBe(1);
		expect(text).not.toContain("MACD:fast=12:slow=26:signal=9MACD");
		const label = Array.from(container?.querySelectorAll("span") ?? [])
			.find((el) => el.textContent === "MACD:fast=12:slow=26:signal=9");
		expect(label?.getAttribute("title")).toBe("MACD:fast=12:slow=26:signal=9");
	});

	it("formats the bar date in the widget locale", () => {
		renderDw("vi");
		const viText = container?.textContent ?? "";
		act(() => { root?.unmount(); });
		container?.remove();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		renderDw("en");
		const enText = container?.textContent ?? "";
		// vi-VN day-first vs en-US month-first must differ for this date.
		// The SSOT zero-pads ("21/09/2026" where toLocaleString gave "21/9/2026"),
		// which is the same form the X-axis ticks use. Padding changed here on
		// purpose: consistency with the axis beats matching the old string.
		expect(viText).toContain("21/09/2026");
		expect(enText).toContain("09/21/2026");
	});

	// The regression this whole slice exists for. Before the fix, DataWindow called
	// `datum.date.toLocaleString(locale)`, which formats in the *host machine's* zone
	// while the chart axis and tooltip format through the timezone SSOT. With the
	// widget set to a zone other than the host's, the dock showed a different bar
	// time than the axis beside it.
	//
	// Asserting the day part specifically, because that is where it hurts most: the
	// clock drifts by hours and a user reads that as noise, but a wrong *date* in a
	// dock next to a chart showing a different date is simply a bug they cannot
	// explain. 00:30 local in New York is still the previous calendar day in Vietnam.
	it("formats under the widget timezone, not the machine's", () => {
		setGlobalTimezone("America/New_York");
		// 2026-09-21T00:30Z is 20/09 20:30 in New York but 21/09 07:30 in Vietnam.
		const bar = { ...datum, date: new Date(Date.UTC(2026, 8, 21, 0, 30)) } as never;

		act(() => {
			root?.render(createElement(
				WidgetI18nProvider as (props: { locale: "vi" | "en"; children?: React.ReactNode }) => React.ReactElement,
				{ locale: "vi" },
				createElement(DataWindow, { symbol: "VIC", timeframe: "1h", datum: bar }),
			));
		});
		const nyText = container?.textContent ?? "";

		// Read the label the widget configured, not the host's.
		expect(nyText).toContain("20/09/2026");
		expect(nyText).toContain("20:30");
		// The host-zone answer must be gone entirely.
		expect(nyText).not.toContain("21/09/2026");
	});

	it("follows the widget timezone when it changes", () => {
		const bar = { ...datum, date: new Date(Date.UTC(2026, 8, 21, 0, 30)) } as never;
		const renderAt = () => act(() => {
			root?.render(createElement(
				WidgetI18nProvider as (props: { locale: "vi" | "en"; children?: React.ReactNode }) => React.ReactElement,
				{ locale: "vi" },
				createElement(DataWindow, { symbol: "VIC", timeframe: "1h", datum: bar }),
			));
		});

		setGlobalTimezone("UTC");
		renderAt();
		expect(container?.textContent ?? "").toContain("21/09/2026");

		setGlobalTimezone("America/New_York");
		renderAt();
		expect(container?.textContent ?? "").toContain("20/09/2026");
	});
});
