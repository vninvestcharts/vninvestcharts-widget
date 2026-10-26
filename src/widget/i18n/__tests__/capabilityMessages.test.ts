import { describe, expect, it } from "vitest";
import { widgetMessagesEn } from "../messages.en";
import { widgetMessagesVi } from "../messages.vi";
import { capabilityMessagesEn } from "../capability.messages.en";
import { capabilityMessagesVi } from "../capability.messages.vi";
import { ALL_CAPABILITIES, hasCapability, minTierFor, type Capability } from "@vninvestcharts/engine-core";

/**
 * Regression lock cho module i18n capability (W0.4).
 *
 * Mục tiêu: bảo đảm
 *  1. parity en/vi 100% (đã là quy tắc của repo, nay khoá luôn cho module mới);
 *  2. **mọi capability trong `capabilities.ts` đều có chuỗi upsell** — nếu thêm
 *     capability mà quên i18n thì UI upsell sẽ hiện key thô, vi phạm AGENTS.md Rule 1.
 */
describe("capability i18n: parity en/vi", () => {
	const enKeys = Object.keys(capabilityMessagesEn).sort();
	const viKeys = Object.keys(capabilityMessagesVi).sort();

	it("cùng số lượng key", () => {
		expect(viKeys.length).toBe(enKeys.length);
	});

	it("không có key nào thiếu ở tiếng Việt", () => {
		expect(viKeys).toEqual(enKeys);
	});

	it("không có value rỗng", () => {
		for (const [key, value] of Object.entries(capabilityMessagesEn)) {
			expect(value.trim(), `en:${key}`).not.toBe("");
		}
		for (const [key, value] of Object.entries(capabilityMessagesVi)) {
			expect(value.trim(), `vi:${key}`).not.toBe("");
		}
	});
});

describe("capability i18n: phủ kín capability có thể bị khoá", () => {
	// Chỉ capability có minTier "none" (Community) mới luôn mở cho MỌI user kể cả
	// chưa xác minh (AGENTS.md Rule 15) ⇒ không có upsell, và không được vẽ ra.
	// Mọi capability còn lại đều có thể bị khoá với user `free` ⇒ cần upsell copy.
	const LOCKABLE = ALL_CAPABILITIES.filter((c: Capability) => minTierFor(c) !== "none");
	const ALWAYS_OPEN = ALL_CAPABILITIES.filter((c: Capability) => minTierFor(c) === "none");

	it("mọi capability có thể khoá đều có `capability.upsell.<cap>.title` và `.benefit`", () => {
		const missing: string[] = [];
		for (const cap of LOCKABLE) {
			for (const suffix of ["title", "benefit"]) {
				const key = `capability.upsell.${cap}.${suffix}`;
				if (!widgetMessagesEn[key] || !widgetMessagesVi[key]) missing.push(key);
			}
		}
		expect(missing, `thiếu chuỗi upsell: ${missing.join(", ")}`).toEqual([]);
	});

	it("Community KHÔNG được có chuỗi upsell (không bán thứ đã mở sẵn)", () => {
		const offending = ALWAYS_OPEN.filter(
			(cap: Capability) => widgetMessagesEn[`capability.upsell.${cap}.title`],
		);
		expect(offending, `capability luôn mở mà có upsell: ${offending.join(", ")}`).toEqual([]);
	});

	it("community luôn mở vẫn mở ở mọi tier kể cả none (Rule 15)", () => {
		for (const cap of ALWAYS_OPEN) {
			expect(hasCapability("none", cap), `${cap} phải mở ở none`).toBe(true);
			expect(hasCapability("free", cap), `${cap} phải mở ở free`).toBe(true);
		}
	});

	it("không có key upsell thừa (capability đã bị xoá khỏi matrix)", () => {
		const known = new Set(ALL_CAPABILITIES);
		const orphans = Object.keys(capabilityMessagesEn)
			.filter((k) => k.startsWith("capability.upsell."))
			.map((k) => k.slice("capability.upsell.".length).split(".")[0])
			.filter((cap) => !known.has(cap as never));
		expect(orphans, `key upsell thừa: ${orphans.join(", ")}`).toEqual([]);
	});
});

describe("capability i18n: 3 trạng thái gate có chuỗi riêng", () => {
	it("locked / unavailable / data-availability có bộ chuỗi riêng biệt", () => {
		const required = [
			"capability.locked.title",
			"capability.locked.subtitle",
			"capability.locked.cta",
			"capability.unavailable.title",
			"capability.unavailable.backend",
			"capability.unavailable.device",
			"capability.unavailable.perf",
			"capability.unavailable.quota",
			"capability.unavailable.data",
			"data.unadjusted.title",
			"data.unadjusted.body",
			"data.localOnly.badge",
			"data.exportLoaded.badge",
		];
		for (const key of required) {
			expect(widgetMessagesEn[key], `en:${key}`).toBeTruthy();
			expect(widgetMessagesVi[key], `vi:${key}`).toBeTruthy();
		}
	});
});

describe("i18n: module mới đã được merge vào bundle", () => {
	it("widgetMessagesEn/Vi chứa key của module capability", () => {
		expect(widgetMessagesEn["capability.locked.title"]).toBe(
			capabilityMessagesEn["capability.locked.title"],
		);
		expect(widgetMessagesVi["capability.locked.title"]).toBe(
			capabilityMessagesVi["capability.locked.title"],
		);
	});
});
