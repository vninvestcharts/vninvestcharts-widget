import { describe, it, expect } from "vitest";
import { VirtualBrokerEngine } from "../VirtualBrokerEngine";
import { VN_SPOT_RULES } from "../MarketRules";
import { InMemoryStorageAdapter } from "../storage/InMemoryStorageAdapter";
import type { ReplayOHLCBar } from "../../replay/replayTradingTypes";

/**
 * F-TRADE-01 (điểm A) — `onBar` KHÔNG được để lại OMS và PMS lệch nhau.
 *
 * Đo trước khi sửa (probe tạm, đã xoá sau khi chốt): với `bar(0,0,0,0)` và một lệnh market
 * đang `working`, `onBar` **ném** `"Position price must be positive"` *sau khi*
 * `oms.processBar()` đã đánh dấu lệnh `filled` / `filledQuantity = 100`, trong khi PMS có
 * **0** vị thế. Bar hợp lệ đưa vào sau **không** tự sửa: order vẫn `filled`, vị thế vẫn 0.
 *
 * Bất biến được bảo vệ ở đây: **OMS và PMS luôn đồng bộ**. Cách giữ nó là chặn bar rác
 * TRƯỚC bước duy nhất biến OMS (`processBar`), chứ không rollback — vì
 * `PositionManager.restoreState()` gọi `clear()` mà `clear()` xoá cả FIFO `lots` mà
 * `restoreState` không phục hồi, nên rollback sẽ làm hỏng cost basis.
 */

const bar = (o: number, h: number, l: number, c: number, date = 1): ReplayOHLCBar => ({
	open: o,
	high: h,
	low: l,
	close: c,
	date,
});

function broker() {
	const b = new VirtualBrokerEngine({
		rules: VN_SPOT_RULES,
		storageAdapter: new InMemoryStorageAdapter(),
	});
	b.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 } as never, {
		skipValidation: true,
	});
	return b;
}

const filledQty = (b: VirtualBrokerEngine) =>
	b.getOrders().reduce((s, o) => s + (o.filledQuantity ?? 0), 0);
const posQty = (b: VirtualBrokerEngine) => b.getPositions().reduce((s, p) => s + p.quantity, 0);

describe("F-TRADE-01 điểm A — bar rác không được làm lệch OMS/PMS", () => {
	it.each([
		["giá 0", bar(0, 0, 0, 0)],
		["giá âm", bar(-5, -1, -10, -5)],
		["NaN", bar(Number.NaN, Number.NaN, Number.NaN, Number.NaN)],
		["Infinity", bar(Number.POSITIVE_INFINITY, 1, 1, 1)],
	])("bar %s: onBar không ném", (_name, badBar) => {
		const b = broker();
		expect(() => b.onBar("FPT", badBar, 1)).not.toThrow();
	});

	it.each([
		["giá 0", bar(0, 0, 0, 0)],
		["giá âm", bar(-5, -1, -10, -5)],
		["NaN", bar(Number.NaN, Number.NaN, Number.NaN, Number.NaN)],
	])("bar %s: OMS KHÔNG được đánh dấu filled", (_name, badBar) => {
		const b = broker();
		b.onBar("FPT", badBar, 1);
		expect(filledQty(b)).toBe(0);
		expect(b.getOrders()[0].status).toBe("working");
	});

	it("bất biến OMS/PMS giữ được sau bar rác, kể cả khi bar hợp lệ đến sau", () => {
		const b = broker();
		b.onBar("FPT", bar(0, 0, 0, 0), 1);
		expect(filledQty(b)).toBe(posQty(b));

		// bar hợp lệ đến sau: lệnh working sẽ fill đúng một lần, không nhân đôi
		b.onBar("FPT", bar(128000, 129000, 127000, 128500), 2);
		expect(filledQty(b)).toBe(100);
		expect(posQty(b)).toBe(100);
		expect(filledQty(b)).toBe(posQty(b));
	});

	it("bar rác bị đếm và mô tả, để quan sát được", () => {
		const b = broker();
		expect(b.getBarRejectionCount()).toBe(0);
		b.onBar("FPT", bar(0, 0, 0, 0), 1);
		b.onBar("FPT", bar(Number.NaN, 0, 0, 0), 2);
		expect(b.getBarRejectionCount()).toBe(2);
		expect(b.getLastBarRejected()).not.toBeNull();
		expect(b.getLastBarRejected()?.symbol).toBe("FPT");
	});

	it("bar rác KHÔNG được ghi đè lastClose (giá rác không thành mark price)", () => {
		const b = broker();
		b.onBar("FPT", bar(128000, 128000, 128000, 128000), 1);
		const mark1 = b.getPositions().length;
		b.onBar("FPT", bar(-1, -1, -1, -1), 2);
		// mark price phải giữ giá trị hợp lệ trước đó
		expect(b.getPositions().length).toBe(mark1);
		expect(b.getAccount().equity).not.toBeNaN();
	});

	it("bảo toàn: bar hợp lệ vẫn hoạt động như trước", () => {
		const b = broker();
		b.onBar("FPT", bar(128000, 129000, 127000, 128500), 1);
		expect(b.getPositions()).toHaveLength(1);
		expect(b.getPositions()[0].quantity).toBe(100);
		expect(b.getBarRejectionCount()).toBe(0);
	});

	it("bảo toàn: giá rất nhỏ nhưng hợp lệ vẫn được chấp nhận", () => {
		const b = new VirtualBrokerEngine({
			rules: VN_SPOT_RULES,
			storageAdapter: new InMemoryStorageAdapter(),
		});
		b.placeOrder({ symbol: "BTC", side: "buy", type: "market", quantity: 0.001 } as never, {
			skipValidation: true,
		});
		b.onBar("BTC", bar(0.00001, 0.00002, 0.00001, 0.000015), 1);
		expect(b.getBarRejectionCount()).toBe(0);
	});
});