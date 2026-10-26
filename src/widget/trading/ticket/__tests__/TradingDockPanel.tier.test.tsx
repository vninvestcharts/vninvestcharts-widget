import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TradingDockPanel } from "../TradingDockPanel";
import { VN_SPOT_RULES } from "../../../../lib/core/trading/MarketRules";

// S5b: trailing_stop là lệnh nâng cao (`paper_advanced`). Free: tab khóa, không chọn/submit.
// S1: prop là `canUseAdvancedOrders` (kết quả capability, tôn trọng license `caps`) thay vì
// `advancedOrderTier` (suy ra từ tier) — suy ra từ tier thì license thu hẹp gói bị bỏ qua.
const account = { equity: 100_000_000, freeMargin: 100_000_000, buyingPower: 100_000_000 };

function dock(canUseAdvancedOrders?: boolean) {
	const onSubmit = vi.fn();
	render(
		<TradingDockPanel
			side="buy"
			symbol="FPT"
			lastPrice={128500}
			rules={VN_SPOT_RULES}
			account={account}
			onSubmit={onSubmit}
			canUseAdvancedOrders={canUseAdvancedOrders}
		/>,
	);
	return { onSubmit };
}

describe("TradingDockPanel advanced-order gate (S5b + S1)", () => {
	it("free: trailing_stop tab khóa, limit vẫn đặt được", () => {
		const { onSubmit } = dock(false);
		const trailing = screen.getByTestId("dock-type-trailing_stop") as HTMLButtonElement;
		expect(trailing.disabled).toBe(true);
		expect(trailing.textContent).toContain("🔒");
		fireEvent.click(trailing);
		expect(trailing.getAttribute("aria-selected")).toBe("false");
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		fireEvent.click(screen.getByTestId("dock-submit"));
		fireEvent.click(screen.getByTestId("order-review-confirm"));
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: "limit" });
	});

	it("có quyền: trailing_stop mở và submit được", () => {
		const { onSubmit } = dock(true);
		const trailing = screen.getByTestId("dock-type-trailing_stop") as HTMLButtonElement;
		expect(trailing.disabled).toBe(false);
		fireEvent.click(trailing);
		expect(trailing.getAttribute("aria-selected")).toBe("true");
		const submit = screen.getByTestId("dock-submit") as HTMLButtonElement;
		expect(submit.disabled).toBe(false);
		fireEvent.click(submit);
		fireEvent.click(screen.getByTestId("order-review-confirm"));
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: "trailing_stop" });
	});

	it("legacy (không truyền quyền): trailing mở như cũ", () => {
		dock(undefined);
		expect((screen.getByTestId("dock-type-trailing_stop") as HTMLButtonElement).disabled).toBe(false);
	});
});

function replayDock(canUseReplayTrading?: boolean, isReplayMode?: boolean) {
	const onSubmit = vi.fn();
	render(
		<TradingDockPanel
			side="buy"
			symbol="FPT"
			lastPrice={128500}
			rules={VN_SPOT_RULES}
			account={account}
			onSubmit={onSubmit}
			isReplayMode={isReplayMode}
			canUseReplayTrading={canUseReplayTrading}
		/>,
	);
	return { onSubmit };
}

// O6/replay_trading (13.03 §4): sub-gate ô đặt lệnh trong replay. Fail-closed
// đúng một chiều: chỉ khóa khi (replay === true && grant === false).
describe("TradingDockPanel replay-trading sub-gate (O6)", () => {
	it("replay mà không có quyền: submit khóa, onSubmit không chạy", () => {
		const { onSubmit } = replayDock(false, true);
		const submit = screen.getByTestId("dock-submit") as HTMLButtonElement;
		expect(submit.disabled).toBe(true);
		fireEvent.click(submit);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("replay có quyền: submit mở như thường", () => {
		const { onSubmit } = replayDock(true, true);
		const submit = screen.getByTestId("dock-submit") as HTMLButtonElement;
		expect(submit.disabled).toBe(false);
		fireEvent.click(submit);
		fireEvent.click(screen.getByTestId("order-review-confirm"));
		expect(onSubmit).toHaveBeenCalledTimes(1);
	});

	it("live mà không có quyền replay_trading: KHÔNG khóa (sub-gate chỉ trong replay)", () => {
		const { onSubmit } = replayDock(false, false);
		const submit = screen.getByTestId("dock-submit") as HTMLButtonElement;
		expect(submit.disabled).toBe(false);
		fireEvent.click(submit);
		fireEvent.click(screen.getByTestId("order-review-confirm"));
		expect(onSubmit).toHaveBeenCalledTimes(1);
	});

	it("legacy (không truyền prop replay): mở như cũ", () => {
		replayDock(undefined, undefined);
		expect((screen.getByTestId("dock-submit") as HTMLButtonElement).disabled).toBe(false);
	});
});
