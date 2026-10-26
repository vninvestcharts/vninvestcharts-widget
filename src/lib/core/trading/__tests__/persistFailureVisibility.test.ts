import { describe, it, expect } from "vitest";
import { VirtualBrokerEngine } from "../VirtualBrokerEngine";
import { VN_SPOT_RULES } from "../MarketRules";
import type { AsyncStorageAdapter } from "@vninvestcharts/engine-react";

/**
 * A-4..A-6 — F-TRADE-01 (điểm B): lỗi lưu trạng thái phải **quan sát được**.
 *
 * Trước khi sửa, `VirtualBrokerEngine.persist()` kết thúc bằng
 * `.catch(() => undefined)` và cả `afterMutation()` lẫn `onBar()` đều gọi **không await**.
 * Hệ quả đo được: người dùng đóng lệnh, thấy nó trên màn hình, đóng tab — lúc mở lại
 * giao dịch đó biến mất **và không có thông báo nào**.
 *
 * ⚠ `persist()` là **fire-and-forget** theo thiết kế, nên lỗi được ghi nhận ở microtask
 * kế tiếp. Test phải `await tick()` trước khi khẳng định — kiểm tra đồng bộ sẽ luôn
 * thấy `null` và cho kết quả sai (đây chính là lý do bản test đầu đỏ 3/4).
 *
 * Test này **đã chạy đỎ trước khi sửa**; xem `docs/PLAN_F_TRADE_01_VISIBILITY_2026-10-15.md` §3.
 */

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Storage adapter luôn hỏng — mô phỏng quota đầy. */
function brokenStorage(): AsyncStorageAdapter {
	return {
		getItem: async () => null,
		setItem: async () => {
			throw new Error("QuotaExceededError");
		},
		removeItem: async () => undefined,
	} as unknown as AsyncStorageAdapter;
}

const ORDER = {
	symbol: "FPT",
	side: "buy",
	type: "market",
	quantity: 100,
	price: 128000,
} as never;

async function hydratedBrokerWith(storage: AsyncStorageAdapter) {
	const engine = new VirtualBrokerEngine({ rules: VN_SPOT_RULES, storageAdapter: storage });
	// `persist()` có hydrate-gate: `if (!this.storage || !this.hydrated) return`
	await engine.hydrate();
	return engine;
}

describe("VirtualBrokerEngine — lỗi persist phải lộ ra", () => {
	it("A-4/A-5: storage hỏng ⇒ lỗi quan sát được qua getter", async () => {
		const engine = await hydratedBrokerWith(brokenStorage());
		engine.placeOrder(ORDER, { skipValidation: true });

		expect(engine.getLastPersistError()).toBeNull(); // chưa tới microtask
		await tick();

		expect(engine.getLastPersistError()).toBeInstanceOf(Error);
		expect((engine.getLastPersistError() as Error).message).toContain("QuotaExceeded");
	});

	it("A-5b: lỗi persist phát qua event `persistError`", async () => {
		const engine = await hydratedBrokerWith(brokenStorage());
		const seen: unknown[] = [];
		engine.on("persistError", (e) => seen.push(e));

		engine.placeOrder(ORDER, { skipValidation: true });
		await tick();

		expect(seen).toHaveLength(1);
		expect(seen[0]).toBeInstanceOf(Error);
	});

	it("A-6: lần lưu THÀNH CÔNG thì lastPersistError là null", async () => {
		let shouldFail = true;
		const flaky = {
			getItem: async () => null,
			setItem: async () => {
				if (shouldFail) {
					shouldFail = false;
					throw new Error("lần 1 hỏng");
				}
			},
			removeItem: async () => undefined,
		} as unknown as AsyncStorageAdapter;

		const engine = await hydratedBrokerWith(flaky);
		engine.placeOrder(ORDER, { skipValidation: true });
		await tick();
		expect(engine.getLastPersistError()).toBeInstanceOf(Error);

		await engine.flush(); // flush() await persist() — lần này thành công
		expect(engine.getLastPersistError()).toBeNull();
	});

	it("bảo toàn: không có storage thì không có lỗi để báo", async () => {
		const engine = new VirtualBrokerEngine({ rules: VN_SPOT_RULES });
		await engine.hydrate();
		engine.placeOrder(ORDER, { skipValidation: true });
		await tick();
		expect(engine.getLastPersistError()).toBeNull();
	});

	it("bảo toàn: adapter hỏng KHÔNG làm `placeOrder` ném ra ngoài", async () => {
		const engine = await hydratedBrokerWith(brokenStorage());
		expect(() => engine.placeOrder(ORDER, { skipValidation: true })).not.toThrow();
		await tick();
		// lệnh vẫn được OMS nhận — lỗi lưu không được chặn nghiệp vụ
		expect(engine.getOrders().length).toBeGreaterThanOrEqual(1);
	});
});