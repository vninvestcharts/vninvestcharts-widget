import { describe, it, expect } from "vitest";
import { OrderManagementSystem } from "../OrderManagementSystem";
import type { ReplayOHLCBar } from "../../replay/replayTradingTypes";

// Task 02: OMS + Bracket OCO + Trailing + Phase-A reject. TDD — viết trước impl.
// Quy ước fill: market khớp open nến kế; limit khớp đúng giá; stop gap-through khớp open.
function bar(o: number, h: number, l: number, c: number): ReplayOHLCBar {
	return { open: o, high: h, low: l, close: c, date: 0 };
}

const TICK_100 = () => 100;

describe("OMS market + bracket OCO", () => {
	it("market buy khớp open nến kế, sinh cặp TP/SL mang parentOrderId", () => {
		const oms = new OrderManagementSystem({ tickSizeProvider: TICK_100 });
		const parent = oms.placeOrder({
			symbol: "FPT",
			side: "buy",
			type: "market",
			quantity: 100,
			bracket: { takeProfitPrice: 135000, stopLossPrice: 122000 },
		});
		expect(parent.status).toBe("working");
		const fills = oms.processBar("FPT", bar(128500, 129000, 128000, 128800), 1);
		expect(fills).toHaveLength(1);
		expect(fills[0].fillPrice).toBe(128500);
		const kids = oms.listOrders().filter((o) => o.parentOrderId === parent.id);
		expect(kids).toHaveLength(2);
		const tp = kids.find((o) => o.type === "limit")!;
		const sl = kids.find((o) => o.type === "stop")!;
		expect(tp.side).toBe("sell");
		expect(tp.price).toBe(135000);
		expect(sl.side).toBe("sell");
		expect(sl.stopPrice).toBe(122000);
	});

	it("TP khớp -> SL hủy ngay trong cùng processBar (OCO zero-delay)", () => {
		const oms = new OrderManagementSystem({ tickSizeProvider: TICK_100 });
		const parent = oms.placeOrder({
			symbol: "FPT",
			side: "buy",
			type: "market",
			quantity: 100,
			bracket: { takeProfitPrice: 135000, stopLossPrice: 122000 },
		});
		oms.processBar("FPT", bar(128500, 129000, 128000, 128800), 1);
		const fills = oms.processBar("FPT", bar(134000, 136000, 133000, 135500), 2);
		expect(fills.map((f) => f.orderId)).toHaveLength(1);
		const sl = oms.listOrders().find((o) => o.parentOrderId === parent.id && o.type === "stop")!;
		expect(sl.status).toBe("cancelled");
		expect(oms.listOrders().filter((o) => o.status === "working")).toHaveLength(0);
	});

	it("parent sell sinh lệnh con chiều buy (mirror short)", () => {
		const oms = new OrderManagementSystem();
		const parent = oms.placeOrder({
			symbol: "VN30F1M",
			side: "sell",
			type: "market",
			quantity: 1,
			bracket: { takeProfitPrice: 1200, stopLossPrice: 1350 },
		});
		oms.processBar("VN30F1M", bar(1300, 1310, 1290, 1305), 1);
		const kids = oms.listOrders().filter((o) => o.parentOrderId === parent.id);
		expect(kids.every((o) => o.side === "buy")).toBe(true);
	});

	it("nến nuốt cả TP và SL -> chỉ khớp SL (R6 conservative), TP bị hủy, không double-fill", () => {
		const oms = new OrderManagementSystem({ tickSizeProvider: TICK_100 });
		const parent = oms.placeOrder({
			symbol: "FPT",
			side: "buy",
			type: "market",
			quantity: 100,
			bracket: { takeProfitPrice: 135000, stopLossPrice: 122000 },
		});
		oms.processBar("FPT", bar(128500, 129000, 128000, 128800), 1);
		const fills = oms.processBar("FPT", bar(128000, 136000, 121000, 125000), 2);
		expect(fills).toHaveLength(1);
		expect(fills[0].fillPrice).toBe(122000);
		const tp = oms.listOrders().find((o) => o.parentOrderId === parent.id && o.type === "limit")!;
		expect(tp.status).toBe("cancelled");
		const sl = oms.listOrders().find((o) => o.parentOrderId === parent.id && o.type === "stop")!;
		expect(sl.status).toBe("filled");
	});
});

