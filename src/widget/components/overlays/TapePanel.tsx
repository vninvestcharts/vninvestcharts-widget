/**
 * WE2 P3a-02: TapePanel (moved from src/lib/tape/TapePanel.tsx)
 *
 * Pure-presentational Time-and-Sales (tape) panel.
 * Data is fetched externally (demo shell) and passed via props.
 * All text goes through useWidgetI18n().t() — no hardcoded Vietnamese.
 *
 * Layout: vertical scrollable list — each row is 22px:
 *   [time] [price] [volume] [value] [side badge]
 * Whale rows get a yellow background.
 * Auto-scrolls to the bottom when new entries arrive.
 */

import { useEffect, useRef } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { TapeEntry } from "../../../lib/types/vninvest";
import styles from "../../styles/tape-panel.module.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const ROW_HEIGHT = 22;
const WHALE_BG = "#2a2300";  // dark yellow tint for whale rows
const WHALE_BORDER = "#b8860b";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
	try {
		const d = new Date(iso);
		const h = d.getHours().toString().padStart(2, "0");
		const m = d.getMinutes().toString().padStart(2, "0");
		const s = d.getSeconds().toString().padStart(2, "0");
		return `${h}:${m}:${s}`;
	} catch {
		return iso.slice(11, 19) || "--:--:--";
	}
}

function formatPrice(p: number): string {
	return p.toLocaleString("vi-VN");
}

function formatVolume(v: number): string {
	if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
	if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
	return v.toString();
}

function formatValue(v: number, t: (key: string) => string): string {
	const billions = v / 1_000_000_000;
	if (billions >= 1) return `${billions.toFixed(1)}${t("tape.billions")}`;
	const millions = v / 1_000_000;
	if (millions >= 1) return `${millions.toFixed(0)}tr`;
	return v.toString();
}

// ── Main component ────────────────────────────────────────────────────────────

export interface TapePanelProps {
	show: boolean;
	/** Ordered list of tape entries — most recent last (appended to bottom). */
	entries: readonly TapeEntry[];
	isLoading: boolean;
	symbol?: string;
	/** Filter threshold in billion VND — entries below this are hidden (0 = show all). */
	filterBillions: number;
	onFilterChange?: (billions: number) => void;
	onClose?: () => void;
}

export function TapePanel({
	show,
	entries,
	isLoading,
	symbol,
	filterBillions,
	onFilterChange,
	onClose,
}: TapePanelProps) {
	const { t } = useWidgetI18n();
	const scrollRef = useRef<HTMLDivElement>(null);
	const prevLengthRef = useRef(0);
	const userScrolledRef = useRef(false);

	const SIDE_COLORS: Record<TapeEntry["side"], { bg: string; text: string; label: string }> = {
		buy: { bg: "#0d6b2e", text: "#ffffff", label: t("tape.sideBuy") ?? "Buy" },
		sell: { bg: "#c0392b", text: "#ffffff", label: t("tape.sideSell") ?? "Sell" },
		unknown: { bg: "#4a4a4a", text: "#aaaaaa", label: t("tape.sideUnknown") ?? "Unknown" },
	};

	// Auto-scroll to bottom only when new entries arrive and user hasn't manually scrolled up
	useEffect(() => {
		if (!show) return;
		if (entries.length > prevLengthRef.current) {
			prevLengthRef.current = entries.length;
			if (!userScrolledRef.current) {
				const el = scrollRef.current;
				if (el) el.scrollTop = el.scrollHeight;
			}
		}
	}, [entries.length, show]);

	if (!show) return null;

	const threshold = filterBillions * 1_000_000_000;
	const filtered = threshold > 0
		? entries.filter((e) => e.value >= threshold)
		: entries;

	return (
		<div
			className={styles.panel}
			data-testid="tape-panel"
		>
			{/* Header */}
			<div className={styles.header}>
				<span className={styles.title}>
					{t("tape.title")}{symbol ? ` — ${symbol}` : ""}
				</span>
				{onClose ? (
					<button
						onClick={onClose}
						title={t("tape.close")}
						className={styles.closeBtn}
					>
						×
					</button>
				) : null}
			</div>

			{/* Filter bar */}
			<div className={styles.filterBar}>
				<span className={styles.filterLabel}>≥</span>
				<input
					type="range"
					min={0}
					max={50}
					step={0.5}
					value={filterBillions}
					onChange={(e) => onFilterChange?.(Number(e.target.value))}
					className={styles.filterSlider}
					aria-label={t("tape.filterLabel")}
					title={`≥ ${filterBillions} ${t("tape.billions")}`}
				/>
				<span
					className={styles.filterValue}
					data-testid="tape-filter-label"
				>
					{filterBillions > 0 ? `${filterBillions}${t("tape.billions")}` : t("tape.all")}
				</span>
			</div>

			{/* Column headers */}
			<div className={styles.columnHeaders}>
				<span>{t("tape.colTime")}</span>
				<span style={{ textAlign: "right" }}>{t("tape.colPrice")}</span>
				<span style={{ textAlign: "right" }}>{t("tape.colVolume")}</span>
				<span style={{ textAlign: "right" }}>{t("tape.colValue")}</span>
				<span style={{ textAlign: "center" }}></span>
			</div>

			{/* Entries list */}
			<div
				ref={scrollRef}
				className={styles.entriesList}
				onScroll={() => {
					const el = scrollRef.current;
					if (!el) return;
					const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
					userScrolledRef.current = !atBottom;
				}}
			>
				{isLoading && filtered.length === 0 ? (
					<div className={styles.loading} data-testid="tape-loading">
						{t("tape.loading")}
					</div>
				) : filtered.length === 0 ? (
					<div className={styles.empty} data-testid="tape-empty">
						{t("tape.empty")}
					</div>
				) : (
					filtered.map((entry) => {
						const sideStyle = SIDE_COLORS[entry.side] ?? SIDE_COLORS.unknown;
						return (
							<div
								key={entry.id}
								data-testid="tape-row"
								className={`${styles.row} ${entry.is_whale ? styles.rowWhale : ""}`}
							>
								<span className={styles.rowTime}>{formatTime(entry.ts)}</span>
								<span
									className={`${styles.rowPrice} ${entry.side === "buy" ? styles.rowPriceBuy : entry.side === "sell" ? styles.rowPriceSell : ""} ${entry.is_whale ? styles.rowPriceWhale : ""}`}
								>
									{formatPrice(entry.price)}
								</span>
								<span className={styles.rowVolume}>{formatVolume(entry.volume)}</span>
								<span className={`${styles.rowValue} ${entry.is_whale ? styles.rowValueWhale : ""}`}>
									{formatValue(entry.value, (key: string) => t(key) ?? '')}
								</span>
								<span
									className={`${styles.rowSide} ${styles[`rowSide${entry.side.charAt(0).toUpperCase() + entry.side.slice(1)}` as keyof typeof styles]}`}
									data-side={entry.side}
								>
									{sideStyle.label}
								</span>
							</div>
						);
					})
				)}
			</div>

			{/* Footer: entry count */}
			<div className={styles.footer}>
				{filtered.length} {t("tape.orderCount")}{filterBillions > 0 ? ` (≥${filterBillions}${t("tape.billions")})` : ""}
			</div>
		</div>
	);
}