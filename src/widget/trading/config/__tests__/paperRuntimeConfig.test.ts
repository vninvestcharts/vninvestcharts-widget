import { describe, expect, it } from "vitest";
import {
	resolvePaperRuntimeConfig,
	validatePaperRuntimeConfig,
	DEFAULT_PAPER_RUNTIME_CONFIG,
	INTEGRITY_FAILURE_MODES,
} from "../paperRuntimeConfig";

describe("paperRuntimeConfig validators (S1)", () => {
	it("accepts defaults with zero errors", () => {
		expect(validatePaperRuntimeConfig(DEFAULT_PAPER_RUNTIME_CONFIG)).toEqual([]);
	});

	// F-TRADE-01: lựa chọn của người dùng phải được validator chấp nhận đúng 3 giá trị,
	// và từ chối mọi thứ khác — nếu không, UI có thể lưu được giá trị mà hook từ chối.
	it("integrityFailureMode: chấp nhận đúng 3 giá trị hợp lệ", () => {
		for (const mode of INTEGRITY_FAILURE_MODES) {
			expect(validatePaperRuntimeConfig({ integrityFailureMode: mode })).toEqual([]);
		}
	});

	it("integrityFailureMode: từ chối giá trị lạ", () => {
		const errors = validatePaperRuntimeConfig({
			integrityFailureMode: "khong-hop-le" as never,
		});
		expect(errors.map((e) => e.field)).toContain("integrityFailureMode");
	});

	it("mặc định là 'warn' — hành vi ít phá vỡ nhất", () => {
		expect(DEFAULT_PAPER_RUNTIME_CONFIG.integrityFailureMode).toBe("warn");
	});

	it("resolve giữ nguyên lựa chọn của người dùng", () => {
		expect(resolvePaperRuntimeConfig({ integrityFailureMode: "strict" }).integrityFailureMode).toBe("strict");
		expect(resolvePaperRuntimeConfig(null).integrityFailureMode).toBe("warn");
	});

	it("rejects negatives and out-of-range values per field", () => {
		const errors = validatePaperRuntimeConfig({
			brokerFeeRate: -0.01,
			taxRate: 0.99,
			slippageTicks: 21,
			maxLeverage: 0,
			settlementDays: 5,
		});
		const fields = errors.map((e) => e.field).sort();
		expect(fields).toEqual(["brokerFeeRate", "maxLeverage", "settlementDays", "slippageTicks", "taxRate"]);
	});

	it("rejects non-integer slippage and unknown enums", () => {
		expect(validatePaperRuntimeConfig({ slippageTicks: 1.5 }).length).toBeGreaterThan(0);
		expect(validatePaperRuntimeConfig({ costBasisMethod: "lifo" as never }).length).toBeGreaterThan(0);
		expect(validatePaperRuntimeConfig({ pnlDisplayMode: "x" as never }).length).toBeGreaterThan(0);
	});

	it("resolve merges without mutating inputs", () => {
		const partial = { brokerFeeRate: 0 };
		const resolved = resolvePaperRuntimeConfig(partial);
		expect(resolved.brokerFeeRate).toBe(0);
		expect(resolved.taxRate).toBe(DEFAULT_PAPER_RUNTIME_CONFIG.taxRate);
		expect(partial).toEqual({ brokerFeeRate: 0 });
	});
});
