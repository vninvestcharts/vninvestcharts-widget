// UIUX_AC_RUNTIME_2026-10-21 — harness A5 (RD-09): multi KHÔNG wrap `SaaSFeatureProvider`.
//
// MỤC TIÊU: chứng minh `VNInvestMultiCharts` **tự** wrap provider (RD-09): khi KHÔNG có
// provider bọc ngoài, tier vẫn phải đúng (theo license) ⇒ KHÔNG bị cap 2 chart.
//
// VÌ SAO cần surface riêng: demo `MultiChartsShowcaseDemo` **luôn** wrap provider
// (`src/demo/MultiChartsShowcaseDemo.tsx:129-130`) ⇒ lỗi "cap 2 chart" bị MASK ⇒ không đo
// được. Đây là surface **ADDITIVE** (`?noprovider=1`); hành vi demo cũ KHÔNG đổi.
//
// Rule 8: `src/demo/**` chỉ được trình diễn capability **đã tồn tại** ở widget —
// ở đây là tự-provision provider (không thêm prop public, không thêm feature).
import { useMemo } from "react";
import { VNInvestMultiCharts, type MultiChartConfig, type ChartLayout } from "../widget";
import { BinanceStockDataAdapter } from "./adapters";
import { binanceAdapter } from "../lib/adapters";
import "../widget/styles/widget.css";
import "../widget/styles/chart-splitter.css";
import "../widget/styles/pane-overlays.css";
import "../widget/styles/paper-trade.css";
import "../widget/styles/overlays.css";
import "../widget/styles/drawing.css";
import "../widget/styles/toolbar.css";
import "../widget/styles/header.css";
import "../widget/styles/footer.css";
import "../widget/styles/settings.css";

const CHARTS: MultiChartConfig[] = [
	{ id: "chart-1", symbol: "BTCUSDT", timeframe: "1h" },
	{ id: "chart-2", symbol: "ETHUSDT", timeframe: "1h" },
	{ id: "chart-3", symbol: "SOLUSDT", timeframe: "1h" },
];

const LAYOUT: ChartLayout = { rows: 1, cols: 3 };

export default function TierProviderHarnessDemo() {
	const adapter = useMemo(() => new BinanceStockDataAdapter(binanceAdapter), []);

	return (
		<div
			data-testid="tier-provider-harness"
			style={{
				display: "flex",
				flexDirection: "column",
				width: "100vw",
				height: "100vh",
				background: "var(--gc-bg)",
			}}
		>
			<VNInvestMultiCharts
				layout={LAYOUT}
				charts={CHARTS}
				defaultLayout={LAYOUT}
				workspaceId="tier-provider-harness"
				showWorkspaceToolbar={false}
				showDrawingToolbar={false}
				showBottomPanel={false}
				showPaperTradePanel={false}
				showTapePanel={false}
				showRightDock={false}
				defaultChartProps={{
					showToolbar: true,
					showHeader: true,
					showFooter: true,
					theme: "classic-dark" as const,
					engineRuntime: "fork",
					locale: "vi",
					adapter,
				}}
			/>
		</div>
	);
}
