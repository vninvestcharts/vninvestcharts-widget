import { describe, it, expect } from "vitest";
import { RiskEngine } from "../RiskEngine";
import { VN_SPOT_RULES, VN_DERIVATIVES_RULES, CRYPTO_SPOT_RULES } from "../MarketRules";
import type { BrokerAccount, TradingPosition } from "../types";

// Task 04: RiskEngine — ký quỹ tách 2 cấp, miễn trừ lệnh đóng, thang margin, giá thanh lý.
function spotAccount(balance: number): BrokerAccount {
	return {
		accountId: "test",
		balance,
		equity: balance,
		marginUsed: 0,
		freeMargin: balance,
		buyingPower: balance,
		currency: "VND",
		pnl: 0,
		pnlPercent: 0,
	};
}

function marginAccount(freeMargin: number): BrokerAccount {
	return { ...spotAccount(freeMargin), freeMargin, buyingPower: freeMargin };
}

function position(over: Partial<TradingPosition>): TradingPosition {
	return {
		id: "pos_1",
		symbol: "VN30F1M",
		side: "long",
		quantity: 1,
		availableQuantity: 1,
		entryPrice: 1300,
		currentPrice: 1300,
		unrealizedPnl: 0,
		realizedPnl: 0,
		createdAt: 0,
		updatedAt: 0,
		...over,
	};
}

describe("RiskEngine spot", () => {
	it("mua trong sức mua -> valid", () => {
		const engine = new RiskEngine();
		const r = engine.validateOrderRisk(
			{ symbol: "FPT", side: "buy", type: "market", quantity: 100, price: 128500 },
			spotAccount(100_000_000),
			VN_SPOT_RULES,
		);
		expect(r.valid).toBe(true);
		expect(r.requiredMargin).toBe(12_850_000);
	});

	it("mua vượt sức mua -> INSUFFICIENT_BUYING_POWER", () => {
		const engine = new RiskEngine();
		const r = engine.validateOrderRisk(
			{ symbol: "FPT", side: "buy", type: "market", quantity: 1000, price: 128500 },
			spotAccount(100_000_000),
			VN_SPOT_RULES,
		);
		expect(r.valid).toBe(false);
		expect(r.rejectCode).toBe("INSUFFICIENT_BUYING_POWER");
	});

	it("P1.2c VN: ATO/ATC/MP/MTL valid ở VN_SPOT, reject ở crypto", () => {
		const engine = new RiskEngine();
		for (const type of ["ato", "atc", "mp", "mtl"] as const) {
			const vn = engine.validateOrderRisk(
				{ symbol: "FPT", side: "buy", type, quantity: 100 },
				spotAccount(100_000_000),
				VN_SPOT_RULES,
				128500,
			);
			expect(vn.valid).toBe(true);
		}
		const crypto = engine.validateOrderRisk(
			{ symbol: "BTCUSDT", side: "buy", type: "ato", quantity: 1 },
			spotAccount(100_000_000),
			CRYPTO_SPOT_RULES,
			77200,
		);
		expect(crypto.valid).toBe(false);
		expect(crypto.rejectCode).toBe("UNSUPPORTED_ORDER_TYPE");
	});

	it("bẫy float: 100 x 100000 đúng bằng 10tr -> vẫn valid", () => {
		const engine = new RiskEngine();
		const r = engine.validateOrderRisk(
			{ symbol: "FPT", side: "buy", type: "market", quantity: 100, price: 100000 },
			spotAccount(10_000_000),
			VN_SPOT_RULES,
		);
		expect(r.valid).toBe(true);
	});

	it("spot bán khống -> SHORT_NOT_ALLOWED dù đủ tiền", () => {
		const engine = new RiskEngine();
		const r = engine.validateOrderRisk(
			{ symbol: "FPT", side: "sell", type: "market", quantity: 100, price: 128500 },
			spotAccount(1_000_000_000),
			VN_SPOT_RULES,
		);
		expect(r.valid).toBe(false);
		expect(r.rejectCode).toBe("SHORT_NOT_ALLOWED");
	});
});

