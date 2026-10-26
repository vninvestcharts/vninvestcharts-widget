import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsProvider } from "../../SettingsContext";
import { TradingEventsSettingsTab } from "../TradingEventsSettingsTab";
import {
	useWorkspacePaperVisibility,
	WorkspacePaperVisibilityProvider,
} from "../../../../context/WorkspacePaperVisibilityContext";

// Task M4 + chart-centric: tab Paper section chỉ 1 mục cho ô active (chartId khóa
// lúc mở). Muốn đồng bộ hết lưới dùng nút "Áp dụng cho tất cả" (fan-out provider).

function WithVisibility(props: { workspaceId: string; chartId?: string; symbol?: string }) {
	const visibility = useWorkspacePaperVisibility({
		workspaceId: props.workspaceId,
		charts: [
			{ id: "chart-a", symbol: "FPT" },
			{ id: "chart-b", symbol: "VNM" },
		],
	});
	return (
		<WorkspacePaperVisibilityProvider value={visibility}>
			<SettingsProvider>
				<TradingEventsSettingsTab chartId={props.chartId} symbol={props.symbol} />
			</SettingsProvider>
			<div data-testid="perchart">{JSON.stringify(visibility.perChart)}</div>
			<div data-testid="master">{String(visibility.master)}</div>
		</WorkspacePaperVisibilityProvider>
	);
}

describe("TradingEventsSettingsTab paper section (chart-centric)", () => {
	it("không workspace ctx (single) -> không section, không crash", () => {
		render(
			<SettingsProvider>
				<TradingEventsSettingsTab chartId="chart-solo" symbol="FPT" />
			</SettingsProvider>,
		);
		expect(screen.queryByText("Hiển thị giao dịch mô phỏng")).toBeNull();
		expect(screen.queryByTestId("paper-visibility-chart-solo")).toBeNull();
		// Section cũ vẫn render bình thường (option text cứng, không phụ thuộc locale).
		expect(screen.getByText("Binance Live API")).toBeDefined();
	});

	it("multi -> chỉ 1 mục ô active, không master, không liệt kê ô khác", () => {
		window.localStorage.removeItem("vnsc_paper_visibility_ws-tab");
		render(<WithVisibility workspaceId="ws-tab" chartId="chart-a" symbol="FPT" />);
		expect(screen.getByText("Hiển thị giao dịch mô phỏng")).toBeDefined();
		const rowA = screen.getByTestId("paper-visibility-chart-a") as HTMLInputElement;
		expect(rowA.checked).toBe(true);
		expect(screen.queryByTestId("paper-visibility-chart-b")).toBeNull();
		expect(screen.queryByText("Bật cho toàn workspace")).toBeNull();
		expect(rowA.closest("label")?.textContent).toContain("FPT");
		window.localStorage.removeItem("vnsc_paper_visibility_ws-tab");
	});

	it("tắt ô active ghi override riêng chart đó, ô khác giữ nguyên", () => {
		window.localStorage.removeItem("vnsc_paper_visibility_ws-tab");
		render(<WithVisibility workspaceId="ws-tab" chartId="chart-a" symbol="FPT" />);
		const rowA = screen.getByTestId("paper-visibility-chart-a") as HTMLInputElement;
		fireEvent.click(rowA);
		expect(screen.getByTestId("perchart").textContent).toBe('{"chart-a":false}');
		expect((screen.getByTestId("paper-visibility-chart-a") as HTMLInputElement).checked).toBe(false);
		expect(screen.getByTestId("master").textContent).toBe("true");
		window.localStorage.removeItem("vnsc_paper_visibility_ws-tab");
	});
});
