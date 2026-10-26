import { describe, it, expect, vi } from "vitest";
import { TradingEventBus } from "../BrokerAPI";

/**
 * A-1..A-3 — F-TRADE-01 (điểm C): một listener ném lỗi phải KHÔNG làm các listener sau
 * bị bỏ qua, và không được làm `emit` ném ra ngoài.
 *
 * Vì sao quan trọng: `VirtualBrokerEngine.emitAll()` (:426) phát 4 event theo thứ tự
 * `orderChange` → `positionChange` → `accountChange` → ... . Trước khi có try/catch,
 * một listener hỏng ở event đầu làm **3 event sau không bao giờ tới UI** — người dùng
 * thấy lệnh đã đặt nhưng vị thế không đổi.
 *
 * Test này **phải đỏ trước khi sửa**; xem `docs/PLAN_F_TRADE_01_VISIBILITY_2026-10-15.md` §3.
 */
describe("TradingEventBus — cách ly listener", () => {
	it("A-1/A-2: listener ném lỗi KHÔNG chặn listener sau", () => {
		const bus = new TradingEventBus();
		const order: string[] = [];
		bus.on("orderChange", () => order.push("first"));
		bus.on("orderChange", () => {
			throw new Error("listener hỏng");
		});
		bus.on("orderChange", () => order.push("third"));

		expect(() => bus.emit("orderChange", [] as never)).not.toThrow();
		expect(order).toEqual(["first", "third"]);
	});

	it("A-2b: listener ném lỗi KHÔNG chặn listener của event SAU", () => {
		const bus = new TradingEventBus();
		const seen: string[] = [];
		bus.on("orderChange", () => {
			throw new Error("hỏng");
		});
		bus.on("positionChange", () => seen.push("position"));

		bus.emit("orderChange", [] as never);
		bus.emit("positionChange", [] as never);

		expect(seen).toEqual(["position"]);
	});

	it("A-3: lỗi listener được báo qua hook, không im lặng", () => {
		const bus = new TradingEventBus();
		const onError = vi.fn();
		bus.onListenerError?.(onError);

		bus.on("fill", () => {
			throw new Error("bang");
		});
		bus.emit("fill", {} as never);

		expect(onError).toHaveBeenCalledTimes(1);
		expect((onError.mock.calls[0][1] as Error).message).toBe("bang");
	});

	it("bảo toàn: mọi listener hợp lệ vẫn chạy đủ, đúng thứ tự", () => {
		const bus = new TradingEventBus();
		const order: number[] = [];
		bus.on("accountChange", () => order.push(1));
		bus.on("accountChange", () => order.push(2));
		bus.on("accountChange", () => order.push(3));
		bus.emit("accountChange", {} as never);
		expect(order).toEqual([1, 2, 3]);
	});

	it("bảo toàn: huỷ listener vẫn hoạt động", () => {
		const bus = new TradingEventBus();
		let n = 0;
		const off = bus.on("fill", () => {
			n += 1;
		});
		bus.emit("fill", {} as never);
		off();
		bus.emit("fill", {} as never);
		expect(n).toBe(1);
	});

	it("không listener nào đăng ký thì emit không làm gì", () => {
		const bus = new TradingEventBus();
		expect(() => bus.emit("fill", {} as never)).not.toThrow();
	});
});