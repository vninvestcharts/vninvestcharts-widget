import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrderTicketModal } from "../OrderTicketModal";
import { RiskCalculatorView } from "../RiskCalculatorView";
import { VN_SPOT_RULES } from "../../../../lib/core/trading/MarketRules";
import styles from "../OrderTicketModal.module.css";

// Task 07: ticket render trần (portal fallback document.body trong jsdom).
const account = { equity: 100_000_000, freeMargin: 100_000_000, buyingPower: 100_000_000 };

function openTicket(extra?: object) {
	const onSubmit = vi.fn();
	const onClose = vi.fn();
	render(
		<OrderTicketModal
			open
			side="buy"
			symbol="FPT"
			lastPrice={128500}
			rules={VN_SPOT_RULES}
			account={account}
			onClose={onClose}
			onSubmit={onSubmit}
			{...extra}
		/>,
	);
	return { onSubmit, onClose };
}

describe("OrderTicketModal", () => {
	it("open=false -> render null", () => {
		const onSubmit = vi.fn();
		render(
			<OrderTicketModal
				open={false}
				side="buy"
				symbol="FPT"
				lastPrice={128500}
				rules={VN_SPOT_RULES}
				account={account}
				onClose={() => {}}
				onSubmit={onSubmit}
			/>,
		);
		expect(screen.queryByTestId("order-ticket-overlay")).toBeNull();
	});

	it("market submit -> payload GTC đầy đủ, TIF khóa GTC (R4)", () => {
		const { onSubmit } = openTicket();
		expect(screen.getByTestId("ticket-title").textContent).toBe("Mua FPT");
		expect(screen.getByTestId("tif-row").textContent).toContain("GTC");
		fireEvent.click(screen.getByTestId("ticket-submit"));
		// Pha 1: lệnh mới phải qua bước XÁC NHẬN (AC5) — bấm submit mới chưa gửi.
		expect(onSubmit).not.toHaveBeenCalled();
		fireEvent.click(screen.getByTestId("order-review-confirm"));
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0][0]).toMatchObject({
			symbol: "FPT",
			side: "buy",
			type: "market",
			quantity: 100,
			timeInForce: "GTC",
		});
	});

	it("limit thiếu giá -> disable + báo lỗi; nhập giá -> mở lại", () => {
		openTicket();
		fireEvent.click(screen.getByTestId("type-limit"));
		const submit = screen.getByTestId("ticket-submit") as HTMLButtonElement;
		expect(submit.disabled).toBe(true);
		expect(screen.getByTestId("ticket-error")).toBeDefined();
		fireEvent.change(screen.getByTestId("limit-price"), { target: { value: "127000" } });
		expect((screen.getByTestId("ticket-submit") as HTMLButtonElement).disabled).toBe(false);
	});

	it("lô lẻ 50 -> lỗi invalidQuantity + disable (VN_SPOT)", () => {
		openTicket();
		fireEvent.change(screen.getByTestId("ticket-qty"), { target: { value: "50" } });
		expect(screen.getByTestId("ticket-error")).toBeDefined();
		expect((screen.getByTestId("ticket-submit") as HTMLButtonElement).disabled).toBe(true);
	});

	it("bracket TP/SL hiện R:R 1:2.00 + preview sức mua", () => {
		openTicket();
		fireEvent.click(screen.getByTestId("tp-check"));
		fireEvent.change(screen.getByTestId("tp-price"), { target: { value: "141500" } });
		fireEvent.click(screen.getByTestId("sl-check"));
		fireEvent.change(screen.getByTestId("sl-price"), { target: { value: "122000" } });
		expect(screen.getByText("1 : 2.00")).toBeDefined();
		expect(screen.getByTestId("margin-preview").textContent).toContain("100,000,000");
	});

	it("edit-mode: prefill giá, submit -> onModify (không đặt lệnh mới)", () => {
		const onSubmit = vi.fn();
		const onModify = vi.fn();
		render(
			<OrderTicketModal
				open
				side="sell"
				symbol="FPT"
				lastPrice={128500}
				rules={VN_SPOT_RULES}
				account={account}
				onClose={() => {}}
				onSubmit={onSubmit}
				initialValues={{ stopPrice: 122000 }}
				initialType="stop"
				editOrderId="ord_sl"
				onModify={onModify}
			/>,
		);
		expect(screen.getByTestId("edit-type-label").textContent).toContain("stop");
		expect((screen.getByTestId("stop-price") as HTMLInputElement).value).toBe("122000");
		fireEvent.change(screen.getByTestId("stop-price"), { target: { value: "121500" } });
		fireEvent.click(screen.getByTestId("ticket-submit"));
		expect(onModify).toHaveBeenCalledWith("ord_sl", { price: undefined, stopPrice: 121500 });
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("Escape -> onClose", () => {
		const { onClose } = openTicket();
		fireEvent.keyDown(window, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	// AC9 — Escape khi đang ở bước review: huỷ review, KHÔNG đóng modal.
	// Dispatch trên `document` (mẫu useDialogFocus.test.tsx:63-68): listener capture ở
	// document không nhận event được dispatch thẳng vào `window`.
	it("AC9: Escape khi review mở thì huỷ review, modal vẫn mở, lệnh chưa gửi", () => {
		const { onSubmit, onClose } = openTicket();
		fireEvent.click(screen.getByTestId("ticket-submit"));
		expect(screen.getByTestId("order-review")).toBeDefined();
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByTestId("order-review")).toBeNull();
		expect(onClose).not.toHaveBeenCalled();
		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getByTestId("ticket-submit")).toBeDefined();
	});

	it("multi 2x2: portal lên workspace root, không kẹt trong cell root (anti-clip)", () => {
		const onSubmit = vi.fn();
		render(
			<div data-testid="workspace-root" className="vnsc-root vnsc-multicharts-root">
				<div data-testid="cell-root" className="vnsc-root">
					<OrderTicketModal
						open
						side="buy"
						symbol="BTCUSDT"
						lastPrice={77821.4}
						rules={VN_SPOT_RULES}
						account={account}
						onClose={() => {}}
						onSubmit={onSubmit}
					/>
				</div>
			</div>,
		);
		const overlay = screen.getByTestId("order-ticket-overlay");
		expect(overlay.parentElement?.getAttribute("data-testid")).toBe("workspace-root");
	});

	it("single-chart (không workspace root): rớt về root của chính chart", () => {
		const onSubmit = vi.fn();
		render(
			<div data-testid="cell-root" className="vnsc-root">
				<OrderTicketModal
					open
					side="buy"
					symbol="FPT"
					lastPrice={128500}
					rules={VN_SPOT_RULES}
					account={account}
					onClose={() => {}}
					onSubmit={onSubmit}
				/>
			</div>,
		);
		expect(screen.getByTestId("order-ticket-overlay").parentElement?.getAttribute("data-testid")).toBe("cell-root");
	});

	it("initialQuantity preset từ strip (qty=8) -> form prefill; sai lô vẫn bị chặn submit", () => {
		const onSubmit = vi.fn();
		render(
			<OrderTicketModal
				open
				side="buy"
				symbol="BTCUSDT"
				lastPrice={77821.4}
				rules={VN_SPOT_RULES}
				account={account}
				initialQuantity={8}
				onClose={() => {}}
				onSubmit={onSubmit}
			/>,
		);
		expect((screen.getByTestId("ticket-qty") as HTMLInputElement).value).toBe("8");
		// 8 không phải bội số lô 100 (VN_SPOT) -> validation giữ nguyên, không cho submit.
		expect((screen.getByTestId("ticket-submit") as HTMLButtonElement).disabled).toBe(true);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("initialQuantity hợp lệ (300) -> submit đúng qty", () => {
		const onSubmit = vi.fn();
		render(
			<OrderTicketModal
				open
				side="buy"
				symbol="FPT"
				lastPrice={128500}
				rules={VN_SPOT_RULES}
				account={account}
				initialQuantity={300}
				onClose={() => {}}
				onSubmit={onSubmit}
			/>,
		);
		expect((screen.getByTestId("ticket-qty") as HTMLInputElement).value).toBe("300");
		fireEvent.click(screen.getByTestId("ticket-submit"));
		fireEvent.click(screen.getByTestId("order-review-confirm"));
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ symbol: "FPT", quantity: 300 });
	});

	it("không preset -> mặc định lot của rules (VN_SPOT = 100)", () => {
		openTicket();
		expect((screen.getByTestId("ticket-qty") as HTMLInputElement).value).toBe("100");
	});

	it("submit class theo side: sell co submitSell, buy co submitBuy", () => {
		openTicket({ side: "sell" });
		const sellSubmit = screen.getByTestId("ticket-submit");
		expect(sellSubmit.classList.contains(styles.submitSell)).toBe(true);
		expect(sellSubmit.classList.contains(styles.submitBuy)).toBe(false);
		expect(styles.submitSell).not.toBe(styles.submitBuy);
	});

	it("CSS: mau submit nam o .submitBuy/.submitSell, khong con :last-child", () => {
		const css = readFileSync(resolve(process.cwd(), "src/widget/trading/ticket/OrderTicketModal.module.css"), "utf8");
		expect(css).toMatch(/\.footer button\.submitBuy\s*\{[^}]*background:/);
		expect(css).toMatch(/\.footer button\.submitSell\s*\{[^}]*background:/);
		expect(css).not.toMatch(/\.footer button:last-child\s*\{/);
	});

	// AC6 — số (giá/KL) không được giật khi tick ⇒ tabular-nums trên input số.
	it("AC6: input số dùng tabular-nums (số không nhảy khi live)", () => {
		const css = readFileSync(resolve(process.cwd(), "src/widget/trading/ticket/OrderTicketModal.module.css"), "utf8");
		expect(css).toMatch(/\.field input,\s*\n\.row input\s*\{[^}]*font-variant-numeric:\s*tabular-nums/);
	});

	// AC7 — màu nút submit lấy từ TOKEN (đổi theme theo), không hard-code màu cứng.
	it("AC7: nút submit của dock dùng token màu, không khai màu cứng nền", () => {
		const dockCss = readFileSync(resolve(process.cwd(), "src/widget/trading/ticket/TradingDockPanel.module.css"), "utf8");
		expect(dockCss).toMatch(/\.submitBar\s*\{[^}]*background:\s*var\(--vnsc-color-bullish/);
		expect(dockCss).toMatch(/\.submitBarSell\s*\{[^}]*background:\s*var\(--vnsc-color-bearish/);
		expect(dockCss).not.toMatch(/background:\s*#16a34a/);
		expect(dockCss).not.toMatch(/background:\s*#dc2626/);
	});

	// O2 — nút xác nhận trong review phải có màu (selector .footer không match ở .reviewActions).
	it("O2: nút Xác nhận trong review có rule màu riêng (không rơi về nút browser mặc định)", () => {
		const css = readFileSync(resolve(process.cwd(), "src/widget/trading/ticket/OrderTicketModal.module.css"), "utf8");
		expect(css).toMatch(/\.reviewActions button\.submitBuy\s*\{[^}]*background:/);
		expect(css).toMatch(/\.reviewActions button\.submitSell\s*\{[^}]*background:/);
	});
});

describe("RiskCalculatorView", () => {
	it("không TP/SL -> render null", () => {
		const { container } = render(<RiskCalculatorView entryPrice={128500} quantity={100} accountEquity={100_000_000} />);
		expect(container.firstChild).toBeNull();
	});

	it("hiển thị lãi/lỗ và % rủi ro", () => {
		render(
			<RiskCalculatorView
				entryPrice={128500}
				quantity={100}
				takeProfitPrice={135000}
				stopLossPrice={122000}
				accountEquity={100_000_000}
			/>,
		);
		expect(screen.getByText("+650,000")).toBeDefined();
		expect(screen.getByText("-650,000")).toBeDefined();
		expect(screen.getByText("0.65%")).toBeDefined();
	});
});