describe("RiskEngine derivatives margin split", () => {
	it("1 HĐ @1300 -> vsd 22.75tr + total 28.4375tr (đọc từ rules)", () => {
		const engine = new RiskEngine();
		const m = engine.calculateOrderMargin({ quantity: 1 }, VN_DERIVATIVES_RULES, 1300);
		expect(m.vsdMargin).toBe(22_750_000);
		expect(m.totalRequiredMargin).toBe(28_437_500);
	});

	it("IM override 15% -> margin bám config, không hardcode", () => {
		const engine = new RiskEngine();
		const rules = { ...VN_DERIVATIVES_RULES, initialMarginRate: 0.15 };
		const m = engine.calculateOrderMargin({ quantity: 1 }, rules, 1300);
		expect(m.vsdMargin).toBe(19_500_000);
	});

	it("mở mới trong freeMargin -> valid; vượt -> reject", () => {
		const engine = new RiskEngine();
		const ok = engine.validateOrderRisk(
			{ symbol: "VN30F1M", side: "buy", type: "market", quantity: 1 },
			marginAccount(50_000_000),
			VN_DERIVATIVES_RULES,
			1300,
		);
		expect(ok.valid).toBe(true);
		const over = engine.validateOrderRisk(
			{ symbol: "VN30F1M", side: "buy", type: "market", quantity: 2 },
			marginAccount(50_000_000),
			VN_DERIVATIVES_RULES,
			1300,
		);
		expect(over.valid).toBe(false);
		expect(over.rejectCode).toBe("INSUFFICIENT_BUYING_POWER");
	});

	it("lệnh đóng (isClosingPosition) được miễn trừ ký quỹ mới", () => {
		const engine = new RiskEngine();
		const r = engine.validateOrderRisk(
			{ symbol: "VN30F1M", side: "sell", type: "market", quantity: 1, isClosingPosition: true },
			marginAccount(1_560_000),
			VN_DERIVATIVES_RULES,
			1300,
		);
		expect(r.valid).toBe(true);
		expect(r.requiredMargin).toBe(0);
	});

	it("đảo chiều chỉ tính ký quỹ phần dôi (Long 1 -> Sell 3 = margin 2 HĐ)", () => {
		const engine = new RiskEngine();
		const current = position({ side: "long", quantity: 1 });
		const ok = engine.validateOrderRisk(
			{ symbol: "VN30F1M", side: "sell", type: "market", quantity: 3 },
			marginAccount(60_000_000),
			VN_DERIVATIVES_RULES,
			1300,
			current,
		);
		expect(ok.valid).toBe(true);
		expect(ok.requiredMargin).toBe(56_875_000);
		const over = engine.validateOrderRisk(
			{ symbol: "VN30F1M", side: "sell", type: "market", quantity: 3 },
			marginAccount(50_000_000),
			VN_DERIVATIVES_RULES,
			1300,
			current,
		);
		expect(over.valid).toBe(false);
	});

	it("market không giá và không mark -> INVALID_PRICE; có mark -> định giá được", () => {
		const engine = new RiskEngine();
		const noPrice = engine.validateOrderRisk(
			{ symbol: "VN30F1M", side: "buy", type: "market", quantity: 1 },
			marginAccount(50_000_000),
			VN_DERIVATIVES_RULES,
		);
		expect(noPrice.valid).toBe(false);
		expect(noPrice.rejectCode).toBe("INVALID_PRICE");
		const withMark = engine.validateOrderRisk(
			{ symbol: "VN30F1M", side: "buy", type: "market", quantity: 1 },
			marginAccount(50_000_000),
			VN_DERIVATIVES_RULES,
			1300,
		);
		expect(withMark.valid).toBe(true);
	});
});

describe("RiskEngine account ladder + liquidation", () => {
	function assessed(balance: number, marginUsed: number, unrealized: number) {
		const engine = new RiskEngine();
		return engine.evaluateAccountRisk({
			...spotAccount(balance),
			equity: balance + unrealized,
			marginUsed,
			freeMargin: balance + unrealized - marginUsed,
		});
	}

	it("thang safe/warning/call/liquidation + spot luôn safe", () => {
		expect(assessed(50_000_000, 28_437_500, 0).status).toBe("safe"); // 175.7%
		expect(assessed(25_000_000, 28_437_500, 0).status).toBe("warning"); // 87.9%
		expect(assessed(20_000_000, 28_437_500, 0).status).toBe("call_margin"); // 70.3%
		expect(assessed(14_000_000, 28_437_500, 0).status).toBe("liquidation"); // 49.2%
		expect(assessed(100_000_000, 0, 0).status).toBe("safe");
		expect(assessed(100_000_000, 0, 0).marginLevelPercent).toBe(Number.POSITIVE_INFINITY);
	});

	it("giá thanh lý long 1 HĐ @1300 balance 50tr ≈ 942.19", () => {
		const engine = new RiskEngine();
		const liq = engine.calculateLiquidationPrice(
			position({ side: "long", quantity: 1, entryPrice: 1300 }),
			{ ...spotAccount(50_000_000), marginUsed: 28_437_500 },
			VN_DERIVATIVES_RULES,
		);
		expect(liq).toBeCloseTo(942.1875, 4);
	});

	it("recalculateAccount tổng hợp equity/margin/free/buyingPower", () => {
		const engine = new RiskEngine();
		const acc = engine.recalculateAccount(
			spotAccount(50_000_000),
		 [{ ...position({ side: "long", quantity: 1, entryPrice: 1300 }), currentPrice: 1310 }],
			VN_DERIVATIVES_RULES,
			{ VN30F1M: 1310 },
		);
		expect(acc.equity).toBe(51_000_000);
		expect(acc.marginUsed).toBe(28_437_500);
		expect(acc.freeMargin).toBe(22_562_500);
		expect(acc.buyingPower).toBe(22_562_500);
	});
});
