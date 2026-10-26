/**
 * P4a: RightSidebarDockHost — TradingView-style right dock.
 * Vertical icon strip (40px) + tabbed panel + resizable splitter.
 * Extracted from VNInvestCharts (was 29 inline lines) to restore fat-file headroom.
 * Stacked nodes (paper-trade / host custom panel) render above the tab row khi dock
 * MỞ (RD-10 DOCK_SSOT_B3: đóng ⇒ không render — trước fix render vô điều kiện).
 */
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";
import { AdvisoryPanel } from "../overlays/AdvisoryPanel";
import { TapePanel } from "../overlays/TapePanel";
import {
	IconX, IconBell, IconList, IconBarChart, IconLayers, IconActivity, IconFlask, IconPlus, IconPin,
} from "../common/Icons";
import { DataWindow } from "./DataWindow";
import { WatchlistPanel } from "./WatchlistPanel";
import type { WatchlistAdapter } from "../../types/watchlist";
import styles from "../../styles/right-sidebar-dock.module.css";

export type DockTabId = "watchlist" | "alerts" | "dataWindow" | "objects" | "tape" | "advisory" | "orderTicket";

// D1: persist keys + in-memory sync bus (D5 listener reuses DOCK_TAB_EVENT).
export const DOCK_TAB_KEY = "vnsc_dock_tab";
export const DOCK_OPEN_KEY = "vnsc_dock_open";
export const DOCK_TAB_EVENT = "vnsc_dock_tab";

export function readPersistedTab(): DockTabId | null {
	try {
		if (typeof window === "undefined" || !window.localStorage) return null;
		const raw = window.localStorage.getItem(DOCK_TAB_KEY);
		return typeof raw === "string" && raw.length > 0 ? (raw as DockTabId) : null;
	} catch {
		return null;
	}
}

export function readPersistedOpen(): boolean {
	try {
		if (typeof window === "undefined" || !window.localStorage) return true;
		return window.localStorage.getItem(DOCK_OPEN_KEY) !== "false";
	} catch {
		return true;
	}
}

// DOCK_SSOT_B3 (RD-03a): pin key + read/write — shell dùng chung (RightDockRail)
// KHÔNG tự chạm storage (file mới phải lint-clean; `no-restricted-globals` chỉ có
// baseline cho file cũ). Mọi truy cập LS qua các helper tại đây.
export const DOCK_PIN_KEY = "vnsc_dock_pinned";

export function readDockPin(): boolean {
	try {
		return localStorage.getItem(DOCK_PIN_KEY) === "1";
	} catch {
		return false;
	}
}

export function writeDockPin(next: boolean): void {
	try {
		localStorage.setItem(DOCK_PIN_KEY, next ? "1" : "0");
	} catch {
		// ignore storage errors
	}
}

/** E1: export để slot workspace ghi cùng keys single↔multi (không duplicate LS logic). */
export function persistDock(tab: DockTabId | null, open: boolean): void {
	try {
		if (typeof window === "undefined" || !window.localStorage) return;
		if (tab == null) {
			window.localStorage.removeItem(DOCK_TAB_KEY);
		} else {
			window.localStorage.setItem(DOCK_TAB_KEY, tab);
		}
		window.localStorage.setItem(DOCK_OPEN_KEY, String(open));
	} catch {
		// ignore storage errors
	}
}

export interface DockAdvisoryData {
	show: boolean;
	result: any;
	isLoading: boolean;
	onRefresh?: () => void;
	/** Native advisory session (V2) — renders instead of result when provided. */
	session?: import("../../../lib/types/vninvest").AdvisorySessionV2 | null;
}

export interface DockTapeData {
	show: boolean;
	entries: readonly any[];
	isLoading: boolean;
	filterBillions: number;
	onFilterChange?: (value: number) => void;
}

