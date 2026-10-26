/**
 * S1: PaperRuntimeConfig — user-tunable paper trading config (§8 audit).
 * Pure types + defaults + validators (no React, no storage — see S3 hook).
 * All changes are PROSPECTIVE (§10 Q2): fills booked keep old values.
 */

export type CostBasisMethod = "average" | "fifo";
export type PnlDisplayMode = "gross" | "net";

/**
 * F-TRADE-01: khi pipeline đặt lệnh gặp sự cố toàn vẹn (lưu trạng thái hỏng, hoặc bar
 * dữ liệu không dùng được) thì hệ thống làm gì.
 *
 * Ba lựa chọn, vì mỗi lựa chọn đổi một thứ khác nhau và **người dùng** mới là người quyết:
 *  - `warn`  — chỉ hiện cảnh báo. Đặt lệnh vẫn chạy. Ít gián đoạn nhất, nhưng người dùng
 *              phải tự nhận ra số liệu có thể lệch.
 *  - `block` — chặn lệnh **mới** cho tới khi người dùng xác nhận đã xử lý. An toàn nhất cho
 *              dữ liệu, nhưng gián đoạn giao dịch.
 *  - `strict`— chặn và **từ chối im lặng** lệnh đó trong OMS, coi như lỗi dữ liệu nguồn.
 *
 * Mặc định `warn`: hành vi ít phá vỡ nhất, và hợp với việc cả hai tình huống đều **đã** được
 * xử lý an toàn ở tầng lõi (persist lỗi được ghi nhận + phát event; bar rác bị chặn trước khi
 * chạm OMS). Cấu hình này chỉ quyết định **mức độ báo và khóa**, không quyết định tính
 * đúng đắn — tính đúng đắn không nên phụ thuộc vào lựa chọn của người dùng.
 */
export type IntegrityFailureMode = "warn" | "block" | "strict";

export interface PaperRuntimeConfig {
	brokerFeeRate: number;
	commissionPerContract: number;
	taxRate: number;
	slippageTicks: number;
	costBasisMethod: CostBasisMethod;
	allowShortSelling: boolean;
	settlementDays: number;
	maxLeverage: number;
	pnlDisplayMode: PnlDisplayMode;
	/** F-TRADE-01: xử lý khi phát hiện lỗi toàn vẹn giao dịch. */
	integrityFailureMode: IntegrityFailureMode;
	/**
	 * A4 (QUICKTRADE_PILLS): đặt lệnh market tức thì khi bấm pill (bỏ qua ticket).
	 * Mặc định false — giữ hành vi "mở ticket" hiện tại; bật trong Settings → Execution.
	 */
	oneClickTrading: boolean;
	effectiveFrom: number;
}

export const DEFAULT_PAPER_RUNTIME_CONFIG: PaperRuntimeConfig = {
	brokerFeeRate: 0.001,
	commissionPerContract: 3000,
	taxRate: 0.001,
	slippageTicks: 0,
	costBasisMethod: "average",
	allowShortSelling: false,
	settlementDays: 2,
	maxLeverage: 1,
	pnlDisplayMode: "gross",
	integrityFailureMode: "warn",
	oneClickTrading: false,
	effectiveFrom: 0,
};

/** Các giá trị hợp lệ — validator và UI cùng đọc từ đây để không lệch nhau. */
export const INTEGRITY_FAILURE_MODES: readonly IntegrityFailureMode[] = ["warn", "block", "strict"] as const;

export const PAPER_CONFIG_BOUNDS = {
	brokerFeeRate: { min: 0, max: 0.05 },
	commissionPerContract: { min: 0, max: 100000 },
	taxRate: { min: 0, max: 0.05 },
	slippageTicks: { min: 0, max: 20 },
	settlementDays: { allowed: [0, 1, 2, 3] },
	maxLeverage: { min: 1, max: 100 },
} as const;

export interface ConfigValidationError {
	field: keyof PaperRuntimeConfig;
	message: string;
}

function inRange(value: number, min: number, max: number): boolean {
	return Number.isFinite(value) && value >= min && value <= max;
}

/** Field-level validation shared by modal (S1) and hook (S3). */
export function validatePaperRuntimeConfig(
	config: Partial<PaperRuntimeConfig>,
): ConfigValidationError[] {
	const errors: ConfigValidationError[] = [];
	if (config.brokerFeeRate !== undefined && !inRange(config.brokerFeeRate, 0, 0.05)) {
		errors.push({ field: "brokerFeeRate", message: "Fee must be between 0% and 5%" });
	}
	if (config.commissionPerContract !== undefined && !inRange(config.commissionPerContract, 0, 100000)) {
		errors.push({ field: "commissionPerContract", message: "Commission must be between 0 and 100,000" });
	}
	if (config.taxRate !== undefined && !inRange(config.taxRate, 0, 0.05)) {
		errors.push({ field: "taxRate", message: "Tax must be between 0% and 5%" });
	}
	if (config.slippageTicks !== undefined && (!Number.isInteger(config.slippageTicks) || !inRange(config.slippageTicks, 0, 20))) {
		errors.push({ field: "slippageTicks", message: "Slippage must be an integer 0–20" });
	}
	if (config.settlementDays !== undefined && ![0, 1, 2, 3].includes(config.settlementDays)) {
		errors.push({ field: "settlementDays", message: "Settlement must be 0, 1, 2 or 3" });
	}
	if (config.maxLeverage !== undefined && !inRange(config.maxLeverage, 1, 100)) {
		errors.push({ field: "maxLeverage", message: "Leverage must be between 1 and 100" });
	}
	if (config.costBasisMethod !== undefined && config.costBasisMethod !== "average" && config.costBasisMethod !== "fifo") {
		errors.push({ field: "costBasisMethod", message: "Cost basis must be average or fifo" });
	}
	if (config.pnlDisplayMode !== undefined && config.pnlDisplayMode !== "gross" && config.pnlDisplayMode !== "net") {
		errors.push({ field: "pnlDisplayMode", message: "PnL mode must be gross or net" });
	}
	// F-TRADE-01: so sánh với INTEGRITY_FAILURE_MODES để UI và validator không bao giờ lệch.
	if (
		config.integrityFailureMode !== undefined &&
		!INTEGRITY_FAILURE_MODES.includes(config.integrityFailureMode)
	) {
		errors.push({
			field: "integrityFailureMode",
			message: `Integrity mode must be one of: ${INTEGRITY_FAILURE_MODES.join(", ")}`,
		});
	}
	return errors;
}

/** Merge user partial over defaults (never mutates either). */
export function resolvePaperRuntimeConfig(
	partial?: Partial<PaperRuntimeConfig> | null,
): PaperRuntimeConfig {
	return { ...DEFAULT_PAPER_RUNTIME_CONFIG, ...(partial ?? {}) };
}
