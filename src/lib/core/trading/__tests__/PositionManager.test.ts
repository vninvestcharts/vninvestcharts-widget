import { describe, it, expect } from "vitest";
import { PositionManager } from "../PositionManager";

// Task 03: PMS Netting (default) + Hedging + Partial Close + Reverse + T+2 available.
describe("PMS netting + average cost", () => {
	it("mua 100@128500 + mua 200@130000 -> giữ 300 giá vốn 129500", () => {
		const pms = new PositionManager();
		pms.openPosition({ symbol: "FPT", side: "long", quantity: 100, price: 128500, timestamp: 1 });
		const pos = pms.openPosition({ symbol: "FPT", side: "long", quantity: 200, price: 130000, timestamp: 2 });
		expect(pos.quantity).toBe(300);
		expect(pos.entryPrice).toBe(129500);
		expect(pos.availableQuantity).toBe(300);
	});

	it("đảo chiều: Long 100 -> Sell 150 -> Short 50 + PnL thực nhận", () => {
		const pms = new PositionManager();
		pms.openPosition({ symbol: "FPT", side: "long", quantity: 100, price: 128500, timestamp: 1 });
		const reversed = pms.openPosition({ symbol: "FPT", side: "short", quantity: 150, price: 130000, timestamp: 2 });
		expect(reversed.side).toBe("short");
		expect(reversed.quantity).toBe(50);
		expect(reversed.entryPrice).toBe(130000);
		expect(reversed.realizedPnl).toBe((130000 - 128500) * 100);
	});

	it("đóng một phần: 300 -> đóng 100 -> còn 200, PnL theo giá vốn bình quân", () => {
		const pms = new PositionManager();
		const opened = pms.openPosition({ symbol: "FPT", side: "long", quantity: 300, price: 129500, timestamp: 1 });
		const res = pms.closePosition(opened.id, 100, 131000, 2, "manual");
		expect(res.closedQuantity).toBe(100);
		expect(res.realizedPnl).toBe((131000 - 129500) * 100);
		const rest = pms.getPositionById(opened.id)!;
		expect(rest.quantity).toBe(200);
		expect(rest.entryPrice).toBe(129500);
		expect(rest.availableQuantity).toBe(200);
	});

	it("đóng toàn bộ xóa vị thế; short PnL đảo dấu", () => {
		const pms = new PositionManager();
		const opened = pms.openPosition({ symbol: "VN30F1M", side: "short", quantity: 50, price: 130000, timestamp: 1 });
		const res = pms.closePosition(opened.id, 50, 128000, 2, "manual");
		expect(res.realizedPnl).toBe((130000 - 128000) * 50);
		expect(res.remaining).toBeNull();
		expect(pms.getPositionById(opened.id)).toBeUndefined();
	});
});

describe("PMS mark price + hedging + settlement", () => {
	it("short + giá giảm -> unrealized dương; chỉ chạm đúng symbol", () => {
		const pms = new PositionManager();
		const s = pms.openPosition({ symbol: "VN30F1M", side: "short", quantity: 50, price: 130000, timestamp: 1 });
		pms.openPosition({ symbol: "FPT", side: "long", quantity: 100, price: 128500, timestamp: 1 });
		pms.updateMarkPrice("VN30F1M", 128000, 2);
		expect(pms.getPositionById(s.id)!.unrealizedPnl).toBe((130000 - 128000) * 50);
		expect(pms.getPosition("FPT")!.unrealizedPnl).toBe(0);
	});

	it("hedging mode: Long + Short cùng symbol tồn tại song song", () => {
		const pms = new PositionManager({ hedgingMode: true });
		const long = pms.openPosition({ symbol: "FPT", side: "long", quantity: 100, price: 128500, timestamp: 1 });
		const short = pms.openPosition({ symbol: "FPT", side: "short", quantity: 50, price: 129000, timestamp: 2 });
		expect(long.id).not.toBe(short.id);
		expect(pms.listPositions()).toHaveLength(2);
		pms.openPosition({ symbol: "FPT", side: "long", quantity: 100, price: 130000, timestamp: 3 });
		expect(pms.getPositionById(long.id)!.quantity).toBe(200);
		expect(pms.listPositions()).toHaveLength(2);
	});

	it("netting mode mặc định: mở ngược chiều không tạo vị thế thứ hai", () => {
		const pms = new PositionManager();
		pms.openPosition({ symbol: "FPT", side: "long", quantity: 100, price: 128500, timestamp: 1 });
		pms.openPosition({ symbol: "FPT", side: "short", quantity: 40, price: 129000, timestamp: 2 });
		expect(pms.listPositions()).toHaveLength(1);
		expect(pms.getPosition("FPT")!.quantity).toBe(60);
	});

	it("spot chờ T+2: available = 0, applySettlement mở khóa, đóng trước hạn throw", () => {
		const pms = new PositionManager();
		const settleAt = new Date(2026, 8, 22, 13, 0, 0, 0).getTime();
		const pos = pms.openPosition({
			symbol: "FPT",
			side: "long",
			quantity: 100,
			price: 128500,
			timestamp: 1,
			settlementDate: settleAt,
		});
		expect(pos.availableQuantity).toBe(0);
		expect(() => pms.closePosition(pos.id, 10, 129000, 2, "manual")).toThrow();
		pms.applySettlement(settleAt);
		expect(pms.getPositionById(pos.id)!.availableQuantity).toBe(100);
		const res = pms.closePosition(pos.id, 100, 129000, settleAt + 1, "manual");
		expect(res.realizedPnl).toBe((129000 - 128500) * 100);
	});

	it("contractMultiplier 100000: PnL phái sinh tính theo tiền (không phải điểm)", () => {
		const pms = new PositionManager({ contractMultiplier: 100000 });
		const s = pms.openPosition({ symbol: "VN30F1M", side: "short", quantity: 1, price: 1300, timestamp: 1 });
		pms.updateMarkPrice("VN30F1M", 1290, 2);
		expect(pms.getPositionById(s.id)!.unrealizedPnl).toBe((1300 - 1290) * 100000);
		const res = pms.closePosition(s.id, 1, 1290, 3, "manual");
		expect(res.realizedPnl).toBe((1300 - 1290) * 100000);
	});

	it("đóng vượt available -> throw, không đổi trạng thái", () => {
		const pms = new PositionManager();
		const pos = pms.openPosition({ symbol: "FPT", side: "long", quantity: 100, price: 128500, timestamp: 1 });
		expect(() => pms.closePosition(pos.id, 101, 129000, 2, "manual")).toThrow();
		expect(pms.getPositionById(pos.id)!.quantity).toBe(100);
	});
});
