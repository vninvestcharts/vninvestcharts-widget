/**
 * P4b: WatchlistPanel — TradingView-style watchlist (F1: adapter + VN30 fallback).
 * Rows: symbol, sparkline, price, change%. Click switches chart symbol.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { VN30_SYMBOLS, VN30_NAMES } from "../../constants/vn30";
import type { WatchlistAdapter, WatchlistItem, WatchlistQuoteUpdate } from "../../types/watchlist";
import styles from "../../styles/watchlist-panel.module.css";

export interface WatchlistPanelProps {
	symbol: string;
	onSymbolChange?: (symbol: string) => void;
	adapter?: WatchlistAdapter;
}

function formatPrice(value: number | undefined): string {
	if (typeof value !== "number" || !Number.isFinite(value)) return "—";
	return value.toLocaleString("en-US", { maximumFractionDigits: value < 10 ? 2 : 1 });
}

function toSparkPoints(values: number[], width: number, height: number): string {
	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = max - min || 1;
	return values.map((v, i) => {
		const x = (i / Math.max(values.length - 1, 1)) * width;
		const y = height - ((v - min) / span) * (height - 2) - 1;
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	}).join(" ");
}

function mergeUpdate(item: WatchlistItem, update: WatchlistQuoteUpdate): WatchlistItem {
	const defined = Object.fromEntries(
		Object.entries(update).filter(([, value]) => value !== undefined),
	);
	return { ...item, ...defined };
}

export function WatchlistPanel({ symbol, onSymbolChange, adapter }: WatchlistPanelProps) {
	const { t } = useWidgetI18n();
	const [items, setItems] = useState<WatchlistItem[]>([]);
	const [loading, setLoading] = useState(true);
	// D3: roving tabindex for APG listbox keyboard nav.
	const [focusIndex, setFocusIndex] = useState(0);
	const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
	const activeSymbol = symbol.toUpperCase();

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		const fallback = () => VN30_SYMBOLS.map((s) => ({ symbol: s, name: VN30_NAMES[s] ?? s }));
		if (!adapter) {
			setItems(fallback());
			setLoading(false);
			return;
		}
		Promise.resolve()
			.then(() => adapter.getWatchlist())
			.then((list) => { if (!cancelled && Array.isArray(list)) setItems(list); })
			.catch(() => { if (!cancelled) setItems(fallback()); })
			.finally(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, [adapter]);

	const symbols = useMemo(() => items.map((item) => item.symbol), [items]);
	const symbolsKey = symbols.join(",");
	const symbolsForSub = useMemo(() => symbolsKey.split(",").filter(Boolean), [symbolsKey]);

	useEffect(() => {
		if (!adapter?.subscribeQuotes || symbolsForSub.length === 0) return;
		const off = adapter.subscribeQuotes(symbolsForSub, (update) => {
			setItems((prev) => prev.map((item) =>
				item.symbol === update.symbol ? mergeUpdate(item, update) : item,
			));
		});
		return () => { if (typeof off === "function") off(); };
	}, [adapter, symbolsForSub]);

	if (loading) {
		return <div className={styles.empty}>{t("widget.loading")}</div>;
	}

	if (items.length === 0) {
		return <div className={styles.empty}>{t("widget.noData")}</div>;
	}

	const focusRow = (index: number) => {
		const clamped = Math.max(0, Math.min(items.length - 1, index));
		setFocusIndex(clamped);
		rowRefs.current[clamped]?.focus();
	};

	const handleListKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			focusRow(focusIndex + 1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			focusRow(focusIndex - 1);
		} else if (e.key === "Home") {
			e.preventDefault();
			focusRow(0);
		} else if (e.key === "End") {
			e.preventDefault();
			focusRow(items.length - 1);
		} else if (e.key === "Enter") {
			const item = items[focusIndex];
			if (item) onSymbolChange?.(item.symbol);
		}
	};

	return (
		<div className={styles.list} role="listbox" aria-label={t("dock.watchlist")} onKeyDown={handleListKeyDown}>
			{items.map((item, index) => {
				const isActive = item.symbol.toUpperCase() === activeSymbol;
				const pct = typeof item.changePercent === "number" && Number.isFinite(item.changePercent) ? item.changePercent : null;
				const pctClass = pct === null ? undefined : pct > 0 ? styles.up : pct < 0 ? styles.down : undefined;
				const spark = Array.isArray(item.sparkline) && item.sparkline.length > 1 ? item.sparkline : null;
				return (
					<div
						key={item.symbol}
						role="option"
						aria-selected={isActive}
						tabIndex={index === focusIndex ? 0 : -1}
						ref={(el) => { rowRefs.current[index] = el; }}
						data-testid={`watchlist-row-${item.symbol}`}
						className={`${styles.row}${isActive ? ` ${styles.rowActive}` : ""}`}
						onClick={() => { setFocusIndex(index); onSymbolChange?.(item.symbol); }}
						title={item.name ?? item.symbol}
					>
						<span className={styles.symBlock}>
							<span className={styles.sym}>{item.symbol}</span>
							{item.name ? <span className={styles.name}>{item.name}</span> : null}
						</span>
						{spark ? (
							<svg className={styles.spark} width="64" height="20" viewBox="0 0 64 20" aria-hidden="true">
								<polyline
									points={toSparkPoints(spark, 64, 20)}
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									className={pctClass}
								/>
							</svg>
						) : null}
						<span className={styles.quote}>
							<span className={styles.price}>{formatPrice(item.price)}</span>
							<span className={`${styles.pct}${pctClass ? ` ${pctClass}` : ""}`}>
								{pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
							</span>
						</span>
					</div>
				);
			})}
		</div>
	);
}
