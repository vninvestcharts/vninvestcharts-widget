/**
 * WP-04: VNSymbolSearch — moved from src/demo/components/
 * Search box with debounce and keyboard navigation.
 * Widget-scoped: uses useWidgetI18n(), .vnsc- prefix.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { useShadowRoot } from "../../context/VNInvestChartsContext";
import type { StockDataAdapter } from "../../../lib/types/adapter";
import type { VNInvestClient } from "../../adapters/VNInvestClient";
import { COMPARISON_COLORS } from "../../constants/comparison";
import { CRYPTO_SYMBOLS, EXCHANGE_OPTIONS, FUTURES_SYMBOLS, TIMEFRAME_ALIASES, VN30_SYMBOLS, type ExchangeFilter } from "../../constants/symbolSearch";
import type { ComparisonOverlayEntry } from "../../hooks/useComparisonState";
import { useRecentSymbols } from "../../hooks/useRecentSymbols";
import { useSymbolSearch } from "../../hooks/useSymbolSearch";
import type { SymbolSearchItem } from "../../types/symbolSearch";
import { isClickOutside } from "../../utils/clickOutside";
import styles from "../../styles/symbol-search.module.css";

// UX-02: WAI-ARIA combobox contract — the input owns the listbox via
// `aria-controls` and points at the highlighted option with
// `aria-activedescendant` (focus stays in the input while arrowing).
const LISTBOX_ID = "vnsc-symbol-search-listbox";

/** Unified compare controls (P2): single object replacing the 5 loose compare* props. */
export interface SymbolSearchCompare {
	existing: string[];
	entries?: ComparisonOverlayEntry[];
	onAdd: (symbolId: string, options?: { color?: string }) => void;
	onRemove: (symbolId: string) => void;
	onUpdate?: (symbolId: string, partial: Partial<ComparisonOverlayEntry>) => void;
	open?: boolean;
	onClose?: () => void;
}

export interface VNSymbolSearchProps {
	/** New: standard adapter interface. */
	adapter?: StockDataAdapter;
	/** Legacy: direct VNInvestClient reference (backward compat with demo). */
	client?: VNInvestClient;
	/** Current symbol (required in symbol mode, unused in compare mode). */
	value?: string;
	/** Fired on symbol selection (required in symbol mode, unused in compare mode). */
	onChange?: (symbol: string) => void;
	onItemSelect?: (item: SymbolSearchItem) => void;
	/** If provided, called on input focus instead of opening dropdown. */
	onFocusGuard?: () => void;
	/** If set, opens the search with this prefix pre-filled (for quick keyboard entry). */
	quickEntryPrefix?: string;
	/** Fired when search includes a timeframe suffix (e.g. "VIC 1D", "BTCUSDT 1h"). */
	onTimeframeChange?: (timeframe: string) => void;

	/** Operation mode: "symbol" (default) for main switching, "compare" (legacy) for overlay picker, "unified" for both in one modal (P2). */
	mode?: "unified" | "symbol" | "compare";
	/**
	 * Default pick action for row/chip/Enter in unified mode.
	 * - "switch" (default): P2 behavior — row click / plain Enter replaces the main symbol.
	 * - "compare": row click / plain Enter adds a comparison overlay and keeps the panel open.
	 *   Used by SymbolCompareModal so the compare dialog can never replace the main symbol.
	 */
	defaultAction?: "switch" | "compare";
	/**
	 * Show the per-row Switch button in unified mode.
	 * Defaults to true unless defaultAction === "compare" (TradingView compare dialog has no Switch).
	 */
	allowSwitch?: boolean;
	/**
	 * Current main-chart symbol (e.g. "VIC"). Matching rows render disabled with a
	 * "Current" badge — a symbol can never be compared against itself.
	 */
	mainSymbol?: string;
	/** Compare mode: whether the dialog is open. */
	compareOpen?: boolean;
	/** Compare mode: close callback. */
	onCompareClose?: () => void;
	/** Compare mode: add a comparison overlay. */
	onAddCompareSymbol?: (symbolId: string, options?: { color?: string }) => void;
	/** Compare mode: remove a comparison overlay. */
	onRemoveCompareSymbol?: (symbolId: string) => void;
	/** Compare mode: list of currently compared symbol IDs (filters them out of results). */
	compareExistingOverlays?: string[];
	/** Compare mode: full overlay entries for rich display (visibility, normalizeToBaseline, color). */
	compareOverlayEntries?: ComparisonOverlayEntry[];
	/** Compare mode: update a specific overlay property. */
	onUpdateCompareOverlay?: (symbolId: string, partial: Partial<ComparisonOverlayEntry>) => void;
	/** Unified compare object (P2). Loose compare* props above are shimmed into it (deprecated). */
	compare?: SymbolSearchCompare;

