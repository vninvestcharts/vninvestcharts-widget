import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TradingPanelHeader } from "../TradingPanelHeader";
import type { BrokerAccount } from "../../../../lib/core/trading/types";

const account: BrokerAccount = {
	accountId: "paper-VN_SPOT",
	balance: 100_000_000,
	equity: 100_000_000,
	marginUsed: 0,
	freeMargin: 100_000_000,
	buyingPower: 100_000_000,
	currency: "VND",
	pnl: 0,
	pnlPercent: 0,
};

function renderHeader(extra: Record<string, unknown> = {}) {
	const onSavePaperConfig = vi.fn();
	render(
		<TradingPanelHeader
			account={account}
			positions={[]}
			realizedPnl={0}
			ordersMargin={0}
			onResetAccount={vi.fn()}
			onExportCsv={vi.fn()}
			onSavePaperConfig={onSavePaperConfig}
			{...extra}
		/>,
	);
	return { onSavePaperConfig };
}

describe("TradingPanelHeader settings gear (S1)", () => {
	it("gear opens the settings modal", () => {
		renderHeader();
		expect(screen.queryByTestId("paper-settings-modal")).toBeNull();
		fireEvent.click(screen.getByTestId("panel-settings"));
		expect(screen.getByTestId("paper-settings-modal")).toBeDefined();
	});

	it("polish: zero PnL is neutral, values carry currency", () => {
		render(
			<TradingPanelHeader
				account={account}
				positions={[]}
				realizedPnl={0}
				ordersMargin={0}
				onResetAccount={vi.fn()}
				onExportCsv={vi.fn()}
			/>,
		);
		const pill = screen.getByTestId("header-unrealized");
		expect(pill.textContent).toContain("+0");
		expect(screen.getByTestId("header-equity").textContent).toContain("VND");
		expect(screen.getByTestId("header-power").textContent).toContain("VND");
	});

	it("header actions are icon-only with accessible names", () => {
		renderHeader();
		for (const id of ["panel-export", "panel-settings", "header-reset"]) {
			const btn = screen.getByTestId(id) as HTMLButtonElement;
			expect(btn.getAttribute("aria-label") ?? btn.title).toBeTruthy();
		}
	});

	it("saving forwards the partial config to the host", () => {
		const { onSavePaperConfig } = renderHeader();
		fireEvent.click(screen.getByTestId("panel-settings"));
		fireEvent.change(screen.getByTestId("paper-settings-tax"), { target: { value: "0.2" } });
		fireEvent.click(screen.getByTestId("paper-settings-save"));
		expect(onSavePaperConfig).toHaveBeenCalledTimes(1);
		expect(onSavePaperConfig.mock.calls[0][0].taxRate).toBeCloseTo(0.002);
		expect(screen.queryByTestId("paper-settings-modal")).toBeNull();
	});
});
