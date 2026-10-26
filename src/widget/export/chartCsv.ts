import type { CanonicalBar } from "../data/DataEnvelope";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";

/**
 * W1.4/A5 — CSV export cho bars, chỉ báo và đối tượng vẽ.
 *
 * Đọc từ `CanonicalBar` (W0.3) nên **không phụ thuộc EP backend nào** — chỉ xuất
 * những gì đang có trong bộ nhớ. Người dùng phải được biết điều đó, nên caller
 * gắn badge "Chỉ dữ liệu đang tải" (đã có key `data.exportLoaded.badge`).
 *
 * Ba ràng buộc đã học được từ dữ liệu thật:
 *  1. **UTF-8 BOM**: không có BOM thì Excel trên Windows mở tiếng Việt ra mojibake.
 *  2. **Escape đúng**: giá trị chứa dấu phẩy, xuống dòng, hoặc dấu nháy phải bọc.
 *  3. **Số là số, không phải chuỗi rỗng**: `null` (thiếu dữ liệu) xuất thành ô
 *     trống, KHÔNG thành `0` — 0 là giá thật và sẽ làm người dùng tính sai
 *     (vi phạm AGENTS.md Rule 15).
 */

/** Trần số dòng mỗi file; vượt thì tách nhiều file thay vì làm treo trình duyệt. */
export const CSV_MAX_ROWS = 200_000;

export type CsvDataset = "bars" | "indicators" | "drawings";

export interface CsvSeriesDescriptor {
	/** Tên cột trong CSV (tiêu đề). */
	column: string;
	/** Giá trị tương ứng với từng bar, cùng độ dài với `bars`. */
	values: readonly (number | null)[];
}

export interface BarsCsvOptions {
	symbol: string;
	timeframe: string;
	bars: readonly CanonicalBar[];
	/** Cột chỉ báo thêm vào sau cột OHLCV. */
	series?: readonly CsvSeriesDescriptor[];
}

export interface DrawingsCsvOptions {
	drawings: readonly DrawingObject[];
}

// ---------------------------------------------------------------------------
// Primitive
// ---------------------------------------------------------------------------