export interface RightSidebarDockHostProps {
	width: number;
	isResizing: boolean;
	onSplitterPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
	drawingDockNode?: ReactNode;
	paperTradePanelNode?: ReactNode;
	tradingDockNode?: ReactNode;
	customPanelNode?: ReactNode;
	advisory?: DockAdvisoryData;
	tape?: DockTapeData;
	symbol: string;
	timeframe: string;
	datum?: EnrichedDatum | null;
	onAlertsOpen?: () => void;
	onSymbolChange?: (symbol: string) => void;
	watchlistAdapter?: WatchlistAdapter;
	/** E1 controlled mode (workspace hover-pin): undefined = uncontrolled (single giữ nguyên). */
	openTab?: DockTabId | null;
	onOpenTabChange?: (tab: DockTabId | null, opts: { sticky: boolean }) => void;
	/** E1: hiện nút pin trong panel header. Default false (single không nút). */
	showPinToggle?: boolean;
	pinned?: boolean;
	onPinChange?: (pinned: boolean) => void;
}

export function RightSidebarDockHost({
	width,
	isResizing,
	onSplitterPointerDown,
	drawingDockNode,
	paperTradePanelNode,
	tradingDockNode,
	customPanelNode,
	advisory,
	tape,
	symbol,
	timeframe,
	datum,
	onAlertsOpen,
	onSymbolChange,
	watchlistAdapter,
	openTab,
	onOpenTabChange,
	showPinToggle,
	pinned,
	onPinChange,
}: RightSidebarDockHostProps) {
	const { t } = useWidgetI18n();
	const [activeTab, setActiveTab] = useState<DockTabId | null>(() => readPersistedTab());
	// D1: explicit open state — closing keeps the 40px strip (TV-like) instead
	// of falling back to defaultTab (P4a-08 dead-end fix).
	const [isOpen, setIsOpen] = useState<boolean>(() => readPersistedOpen());
	// E1 controlled mode (workspace hover-pin): parent owns open state.
	// undefined = uncontrolled (single giữ nguyên path cũ).
	const controlled = openTab !== undefined;

	// D5: multi-chart tab sync via in-memory broadcast (storage events do NOT
	// fire in the emitting window, so localStorage alone cannot sync same-page
	// charts). Applies remote state WITHOUT re-dispatching (no loops).
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent<{ tab?: DockTabId | null; open?: boolean }>).detail;
			if (!detail) return;
			// E1: controlled không setState (tránh fight với props) → route callback.
			if (controlled) {
				if (typeof detail.open === "boolean" && !detail.open) {
					onOpenTabChange?.(null, { sticky: false });
				} else if (detail.tab !== undefined) {
					onOpenTabChange?.(detail.tab ?? null, { sticky: false });
				}
				return;
			}
			if (typeof detail.open === "boolean") {
				setIsOpen(detail.open);
			}
			if (detail.tab !== undefined) {
				setActiveTab(detail.tab);
			}
			persistDock(detail.tab ?? null, typeof detail.open === "boolean" ? detail.open : true);
		};
		window.addEventListener(DOCK_TAB_EVENT, handler);
		return () => window.removeEventListener(DOCK_TAB_EVENT, handler);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [controlled, onOpenTabChange]);

	const tabs = useMemo(() => {
		// Full menu always renders; tabs without data show disabled with an
		// explanatory tooltip instead of vanishing (demo/discovery friendly).
		const list: Array<{ id: DockTabId; title: string; icon: ReactNode; action?: boolean; disabled?: boolean; disabledReason?: string }> = [
			{ id: "watchlist", title: t("dock.watchlist"), icon: <IconList size={15} /> },
		];
		if (onAlertsOpen) list.push({ id: "alerts", title: t("dock.alerts"), icon: <IconBell size={15} />, action: true });
		list.push({ id: "dataWindow", title: t("dock.dataWindow"), icon: <IconBarChart size={15} /> });
		list.push({
			id: "objects", title: t("dock.objectTree"), icon: <IconLayers size={15} />,
			disabled: !drawingDockNode, disabledReason: t("dock.requiresDrawings"),
		});
		list.push({
			id: "tape", title: t("dock.tape"), icon: <IconActivity size={15} />,
			disabled: !tape, disabledReason: t("dock.requiresTape"),
		});
		list.push({
			id: "advisory", title: t("dock.advisory"), icon: <IconFlask size={15} />,
			disabled: !advisory, disabledReason: t("dock.requiresAdvisory"),
		});
		list.push({
			id: "orderTicket", title: t("dock.orderTicket"), icon: <IconPlus size={15} />,
			disabled: !tradingDockNode, disabledReason: t("dock.requiresPaperTrading"),
		});
		return list;
	}, [t, onAlertsOpen, drawingDockNode, tape, advisory, tradingDockNode]);

	const panelTabs = tabs.filter((tab) => !tab.action);
	const enabledTabs = panelTabs.filter((tab) => !tab.disabled);
	const defaultTab: DockTabId | null = (["objects", "tape", "advisory", "dataWindow", "watchlist", "orderTicket"] as const)
		.find((id) => enabledTabs.some((tab) => tab.id === id)) ?? null;
	const validTab = enabledTabs.some((tab) => tab.id === activeTab) ? activeTab : defaultTab;
	// D1: closed dock renders strip-only (effectiveTab null) — never force
	// defaultTab on a user close (P4a-08 fix).
	// E1: controlled dùng prop (fallback defaultTab khi tab bị disabled), parent persist.
	const effectiveTab = controlled
		? (openTab && enabledTabs.some((tab) => tab.id === openTab) ? openTab : (openTab ? defaultTab : null))
		: (isOpen ? validTab : null);
	const effectiveTitle = tabs.find((tab) => tab.id === effectiveTab)?.title ?? "";

	const applyTab = (tab: DockTabId | null, open: boolean, sticky: boolean) => {
		if (!controlled) {
			setActiveTab(tab);
			setIsOpen(open);
			persistDock(tab, open);
		}
		try {
			window.dispatchEvent(new CustomEvent(DOCK_TAB_EVENT, { detail: { tab, open } }));
		} catch {
			// ignore event errors (D5 listener)
		}
		if (controlled) {
			onOpenTabChange?.(open ? tab : null, { sticky });
		}
	};

	const handleStripClick = (tab: { id: DockTabId; action?: boolean; disabled?: boolean }) => {
		if (tab.disabled) return;
		if (tab.id === "alerts") {
			onAlertsOpen?.();
			return;
		}
		if (!controlled && activeTab === tab.id && isOpen) {
			applyTab(tab.id, false, false);
			return;
		}
		if (controlled && effectiveTab === tab.id) {
			applyTab(tab.id, false, false);
			return;
		}
		applyTab(tab.id, true, true);
	};

	return (
		<>
			{effectiveTab && (
				<div
					className={`${styles.splitter}${isResizing ? ` ${styles.splitterActive}` : ""}`}
					data-testid="dock-splitter"
					role="separator"
					aria-orientation="vertical"
					aria-label={t("dock.resize", { defaultValue: "Resize dock" })}
					onPointerDown={onSplitterPointerDown}
				/>
			)}
			<div
				className={`${styles.dock}${effectiveTab ? "" : ` ${styles.dockClosed}`}`}
				// Closed dock collapses to the 40px strip so the chart reclaims
				// the panel width (no dead void on the right).
				style={{ width: `${effectiveTab ? width : 40}px` }}
			>
				{/* RD-10 (DOCK_SSOT_B3): stacked chỉ render khi dock MỞ — trước fix
				    render bất kể effectiveTab ⇒ node bị nhét vào wrapper 40px, clip. */}
				{effectiveTab && (paperTradePanelNode || customPanelNode) && (
					<div className={styles.stacked}>
						{paperTradePanelNode}
						{customPanelNode}
					</div>
				)}
				<div className={styles.body}>
					{effectiveTab && (
						<div className={styles.panel}>
							<div className={styles.panelHeader}>
								<span className={styles.panelTitle}>{effectiveTitle}</span>
								{/* F2: actions gom phải — space-between với 3 con đẩy pin ra giữa,
									gây gap ~76px với X (đã đo runtime). */}
								<div className={styles.panelActions}>
									{showPinToggle && (
										<button
											type="button"
											className={styles.panelClose}
											data-testid="dock-pin-toggle"
											onClick={() => onPinChange?.(!pinned)}
											title={pinned ? t("dock.unpin") : t("dock.pin")}
											aria-label={pinned ? t("dock.unpin") : t("dock.pin")}
											aria-pressed={pinned === true}
										>
											<IconPin size={10} />
										</button>
									)}
									<button
										type="button"
										className={styles.panelClose}
										data-testid="dock-panel-close"
										onClick={() => applyTab(controlled ? effectiveTab : activeTab, false, false)}
										title={t("common.close")}
										aria-label={t("common.close")}
									>
										<IconX size={10} />
									</button>
								</div>
							</div>
							<div className={styles.panelBody}>
								{effectiveTab === "objects" && (drawingDockNode ?? (
									<div className={styles.dwEmpty}>{t("dock.emptyPanel")}</div>
								))}
								{effectiveTab === "tape" && tape && (
									<TapePanel
										show
										entries={tape.entries}
										isLoading={tape.isLoading}
										symbol={symbol}
										filterBillions={tape.filterBillions}
										onFilterChange={tape.onFilterChange}
									/>
								)}
								{effectiveTab === "advisory" && advisory && (
									<AdvisoryPanel
										show
										result={advisory.result}
										session={advisory.session ?? undefined}
										isLoading={advisory.isLoading}
										symbol={symbol}
										onRefresh={advisory.onRefresh}
									/>
								)}
								{effectiveTab === "dataWindow" && (
									<DataWindow symbol={symbol} timeframe={timeframe} datum={datum} />
								)}
								{effectiveTab === "watchlist" && (
									<WatchlistPanel symbol={symbol} onSymbolChange={onSymbolChange} adapter={watchlistAdapter} />
								)}
								{effectiveTab === "orderTicket" && (tradingDockNode ?? (
									<div className={styles.dwEmpty}>{t("dock.emptyPanel")}</div>
								))}
							</div>
						</div>
					)}
					<div
						className={styles.strip}
						role="toolbar"
						aria-label={effectiveTitle}
						onKeyDown={(e) => {
							// D3: strip keyboard nav — arrows move between tabs, Escape closes.
							if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Escape") return;
							e.preventDefault();
							if (e.key === "Escape") {
								applyTab(controlled ? effectiveTab : activeTab, false, false);
								return;
							}
							const buttons = Array.from(
								e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
							);
							const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
							const next = e.key === "ArrowDown"
								? (current + 1) % buttons.length
								: (current - 1 + buttons.length) % buttons.length;
							buttons[next]?.focus();
						}}
					>
						{tabs.map((tab) => (
							<button
								key={tab.id}
								type="button"
								data-testid={`dock-tab-${tab.id}`}
								className={`${styles.stripBtn}${effectiveTab === tab.id ? ` ${styles.stripBtnActive}` : ""}${tab.disabled ? ` ${styles.stripBtnDisabled}` : ""}`}
								title={tab.disabled && tab.disabledReason ? `${tab.title} — ${tab.disabledReason}` : tab.title}
								aria-label={tab.disabled && tab.disabledReason ? `${tab.title} — ${tab.disabledReason}` : tab.title}
								aria-pressed={effectiveTab === tab.id}
								aria-disabled={tab.disabled === true}
								onClick={() => handleStripClick(tab)}
							>
								{tab.icon}
							</button>
						))}
					</div>
				</div>
			</div>
		</>
	);
}
