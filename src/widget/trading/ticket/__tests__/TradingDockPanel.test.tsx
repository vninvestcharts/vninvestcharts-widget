import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TradingDockPanel } from "../TradingDockPanel";
import { VN_SPOT_RULES, CRYPTO_SPOT_RULES } from "../../../../lib/core/trading/MarketRules";

// Task TVP-B1: dock ticket — exits units, offset, summary, validation.
const account = { equity: 100_000_000, freeMargin: 100_000_000, buyingPower: 100_000_000 };

function dock(extra?: object) {
	const onSubmit = vi.fn();
	render(
		<TradingDockPanel
			side="buy"
			symbol="FPT"
			lastPrice={128500}
			rules={VN_SPOT_RULES}
			account={account}
			onSubmit={onSubmit}
			{...extra}
		/>,
	);
	return { onSubmit };
}

describe("TradingDockPanel", () => {
	// L-G08: sau Pha 1, submit = mở review → xác nhận. Fixture cũ gọi thẳng
	// `onSubmit` nên phải đi qua 2 bước (đây là hành vi MỚI, không phải hỏng).
	const confirmOrder = () => {
		fireEvent.click(screen.getByTestId("dock-submit"));
		fireEvent.click(screen.getByTestId("order-review-confirm"));
	};

	// AC1-AC3 — bước xác nhận lệnh (Pha 1 trust fixes): bấm submit KHÔNG bắn lệnh ngay.
	it("AC1: bấm submit chỉ mở review, chưa gọi onSubmit", () => {
		const { onSubmit } = dock();
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		fireEvent.click(screen.getByTestId("dock-submit"));
		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getByTestId("order-review")).toBeDefined();
		expect(screen.getByTestId("order-review-notional").textContent).toContain("12,700,000");
	});

	it("AC2: bấm Xác nhận trong review thì mới gọi onSubmit đúng 1 lần", () => {
		const { onSubmit } = dock();
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		fireEvent.click(screen.getByTestId("dock-submit"));
		fireEvent.click(screen.getByTestId("order-review-confirm"));
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ side: "buy", type: "limit", quantity: 100, price: 127000 });
	});

	it("AC3: bấm Hủy trong review thì không gọi onSubmit và quay lại form giữ nguyên giá đã nhập", () => {
		const { onSubmit } = dock();
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		fireEvent.click(screen.getByTestId("dock-submit"));
		fireEvent.click(screen.getByTestId("order-review-cancel"));
		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.queryByTestId("order-review")).toBeNull();
		expect((screen.getByTestId("dock-price") as HTMLInputElement).value).toBe("127000");
	});

	it("AC1: review hiện sức mua + margin yêu cầu (số để user kiểm nhẩm)", () => {
		dock();
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		fireEvent.click(screen.getByTestId("dock-submit"));
		const review = screen.getByTestId("order-review").textContent ?? "";
		expect(review).toContain("100,000,000");
	});

	it("Pha 2 quick mode: bật thì ẩn TP/SL/risk, tắt thì hiện lại", () => {
		dock();
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		expect(screen.getByTestId("dock-tp")).toBeDefined();
		expect(screen.getByTestId("dock-sl")).toBeDefined();
		fireEvent.click(screen.getByTestId("dock-quick-mode"));
		expect(screen.queryByTestId("dock-tp")).toBeNull();
		expect(screen.queryByTestId("dock-sl")).toBeNull();
		expect(screen.queryByTestId("dock-error")).toBeNull();
		fireEvent.click(screen.getByTestId("dock-quick-mode"));
		expect(screen.getByTestId("dock-tp")).toBeDefined();
		expect(screen.getByTestId("dock-sl")).toBeDefined();
	});

	it("Pha 2 SL preset: -1%/-2% đặt SL theo % equity (buy: entry - dist)", () => {
		const { onSubmit } = dock();
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		fireEvent.click(screen.getByTestId("dock-sl-preset-1"));
		expect(screen.getByTestId("dock-sl")).toBeDefined();
		const sl = (screen.getByTestId("dock-sl") as HTMLInputElement).value;
		expect(Number(sl)).toBeGreaterThan(0);
		expect(Number(sl)).toBeLessThan(127000);
	});

	it("Pha 2 SL preset: sell đặt SL theo % equity (entry + dist)", () => {
		render(
			<TradingDockPanel side="sell" symbol="FPT" lastPrice={128500} rules={VN_SPOT_RULES} account={account} onSubmit={() => {}} />,
		);
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		fireEvent.click(screen.getByTestId("dock-sl-preset-2"));
		const sl = (screen.getByTestId("dock-sl") as HTMLInputElement).value;
		expect(Number(sl)).toBeGreaterThan(127000);
	});

	it("Pha 2 SL preset bị disable khi chưa có entry price", () => {
		render(
			<TradingDockPanel side="buy" symbol="FPT" lastPrice={0} rules={VN_SPOT_RULES} account={account} onSubmit={() => {}} />,
		);
		const btn = screen.getByTestId("dock-sl-preset-1") as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it("disabled (paper trading off) blocks submit with explain tooltip", () => {
		const { onSubmit } = dock({ disabled: true });
		const submit = screen.getByTestId("dock-submit") as HTMLButtonElement;
		expect(submit.disabled).toBe(true);
		expect(submit.getAttribute("aria-disabled")).toBe("true");
		expect(submit.title.length).toBeGreaterThan(0);
		fireEvent.click(submit);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("enabled by default keeps submit working once the form is valid", () => {
		dock();
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		const submit = screen.getByTestId("dock-submit") as HTMLButtonElement;
		expect(submit.disabled).toBe(false);
		expect(submit.getAttribute("aria-disabled")).toBe("false");
	});

	it("submit summary kiểu TV + payload limit đầy đủ", () => {
		const { onSubmit } = dock();
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		const submit = screen.getByTestId("dock-submit") as HTMLButtonElement;
		expect(submit.disabled).toBe(false);
		expect(submit.textContent).toContain("MUA 100 FPT @ 127,000 LIMIT");
		fireEvent.click(submit);
		fireEvent.click(screen.getByTestId("order-review-confirm"));
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ side: "buy", type: "limit", quantity: 100, price: 127000 });
	});

	it("offset Ask+n ticks quy ra giá tuyệt đối", () => {
		const { onSubmit } = dock();
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.click(screen.getByTestId("dock-offset-check"));
		fireEvent.change(screen.getByTestId("dock-offset-ticks"), { target: { value: "2" } });
		confirmOrder();
		// 128500 + 2*100 (tick HOSE bậc 100) = 128700
		expect(onSubmit.mock.calls[0][0].price).toBe(128700);
	});

	it("exits ticks mode quy ra giá TP/SL quanh entry", () => {
		const { onSubmit } = dock();
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		fireEvent.click(screen.getByTestId("dock-exit-ticks"));
		fireEvent.change(screen.getByTestId("dock-tp"), { target: { value: "50" } });
		fireEvent.change(screen.getByTestId("dock-sl"), { target: { value: "30" } });
		confirmOrder();
		const order = onSubmit.mock.calls[0][0];
		expect(order.bracket.takeProfitPrice).toBe(127000 + 50 * 100);
		expect(order.bracket.stopLossPrice).toBe(127000 - 30 * 100);
	});

	it("exits percent mode quy ra khoảng cách theo % vốn", () => {
		const { onSubmit } = dock();
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		fireEvent.click(screen.getByTestId("dock-exit-percent"));
		fireEvent.change(screen.getByTestId("dock-sl"), { target: { value: "1" } });
		confirmOrder();
		const order = onSubmit.mock.calls[0][0];
		// 1% * 100M / (100 * 1) = 10000đ -> SL = 127000 - 10000 = 117000
		expect(order.bracket.stopLossPrice).toBe(117000);
	});

	it("D-02: mở buy pre-fill giá lastPrice, không lỗi đỏ, submit sẵn sàng", () => {
		dock();
		expect((screen.getByTestId("dock-price") as HTMLInputElement).value).toBe("128500");
		expect(screen.queryByTestId("dock-error")).toBeNull();
		const submit = screen.getByTestId("dock-submit") as HTMLButtonElement;
		expect(submit.disabled).toBe(false);
		expect(submit.textContent).toContain("MUA");
	});

	it("D-02: xóa tay giá → lỗi đỏ quay lại (validation cũ còn nguyên)", () => {
		dock();
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "" } });
		expect(screen.getByTestId("dock-error")).toBeDefined();
		expect((screen.getByTestId("dock-submit") as HTMLButtonElement).disabled).toBe(true);
	});

	it("D-02: đổi symbol cập nhật priceText theo lastPrice mới nếu user chưa sửa", () => {
		const onSubmit = vi.fn();
		const { rerender } = render(
			<TradingDockPanel side="buy" symbol="FPT" lastPrice={128500} rules={VN_SPOT_RULES} account={account} onSubmit={onSubmit} />,
		);
		expect((screen.getByTestId("dock-price") as HTMLInputElement).value).toBe("128500");
		rerender(
			<TradingDockPanel side="buy" symbol="VNM" lastPrice={60000} rules={VN_SPOT_RULES} account={account} onSubmit={onSubmit} />,
		);
		expect((screen.getByTestId("dock-price") as HTMLInputElement).value).toBe("60000");
	});

	it("D-02: user nhập tay giá riêng thì cập nhật lastPrice không ghi đè", () => {
		const onSubmit = vi.fn();
		const props = (symbol: string, lastPrice: number) => (
			<TradingDockPanel side="buy" symbol={symbol} lastPrice={lastPrice} rules={VN_SPOT_RULES} account={account} onSubmit={onSubmit} />
		);
		const { rerender } = render(props("FPT", 128500));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		rerender(props("FPT", 129000));
		expect((screen.getByTestId("dock-price") as HTMLInputElement).value).toBe("127000");
	});

	it("D-02: giá rỗng + chuyển tab sang stop thì điền lại lastPrice", () => {
		dock();
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "" } });
		expect(screen.getByTestId("dock-error")).toBeDefined();
		fireEvent.click(screen.getByTestId("dock-type-stop"));
		expect((screen.getByTestId("dock-price") as HTMLInputElement).value).toBe("128500");
		expect(screen.queryByTestId("dock-error")).toBeNull();
	});

	it("P1.2b: chọn TIF DAY chảy vào payload submit", () => {
		const { onSubmit } = dock();
		fireEvent.change(screen.getByTestId("dock-tif"), { target: { value: "DAY" } });
		expect((screen.getByTestId("dock-tif") as HTMLSelectElement).value).toBe("DAY");
		confirmOrder();
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ timeInForce: "DAY" });
	});

	it("P1.2c VN: hiện tabs ATO/ATC/MP/MTL với rules VN_SPOT", () => {
		dock();
		for (const type of ["ato", "atc", "mp", "mtl"]) {
			expect(screen.getByTestId(`dock-type-${type}`)).toBeDefined();
		}
	});

	it("P1.2c VN: crypto (GLOBAL_MARGIN) không có tabs ATO/MP", () => {
		render(
			<TradingDockPanel side="buy" symbol="BTCUSDT" lastPrice={77200} rules={CRYPTO_SPOT_RULES} account={account} onSubmit={() => {}} />,
		);
		expect(screen.queryByTestId("dock-type-ato")).toBeNull();
		expect(screen.queryByTestId("dock-type-mp")).toBeNull();
		expect(screen.getByTestId("dock-type-market")).toBeDefined();
	});

	it("P1.2c VN: submit MP mang đúng type, không cần giá", () => {
		const onSubmit = vi.fn();
		render(
			<TradingDockPanel side="buy" symbol="FPT" lastPrice={128500} rules={VN_SPOT_RULES} account={account} onSubmit={onSubmit} />,
		);
		fireEvent.click(screen.getByTestId("dock-type-mp"));
		confirmOrder();
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: "mp", symbol: "FPT" });
		expect(onSubmit.mock.calls[0][0].price).toBeUndefined();
	});

	it("P2: trailing_stop tab hiện cho mọi profile, submit với stopPrice + trailing delta", () => {
		const onSubmit = vi.fn();
		render(
			<TradingDockPanel side="buy" symbol="FPT" lastPrice={128500} rules={VN_SPOT_RULES} account={account} onSubmit={onSubmit} />,
		);
		expect(screen.getByTestId("dock-type-trailing_stop")).toBeDefined();
		fireEvent.click(screen.getByTestId("dock-type-trailing_stop"));
		expect(screen.getByTestId("dock-trail-ticks")).toBeDefined();
		expect((screen.getByTestId("dock-trail-ticks") as HTMLInputElement).value).toBe("5");
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		confirmOrder();
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: "trailing_stop", stopPrice: 127000 });
		expect(onSubmit.mock.calls[0][0].bracket.trailingStopDeltaTicks).toBe(5);
	});

	it("P2: stop tab không hiện trailing delta, trailing_stop khác biệt UI", () => {
		const onSubmit = vi.fn();
		render(
			<TradingDockPanel side="buy" symbol="FPT" lastPrice={128500} rules={VN_SPOT_RULES} account={account} onSubmit={onSubmit} />,
		);
		fireEvent.click(screen.getByTestId("dock-type-stop"));
		expect(screen.queryByTestId("dock-trail-ticks")).toBeNull();
		fireEvent.click(screen.getByTestId("dock-type-trailing_stop"));
		expect(screen.getByTestId("dock-trail-ticks")).toBeDefined();
	});

	it("P2: trailing_stop rỗng delta thì chặn submit với lỗi Trail", () => {
		const onSubmit = vi.fn();
		render(
			<TradingDockPanel side="buy" symbol="FPT" lastPrice={128500} rules={VN_SPOT_RULES} account={account} onSubmit={onSubmit} />,
		);
		fireEvent.click(screen.getByTestId("dock-type-trailing_stop"));
		fireEvent.change(screen.getByTestId("dock-trail-ticks"), { target: { value: "" } });
		expect(screen.getByTestId("dock-error")).toBeDefined();
		expect((screen.getByTestId("dock-submit") as HTMLButtonElement).disabled).toBe(true);
		fireEvent.change(screen.getByTestId("dock-trail-ticks"), { target: { value: "10" } });
		expect(screen.queryByTestId("dock-error")).toBeNull();
		confirmOrder();
		expect(onSubmit.mock.calls[0][0].bracket.trailingStopDeltaTicks).toBe(10);
	});

	it("PLO VN: hiện tab plo cho VN_SPOT, submit với price", () => {
		const onSubmit = vi.fn();
		render(
			<TradingDockPanel side="buy" symbol="FPT" lastPrice={128500} rules={VN_SPOT_RULES} account={account} onSubmit={onSubmit} />,
		);
		expect(screen.getByTestId("dock-type-plo")).toBeDefined();
		fireEvent.click(screen.getByTestId("dock-type-plo"));
		expect((screen.getByTestId("dock-price") as HTMLInputElement).value).toBe("128500");
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		confirmOrder();
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: "plo", price: 127000 });
	});

	it("P1.2b: IOC submit đi kèm timeInForce đúng (matching ở engine)", () => {
		const onSubmit = vi.fn();
		render(
			<TradingDockPanel side="buy" symbol="FPT" lastPrice={128500} rules={VN_SPOT_RULES} account={account} onSubmit={onSubmit} />,
		);
		fireEvent.change(screen.getByTestId("dock-tif"), { target: { value: "IOC" } });
		confirmOrder();
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: "limit", timeInForce: "IOC", price: 128500 });
	});

	it("D-02: bỏ check offset khi giá rỗng → điền lại lastPrice", () => {
		dock();
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "" } });
		fireEvent.click(screen.getByTestId("dock-offset-check"));
		fireEvent.click(screen.getByTestId("dock-offset-check"));
		expect((screen.getByTestId("dock-price") as HTMLInputElement).value).toBe("128500");
	});

	it("sell khống spot bị chặn ngay trên dock (VN_SPOT)", () => {
		const { onSubmit } = dock();
		fireEvent.click(screen.getByTestId("dock-side-sell"));
		expect(screen.getByTestId("dock-error")).toBeDefined();
		expect((screen.getByTestId("dock-submit") as HTMLButtonElement).disabled).toBe(true);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("P1.2a: chip 50% sức mua tính đúng lô chẵn (50M/128500 → 300)", () => {
		dock();
		fireEvent.click(screen.getByTestId("dock-qty-pct-50"));
		expect((screen.getByTestId("dock-qty") as HTMLInputElement).value).toBe("300");
		expect(screen.getByTestId("dock-submit").textContent).toContain("300");
	});

	it("P1.2a: chip 100% không vượt quá sức mua và giữ bội số lô", () => {
		dock();
		fireEvent.click(screen.getByTestId("dock-qty-pct-100"));
		const qty = Number.parseInt((screen.getByTestId("dock-qty") as HTMLInputElement).value, 10);
		expect(qty % 100).toBe(0);
		expect(qty * 128500).toBeLessThanOrEqual(100_000_000);
	});

	it("xóa trắng qty rồi gõ lại: 100 -> xóa -> 250 (repro)", () => {
		dock();
		const input = screen.getByTestId("dock-qty") as HTMLInputElement;
		expect(input.value).toBe("100");
		fireEvent.change(input, { target: { value: "" } });
		expect(input.value).toBe("");
		fireEvent.change(input, { target: { value: "250" } });
		expect(input.value).toBe("250");
		expect(screen.getByTestId("dock-submit").textContent).toContain("250");
	});

	// SW2 (TICKET_POLISH_2026-10-25) — P1-5 lock-in: vị thế đang mở + P&L live.
	it("P1-5: có vị thế đang mở → render qty + giá nhập + P&L", () => {
		render(
			<TradingDockPanel
				side="buy"
				symbol="FPT"
				lastPrice={128500}
				rules={VN_SPOT_RULES}
				account={account}
				currentPosition={{
					id: "p1",
					symbol: "FPT",
					side: "long",
					quantity: 200,
					availableQuantity: 200,
					entryPrice: 64000,
					currentPrice: 65000,
					unrealizedPnl: 120000,
					realizedPnl: 0,
					createdAt: 0,
					updatedAt: 0,
				}}
				onSubmit={() => {}}
			/>,
		);
		const pos = screen.getByTestId("dock-position").textContent ?? "";
		expect(pos).toContain("200 @ 64,000");
		expect(pos).toContain("120,000");
	});

	it("P1-5: không có vị thế → ẩn dock-position", () => {
		dock();
		expect(screen.queryByTestId("dock-position")).toBeNull();
	});

	it("P1-5: qty = 0 → ẩn dock-position", () => {
		render(
			<TradingDockPanel
				side="buy"
				symbol="FPT"
				lastPrice={128500}
				rules={VN_SPOT_RULES}
				account={account}
				currentPosition={{
					id: "p1",
					symbol: "FPT",
					side: "long",
					quantity: 0,
					availableQuantity: 0,
					entryPrice: 64000,
					currentPrice: 64000,
					unrealizedPnl: 0,
					realizedPnl: 0,
					createdAt: 0,
					updatedAt: 0,
				}}
				onSubmit={() => {}}
			/>,
		);
		expect(screen.queryByTestId("dock-position")).toBeNull();
	});

	it("P1-5: P&L cập nhật khi position prop đổi (live)", () => {
		const props = (pnl: number) => (
			<TradingDockPanel
				side="buy"
				symbol="FPT"
				lastPrice={128500}
				rules={VN_SPOT_RULES}
				account={account}
				currentPosition={{
					id: "p1",
					symbol: "FPT",
					side: "long",
					quantity: 200,
					availableQuantity: 200,
					entryPrice: 64000,
					currentPrice: 65000,
					unrealizedPnl: pnl,
					realizedPnl: 0,
					createdAt: 0,
					updatedAt: 0,
				}}
				onSubmit={() => {}}
			/>
		);
		const { rerender } = render(props(120000));
		expect(screen.getByTestId("dock-position").textContent).toContain("120,000");
		rerender(props(999));
		expect(screen.getByTestId("dock-position").textContent).toContain("999");
	});

	// SW2 — P1-4 RED-before: hint stop-market + stop_limit chưa hỗ trợ.
	it("P1-4: tab Stop hiện hint stop-market + stop_limit chưa hỗ trợ; tab Limit ẩn hint (RED-before)", () => {
		dock();
		fireEvent.click(screen.getByTestId("dock-type-stop"));
		const hint = screen.getByTestId("dock-stop-hint");
		expect(hint).toBeDefined();
		expect(hint.textContent ?? "").toContain("stop-market");
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		expect(screen.queryByTestId("dock-stop-hint")).toBeNull();
	});

	// SW2 — P1-4 lock-in: submit summary stop-market có giá dừng + payload stop.
	it("P1-4: submit summary stop-market có giá dừng + payload stop (lock-in)", () => {
		const { onSubmit } = dock();
		fireEvent.click(screen.getByTestId("dock-type-stop"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		expect(screen.getByTestId("dock-submit").textContent).toContain("@ 127,000 STOP");
		fireEvent.click(screen.getByTestId("dock-submit"));
		fireEvent.click(screen.getByTestId("order-review-confirm"));
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: "stop", stopPrice: 127000 });
	});
});