	/** Symbol mode: controlled open state (for external trigger, e.g. toolbar button). */
	open?: boolean;
	/** Symbol mode: called when open state changes. */
	onOpenChange?: (open: boolean) => void;
	/**
	 * Flat layout: render results in normal flow instead of a floating dropdown.
	 * Required when embedded in SymbolSearchModal (the modal panel already
	 * provides border/background — a nested absolute dropdown stacks 2 layers).
	 */
	flat?: boolean;
}

export function VNSymbolSearch({
	adapter,
	client,
	value,
	onChange,
	onItemSelect,
	onFocusGuard,
	quickEntryPrefix,
	onTimeframeChange,
	mode = "symbol",
	compareOpen,
	onCompareClose,
	onAddCompareSymbol,
	onRemoveCompareSymbol,
	compareExistingOverlays = [],
	compareOverlayEntries,
	onUpdateCompareOverlay,
	compare: compareProp,
	defaultAction,
	allowSwitch,
	mainSymbol,
	open: openProp,
	onOpenChange,
	flat = false,
}: VNSymbolSearchProps) {
	const isCompare = mode === "compare";
	const isUnified = mode === "unified";
	// P2-02 compat shim: loose compare* props map onto the unified object (warn once in dev).
	const hasLegacyCompare = compareOpen !== undefined || onCompareClose !== undefined
		|| onAddCompareSymbol !== undefined || onRemoveCompareSymbol !== undefined
		|| compareExistingOverlays.length > 0 || compareOverlayEntries !== undefined
		|| onUpdateCompareOverlay !== undefined;
	const warnedRef = useRef(false);
	if (hasLegacyCompare && !compareProp && !warnedRef.current) {
		warnedRef.current = true;
		if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
			console.warn("[VNSymbolSearch] compare* props are deprecated — pass compare={{...}} instead.");
		}
	}
	const compare: SymbolSearchCompare | undefined = compareProp ?? (hasLegacyCompare ? {
		existing: compareExistingOverlays,
		entries: compareOverlayEntries,
		onAdd: onAddCompareSymbol ? (id: string) => onAddCompareSymbol(id) : () => {},
		onRemove: onRemoveCompareSymbol ?? (() => {}),
		onUpdate: onUpdateCompareOverlay,
		open: compareOpen,
		onClose: onCompareClose,
	} : undefined);
	const cmpExisting = compare?.existing ?? compareExistingOverlays;
	const cmpEntries = compare?.entries ?? compareOverlayEntries;
	const cmpOnRemove = compare?.onRemove ?? onRemoveCompareSymbol;
	const cmpOnUpdate = compare?.onUpdate ?? onUpdateCompareOverlay;
	/** Effective default pick action: compare dialog can never switch the main symbol. */
	const effectiveDefaultAction = defaultAction ?? (isCompare ? "compare" : "switch");
	const canSwitch = allowSwitch ?? effectiveDefaultAction === "switch";
	const isMainSymbol = useCallback((sym: string) => !!mainSymbol && sym.toUpperCase() === mainSymbol.toUpperCase(), [mainSymbol]);
	const isControlled = openProp !== undefined;
	const { t } = useWidgetI18n();
	const shadowRoot = useShadowRoot();
	const [internalOpen, setInternalOpen] = useState(false);
	const open = isControlled ? openProp! : internalOpen;

	/** Unified open-state setter: updates local state + fires onOpenChange. */
	const setOpen = useCallback((next: boolean) => {
		if (isControlled) {
			onOpenChange?.(next);
		} else {
			setInternalOpen(next);
		}
	}, [isControlled, onOpenChange]);
	const [exchangeFilter, setExchangeFilter] = useState<ExchangeFilter>("ALL");
	const [recentItems, saveRecentItem] = useRecentSymbols();
	const { query, setQuery, results, loading, highlightIndex, setHighlightIndex, search } = useSymbolSearch({
		adapter, client, exchangeFilter, compareExisting: (isCompare || (isUnified && compare)) ? cmpExisting : undefined,
	});
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClick(e: Event) {
			const me = e as MouseEvent;
			if (isClickOutside(wrapperRef.current, me)) {
				if (isCompare) {
					onCompareClose?.();
				} else {
					setOpen(false);
				}
			}
		}
		// Use shadowRoot for capture-phase listeners in Shadow DOM mode
		const target = shadowRoot ?? document;
		target.addEventListener("mousedown", handleClick, { capture: true });
		return () => {
			target.removeEventListener("mousedown", handleClick, { capture: true });
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [shadowRoot, isCompare, onCompareClose]);

	// Parse trailing timeframe suffix from query (e.g. "BTCUSDT 1D" -> { symbol: "BTCUSDT", timeframe: "1D" })
	function parseTimeframeSuffix(raw: string): { symbol: string; timeframe?: string } {
		const trimmed = raw.trim();
		const parts = trimmed.split(/\s+/);
		if (parts.length < 2) return { symbol: trimmed };
		const last = parts[parts.length - 1];
		// Try exact match first (preserves case for 1M vs 1m), then lowercase fallback
		const matched = TIMEFRAME_ALIASES[last] ?? TIMEFRAME_ALIASES[last.toLowerCase()];
		if (matched) {
			return { symbol: parts.slice(0, -1).join(" "), timeframe: matched };
		}
		return { symbol: trimmed };
	}

	/** Search pass + dropdown open-state (symbol mode only).
	 * A background re-search (typing / exchange filter) may OPEN the dropdown
	 * but must NEVER auto-close it — closing is reserved for explicit actions
	 * (select, Escape, outside click). Otherwise clicking HOSE/HNX/UPCOM with
	 * 0 filtered results hides the panel the user is interacting with. */
	const searchWithOpen = useCallback(async (q: string, exFilter: ExchangeFilter, keepOpen = false) => {
		const count = await search(q, exFilter);
		if (count !== null && !isCompare && (count > 0 || keepOpen)) setOpen(true);
	}, [search, isCompare, setOpen]);

	useEffect(() => {
		if (!query) return;
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => void searchWithOpen(query, exchangeFilter, true), 150);
	}, [exchangeFilter, query, searchWithOpen]);

	useEffect(() => {
		if (quickEntryPrefix) {
			setQuery(quickEntryPrefix);
			setOpen(true);
			searchWithOpen(quickEntryPrefix, exchangeFilter);
		}
	}, [quickEntryPrefix, exchangeFilter, searchWithOpen]);

	// Move cursor to end when quick entry sets query from outside
	useEffect(() => {
		if (query && wrapperRef.current) {
			const input = wrapperRef.current.querySelector("input");
			if (input && document.activeElement === input) {
				input.setSelectionRange(query.length, query.length);
			}
		}
	}, [query]);

	function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
		const q = e.target.value;
		setQuery(q);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		if (!q) { void search("", exchangeFilter); if (!isCompare) setOpen(true); return; }
		debounceRef.current = setTimeout(() => void searchWithOpen(q, exchangeFilter), 300);
	}

	function handleSelect(item: SymbolSearchItem) {
		setQuery(item.symbol);
		setOpen(false);
		// Check if the user typed a timeframe suffix (e.g. selected "VIC" from query "VIC 1D")
		const { timeframe } = parseTimeframeSuffix(query);
		saveRecentItem(item);
		onChange?.(item.symbol);
		if (timeframe && onTimeframeChange) onTimeframeChange(timeframe);
		onItemSelect?.(item);
	}

	function commitRawQuery() {
		const raw = query.trim().toUpperCase();
		if (!raw) return;
		const { symbol, timeframe } = parseTimeframeSuffix(raw);
		setQuery(symbol);
		setOpen(false);
		onChange?.(symbol);
		if (timeframe && onTimeframeChange) onTimeframeChange(timeframe);
	}

	function handleCompareAddSymbol(item: SymbolSearchItem) {
		onAddCompareSymbol?.(item.symbol);
		onCompareClose?.();
		setQuery("");
		void search("", exchangeFilter);
	}

	/** Unified Switch (P2): main-symbol change — caller closes the modal via onChange. */
	function handleUnifiedSwitch(item: SymbolSearchItem) {
		const { timeframe } = parseTimeframeSuffix(query);
		saveRecentItem(item);
		setQuery("");
		setOpen(false);
		onChange?.(item.symbol);
		if (timeframe && onTimeframeChange) onTimeframeChange(timeframe);
		onItemSelect?.(item);
	}

	/** Unified +Compare (P2): add overlay, KEEP the modal open for the next pick. */
	function handleUnifiedCompare(item: SymbolSearchItem) {
		if (!compare || isMainSymbol(item.symbol)) return;
		saveRecentItem(item);
		compare.onAdd(item.symbol);
		setQuery("");
		void search("", exchangeFilter);
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "ArrowDown") {
			if (results.length === 0) return;
			e.preventDefault();
			setHighlightIndex(Math.min(highlightIndex + 1, results.length - 1));
		} else if (e.key === "ArrowUp") {
			if (results.length === 0) return;
			e.preventDefault();
			setHighlightIndex(Math.max(highlightIndex - 1, 0));
		} else if (e.key === "Enter") {
			e.preventDefault();
			const selected = results.length > 0 ? results[highlightIndex] : null;
			if (selected) {
				if (isUnified) {
					if (isMainSymbol(selected.symbol)) return;
					if (e.shiftKey || effectiveDefaultAction === "compare") {
						handleUnifiedCompare(selected);
					} else {
						handleUnifiedSwitch(selected);
					}
				} else if (isCompare) {
					handleCompareAddSymbol(selected);
				} else {
					handleSelect(selected);
				}
				return;
			}
			if (!isCompare) commitRawQuery();
		} else if (e.key === "Escape") {
			if (isCompare) {
				onCompareClose?.();
			} else {
				setOpen(false);
			}
		}
	}

	function handleFocus() {
		if (onFocusGuard) { onFocusGuard(); return; }
		setOpen(true);
	}

	const dropdownOpen = isCompare ? compareOpen : open;

	function handleResultSelect(item: SymbolSearchItem) {
		if (isMainSymbol(item.symbol)) return;
		if (isUnified) {
			if (effectiveDefaultAction === "compare") {
				handleUnifiedCompare(item);
			} else {
				handleUnifiedSwitch(item);
			}
		} else if (isCompare) {
			handleCompareAddSymbol(item);
		} else {
			handleSelect(item);
		}
	}

	return (
		<div ref={wrapperRef} className={styles.wrapper}>
			<input
				className={styles.input}
				type="text"
				value={query}
				placeholder={t("symbolSearch.placeholder", { defaultValue: "Search symbol..." })}
				onChange={handleInputChange}
				onKeyDown={handleKeyDown}
				onFocus={handleFocus}
				autoFocus
				aria-autocomplete="list"
				aria-haspopup="listbox"
				role="combobox"
				aria-expanded={!!dropdownOpen}
				// UX-02: wire the input to the listbox and the active option.
				aria-controls={LISTBOX_ID}
				aria-activedescendant={
					dropdownOpen && results.length > 0 && highlightIndex >= 0 ? `${LISTBOX_ID}-opt-${highlightIndex}` : undefined
				}
			/>

			{dropdownOpen && (
				<div className={flat ? `${styles.dropdown} ${styles.dropdownFlat}` : styles.dropdown}>
					{/* Compare/unified mode: existing overlays section */}
					{(isCompare || isUnified) && cmpExisting.length > 0 && (
						<>
							<div className={styles.section}>
								<div className={styles.sectionLabel}>{t("compare.existing", { defaultValue: "Compared symbols" })}</div>
								{cmpExisting.map((sym, idx) => {
									const entry = cmpEntries?.find((e) => e.symbolId === sym);
									const color = entry?.color ?? COMPARISON_COLORS[idx % COMPARISON_COLORS.length];
									const visible = entry?.visible ?? true;
									const normalize = entry?.normalizeToBaseline ?? false;
									return (
										<div key={sym} className={styles.overlayRow}>
											<div className={styles.overlayRowLeft}>
												<span className={styles.colorDot} style={{ background: color }} />
												<span className={styles.symbol}>{sym}</span>
											</div>
											<div style={{ display: "flex", gap: 4, alignItems: "center" }}>
												<button
													type="button"
													className={styles.addBtn}
													style={{ color: "inherit", borderColor: "#555" }}
													onClick={() => cmpOnUpdate?.(sym, { visible: !visible })}
													title={visible ? t("compare.hide", { defaultValue: "Hide" }) : t("compare.show", { defaultValue: "Show" })}
												>
													{visible ? "👁" : "◌"}
												</button>
												<button
													type="button"
													className={styles.addBtn}
													style={{ color: normalize ? "#2196F3" : "#aaa", borderColor: "#555", minWidth: 44 }}
													onClick={() => cmpOnUpdate?.(sym, { normalizeToBaseline: !normalize })}
													title={normalize ? t("compare.absolute", { defaultValue: "Price" }) : t("compare.normalize", { defaultValue: "% Change" })}
												>
													{normalize ? "%" : "₫"}
												</button>
												<button
													type="button"
													className={styles.removeBtn}
													onClick={() => cmpOnRemove?.(sym)}
												>
												✕
												</button>
											</div>
										</div>
									);
								})}
							</div>
							<hr className={styles.divider} />
						</>
					)}

					{/* Exchange filter bar */}
					<div className={styles.exchangeBar}>
						{EXCHANGE_OPTIONS.map((ex) => (
							<button
								key={ex}
								type="button"
								className={`${styles.exBtn} ${exchangeFilter === ex ? styles.exBtnActive : ""}`}
								onMouseDown={(e) => {
									e.preventDefault();
									e.stopPropagation();
									setExchangeFilter(ex);
									if (!isCompare) setOpen(true);
								}}
							>
								{ex === "ALL" ? "All" : ex}
							</button>
						))}
					</div>

					{/* Results list */}
					{query && results.length > 0 && (
						<ul role="listbox" id={LISTBOX_ID} aria-label={t("symbolSearch.placeholder", { defaultValue: "Search symbol..." })}>
							{results.map((item, idx) => {
								const isCurrentMain = isMainSymbol(item.symbol);
								return (
									<li
										key={item.symbol}
										role="option"
										id={`${LISTBOX_ID}-opt-${idx}`}
										aria-selected={idx === highlightIndex}
										aria-disabled={isCurrentMain || undefined}
										className={`${styles.item} ${idx === highlightIndex ? styles.itemHighlighted : ""} ${isCurrentMain ? styles.itemDisabled : ""}`}
										onMouseDown={() => handleResultSelect(item)}
									>
										{(isCompare || (isUnified && compare)) && (
											<span
												className={styles.colorDot}
												style={{ background: COMPARISON_COLORS[(cmpExisting.length + idx) % COMPARISON_COLORS.length] }}
											/>
										)}
										<span className={styles.symbol}>{item.symbol}</span>
										{item.exchange && (
											<span className={`${styles.exBadge} ${styles[`exBadge${item.exchange.charAt(0).toUpperCase() + item.exchange.slice(1).toLowerCase()}` as keyof typeof styles]}`}>
												{item.exchange}
											</span>
										)}
										{item.company_name && (
											<span className={styles.name}>{item.company_name}</span>
										)}
										{isCurrentMain ? (
											<span className={styles.currentBadge}>
												{t("compare.currentSymbol", { defaultValue: "Current" })}
											</span>
										) : isUnified && compare ? (
											<span className={styles.unifiedRowActions}>
												{canSwitch && (
													<button
														type="button"
														className={`${styles.addBtn} ${styles.switchBtn}`}
														onMouseDown={(e) => e.stopPropagation()}
														onClick={(e) => { e.stopPropagation(); handleUnifiedSwitch(item); }}
													>
														{t("symbolSearch.switch", { defaultValue: "Switch" })}
													</button>
												)}
												<button
													type="button"
													className={styles.addBtn}
													onMouseDown={(e) => e.stopPropagation()}
													onClick={(e) => { e.stopPropagation(); handleUnifiedCompare(item); }}
												>
											+ {t("common.compare", { defaultValue: "Compare" })}
												</button>
											</span>
										) : isCompare && (
											<button
												type="button"
												className={styles.addBtn}
												onClick={(e) => { e.stopPropagation(); handleCompareAddSymbol(item); }}
											>
												{t("compare.add", { defaultValue: "Add" })}
											</button>
										)}
									</li>
								);
							})}
						</ul>
					)}

					{/* Loading state */}
					{query && loading && results.length === 0 && (
						<div className={styles.emptyState}>
							<span className={styles.loadingText}>
								{t("common.loading", { defaultValue: "Searching…" })}
							</span>
						</div>
					)}

					{/* No results */}
					{query && !loading && results.length === 0 && (
						<div className={styles.emptyState}>
							<span className={styles.emptyText}>
								{t("symbolSearch.noResults", { defaultValue: "No results for \"{query}\"" }).replace("{query}", query)}
							</span>
						</div>
					)}

					{/* Empty / no-query panel: quick-add shortcuts */}
					{!query && results.length === 0 && !loading && (
						<>
							{recentItems.length > 0 && (
								<div className={styles.section}>
									<div className={styles.sectionLabel}>{t("symbolSearch.recent", { defaultValue: "Recent" })}</div>
									<div className={styles.chipRow}>
										{recentItems.map((item) => (
											<button
												key={item.symbol}
												type="button"
												className={styles.chip}
												onMouseDown={() => handleResultSelect(item)}
											>
												{item.symbol}
											</button>
										))}
									</div>
								</div>
							)}
							<div className={styles.section}>
								<div className={styles.sectionLabel}>{t("symbolSearch.futures", { defaultValue: "Futures" })}</div>
								<div className={styles.chipRow}>
									{FUTURES_SYMBOLS.map((item) => (
										<button
											key={item.symbol}
											type="button"
											className={`${styles.chip} ${styles.chipFutures}`}
											onMouseDown={() => handleResultSelect(item)}
										>
											{item.symbol}
										</button>
									))}
								</div>
							</div>
							<div className={styles.section}>
								<div className={styles.sectionLabel}>{t("symbolSearch.vn30", { defaultValue: "VN30" })}</div>
								<div className={styles.vn30Grid}>
									{VN30_SYMBOLS.map((sym) => (
										<button
											key={sym}
											type="button"
											className={`${styles.chip} ${styles.chipVn30}`}
											onMouseDown={() => handleResultSelect({ symbol: sym, company_name: "", exchange: "HOSE" })}
										>
											{sym}
										</button>
									))}
								</div>
							</div>
							<div className={styles.section}>
								<div className={styles.sectionLabel}>{t("symbolSearch.crypto", { defaultValue: "Crypto" })}</div>
								<div className={styles.chipRow}>
									{CRYPTO_SYMBOLS.map((item) => (
										<button
											key={item.symbol}
											type="button"
											className={`${styles.chip} ${styles.chipCrypto}`}
											onMouseDown={() => handleResultSelect(item)}
										>
											{item.symbol}
										</button>
									))}
								</div>
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
}

/** SSOT alias (SYMBOL_SEARCH P1): single search component for symbol + compare. */
export { VNSymbolSearch as SymbolSearch };