describe("OMS trailing stop", () => {
	it("SL dời lên theo đỉnh mới, không bao giờ hạ, khớp đúng mức đã dời", () => {
		const oms = new OrderManagementSystem({ tickSizeProvider: TICK_100 });
		const parent = oms.placeOrder({
			symbol: "FPT",
			side: "buy",
			type: "market",
			quantity: 100,
			bracket: { trailingStopDeltaTicks: 5 }, // delta = 500đ
		});
		const f0 = oms.processBar("FPT", bar(128500, 129000, 128000, 128800), 1);
		expect(f0[0].fillPrice).toBe(128500);
		let sl = oms.listOrders().find((o) => o.parentOrderId === parent.id)!;
		expect(sl.type).toBe("trailing_stop");
		expect(sl.stopPrice).toBe(128000); // 128500 - 500
		// Đỉnh mới 130000 -> SL dời lên 129500; low vẫn trên SL nên chưa khớp
		oms.processBar("FPT", bar(129000, 130000, 129600, 129800), 2);
		sl = oms.getOrder(sl.id)!;
		expect(sl.stopPrice).toBe(129500);
		// Giá hạ nhưng vẫn trên SL đã dời, đỉnh cũ giữ -> SL không hạ, chưa khớp
		oms.processBar("FPT", bar(129600, 129800, 129550, 129700), 3);
		sl = oms.getOrder(sl.id)!;
		expect(sl.stopPrice).toBe(129500);
		expect(sl.status).toBe("working");
		// Mở cửa trên SL rồi xuyên qua trong nến -> khớp đúng SL đã dời 129500 (không phải open)
		const fills = oms.processBar("FPT", bar(129700, 129800, 128000, 128500), 4);
		expect(fills).toHaveLength(1);
		expect(fills[0].fillPrice).toBe(129500);
	});
});

describe("OMS limit / gap / cancel", () => {
	it("limit buy chỉ khớp khi chạm giá, khớp đúng giá limit", () => {
		const oms = new OrderManagementSystem();
		const o = oms.placeOrder({ symbol: "FPT", side: "buy", type: "limit", quantity: 100, price: 127000 });
		expect(oms.processBar("FPT", bar(128500, 129000, 128200, 128800), 1)).toHaveLength(0);
		expect(oms.getOrder(o.id)!.status).toBe("working");
		const fills = oms.processBar("FPT", bar(128200, 128400, 126900, 127500), 2);
		expect(fills).toHaveLength(1);
		expect(fills[0].fillPrice).toBe(127000);
	});

	it("stop sell gap-through khớp tại open (không look-ahead)", () => {
		const oms = new OrderManagementSystem();
		oms.placeOrder({ symbol: "FPT", side: "sell", type: "stop", quantity: 100, stopPrice: 122000 });
		const fills = oms.processBar("FPT", bar(121000, 121500, 119000, 120000), 1);
		expect(fills).toHaveLength(1);
		expect(fills[0].fillPrice).toBe(121000);
	});

	it("cancel lệnh working -> true; cancel lệnh đã filled -> false", () => {
		const oms = new OrderManagementSystem();
		const o = oms.placeOrder({ symbol: "FPT", side: "buy", type: "limit", quantity: 100, price: 100000 });
		expect(oms.cancelOrder(o.id)).toBe(true);
		expect(oms.getOrder(o.id)!.status).toBe("cancelled");
		const m = oms.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		oms.processBar("FPT", bar(128500, 129000, 128000, 128800), 1);
		expect(oms.cancelOrder(m.id)).toBe(false);
	});
});

