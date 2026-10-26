import type { ReactNode } from "react";
import type { Timeframe } from "../../../lib/types/adapter";
import { TimeframeFooter, type ScaleMode } from "./TimeframeFooter";
import { ShortcutHelpModal } from "../ShortcutHelpModal";

export type BottomTabId = "pine_editor" | "strategy_tester" | "paper_trade";

export interface ChartFooterProps {
	showFooter?: boolean;
	renderFooter?: (ctx: { timeframe?: string; range?: string }) => ReactNode;
	timeframe: Timeframe;
	localRange: string | undefined;
	onTimeframeChange: (tf: Timeframe) => void;
	onRangeChange: (range: string) => void;
	scaleMode: ScaleMode;
	onScaleModeChange: (mode: ScaleMode) => void;
	timezone: string;
	t: (key: string) => string | undefined;
	activeBottomTab: BottomTabId | null;
	onBottomTabChange: (tab: BottomTabId | null) => void;
}

/**
 * BL-03B extraction from VNInvestCharts.tsx (behavior-identical move).
 * Footer with timeframe/range/scale controls + bottom-tab toggles.
 */
export function ChartFooter({
	showFooter,
	renderFooter,
	timeframe,
	localRange,
	onTimeframeChange,
	onRangeChange,
	scaleMode,
	onScaleModeChange,
	timezone,
	t,
	activeBottomTab,
	onBottomTabChange,
}: ChartFooterProps) {
	// UI-AUDIT: the shortcut modal must stay mounted even with the footer
	// hidden so `?` keeps working. The inline `? Phím tắt` chip is hidden by default
	// (it repeated on every cell in multicharts); `?` is still the way in.
	if (!showFooter) return <ShortcutHelpModal hintInline />;
	if (renderFooter) {
		return <>{renderFooter({ timeframe, range: localRange })}</>;
	}
	const tabButton = (tab: BottomTabId, label: string) => (
		<button
			onClick={() => onBottomTabChange(activeBottomTab === tab ? null : tab)}
			style={{
				padding: "3px 8px",
				background: activeBottomTab === tab ? "var(--vnsc-accent-strong, #2563eb)" : "transparent",
				border: "none",
				borderRadius: "4px",
				color: activeBottomTab === tab ? "#fff" : "var(--vnsc-text-secondary, #a0a0a0)",
				cursor: "pointer",
				fontSize: "11px",
				fontWeight: 600,
			}}
		>
			{label}
		</button>
	);
	return (
		<TimeframeFooter
			timeframe={timeframe}
			onTimeframeChange={onTimeframeChange}
			range={localRange}
			onRangeChange={onRangeChange}
			scaleMode={scaleMode}
			onScaleModeChange={onScaleModeChange}
			timezone={timezone}
			trailingNode={<ShortcutHelpModal hintInline />}
		>
			{tabButton("pine_editor", t("ui.bottomTab.pineEditor") || "Pine Editor")}
			{tabButton("strategy_tester", t("ui.bottomTab.strategyTester") || "Strategy Tester")}
			{tabButton("paper_trade", t("ui.bottomTab.paperTrading") || "Paper Trading")}
			{activeBottomTab && (
				<button
					onClick={() => onBottomTabChange(null)}
					title={t("common.close") || "Close"}
					aria-label={t("common.close") || "Close"}
					style={{
						background: "transparent",
						border: "none",
						color: "var(--vnsc-text-secondary, #a0a0a0)",
						cursor: "pointer",
						display: "inline-flex",
						alignItems: "center",
						fontSize: "11px",
						marginLeft: "4px",
						padding: "2px",
					}}
				>
					<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
						<line x1="1" y1="1" x2="9" y2="9" />
						<line x1="9" y1="1" x2="1" y2="9" />
					</svg>
				</button>
			)}
		</TimeframeFooter>
	);
}
