import { useState, useCallback, useMemo, useRef } from "react";
import {
	VNInvestMultiCharts,
	BottomPanelHost,
	SaaSFeatureProvider,
	MultiSourceDataAdapter,
	type VNInvestMultiChartsRef,
	type VNInvestMultiChartsProps,
	type MultiChartConfig,
	type ChartLayout,
	type VNInvestChartsProps,
} from "../widget";
import { useDemoI18n } from "./i18n";
import { DemoDataSource, VNInvestDataSource } from "./dataSources";
import { getOfflineDemoBars, INTERVAL_MS_MAP } from "./demoData";
import { binanceAdapter } from "../lib/adapters";
import { VNInvestClient } from "../widget/adapters/VNInvestClient";
import { VNInvestDataAdapter as ProdVNInvestDataAdapter } from "../widget/adapters/VNInvestDataAdapter";
import { BinanceStockDataAdapter, DemoVNInvestStockDataAdapter } from "./adapters";
import type { StockDataAdapter } from "../lib/types/adapter";
import {
	ALL_SHOWCASES,
	getShowcase,
	type ShowcaseName,
} from "./showcases";
import "./demo.css";
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

export default function MultiChartsShowcaseDemo() {
	const multiChartsRef = useRef<VNInvestMultiChartsRef | null>(null);

	// --- Showcase Selection ---
	const [activeShowcase, setActiveShowcase] = useState<ShowcaseName>("overview");
	const showcase = getShowcase(activeShowcase);
	const { t: dt } = useDemoI18n();

	// --- Data Adapters ---
	const [dataAdapters] = useState(() => ({
		binance: binanceAdapter,
		demo: new DemoDataSource(),
		vninvest: new VNInvestDataSource(new VNInvestClient()),
	}));

	// BE-05: explicit offline toggle — CSV demo data only when ON (default: real backend).
	const [offlineMode, setOfflineMode] = useState(false);
	const [vniClientForProd] = useState(() => new VNInvestClient());
	const prodAdapter = useMemo(() => new ProdVNInvestDataAdapter({
		patToken: vniClientForProd.getPAT(),
		apiBase: vniClientForProd.getBase(),
	}), [vniClientForProd]);

	// --- Resolve adapter name from showcase config to StockDataAdapter ---
	// Uses MultiSourceDataAdapter to route by symbol pattern
	const resolvedAdapter = useMemo<StockDataAdapter>(() => {
		const binanceAdapter_ = new BinanceStockDataAdapter(dataAdapters.binance);
		const vnInvestAdapter_: StockDataAdapter = offlineMode
			? new DemoVNInvestStockDataAdapter(dataAdapters.vninvest)
			: prodAdapter;

		return new MultiSourceDataAdapter({
			routes: [
				{ pattern: /^(VN30|VND|FPT|HCM|SSI|VCB|BID|CTG|TCB|MWG|ACB)/, adapter: vnInvestAdapter_ },
				{ pattern: /^[A-Z]{3}$/, adapter: vnInvestAdapter_ },
			],
			defaultAdapter: binanceAdapter_,
		});
	}, [dataAdapters, offlineMode, prodAdapter]);

	// DEV-only: ?pro=1 bypass tier gate để runtime-check full dock Pro
	// (mirror StandaloneEmbedDemo ?dock=1). Mặc định giữ nguyên tier thật.
	const forceProDock = typeof window !== "undefined"
		&& new URLSearchParams(window.location.search).get("pro") === "1";

	// S0 DOCK_SSOT_B3 (Rule 17): ?rightpanel=1 — bật renderRightPanel (node không text —
	// né i18n; Rule 8 chỉ bật capability đã có) để probe staging chứng minh RD-10.
	const demoRightPanel = typeof location !== "undefined"
		&& new URLSearchParams(location.search).get("rightpanel") === "1";

	// --- Render MultiCharts ---
	const renderMultiCharts = () => (
		<VNInvestMultiCharts
			ref={multiChartsRef}
			layout={showcase.layout}
			charts={showcase.charts}
			defaultLayout={showcase.layout}
			syncVisibleRange={showcase.syncSettings.syncVisibleRange}
			syncCrosshair={showcase.syncSettings.syncCrosshair}
			syncDrawings={showcase.syncSettings.syncDrawings}
			syncSymbolLinks={showcase.syncSettings.syncSymbolLinks}
			syncTimeframe={showcase.syncSettings.syncTimeframe}
			syncChartType={showcase.syncSettings.syncChartType}
			workspaceId={showcase.workspaceId}
			showWorkspaceToolbar={false}
			showDrawingToolbar={true}
			showBottomPanel={true}
			showPaperTradePanel={showcase.showPaperTradePanel}
			showTapePanel={showcase.showTapePanel}
			showRightDock={true}
			dockTierGate={forceProDock ? false : undefined}
			renderRightPanel={demoRightPanel ? () => <div data-testid="demo-right-panel" style={{ height: 120 }} /> : undefined}
			defaultChartProps={{
				...showcase.defaultChartProps,
				engineRuntime: "fork",
				locale: "vi",
				adapter: resolvedAdapter,
			}}
			onActiveChartChange={(chartId) => {
			}}
			onLayoutChange={(layout) => {
			}}
			onChartAdd={(chartId) => {
			}}
			onChartRemove={(chartId) => {
			}}
		/>
	);

	const [vniClient] = useState(() => new VNInvestClient());

	return (
		<SaaSFeatureProvider client={vniClient}>
			<div
				data-chart-theme="classic-dark"
				data-chart-mode="dark"
				style={{
					display: "flex",
					flexDirection: "column",
					width: "100vw",
					height: "100vh",
					background: "var(--gc-bg)",
					color: "var(--gc-text)",
					fontFamily: "var(--gc-font)",
					overflow: "hidden",
				}}
			>
				{/* Main Content Area */}
				<main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
					<div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
						{/* BE-05: explicit offline toggle */}
						<label
							style={{
								position: "absolute",
								top: 8,
								right: 12,
								zIndex: 10,
								display: "flex",
								alignItems: "center",
								gap: 6,
								fontSize: 12,
								color: "var(--gc-text-muted)",
								background: "var(--gc-surface)",
								border: "1px solid var(--gc-border)",
								borderRadius: 6,
								padding: "4px 8px",
								cursor: "pointer",
							}}
						>
							<input
								type="checkbox"
								checked={offlineMode}
								onChange={(e) => setOfflineMode(e.target.checked)}
							/>
							{dt("demo.offlineMode")}
						</label>
						{renderMultiCharts()}
					</div>
				</main>
			</div>
		</SaaSFeatureProvider>
	);
}
