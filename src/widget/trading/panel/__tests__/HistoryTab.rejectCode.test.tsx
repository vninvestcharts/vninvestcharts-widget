// AC-C2: every OrderRejectCode is rendered through an i18n key, never raw.
//
// `HistoryTab` used to append `(${rejectCode})` — a technical enum
// ("INSUFFICIENT_BUYING_POWER") straight onto the screen. This file locks the
// replacement.
//
// ON THE COUNT: an earlier version of this file asserted `ALL_CODES` had length
// 7. That can never fail — it compares a literal array to a literal — and the
// header above it claimed the count was "asserted against the real union",
// which was not true of anything. Both are gone.
//
// The real guard against a new code shipping untranslated is the COMPILE-TIME
// one: `REJECT_CODE_KEYS` is declared as `Record<OrderRejectCode, string>` in
// HistoryTab.tsx, so adding a member to the union breaks `tsc` there. That is
// the lock, not this file; the first test below is the runtime confirmation
// that the map is actually consulted.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { HistoryTab } from "../HistoryTab";
import type { OrderRejectCode, TradingOrder } from "../../../../lib/core/trading/types";

const ALL_CODES: OrderRejectCode[] = [
	"UNSUPPORTED_TIF",
	"UNSUPPORTED_ORDER_TYPE",
	"INSUFFICIENT_BUYING_POWER",
	"INVALID_QUANTITY",
	"INVALID_PRICE",
	"SHORT_NOT_ALLOWED",
	"PRICE_OUT_OF_BAND",
];

function orderWith(code: string, id: string): TradingOrder {
	return {
		id,
		clientOrderId: id,
		symbol: "FPT",
		side: "buy",
		type: "limit",
		status: "rejected",
		quantity: 100,
		filledQuantity: 0,
		timeInForce: "GTC",
		rejectCode: code,
		createdAt: 0,
		updatedAt: 0,
	} as TradingOrder;
}

describe("HistoryTab reject reasons", () => {
	it("renders a translated label for every OrderRejectCode", () => {
		render(<HistoryTab orders={ALL_CODES.map((c, i) => orderWith(c, `r${i}`))} />);
		for (const code of ALL_CODES) {
			const id = `r${ALL_CODES.indexOf(code)}`;
			const cell = screen.getByTestId(`history-row-${id}`).textContent ?? "";
			expect(cell, `${code} must not appear raw`).not.toContain(code);
			// A parenthesised suffix is the shape we expect; without it the code
			// was dropped instead of translated.
			expect(cell, `${code} needs a parenthesised reason`).toMatch(/\(.+\)/);
		}
	});

	it("falls back to the raw value only for a code this build cannot produce", () => {
		// Persisted orders can outlive a build. Showing the code is better than
		// showing an empty cell, so the fallback is deliberate — but it must not
		// be reachable for a code defined in this build.
		render(<HistoryTab orders={[orderWith("LEGACY_CODE_FROM_OLDER_BUILD", "legacy")]} />);
		const cell = screen.getByTestId("history-row-legacy").textContent ?? "";
		expect(cell).toContain("LEGACY_CODE_FROM_OLDER_BUILD");
	});
});