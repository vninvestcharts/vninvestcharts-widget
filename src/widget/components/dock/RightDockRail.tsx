// DOCK_SSOT_B3 (RD-03a): shell dùng chung single↔multi — tách từ
// WorkspaceRightDockSlot (:112-254). Sở hữu: wrapper flyout + grip (CSS) +
// open/pin/lastTab + persist keys + tier gate + Suspense + lazy host.
// Multi đi qua WorkspaceRightDockSlot (data-bridging tầng trên); single (S2)
// mount trực tiếp file này với cùng bộ props dữ liệu.
import React, { lazy, Suspense, useState, type ReactNode } from "react";
import { resolveDockAccess } from "./dockAccess";
import {
	persistDock,
	readDockPin,
	readPersistedOpen,
	readPersistedTab,
	writeDockPin,
	type DockAdvisoryData,
	type DockTabId,
	type DockTapeData,
} from "./RightSidebarDockHost";
import { DockUpgradeNudge } from "./DockUpgradeNudge";
import { useSidebarResize } from "../../hooks/overlays/useSidebarResize";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { WatchlistAdapter } from "../../types/watchlist";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";
import railStyles from "../../styles/right-dock-rail.module.css";

export interface RightDockRailProps {
	/** Falsy = tắt tier gate (mirror `dockTierGate` cũ của slot). */
	dockTierGate?: boolean;
	tier: string | null | undefined;
	symbol: string;
	timeframe: string;
	datum?: EnrichedDatum | null;
	onSymbolChange?: (symbol: string) => void;
	watchlistAdapter?: WatchlistAdapter;
	drawingDockNode?: ReactNode;
	tradingDockNode?: ReactNode;
	tape?: DockTapeData;
	advisory?: DockAdvisoryData;
	onAlertsOpen?: () => void;
	customPanelNode?: ReactNode;
	/** E2: true khi viewport mobile (hover/pin tắt, tap = click). */
	isMobile?: boolean;
	/** D1 (S2 single): desktop khôi phục tab+open đã persist khi mount.
	 * Multi không truyền (false) — byte-identical với init null cũ. */
	restoreOpenOnMount?: boolean;
}

// Tab panel hợp lệ cho lastTab (loại alerts action-tab).
const PANEL_TABS: readonly DockTabId[] = ["watchlist", "dataWindow", "objects", "tape", "advisory", "orderTicket"];

function readLastTab(): DockTabId {
	const raw = readPersistedTab();
	if (raw && (PANEL_TABS as readonly string[]).includes(raw)) return raw as DockTabId;
	return "watchlist";
}

/** D1: tab cuối đã lưu, chỉ khi open ≠ "false" (chưa từng lưu ⇒ strip-only). */
function readRestoreTab(): DockTabId | null {
	if (!readPersistedOpen()) return null;
	const raw = readPersistedTab();
	return raw && (PANEL_TABS as readonly string[]).includes(raw) ? raw : null;
}

const LazyRightSidebarDockHost = lazy(() =>
	import("./RightSidebarDockHost").then((m) => ({ default: m.RightSidebarDockHost })),
);

export function RightDockRail(props: RightDockRailProps): ReactNode {
	const {
		dockTierGate,
		tier,
		symbol,
		timeframe,
		datum,
		onSymbolChange,
		watchlistAdapter,
		drawingDockNode,
		tradingDockNode,
		tape,
		advisory,
		onAlertsOpen,
		customPanelNode,
		isMobile,
		restoreOpenOnMount,
	} = props;

	// Width persist reuse (cap window-based đúng ở workspace level).
	const { t } = useWidgetI18n();
	const {
		sidebarWidth,
		isResizingSidebar,
		handleSidebarPointerDown,
	} = useSidebarResize();

	// F1 autohide: trượt/hiện thuần CSS (:hover/:focus-within trên wrapper).
	// React chỉ sở hữu openTab (mở khi CLICK tab, đóng khi X/toggle/Escape),
	// pinned (in-flow) và lastTab. Không hover-open, không timer, không sticky.
	const [openTab, setOpenTab] = useState<DockTabId | null>(() =>
		restoreOpenOnMount && !isMobile ? readRestoreTab() : null);
	const [lastTab, setLastTab] = useState<DockTabId>(() => readLastTab());
	const [pinned, setPinned] = useState<boolean>(() => readDockPin());
	const effPinned = pinned && !isMobile;

	const tierFull = resolveDockAccess(tier, customPanelNode != null ? false : dockTierGate).mode === "full";

	// Fly = overlay thuần (mirror drawing toolbar flyout): KHÔNG reflow gì,
	// panel giữ full width (drawer phủ tạm, đóng để xem hết). Chỉ docked/pinned
	// mới đẩy layout qua flex (mainCol co, panel co theo — đã đo 1600→1295).
	const handleOpenTabChange = (tab: DockTabId | null) => {
		if (tab) {
			setOpenTab(tab);
			setLastTab(tab);
			persistDock(tab, true);
		} else {
			setOpenTab(null);
			persistDock(lastTab, false);
			// X/Escape trong pinned → về overlay-closed strip (1 nguồn sự thật).
			if (effPinned) {
				setPinned(false);
				writeDockPin(false);
			}
		}
	};

	const handlePinChange = (next: boolean) => {
		setPinned(next);
		writeDockPin(next);
		// Pin rỗng vô nghĩa: mở luôn tab gần nhất.
		if (next && openTab === null) {
			setOpenTab(lastTab);
			persistDock(lastTab, true);
		}
	};

	// F1: cả nudge lẫn dock đều nằm trong flyout (trượt thuần CSS, mirror
	// drawing toolbar shell). Wrapper 10px = grip zone; openTab != null giữ
	// flyout trượt ra qua class workspaceDockOpen.
	const flyoutOpenCls = openTab !== null ? ` ${railStyles.workspaceDockOpen}` : "";
	// Tier-bypass mirror single (VNInvestCharts:2689): host có custom panel
	// thì full dock bất kể tier.
	if (!tierFull) {
		return (
			<div className={railStyles.workspaceDock}>
				<div className={railStyles.workspaceDockFlyout}>
					<DockUpgradeNudge />
				</div>
			</div>
		);
	}
	return (
		<Suspense
			fallback={
				<div style={{ width: 40, alignSelf: "stretch", borderLeft: "1px solid var(--vnsc-border, rgba(255,255,255,0.08))" }} aria-hidden="true" />
			}
		>
			<div
				className={`${railStyles.workspaceDock}${effPinned ? ` ${railStyles.workspaceDockPinned}` : ""}${flyoutOpenCls}`}
				tabIndex={0}
				role="complementary"
				aria-label={t("dock.toggleRail")}
			>
				<div className={railStyles.workspaceDockFlyout}>
					<LazyRightSidebarDockHost
						width={sidebarWidth}
						isResizing={isResizingSidebar}
						onSplitterPointerDown={handleSidebarPointerDown}
						symbol={symbol}
						timeframe={timeframe}
						datum={datum}
						onSymbolChange={onSymbolChange}
						watchlistAdapter={watchlistAdapter}
						drawingDockNode={drawingDockNode}
						tradingDockNode={tradingDockNode}
						tape={tape}
						advisory={advisory}
						onAlertsOpen={onAlertsOpen}
						customPanelNode={customPanelNode}
						openTab={openTab}
						onOpenTabChange={handleOpenTabChange}
						showPinToggle={!isMobile}
						pinned={effPinned}
						onPinChange={handlePinChange}
					/>
				</div>
			</div>
		</Suspense>
	);
}
