// Task TVP-A4: CSV export — serialize + UTF-8 BOM + escape + jsdom guard.
import type { ClosedTradeRecord } from "../../../lib/core/trading/AnalyticsEngine";
import type { TradingOrder, TradingPosition } from "../../../lib/core/trading/types";

export function toCsvCell(value: unknown): string {
	if (value == null) return "";
	const text = String(value);
	if (text.includes(",") || text.includes('"') || text.includes("\n")) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
	const lines = [headers.map(toCsvCell).join(",")];
	for (const row of rows) {
		lines.push(row.map(toCsvCell).join(","));
	}
	return lines.join("\n");
}

export function positionsToRows(positions: TradingPosition[]): { headers: string[]; rows: unknown[][] } {
	return {
		headers: ["symbol", "side", "quantity", "entryPrice", "currentPrice", "unrealizedPnl"],
		rows: positions.map((p) => [p.symbol, p.side, p.quantity, p.entryPrice, p.currentPrice, Math.round(p.unrealizedPnl)]),
	};
}

export function ordersToRows(orders: TradingOrder[]): { headers: string[]; rows: unknown[][] } {
	return {
		headers: ["id", "symbol", "side", "type", "quantity", "price", "stopPrice", "status", "time"],
		rows: orders.map((o) => [
			o.id,
			o.symbol,
			o.side,
			o.type,
			o.quantity,
			o.price ?? o.stopPrice ?? "",
			o.stopPrice ?? "",
			o.status,
			new Date(o.createdAt).toISOString(),
		]),
	};
}

export function tradesToRows(trades: ClosedTradeRecord[]): { headers: string[]; rows: unknown[][] } {
	return {
		headers: ["symbol", "side", "quantity", "entryPrice", "exitPrice", "realizedPnl", "commission", "tax", "exitReason", "time"],
		rows: trades.map((t) => [
			t.symbol ?? "",
			t.side ?? "",
			t.quantity ?? "",
			t.entryPrice ?? "",
			t.exitPrice ?? "",
			Math.round(t.realizedPnl),
			t.commission,
			t.tax,
			t.exitReason ?? "",
			new Date(t.timestamp).toISOString(),
		]),
	};
}

/** Tải file CSV (BOM UTF-8 cho Excel Windows). Trả false khi môi trường thiếu API. */
export function downloadCsv(filename: string, csv: string): boolean {
	try {
		if (typeof window === "undefined" || typeof window.URL?.createObjectURL !== "function") return false;
		const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8;" });
		const url = window.URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = filename;
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		window.URL.revokeObjectURL(url);
		return true;
	} catch {
		return false;
	}
}
