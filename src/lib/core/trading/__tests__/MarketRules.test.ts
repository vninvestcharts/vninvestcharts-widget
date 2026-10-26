import { describe, it, expect } from "vitest";
import { VN_SPOT_RULES, VN_DERIVATIVES_RULES, CRYPTO_SPOT_RULES, resolveMarketProfile } from "../MarketRules";
import { SettlementCalendar } from "../SettlementCalendar";

// Task 01 acceptance: quy chuẩn VN_SPOT/VN_DERIVATIVES + settlement T+2.
describe("MarketRules VN_SPOT", () => {
	it("từ chối lệnh lẻ lô", () => {
		const r = VN_SPOT_RULES.validateOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 50 });
		expect(r.valid).toBe(false);
	});

	it("từ chối bán khống retail, chấp nhận bán đóng vị thế", () => {
		const short = VN_SPOT_RULES.validateOrder({ symbol: "FPT", side: "sell", type: "market", quantity: 100 });
		expect(short.valid).toBe(false);
		const closing = VN_SPOT_RULES.validateOrder({
			symbol: "FPT",
			side: "sell",
			type: "market",
			quantity: 100,
			isClosingPosition: true,
		});
		expect(closing.valid).toBe(true);
	});

	it("bước giá HOSE 3 bậc, HNX/UPCOM đồng 100đ", () => {
		expect(VN_SPOT_RULES.getTickSize(5000)).toBe(10);
		expect(VN_SPOT_RULES.getTickSize(20000)).toBe(50);
		expect(VN_SPOT_RULES.getTickSize(80000)).toBe(100);
		expect(VN_SPOT_RULES.getTickSize(20000, "HNX")).toBe(100);
		expect(VN_SPOT_RULES.getTickSize(5000, "UPCOM")).toBe(100);
	});

	it("biên độ HOSE ±7%, HNX ±10%, UPCOM ±15%", () => {
		expect(VN_SPOT_RULES.getPriceBand(100000, "HOSE")).toEqual({ ceilingPrice: 107000, floorPrice: 93000 });
		expect(VN_SPOT_RULES.getPriceBand(100000, "HNX")).toEqual({ ceilingPrice: 110000, floorPrice: 90000 });
		expect(VN_SPOT_RULES.getPriceBand(100000, "UPCOM")).toEqual({ ceilingPrice: 115000, floorPrice: 85000 });
	});
});

describe("MarketRules VN_DERIVATIVES", () => {
	it("chấp nhận short 1 HĐ VN30F1M", () => {
		const r = VN_DERIVATIVES_RULES.validateOrder({ symbol: "VN30F1M", side: "sell", type: "market", quantity: 1 });
		expect(r.valid).toBe(true);
	});

	it("từ chối KL 0 / lẻ / vượt 500 HĐ/lệnh", () => {
		expect(
			VN_DERIVATIVES_RULES.validateOrder({ symbol: "VN30F1M", side: "buy", type: "market", quantity: 0 }).valid,
		).toBe(false);
		expect(
			VN_DERIVATIVES_RULES.validateOrder({ symbol: "VN30F1M", side: "buy", type: "market", quantity: 1.5 }).valid,
		).toBe(false);
		expect(
			VN_DERIVATIVES_RULES.validateOrder({ symbol: "VN30F1M", side: "buy", type: "market", quantity: 501 }).valid,
		).toBe(false);
	});

	it("IM là param đọc từ rules (không hardcode 0.175 trong logic)", () => {
		expect(VN_DERIVATIVES_RULES.initialMarginRate).toBe(0.175);
		expect(VN_DERIVATIVES_RULES.brokerBufferMultiplier).toBe(1.25);
		expect(VN_DERIVATIVES_RULES.maxOrderQuantity).toBe(500);
		expect(VN_DERIVATIVES_RULES.maxPositionQuantity).toBe(5000);
	});
});

describe("SettlementCalendar", () => {
	it("mua thứ Sáu -> T+2 về 13:00 thứ Ba (qua cuối tuần)", () => {
		const friday = new Date(2026, 8, 18, 10, 0, 0, 0).getTime(); // 18/09/2026 = thứ Sáu
		expect(new Date(friday).getDay()).toBe(5);
		const settled = SettlementCalendar.calculateSettlementTimestamp(friday, 2);
		expect(settled).toBe(new Date(2026, 8, 22, 13, 0, 0, 0).getTime()); // thứ Ba 22/09 13:00
	});

	it("T+0 (phái sinh) trả ngay timestamp gốc", () => {
		const now = new Date(2026, 8, 18, 10, 0, 0, 0).getTime();
		expect(SettlementCalendar.calculateSettlementTimestamp(now, 0)).toBe(now);
	});

	it("ngày lễ inject từ config bị loại; ngoài seed chỉ trừ T7/CN", () => {
		SettlementCalendar.configure(["2026-09-21"]); // giả lập thứ Hai nghỉ lễ
		expect(SettlementCalendar.isTradingDay(new Date(2026, 8, 21))).toBe(false);
		const friday = new Date(2026, 8, 18, 10, 0, 0, 0).getTime();
		// T+2 bỏ qua T7(19), CN(20), lễ T2(21) -> về thứ Tư 23/09 13:00
		expect(SettlementCalendar.calculateSettlementTimestamp(friday, 2)).toBe(
			new Date(2026, 8, 23, 13, 0, 0, 0).getTime(),
		);
		SettlementCalendar.configure([]); // ngoài seed: chỉ trừ T7/CN
		expect(SettlementCalendar.isTradingDay(new Date(2023, 4, 1))).toBe(true); // thứ Hai 01/05/2023
		expect(SettlementCalendar.isTradingDay(new Date(2023, 4, 6))).toBe(false); // thứ Bảy
	});
});

describe("resolveMarketProfile", () => {
	it("mã VN -> spot, VN30F -> phái sinh, crypto -> spot margin", () => {
		expect(resolveMarketProfile("FPT")).toBe(VN_SPOT_RULES);
		expect(resolveMarketProfile("vnm")).toBe(VN_SPOT_RULES);
		expect(resolveMarketProfile("VN30F1M")).toBe(VN_DERIVATIVES_RULES);
		expect(resolveMarketProfile("BTCUSDT")).toBe(CRYPTO_SPOT_RULES);
		expect(resolveMarketProfile("ETH/USDT")).toBe(CRYPTO_SPOT_RULES);
		expect(resolveMarketProfile("BINANCE:BTCUSDT")).toBe(CRYPTO_SPOT_RULES);
	});

	it("crypto profile: lô 1, không short, T+0, tick theo bậc giá", () => {
		expect(CRYPTO_SPOT_RULES.lotSize).toBe(1);
		expect(CRYPTO_SPOT_RULES.allowShortSelling).toBe(false);
		expect(CRYPTO_SPOT_RULES.settlementDays).toBe(0);
		expect(CRYPTO_SPOT_RULES.getTickSize(77200)).toBe(0.1);
		expect(CRYPTO_SPOT_RULES.getTickSize(150)).toBe(0.01);
		const r = CRYPTO_SPOT_RULES.validateOrder({ symbol: "BTCUSDT", side: "sell", type: "market", quantity: 1 });
		expect(r.valid).toBe(false);
		expect(r.code).toBe("SHORT_NOT_ALLOWED");
	});
});
