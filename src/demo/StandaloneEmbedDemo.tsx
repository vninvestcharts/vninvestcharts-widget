import { useState, useMemo, useEffect } from "react";
import { VNInvestCharts, widgetMessagesVi } from "../public-api";
import { binanceAdapter } from "../lib/adapters";
import { DemoDataSource, VNInvestDataSource } from "./dataSources";
import { VNInvestClient } from "../widget/adapters/VNInvestClient";
import { VNInvestDataAdapter as ProdVNInvestDataAdapter } from "../widget/adapters/VNInvestDataAdapter";
import { UnavailableState } from "../widget/components/CapabilityGate";
import { BinanceStockDataAdapter, DemoVNInvestStockDataAdapter, GeoBlockedBinanceAdapter, type GeoBlockedStatus } from "./adapters";
import { HealthProbedDataAdapter } from "./adapters/HealthProbedDataAdapter";
import { useDemoI18n } from "./i18n";
import type { StockDataAdapter } from "../lib/types/adapter";
import { PATTokenModal } from "./components/PATTokenModal";
import type { ChartTheme } from "../lib/core";
import { themeToMode } from "../lib/core/hooks/useChartTheme";

// Import all styles to ensure the core widget renders perfectly
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
import "./demo.css";

export default function StandaloneEmbedDemo() {
	// Manual-test hook for the right dock.
	//   `?dock=1`     — host opt-out (dockTierGate={false}): full dock cho MỌI tier.
	//                   Đây là hợp đồng có chủ ý (dockAccess.ts:14), KHÔNG phải lỗi gate.
	//   `?dockgate=1` — bật gate tường minh (dockTierGate={true}). Ở free/starter, gate
	//                   bắt buộc phải tỏ ra (DockUpgradeNudge, không fetch chunk pro);
	//                   ở pro+ thì dock mở đầy đủ. Đây là lever DUY NHẤT để chấm
	//                   `dock_pro` — vì `?dock=1` tự vô hiệu hoá đúng cái gate cần đo.
	const showDock = useMemo(() => {
		try {
			return new URLSearchParams(window.location.search).get("dock") === "1";
		} catch {
			return false;
		}
	}, []);
	const forceDockGate = useMemo(() => {
		try {
			return new URLSearchParams(window.location.search).get("dockgate") === "1";
		} catch {
			return false;
		}
	}, []);
	// `?uncontrolled=1` — E2E restore surface (PINE Stage 2, W-04). Khi bật, demo
	// KHÔNG truyền `panes` (prop optional): `useWidgetSettings` vì vậy không bắn
	// `localReplaceLayout`, và widget boot từ layout đã seed trong storage (bare
	// `rsc-pane-layout-v2` — key tất định vì demo không truyền `props.id`).
	// Đây là cấu hình capability `panes` optional đã tồn tại (Rule 8), không phải
	// feature mới. Route mặc định (không param) giữ nguyên hành vi từng byte.
	const uncontrolled = useMemo(() => {
		try {
			return new URLSearchParams(window.location.search).get("uncontrolled") === "1";
		} catch {
			return false;
		}
	}, []);
	// `?whale=1` — cấp dữ liệu whale tổng hợp cho chart. KHÔNG phải lever tier: nó chỉ
	// bật capability `pro_plugin` đã tồn tại (props `enableWhale`/`whaleOrders` có sẵn từ
	// lâu) để gate trình duyệt QUAN SÁT ĐƯỢC overlay. Không có nó thì "overlay vắng ở
	// free" là absence vacuous — không biết là do gate hay do không có dữ liệu.
	// Repo cố tình KHÔNG có `?tier=` (xem verify-alerts.cjs: minting là đường vào duy nhất),
	// nên lever này chỉ cấp DỮ LIỆU, quyền vẫn do license quyết định.
	const whaleDemoData = useMemo(() => {
		try {
			return new URLSearchParams(window.location.search).get("whale") === "1";
		} catch {
			return false;
		}
	}, []);
	// Lệnh whale tổng hợp: đủ lớn để vượt ngưỡng detector, giá neo theo ngày để overlay có
	// toạ độ thật. Không đây là dữ liệu thật (demo không có feed whale).
	const whaleOrders = useMemo(
		() =>
			whaleDemoData
				? [
					{ ts: "2024-01-02T09:00:00Z", price: 100, volume: 900_000, matched_value: 90_000_000, side: "buy" as const, size_class: "whale" as const },
					{ ts: "2024-01-03T09:30:00Z", price: 100, volume: 750_000, matched_value: 75_000_000, side: "sell" as const, size_class: "whale" as const },
				]
				: undefined,
		[whaleDemoData],
	);
	// D6 (F-07): state phải nhận **mọi** preset của widget, không chỉ 2 mode ⇒ khi
	// host gọi `onThemePresetChange` với `midnight-blue`/`high-contrast` thì state nhận được.
	const [theme, setTheme] = useState<ChartTheme>("classic-dark");
	// UI-AUDIT: initial values only — the widget header owns Symbol/Timeframe
	// changes (Single Source of Truth), so no setters are kept here.
	const [symbol] = useState("BTCUSDT");
	const [timeframe] = useState("1h");
	const [showDrawingPriceMarkers, setShowDrawingPriceMarkers] = useState(true);

	// MultiSource adapter to support comparison across data sources
	const [vniClient] = useState(() => new VNInvestClient());
	const [dataAdapters] = useState(() => ({
		binance: binanceAdapter,
		demo: new DemoDataSource(),
		vninvest: new VNInvestDataSource(vniClient),
	}));
	const [patModalOpen, setPatModalOpen] = useState(false);
	// 451-resilience (Phase 2 parity): explicit offline toggle + auto CSV fallback
	// when Binance answers HTTP 451 (regional block). VN symbols use the production
	// backend adapter. What the user is shown about the crypto feed is exactly the
	// header status badge: it reads LIVE, or OFFLINE / GEO-BLOCKED (CSV) once the
	// fallback is serving, and it flips the moment the switch is flipped — the
	// `data-feed-status` attribute on that badge is the machine-readable form of
	// the same fact (see `verify-degraded-data.cjs` DEG-05).
	const [offlineMode, setOfflineMode] = useState(false);
	const [feedStatus, setFeedStatus] = useState<GeoBlockedStatus>("live");
	// A real, observed outage of the data path — see HealthProbedDataAdapter.
	const [dataUnavailable, setDataUnavailable] = useState(false);
	const { t: dt } = useDemoI18n();

	const chartAdapter = useMemo<StockDataAdapter>(() => {
		const geoBinance = new GeoBlockedBinanceAdapter(
			new BinanceStockDataAdapter(dataAdapters.binance),
			dataAdapters.binance,
		);
		geoBinance.setForceOffline(offlineMode);
		geoBinance.onStatusChange(setFeedStatus);
		const vnInvestAdapter_: StockDataAdapter = offlineMode
			? new DemoVNInvestStockDataAdapter(dataAdapters.vninvest)
			: new ProdVNInvestDataAdapter({ patToken: vniClient.getPAT(), apiBase: vniClient.getBase() });
		return new HealthProbedDataAdapter(
			{
				routes: [
					{ pattern: /^(VN30|VND|FPT|HCM|SSI|VCB|BID|CTG|TCB|MWG|ACB)/, adapter: vnInvestAdapter_ },
					{ pattern: /^[A-Z]{3,4}$/, adapter: vnInvestAdapter_ },
				],
				defaultAdapter: geoBinance,
			},
			setDataUnavailable,
		);
	}, [dataAdapters, offlineMode, vniClient]);

	// A freshly built adapter has seen no failure yet, so a stale "unavailable"
	// from the previous one must not survive the swap.
	useEffect(() => {
		setDataUnavailable(false);
	}, [chartAdapter]);

	// Core default panes configuration
	const panes = useMemo(() => [
		{
			id: "price",
			label: "Price",
			visible: true,
			heightRatio: 3,
			pinned: false,
			splitScale: false,
			tooltip: "value" as const,
			series: [
				{
					id: "price-main",
					type: "Candlestick" as const,
					yAxis: "right" as const,
				}
			]
		},
		{
			id: "volume",
			label: "Volume",
			visible: true,
			heightRatio: 1,
			pinned: false,
			splitScale: false,
			tooltip: "value" as const,
			series: [
				{
					id: "vol-main",
					type: "Volume" as const,
					yAxis: "right" as const,
				}
			]
		}
	], []);

	const isDark = themeToMode(theme) === "dark";

	return (
		<><div
			data-chart-theme={theme}
			style={{
				display: "flex",
				flexDirection: "column",
				width: "100vw",
				height: "100vh",
				background: "var(--gc-bg)",
				color: "var(--gc-text)",
				fontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
				overflow: "hidden",
				transition: "background-color 0.3s ease, color 0.3s ease",
			}}
		>
			{/* Modern Premium Header */}
			<header
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "12px 24px",
					background: "var(--gc-surface)",
					borderBottom: "1px solid var(--gc-border)",
					backdropFilter: "blur(12px)",
					WebkitBackdropFilter: "blur(12px)",
					zIndex: 100,
				}}
			>
				{/* UI-AUDIT: single branding element (badge + text were duplicated). */}
				<div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
					<div
						style={{
							background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
							color: "#ffffff",
							padding: "6px 12px",
							borderRadius: "8px",
							fontWeight: "bold",
							fontSize: "14px",
							letterSpacing: "0.5px",
							boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
						}}
						aria-label="VNInvest Charts"
					>
						VNINVESTCHARTS
					</div>
				</div>

				{/* UI-AUDIT: Symbol/Timeframe removed — the widget header owns them
			(Single Source of Truth). Demo passes initial values once; keeping
			duplicate selects caused state desync (no onChange sync-back). */}
				<div style={{ display: "flex", alignItems: "center", gap: "8px" }} role="status" aria-label="Environment status">
					<button
						type="button"
						onClick={() => setPatModalOpen(true)}
						title="PAT Settings"
						aria-label="PAT Settings"
						style={{
							padding: "4px 10px",
							borderRadius: "var(--gc-radius-btn)",
							background: "var(--gc-border)",
							color: "var(--gc-text)",
							border: "none",
							cursor: "pointer",
							fontSize: "12px",
							fontWeight: 500,
						}}
					>
						PAT
					</button>
					<span
						style={{
							background: "var(--gc-border)",
							color: "var(--gc-text-muted)",
							fontSize: "11px",
							padding: "3px 8px",
							borderRadius: "12px",
							fontWeight: 500,
						}}
						data-feed-status={feedStatus}
						data-offline-mode={offlineMode ? "on" : "off"}
						data-testid="feed-status"
					>
						{feedStatus === "geo-blocked" ? dt("demo.geoBlocked") : feedStatus.toUpperCase()}
					</span>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: "6px",
							fontSize: "12px",
							color: "var(--gc-text-muted)",
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

					<button
						type="button"
						role="switch"
						aria-checked={isDark}
						aria-label={isDark ? "Dark mode (on)" : "Light mode (on)"}
						onClick={() => setTheme((prev: ChartTheme) => (prev === "classic-dark" ? "modern-light" : "classic-dark"))}
						style={{
							padding: "6px 12px",
							borderRadius: "var(--gc-radius-btn)",
							background: "var(--gc-border)",
							color: "var(--gc-text)",
							border: "none",
							cursor: "pointer",
							fontSize: "13px",
							fontWeight: 500,
							display: "flex",
							alignItems: "center",
							gap: "6px",
							transition: "background-color 0.2s",
						}}
						onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--gc-border-mid)"}
						onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--gc-border)"}
					>
						{isDark ? "Dark" : "Light"}
					</button>
				</div>
			</header>

			{/* Main Workspace Split Layout */}
			<div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>

				{/* The Core Widget Instance */}
				<main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, overflow: "hidden", position: "relative" }}>
					{/* A genuine outage of the DATA path says so, with the real
					`UnavailableState` the capability layer defines. Non-destructive on
					purpose: the chart stays mounted so a late backfill or a partial
					recovery is still visible instead of being replaced by an overlay. */}
					{dataUnavailable && (
						<div
							data-testid="data-unavailable-banner"
							style={{
								display: "flex",
								justifyContent: "center",
								padding: "6px 12px",
								borderBottom: "1px solid var(--gc-border)",
								background: "var(--gc-surface)",
							}}
						>
							<UnavailableState reason="data_unavailable" capability="basic_chart" />
						</div>
					)}
					<VNInvestCharts
						adapter={chartAdapter}
						client={vniClient}
						symbol={symbol}
						timeframe={timeframe as any}
						// W-04: `?uncontrolled=1` bỏ prop để đo restore thật từ storage.
						panes={uncontrolled ? undefined : panes}
						theme={theme}
						// D6 (F-07): host phải nhận callback để tự áp lại preset người dùng chọn
						// trong Settings modal (trước đây demo **ghim** theme ⇒ preset bị che).
						onThemePresetChange={setTheme}
						engineRuntime="fork"
						drawingUiEnabled={true}
						showToolbar={true}
						showHeader={true}
						showFooter={true}
						showDock={showDock || forceDockGate || undefined}
						dockTierGate={showDock ? false : forceDockGate ? true : undefined}
						enableWhale={whaleDemoData}
						whaleOrders={whaleOrders}
						// Cờ SaaS mặc định `false` (`SaaSFeatureContext.DEFAULT_FLAGS`). Không bật
						// nó thì `canUseWhale` false ở MỌI tier, nên "overlay vắng" không phân biệt
						// được gate với tính năng chết — đo sẽ vô nghĩa (đã thử: mutant gỡ
						// `allows("pro_plugin")` vẫn PASS). Cờ SaaS là entitlement của tenant, KHÔNG
						// phải tier — bật nó không cấp quyền Pro.
						debugFeatures={whaleDemoData ? { isWhalePanelEnabled: true } : undefined}
						showDrawingPriceMarkers={showDrawingPriceMarkers}
						locale="vi"
						messages={widgetMessagesVi}
					/>
				</main>
			</div>
		</div>

		<PATTokenModal
			isOpen={patModalOpen}
			client={vniClient}
			activeSource="vninvest"
			onSourceChange={() => {}}
			onClose={() => setPatModalOpen(false)}
			onSaved={() => { window.location.reload(); }}
			onConfigChange={() => { window.location.reload(); }}
		/></>
	);
}