/** Escape một ô theo RFC 4180. `null`/`undefined` → ô trống (KHÔNG phải "0"). */
export function escapeCsvCell(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "";
	const text = typeof value === "number" ? String(value) : value;
	// Cần bọc khi có phẩy, xuống dòng, hoặc dấu nháy. Luôn bọc khi có dấu nháy và
	// nhân đôi nó theo chuẩn.
	return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toRow(cells: readonly (string | number | null | undefined)[]): string {
	return cells.map(escapeCsvCell).join(",");
}

/** Timestamp → ISO ngắn. Dùng ISO để không mất múi giờ. */
function isoOf(ms: number): string {
	return new Date(ms).toISOString();
}

function joinLines(lines: readonly string[]): string {
	// BOM: Excel cần để đọc UTF-8 đúng (tiếng Việt trong tên cột chỉ báo).
	// Spelled \uFEFF, not a literal U+FEFF: an invisible character in source is
	// invisible in every diff and is silently dropped by some editors, pastes and
	// code review tools, which would quietly break UTF-8 detection for every
	// Vietnamese column name the BOM exists to protect. Same byte on the wire.
	return `\uFEFF${lines.join("\r\n")}\r\n`;
}

// ---------------------------------------------------------------------------
// Bars (+ chỉ báo)
// ---------------------------------------------------------------------------

const BAR_COLUMNS = ["time", "open", "high", "low", "close", "volume"] as const;

export function buildBarsCsv(options: BarsCsvOptions): string {
	const { symbol, timeframe, bars, series = [] } = options;
	const header = [
		...BAR_COLUMNS,
		"adj_close",
		"adj_factor",
		"is_partial",
		...series.map((s) => s.column),
	];

	// Dòng siêu dữ liệu đầu file — nêu rõ đây là phần ĐANG TẢI trong bộ nhớ, không
	// phải toàn bộ lịch sử server (server export cần EP-1 chưa có).
	const lines: string[] = [
		toRow(["symbol", "timeframe", "rows", "scope"]),
		toRow([symbol, timeframe, bars.length, "loaded-in-memory"]),
		toRow([]),
		toRow(header),
	];

	for (let i = 0; i < bars.length; i += 1) {
		const bar = bars[i];
		lines.push(
			toRow([
				// KHÔNG lặp symbol/timeframe ở đây: dòng siêu dữ liệu đã có. Lặp lại ở
				// dòng dữ liệu đầu sẽ trông như dữ liệu bị bẩn khi mở bằng công cụ tính.
				isoOf(bar.timestamp),
				bar.open,
				bar.high,
				bar.low,
				bar.close,
				bar.volume,
				bar.adjClose,
				bar.adjFactor,
				bar.isPartial ? "true" : "false",
				...series.map((s) => s.values[i] ?? null),
			]),
		);
	}
	return joinLines(lines);
}

/** Chia bars thành nhiều file khi vượt trần. */
export function splitBarsForCsv(
	options: BarsCsvOptions,
	maxRows: number = CSV_MAX_ROWS,
): { chunkIndex: number; totalChunks: number; csv: string }[] {
	const total = Math.max(1, Math.ceil(options.bars.length / maxRows));
	const out: { chunkIndex: number; totalChunks: number; csv: string }[] = [];
	for (let c = 0; c < total; c += 1) {
		const slice = options.bars.slice(c * maxRows, (c + 1) * maxRows);
		// Cột chỉ báo phải cắt theo cùng chỉ số, nếu không lệch dữ liệu.
		const series = options.series?.map((s) => ({
			column: s.column,
			values: s.values.slice(c * maxRows, (c + 1) * maxRows),
		}));
		out.push({
			chunkIndex: c,
			totalChunks: total,
			csv: buildBarsCsv({ ...options, bars: slice, series }),
		});
	}
	return out;
}

// ---------------------------------------------------------------------------
// Drawings
// ---------------------------------------------------------------------------

/** Serialize đối tượng vẽ thành JSON gọn, 1 dòng cho mỗi drawing. */
export function buildDrawingsCsv(options: DrawingsCsvOptions): string {
	const header = ["id", "type", "symbol", "timeframe", "paneId", "visible", "locked", "zIndex", "json"];
	const lines = [toRow(header)];
	for (const d of options.drawings) {
		const meta = d as unknown as {
			symbol?: string;
			timeframe?: string;
			paneId?: string;
			visible?: boolean;
			locked?: boolean;
			zIndex?: number;
		};
		lines.push(
			toRow([
				d.id,
				d.type,
				meta.symbol,
				meta.timeframe,
				meta.paneId,
				meta.visible === false ? "false" : "true",
				meta.locked ? "true" : "false",
				meta.zIndex,
				JSON.stringify(d),
			]),
		);
	}
	return joinLines(lines);
}

// ---------------------------------------------------------------------------
// Tải xuống
// ---------------------------------------------------------------------------

/** Kích thước file gần đúng, để cảnh báo trước khi tải. */
export function estimateCsvBytes(csv: string): number {
	// JS string là UTF-16; byte thực gần bằng length cho ASCII. Dùng ước lượng
	// có hệ số cho ký tự nhiều byte (tiếng Việt có dấu).
	let ascii = 0;
	for (let i = 0; i < csv.length; i += 1) {
		if (csv.charCodeAt(i) < 128) ascii += 1;
	}
	return ascii + (csv.length - ascii) * 2;
}

export interface DownloadResult {
	filename: string;
	rowCount: number;
}

/**
 * Tải CSV xuống máy. Không dùng `window` khi không có (SSR/test) — trả về null
 * thay vì ném, để caller biết mà hiển thị cho người dùng.
 */
export function downloadCsv(
	filename: string,
	csv: string,
	// `doc` is already injectable so an embed can pass its own document; the bare
	// `document` here is only the default when the caller passed nothing.
	/* eslint-disable-next-line no-restricted-globals */
	doc: Document | null = typeof document === "undefined" ? null : document,
): DownloadResult | null {
	if (!doc) return null;
	// Một số môi trường nhúng (webview cũ, jsdom) không có createObjectURL. Ném lỗi
	// rõ ràng thay vì để TypeError "is not a function" khó hiểu; và KHÔNG fallback
	// sang data: URL vì CSV có thể 200k dòng, data URL sẽ treo trình duyệt.
	if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
		throw new Error(
			"CSV download is not supported in this environment (URL.createObjectURL unavailable).",
		);
	}
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
	// File tạm + <a download>: hoạt động ở jsdom và mọi trình duyệt, không cần
	// gắn vào DOM lâu dài.
	const url = URL.createObjectURL(blob);
	const a = doc.createElement("a");
	a.href = url;
	a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
	a.rel = "noopener";
	doc.body.appendChild(a);
	a.click();
	doc.body.removeChild(a);
	// Giải phóng sau một tick: Safari cần URL còn sống lúc click xử lý xong.
	setTimeout(() => URL.revokeObjectURL(url), 0);
	const rowCount = csv.split("\r\n").filter((l) => l.length > 0).length;
	return { filename: a.download, rowCount };
}

/** Tên file có timestamp để không đè lên nhau. */
export function csvFilename(base: string, ext = "csv"): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
	return `${base}-${stamp}.${ext}`;
}
