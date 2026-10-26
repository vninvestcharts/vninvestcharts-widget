import type { WidgetMessages } from "./types";

/**
 * Chuỗi cho capability gate / upsell / data-availability.
 * Tách riêng (W0.4) vì `messages.en.ts` chỉ còn ~48 dòng headroom budget
 * còn Track A cần ~168 key × 2 ngôn ngữ (PLAN_FRONTEND_PROPLUS_TRACKA §8.2).
 */
export const capabilityMessagesEn: WidgetMessages = {
	// --- Capability gate: 3 trạng thái phân biệt rõ (không nhầm với nhau) ---
	"capability.locked.title": "Available on {{plan}}",
	"capability.locked.subtitle": "Your current plan ({{currentPlan}}) does not include this.",
	"capability.locked.cta": "See plans",
	"capability.locked.close": "Close",
	"capability.locked.whyTitle": "What you get",
	"capability.unavailable.title": "Not available yet",
	"capability.unavailable.backend": "This feature needs a backend service that is not deployed yet. Nothing is faked here.",
	"capability.unavailable.device": "Not available on this device.",
	"capability.unavailable.perf": "Too much data for this view. Try a shorter range.",
	"capability.unavailable.quota": "Daily limit reached.",
	"capability.unavailable.data": "No data for this symbol right now.",
	"capability.locked.icon": "Locked feature",
	"capability.unlocked": "Unlocked",

	// --- Plan names + prices (PRICING 2026-10-22) ---
	// Source of truth for the price: `PLAN_DEV_PHASE_OFFICIAL_2026-10-22.md` §1.1 (D1).
	// Changing the price = edit these two lines (vi + en) + the price table in that plan.
	"plan.free": "Free",
	"plan.starter": "Starter",
	"plan.pro": "Pro",
	"plan.enterprise": "Enterprise",
	"plan.custom": "Custom",
	"plan.internal": "Internal",
	"plan.pro.price": "199,000 VND/month",
	"plan.enterprise.price": "Contact us",

	// --- Upsell theo capability (tên + lợi ích 1 câu) ---
	"capability.upsell.indicator_full.title": "All 60+ indicators",
	"capability.upsell.indicator_full.benefit": "Trend, momentum, volatility and volume studies with tunable parameters.",
	"capability.upsell.chart_baseline.title": "Baseline charts",
	"capability.upsell.chart_baseline.benefit": "Compare instruments on percent change from the first visible bar.",
	"capability.upsell.chart_exotic.title": "Renko, Kagi, Line Break, Point & Figure",
	"capability.upsell.chart_exotic.benefit": "Price-action charts that remove the noise between candles.",
	// volume_profile + volume_footprint: see the "promoted to Community" note further down.
	// PINE-COPY 2026-10-08: these benefit strings used to advertise behaviour that does
	// not exist. Round 2 (after independent audit) also had to fix what round 1 introduced:
	//   - "add them to your chart" was STILL a promise the pipeline cannot keep (the series
	//     never reaches the chart — PLAN_PINE_PARITY_2026-10-08 §2.1). Reworded to what the
	//     editor genuinely does today: parse and validate.
	//   - "69 built-in functions" was wrong. 69 was this repo's own buggy counter. Measured:
	//     ta.* 24 + math.* 17 + str.* 13 = 54 namespaced, plus 10 bare aliases. See
	//     scripts/check-capability-copy-claims.mjs, which recomputes this.
	// `npm run audit:capability-copy` is the gate; `audit:capability-copy:self-test` proves it bites.
	"capability.upsell.pine_editor.title": "Pine editor and custom scripts",
	"capability.upsell.pine_editor.benefit": "Write custom indicators in Pine and check the syntax and logic as you type.",
	"capability.upsell.pine_functional.title": "Pine function library",
	"capability.upsell.pine_functional.benefit": "54 built-in functions across ta.*, math.* and str.*, plus plot, plotshape, hline and alertcondition.",
	"capability.upsell.strategy_tester.title": "Strategy tester with trade report",
	"capability.upsell.strategy_tester.benefit": "Backtest four built-in strategies on your loaded bars and review the trade report.",
	"capability.upsell.replay.title": "Bar replay",
	"capability.upsell.replay.benefit": "Step through history bar by bar as if it were live.",
	"capability.upsell.replay_trading.title": "Trade inside bar replay",
	"capability.upsell.replay_trading.benefit": "Place practice orders while the replay clock is running.",
	"capability.upsell.paper_advanced.title": "Advanced paper orders",
	"capability.upsell.paper_advanced.benefit": "Stop, stop-limit, trailing and PLO orders with portfolio risk.",
	"capability.upsell.alert_local.title": "Price and indicator alerts",
	"capability.upsell.alert_local.benefit": "Get notified when price or a study crosses your level.",
	"capability.upsell.alert_drawing.title": "Drawing-triggered alerts",
	"capability.upsell.alert_drawing.benefit": "Fire when price crosses a line, channel or Fibonacci level you drew.",
	"capability.upsell.export_png.title": "Save chart as image",
	"capability.upsell.export_png.benefit": "Export any layout as a shareable PNG.",
	"capability.upsell.export_csv.title": "Export data as CSV",
	"capability.upsell.export_csv.benefit": "Download bars, indicator values and drawings for your own analysis.",
	"capability.upsell.auto_pattern.title": "Automatic chart patterns",
	"capability.upsell.auto_pattern.benefit": "Head-and-shoulders, triangles and flags detected on the chart.",
	"capability.upsell.layout_user.title": "Save your own layouts",
	"capability.upsell.layout_user.benefit": "Keep your multi-chart setups and come back to them later.",
	"capability.upsell.share_local.title": "Bookmark and share a chart",
	"capability.upsell.share_local.benefit": "Save a snapshot of the current setup.",
	// PROMOTED TO COMMUNITY 2026-10-08 — six upsell blocks deleted because the engine matrix
	// lowered them to `none`: gap_compression · measure_pane · shortcut_map · scale_sync ·
	// volume_profile · volume_footprint. Copy with nothing gating it is a promise the product
	// cannot keep, and it is also what made `audit:paid-capability` report the wrong number.
	// See `docs/system-design/13-ROADMAP/13.03-unshipped-paid-capability-decisions.md`.
	"capability.upsell.multi_chart.title": "Multi-chart workspace",
	"capability.upsell.multi_chart.benefit": "Split the screen and keep panes in sync.",
	// REMOVED 2026-10-22 (D2): `smart_drawing_pro` → Community. The 16 TIER-16 drawing
	// tools were already shipped unminified in `engine-drawing@2.2.0`, so the upsell
	// promised something the product could not withhold. `capabilityMessages.test.ts`
	// fails if a Community capability regains upsell copy.
	"capability.upsell.adjusted_bars.title": "Corporate-action adjusted prices",
	"capability.upsell.adjusted_bars.benefit": "Prices and indicators stay correct across dividends and splits.",
	"capability.upsell.cloud_alert.title": "Cloud alerts that keep running",
	"capability.upsell.cloud_alert.benefit": "Evaluated on the server, delivered even when your tab is closed.",
	"capability.upsell.webhook.title": "Webhook delivery",
	"capability.upsell.webhook.benefit": "Pipe every trigger into your own bot or service.",
	"capability.upsell.orderbook_dom.title": "Order book depth",
	"capability.upsell.orderbook_dom.benefit": "Live bid and ask ladder with aggregated volume.",
	"capability.upsell.fundamentals_full.title": "Full financial statements",
	"capability.upsell.fundamentals_full.benefit": "Annual and quarterly income, balance sheet and cash flow.",
	"capability.upsell.index_constituents.title": "Index constituents",
	"capability.upsell.index_constituents.benefit": "VN30, VN100 and index watchlists with weights.",
	"capability.upsell.deep_history.title": "Unlimited intraday history",
	"capability.upsell.deep_history.benefit": "No bar cap when you scroll back on intraday timeframes.",
	"capability.upsell.server_pine.title": "Server-side deep backtesting",
	"capability.upsell.server_pine.benefit": "Run a strategy over the full history, not just the loaded bars.",
	"capability.upsell.server_workspace.title": "Sync across devices",
	"capability.upsell.server_workspace.benefit": "Your layouts, drawings and settings follow you between machines.",
	"capability.upsell.realtime_tick.title": "Tick and second data",
	"capability.upsell.realtime_tick.benefit": "Sub-minute bars for scalping analysis.",
	"capability.upsell.whale_campaign.title": "Whale campaign clustering",
	"capability.upsell.whale_campaign.benefit": "Group large orders into campaigns with price impact.",
	"capability.upsell.portfolio_analytics.title": "Portfolio analytics",
	"capability.upsell.portfolio_analytics.benefit": "Equity curve, allocation and drawdown for your holdings.",
	"capability.upsell.dock_pro.title": "Full right dock",
	"capability.upsell.dock_pro.benefit": "Tape, advisory and order ticket beside the chart.",
	"capability.upsell.no_ads.title": "No ads",
	"capability.upsell.no_ads.benefit": "Charts stay clean, with no watermark.",
	"capability.upsell.pro_plugin.title": "Pro extension plugins",
	"capability.upsell.pro_plugin.benefit": "Load extra drawing tools and series from a Pro extension module.",
	"capability.upsell.layout_preset.title": "Chart layout presets",
	"capability.upsell.layout_preset.benefit": "Start from a saved arrangement instead of a single chart.",
	"capability.upsell.chart_compare.title": "Compare two symbols",
	"capability.upsell.chart_compare.benefit": "Overlay a second instrument to see relative strength.",

	// --- Data availability: trung thực, KHÔNG upsell ---
	"data.unadjusted.title": "Prices are not adjusted for corporate actions",
	"data.unadjusted.body": "Dividend and split data is not available yet, so long-horizon indicators may be wrong around ex-dates.",
	"data.unadjusted.tag": "Not adjusted",
	"data.localOnly.badge": "Saved on this device only",
	"data.localOnly.body": "Cloud sync is not enabled for this plan, so this will not appear on your other devices.",
	"data.exportLoaded.badge": "Loaded data only",
	"data.exportLoaded.body": "Exporting the bars currently held in memory, not the full server history.",
	"data.sessionsDefault.badge": "Default schedule",
	"data.sessionsDefault.body": "Using the built-in exchange schedule. Edit it in Settings.",
	"data.whaleCampaignUnavailable": "Campaign data is not available for this symbol.",
	"data.indexApprox.badge": "Approximate",
	"data.indexApprox.body": "Built from industry groups because official index constituents are not available yet.",
	"data.deepHistoryLimited.badge": "Daily bar limit reached",
	"data.backtestLimited.badge": "Trial limit",
	"data.backtestLimited.body": "This run is capped. Server-side deep backtesting runs over the full history.",
	"data.dividendsMissing": "No dividend history for this symbol.",
	"data.alertLocalOnly.badge": "Alerts run in this tab only",
	"data.alertLocalOnly.body": "Alerts are evaluated in the browser. They stop when you close the tab; server-side cloud alerts are an enterprise feature.",
	"alert.toast.direction.above": "crossed above",
	"alert.toast.direction.below": "crossed below",
	"alert.toast.dismiss": "Dismiss alert",
	// A10 auto pattern detection (PLAN_FRONTEND_PROPLUS_TRACKA_2026-09-28 §3.9).
	// Lives here rather than in its own module because `messages.en.ts` is
	// frozen at its budget with zero headroom, and these strings are the
	// surface of the `auto_pattern` capability whose upsell copy is already
	// in this file.
	//
	// `pattern.detail.r2Unknown` exists because the detector reports
	// `degenerateFit` when its gating fit had fewer than three samples.
	// Rendering "R² 1.00" there would be a claim the number cannot support.
	"pattern.scan.title": "Auto pattern detection",
	"pattern.scan.hint": "Confirmed patterns only. Nothing is drawn before the market has proved it.",
	"pattern.scan.shapes": "Shapes",
	"pattern.scan.selectAll": "Select all",
	"pattern.scan.clearAll": "Clear",
	"pattern.scan.run": "Scan chart",
	"pattern.scan.none": "No confirmed pattern found.",
	"pattern.scan.noData": "Not enough closed bars to scan.",
	"pattern.scan.skippedBusy": "Scanning is paused while you pan or zoom.",
	"pattern.scan.skippedDisabled": "Pattern detection is not available on this plan or device.",
	"pattern.scan.unavailable": "Auto pattern detection needs the Pro module. Install @vninvestcharts/widget-pro to enable it.",
	"pattern.shape.headAndShoulders": "Head and shoulders",
	"pattern.shape.inverseHeadAndShoulders": "Inverse head and shoulders",
	"pattern.shape.doubleTop": "Double top",
	"pattern.shape.doubleBottom": "Double bottom",
	"pattern.shape.triangle": "Triangle",
	"pattern.direction.bullish": "Bullish",
	"pattern.direction.bearish": "Bearish",
	"pattern.detail.confirmed": "confirmed",
	"pattern.detail.bars": "bars",
	"pattern.detail.r2Unknown": "R² n/a",
};
