/**
 * SSOT number formatting (V-02). One module, one output per input.
 * Grouping is international (en-US); vi-VN locale is a P2 follow-up.
 * Non-finite inputs render "n/a" (shared with resolveDisplayValue contract).
 */

/** Full-precision price: "81,325.38". Replaces d3 ",.2f" + toFixed(2) copies. */
export function formatPrice(v: number): string {
	if (typeof v !== "number" || !Number.isFinite(v)) return "n/a";
	return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Volume: "1.2M" / "13K" / raw below 1000 (grid semantics, kept verbatim). */
export function formatVolume(v: number): string {
	if (typeof v !== "number" || !Number.isFinite(v)) return "n/a";
	if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
	if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
	return String(v);
}

/** Signed change value: "+2,700.00" / "-300.50". */
export function formatChangeValue(diff: number): string {
	if (typeof diff !== "number" || !Number.isFinite(diff)) return "n/a";
	return `${diff >= 0 ? "+" : ""}${formatPrice(diff)}`;
}

/** Signed percent: "+2.04%" / "-0.62%". */
export function formatPercent(pct: number): string {
	if (typeof pct !== "number" || !Number.isFinite(pct)) return "n/a";
	return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}