describe("OMS Phase-A reject guard", () => {
	it("stop_limit -> rejected + UNSUPPORTED_ORDER_TYPE, LƯU sổ cho lịch sử (TVP-A3)", () => {
		const oms = new OrderManagementSystem();
		const o = oms.placeOrder({ symbol: "FPT", side: "buy", type: "stop_limit", quantity: 100, price: 1 });
		expect(o.status).toBe("rejected");
		expect(o.rejectCode).toBe("UNSUPPORTED_ORDER_TYPE");
		expect(oms.listOrders()).toHaveLength(1);
		expect(oms.listOrders().filter((x) => x.status === "working")).toHaveLength(0);
		expect(oms.processBar("FPT", bar(1, 2, 0.5, 1.5), 1)).toHaveLength(0);
	});

	it("P1.2b: DAY/IOC/FOK được chấp nhận + lưu đúng TIF (không còn reject)", () => {
		const oms = new OrderManagementSystem();
		for (const tif of ["DAY", "IOC", "FOK"] as const) {
			const o = oms.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100, timeInForce: tif });
			expect(o.status).toBe("working");
			expect(o.timeInForce).toBe(tif);
		}
		expect(oms.listOrders()).toHaveLength(3);
	});

	it("P1.2b: chuỗi TIF lạ (JS callers) vẫn reject UNSUPPORTED_TIF", () => {
		const oms = new OrderManagementSystem();
		const o = oms.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100, timeInForce: "GTX" as never });
		expect(o.status).toBe("rejected");
		expect(o.rejectCode).toBe("UNSUPPORTED_TIF");
	});

	it("P1.2b: DAY hết hạn qua ngày UTC (lười gán dayKey ở nến đầu)", () => {
		const oms = new OrderManagementSystem();
		const o = oms.placeOrder({ symbol: "FPT", side: "buy", type: "limit", quantity: 100, price: 1, timeInForce: "DAY" });
		expect(o.status).toBe("working");
		// Nến cùng ngày UTC: không fill (giá xa) nhưng cũng không hết hạn.
		oms.processBar("FPT", { open: 128000, high: 128400, low: 127800, close: 128200, date: new Date("2026-09-21T03:00:00Z") });
		expect(oms.getOrder(o.id)?.status).toBe("working");
		expect(oms.getOrder(o.id)?.dayKey).toBe("2026-09-21");
		// Nến ngày UTC khác (dù cùng phiên ICT): hết hạn.
		oms.processBar("FPT", { open: 128000, high: 128400, low: 127800, close: 128200, date: new Date("2026-09-22T03:00:00Z") });
		expect(oms.getOrder(o.id)?.status).toBe("expired");
	});

	it("P1.2b: IOC/FOK không khớp thì hủy cuối pass (bracket children GTC miễn)", () => {
		const oms = new OrderManagementSystem();
		const ioc = oms.placeOrder({ symbol: "FPT", side: "buy", type: "limit", quantity: 100, price: 1, timeInForce: "IOC" });
		const fok = oms.placeOrder({ symbol: "FPT", side: "buy", type: "limit", quantity: 100, price: 1, timeInForce: "FOK" });
		oms.processBar("FPT", bar(128000, 128400, 127800, 128200), 1);
		expect(oms.getOrder(ioc.id)?.status).toBe("cancelled");
		expect(oms.getOrder(fok.id)?.status).toBe("cancelled");
		// IOC≡FOK hành vi (engine full-or-nothing, không partial) — khóa tương đương.
		const iocM = oms.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100, timeInForce: "IOC" });
		const fokM = oms.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100, timeInForce: "FOK" });
		oms.processBar("FPT", bar(128500, 129000, 128000, 128800), 2);
		expect(oms.getOrder(iocM.id)?.status).toBe("filled");
		expect(oms.getOrder(fokM.id)?.status).toBe("filled");
	});

	it("P1.2c VN: ATO/MP/MTL khớp open, ATC khớp close (đơn giản hóa có chủ ý)", () => {
		const oms = new OrderManagementSystem();
		const ato = oms.placeOrder({ symbol: "FPT", side: "buy", type: "ato", quantity: 100 });
		const atc = oms.placeOrder({ symbol: "FPT", side: "buy", type: "atc", quantity: 100 });
		const mp = oms.placeOrder({ symbol: "FPT", side: "buy", type: "mp", quantity: 100 });
		const mtl = oms.placeOrder({ symbol: "FPT", side: "buy", type: "mtl", quantity: 100 });
		for (const o of [ato, atc, mp, mtl]) expect(o.status).toBe("working");
		const fills = oms.processBar("FPT", bar(128500, 129000, 128000, 128800), 1);
		expect(fills).toHaveLength(4);
		const priceOf = (id: string) => fills.find((f) => f.orderId === id)?.fillPrice;
		expect(priceOf(ato.id)).toBe(128500);
		expect(priceOf(mp.id)).toBe(128500);
		expect(priceOf(mtl.id)).toBe(128500);
		expect(priceOf(atc.id)).toBe(128800);
	});

	it("P1.2c VN: không cần giá (như market), vẫn vào sổ working", () => {
		const oms = new OrderManagementSystem();
		for (const type of ["ato", "atc", "mp", "mtl"] as const) {
			const o = oms.placeOrder({ symbol: "FPT", side: "buy", type, quantity: 100 });
			expect(o.status).toBe("working");
			expect(o.timeInForce).toBe("GTC");
		}
	});

	it("thiếu price/stopPrice -> rejected + INVALID_PRICE", () => {
		const oms = new OrderManagementSystem();
		const noPrice = oms.placeOrder({ symbol: "FPT", side: "buy", type: "limit", quantity: 100 });
		expect(noPrice.status).toBe("rejected");
		expect(noPrice.rejectCode).toBe("INVALID_PRICE");
		const noStop = oms.placeOrder({ symbol: "FPT", side: "sell", type: "stop", quantity: 100 });
		expect(noStop.status).toBe("rejected");
		expect(noStop.rejectCode).toBe("INVALID_PRICE");
	});
});
