import { type EnrichedDatum } from "../../lib/core/calculators/types";
import {
	type WidgetPaneRuntimeSnapshot,
	buildForkTooltipTokens,
	dateFormat,
	priceFormat,
} from "../utils/widgetHelpers";
import { type PaneDescriptor } from "../../lib/core";
import { ChartStatusLine } from "./canvas/ChartStatusLine";
import styles from "../styles/fork-overlays.module.css";

function changePercent(close: number, open: number): string {
	if (open === 0) return "—";
	return `${((close - open) / open * 100).toFixed(2)}%`;
}

function changeColor(pct: string, color: string): string {
	if (pct.startsWith("-")) return "#ef5350";
	if (pct === "0.00%" || pct === "—") return color;
	return "#26a69a";
}

export interface ForkPaneTooltipsProps {
	hoveredDatum?: EnrichedDatum | null;
	lastDatum?: EnrichedDatum | null;
	symbol?: string;
	timeframe?: string;
	isDark: boolean;
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	panes: readonly PaneDescriptor[];
	onSettingsClick?: () => void;
	onToggleSeriesVisibility?: (seriesId: string) => void;
	onRemoveIndicator?: (paneId: string, seriesId: string) => void;
	/** DECLUTTER_V4: compare legend node rendered below the OHLC row (single-chart). */
	renderCompareLegend?: (paneId: string) => React.ReactNode;
	/**
	 * SINGLE-OHLC: hide the statusline symbol+OHLC row (the widget header
	 * already shows it). Compare chips move up just under the chart header.
	 */
	hideStatusOhlc?: boolean;
	/** `statusLine.showVolume` — ẩn/hiện Vol trong dòng status trong pane. */
	showStatusVolume?: boolean;
}

export function ForkPaneTooltips({
	hoveredDatum,
	lastDatum,
	symbol = "VIC",
	timeframe = "1D",
	isDark,
	paneSnapshots,
	panes,
	onSettingsClick,
	onToggleSeriesVisibility,
	onRemoveIndicator,
	renderCompareLegend,
	hideStatusOhlc = false,
	showStatusVolume = true,
}: ForkPaneTooltipsProps) {
	const snapshotMap = new Map(paneSnapshots.map((snapshot) => [snapshot.paneId, snapshot]));

	return panes.map((pane) => {
		if (pane.id === "volume" || pane.tooltip === "none") {
			return null;
		}

		const snapshot = snapshotMap.get(pane.id);
		if (!snapshot) {
			return null;
		}

		const leftAxisWidth = snapshot.axisBounds?.left?.width ?? 48;

		// The primary price pane gets the full GoCharting / TradingView status line
		if (pane.id === "price" || pane.tooltip === "ohlc") {
			return (
				<ChartStatusLine
					key={`fork-status-line-${pane.id}`}
					symbol={symbol}
					timeframe={timeframe}
					hoveredDatum={hoveredDatum}
					lastDatum={lastDatum}
					isDark={isDark}
					plotBounds={snapshot.plotBounds}
					leftAxisWidth={leftAxisWidth}
					onSettingsClick={onSettingsClick}
					onToggleSeriesVisibility={onToggleSeriesVisibility}
					onRemoveIndicator={onRemoveIndicator}
					pane={pane}
					compareLegend={renderCompareLegend?.(pane.id)}
					hideMainRow={hideStatusOhlc}
					showVolume={showStatusVolume}
				/>
			);
		}

		// Secondary indicator panes (e.g. RSI, MACD) require hoveredDatum
		if (!hoveredDatum) {
			return null;
		}

		const textColor = isDark ? "#f8fafc" : "#1e2a3b";
		const labelColor = isDark ? "#d1d4dc" : "#64748b";
		const tokens = buildForkTooltipTokens(pane, hoveredDatum, textColor);
		const width = snapshot.plotBounds.width;


		let fontSize = "9.5px";
		let lineHeight = "13px";
		let gap = "2px 6px";

		if (width < 250) {
			fontSize = "7.5px";
			lineHeight = "10px";
			gap = "1px 3px";
		} else if (width < 400) {
			fontSize = "8.5px";
			lineHeight = "12px";
			gap = "1px 4px";
		}

		return (
			<div
				key={`fork-tooltip-${pane.id}`}
				data-rsc-fork-tooltip-pane={pane.id}
				className={`${styles.forkPaneTooltip} ${isDark ? styles.forkPaneTooltipDark : styles.forkPaneTooltipLight}`}
				style={{
					top: snapshot.plotBounds.top + 28,
					left: `calc(${leftAxisWidth}px - 3mm)`,
					maxWidth: Math.max(120, width - 16),
					fontSize,
					lineHeight,
					gap,
					fontWeight: "300",
					fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
				}}
			>
				{tokens.map((token) => {
					const isOhlcLabel = token.key.endsWith("-open") || token.key.endsWith("-high") || token.key.endsWith("-low") || token.key.endsWith("-close") || token.key.endsWith("-volume");
					const currentLabelColor = isOhlcLabel ? labelColor : token.color;
					return (
						<span key={token.key}>
							<span style={{ color: currentLabelColor }}>{` ${token.label} `}</span>
							<span style={{ color: token.color }}>{token.value}</span>
							{token.key.endsWith("-close") && (
								<span style={{ marginLeft: "4px", color: changeColor(changePercent(hoveredDatum.close, hoveredDatum.open), textColor) }}>
									{changePercent(hoveredDatum.close, hoveredDatum.open)}
								</span>
							)}
						</span>
					);
				})}
			</div>
		);
	});
}