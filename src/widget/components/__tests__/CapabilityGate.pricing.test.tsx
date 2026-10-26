// @vitest-environment jsdom
// PRICING 2026-10-22 - contract lock cho upsell: nó phải nói rõ **gói nào** và **giá bao nhiêu**.
//
// WHY: trước đây nút upsell (`.vnsc-locked-feature`) chỉ hiện tên tính năng. Người dùng
// free bấm vào một tính năng bị khoá thì thấy "Elliott waves, XABCD patterns..." và một
// cái ổ khóa - không biết cần mua gói nào, giá bao nhiêu. Không có giá thì không có
// quyết định mua.
//
// 3 lock ở đây:
//   1. upsell hiện TÊN GÓI + GIÁ (tiền đề để giá 199.000đ/tháng tới được người dùng)
//   2. giá trong i18n phải khớp với giá ghi trong plan SSOT (2 tài liệu không được lệch)
//   3. giá phải nằm trong accessible name (aria-label), không chỉ trong title (tooltip)
//
// Đổi giá = sửa `src/widget/i18n/capability.messages.{vi,en}.ts` (2 dòng) + bảng giá
// trong `PLAN_DEV_PHASE_OFFICIAL_2026-10-22.md` §1.1. Test này sẽ đỏ nếu quên 1 trong 2.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { LockedFeature } from "../CapabilityGate";
import { widgetMessagesVi } from "../../i18n/messages.vi";
import { widgetMessagesEn } from "../../i18n/messages.en";

const PLAN_DOC = resolve(__dirname, "../../../../docs/upgrade-standard/plans/PLAN_DEV_PHASE_OFFICIAL_2026-10-22.md");

/** Giá đã chốt (D1, owner 2026-10-22). */
const DECIDED_PRO_PRICE = "199.000đ/tháng";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) act(() => { root?.unmount(); });
	root = null;
	container?.remove();
	container = null;
});

function renderLocked(requiredTier: "pro" | "enterprise" | "starter") {
	act(() => {
		root?.render(
			createElement(LockedFeature, {
				capability: "strategy_tester",
				requiredTier,
			}),
		);
	});
	return container!.querySelector(".vnsc-locked-feature") as HTMLElement;
}

describe("upsell: nói rõ gói và giá (PRICING 2026-10-22)", () => {
	it("hiện tên gói Pro và giá 199.000đ/tháng", () => {
		const btn = renderLocked("pro");
		expect(btn, "không render nút upsell").not.toBeNull();
		expect(btn.querySelector(".vnsc-locked-feature__plan")?.textContent).toBe("Pro");
		expect(btn.querySelector(".vnsc-locked-feature__price")?.textContent).toBe(DECIDED_PRO_PRICE);
	});

	it("giá nằm trong accessible name, không chỉ trong tooltip", () => {
		const btn = renderLocked("pro");
		const aria = btn.getAttribute("aria-label") ?? "";
		expect(aria, "aria-label phải nói giá").toContain(DECIDED_PRO_PRICE);
		expect(aria).toContain("Pro");
	});

	it("Enterprise không niêm yết giá (12 capability Track B chưa giao) mà mời liên hệ", () => {
		const btn = renderLocked("enterprise");
		expect(btn.querySelector(".vnsc-locked-feature__plan")?.textContent).toBe("Enterprise");
		expect(btn.querySelector(".vnsc-locked-feature__price")?.textContent).toBe("Liên hệ");
	});

	it("gói không có giá niêm yết thì không render dòng giá", () => {
		const btn = renderLocked("starter");
		expect(btn.querySelector(".vnsc-locked-feature__plan")?.textContent).toBe("Starter");
		expect(btn.querySelector(".vnsc-locked-feature__price"), "không được bịa giá cho gói không có giá").toBeNull();
	});
});

describe("giá không được lệch giữa i18n và plan SSOT", () => {
	it("i18n vi + en đều mang đúng giá đã chốt", () => {
		expect(widgetMessagesVi["plan.pro.price"]).toBe(DECIDED_PRO_PRICE);
		expect(widgetMessagesEn["plan.pro.price"]).toBe("199,000 VND/month");
	});

	it("giá trong i18n phải xuất hiện trong bảng giá của plan SSOT", () => {
		const doc = readFileSync(PLAN_DOC, "utf8");
		expect(
			doc.includes(DECIDED_PRO_PRICE),
			`bảng giá trong ${PLAN_DOC} không còn "${DECIDED_PRO_PRICE}" - cập nhật §1.1 khi đổi giá`,
		).toBe(true);
	});

	it("mọi gói có giá đều phải có trong cả 2 locale (gate parity của repo)", () => {
		const priceKeys = Object.keys(widgetMessagesVi).filter((k) => k.endsWith(".price"));
		expect(priceKeys.length).toBeGreaterThan(0);
		for (const k of priceKeys) {
			expect(widgetMessagesEn[k], `thiếu bản en cho ${k}`).toBeTruthy();
		}
	});
});
