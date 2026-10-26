/**
 * DataEnvelope — lớp chịu trách nhiệm DUY NHẤT cho việc chuẩn hóa dữ liệu backend.
 *
 * Vì sao cần (PLAN_FRONTEND_PROPLUS_TRACKA_2026-09-28 §2.3):
 * Backend `vninvest` hiện trả **hai contract khác nhau cho cùng dữ liệu OHLCV**:
 *   - `/core/v1/stock-management/stocks/{s}/bars/` → `{ timestamp: <Unix ms int>, volume: int }`
 *     (`stock_mgmt_native_views.py:3665-3685`)
 *   - `/core/v1/stock-management/stocks/{s}/chart/` → `{ date: <ISO string>, volume: float }`
 *     (`stock_mgmt_native_views.py:943-951`)
 * Và quote trả `price` là **string** (Decimal) ở một nơi, **number** ở nơi khác
 * (`market_serving/native_views.py:54-121`); `change_pct` là number nhưng
 * `price_change_pct` lại là string.
 *
 * Nếu để mỗi consumer tự parse ⇒ mọi thay đổi backend lan khắp widget, và parse sai
 * diễn ra âm thầm (`"0.0" == 0` là `false` trong JS). Lớp này gom hết về một kiểu
 * `CanonicalBar` / `CanonicalQuote`; consumer chỉ nhìn kiểu canonical.
 *
 * Khi backend EP-1 (corporate actions) tới: chỉ cần điền `adjClose` — **không** sửa consumer.
 *
 * Nguyên tắc (AGENTS.md Rule 15 — cấm fake dữ liệu production):
 *   - Thiếu dữ liệu ⇒ `null`, **không** dùng `0` (0 là giá/số 0 thật, sẽ vẽ sai).
 *   - Không tự bịa giá điều chỉnh cổ tức khi backend chưa cung cấp.
 *   - Bar không đọc được timestamp ⇒ loại, không tạo bar rỗng.
 */

export type BarSource = "bars" | "chart" | "unknown";

export interface CanonicalBar {
	/** Unix milliseconds, UTC. Mọi endpoint mới dùng int ms; ISO được parse về ms. */
	timestamp: number;
	open: number | null;
	high: number | null;
	low: number | null;
	close: number | null;
	/** Luôn là number. Backend có thể trả int hoặc float hoặc string — đều ép về number. */
	volume: number;
	/** `null` cho tới khi backend cung cấp corporate actions (EP-1). KHÔNG tự tính. */
	adjClose: number | null;
	adjFactor: number | null;
	/** Bar cuối có thể đang chạy (polling) — renderer được phép vẽ nét đứt. */
	isPartial: boolean;
	source: BarSource;
}

const NUMERIC_SENTINELS = new Set(["", "-", "--", "N/A", "n/a", "null", "undefined", "NaN"]);

/**
 * Ép giá trị bất kỳ về number, trả `null` nếu không hợp lệ.
 * Chấp nhận: number | numeric string (kể cả "1.25e6", "42,5"? no — không đổi dấu phẩy).
 * Từ chối: null, undefined, boolean, object, array, NaN, Infinity, chuỗi rỗng.
 */
export function toNum(value: unknown): number | null {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (NUMERIC_SENTINELS.has(trimmed)) return null;
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

/** Ép về number, `null` → 0. Dùng cho `volume` vì 0 volume là hợp lệ (nghỉ giao dịch). */
function toNumOrZero(value: unknown): number {
	const n = toNum(value);
	return n === null ? 0 : n;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** ISO date-time KHÔNG có múi giờ — backend phát UTC nên coi là UTC, không dùng local time. */
const NAIVE_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/;

/**
 * Parse timestamp về Unix ms (UTC).
 * Chấp nhận:
 *   - number: coi là **giây** nếu |v| < 1e11, **ms** nếu >= 1e11 (heuristic chuẩn).
 *     Ranh giới 1e11 ms ≈ 1973-03-03 ⇒ mọi timestamp thị trường thực tế (>1.7e9 giây)
 *     nằm an toàn về một phía. Đã khoá bằng test boundary trong `DataEnvelope.test.ts`.
 *   - ISO "2026-09-18" ⇒ UTC midnight (deterministic, không lệch timezone máy).
 *   - ISO date-time có `Z`/offset ⇒ tôn trọng offset.
 *   - ISO date-time không offset ⇒ coi là UTC (KHÔNG dùng local time của client).
 *   - Date object ⇒ `.getTime()`.
 * Trả `null` nếu không parse được.
 */
export function toTimestampMs(value: unknown): number | null {
	if (value instanceof Date) {
		const t = value.getTime();
		return Number.isFinite(t) ? t : null;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value) || value <= 0) return null;
		// 1e11 giây ≈ năm 5138; 1e11 ms ≈ 1973. Heuristic: < 1e11 là giây.
		return value < 1e11 ? Math.round(value * 1000) : Math.round(value);
	}
	if (typeof value !== "string") return null;

	const trimmed = value.trim();
	if (NUMERIC_SENTINELS.has(trimmed)) return null;
	// Numeric string ⇒ epoch.
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) return toTimestampMs(Number(trimmed));
	if (DATE_ONLY_RE.test(trimmed)) return Date.parse(`${trimmed}T00:00:00Z`);
	if (NAIVE_DATETIME_RE.test(trimmed)) {
		const iso = trimmed.replace(" ", "T");
		const withSeconds = iso.length === 16 ? `${iso}:00` : iso;
		return Date.parse(`${withSeconds}Z`);
	}
	const parsed = Date.parse(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
}

function readRecord(raw: unknown): Record<string, unknown> | null {
	if (raw && typeof raw === "object" && !Array.isArray(raw)) {
		return raw as Record<string, unknown>;
	}
	return null;
}

/** Timestamp có thể nằm ở `timestamp` (bars) hoặc `date`/`time` (chart). */
function readBarTimestamp(rec: Record<string, unknown>): number | null {
	for (const key of ["timestamp", "date", "time", "t", "ts"]) {
		const ms = toTimestampMs(rec[key]);
		if (ms !== null) return ms;
	}
	return null;
}

function readBarSource(rec: Record<string, unknown>): BarSource {
	if (rec.timestamp !== undefined) return "bars";
	if (rec.date !== undefined || rec.time !== undefined) return "chart";
	return "unknown";
}

/**
 * Chuẩn hóa 1 bar từ **bất kỳ** shape nào của backend.
 * Trả `null` nếu không đọc được timestamp (bar vô dụng) — không tạo bar rỗng.
 */
export function normalizeBar(raw: unknown): CanonicalBar | null {
	const rec = readRecord(raw);
	if (!rec) return null;
	const timestamp = readBarTimestamp(rec);
	if (timestamp === null) return null;
	return {
		timestamp,
		open: toNum(rec.open ?? rec.o),
		high: toNum(rec.high ?? rec.h),
		low: toNum(rec.low ?? rec.l),
		close: toNum(rec.close ?? rec.c),
		volume: toNumOrZero(rec.volume ?? rec.v),
		adjClose: toNum(rec.adj_close ?? rec.adjClose),
		adjFactor: toNum(rec.adj_factor ?? rec.adjFactor),
		isPartial: rec.isPartial === true || rec.is_partial === true,
		source: readBarSource(rec),
	};
}

/**
 * Chuẩn hóa mảng bar. Tự bỏ bar hỏng và **giữ nguyên thứ tự** như backend trả về
 * (sắp xếp lại là việc của tầng camera, tránh phá invariant range in-bounds).
 */
export function normalizeBars(raw: unknown): CanonicalBar[] {
	if (!Array.isArray(raw)) return [];
	const out: CanonicalBar[] = [];
	for (const item of raw) {
		const bar = normalizeBar(item);
		if (bar) out.push(bar);
	}
	return out;
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

export type MarketStatus =
	| "PRE_OPEN"
	| "OPEN"
	| "LUNCH"
	| "CLOSED"
	| "HALTED"
	| "SUSPENDED"
	| "NOT_TRADED"
	| "UNKNOWN";

const MARKET_STATUSES: ReadonlySet<string> = new Set<MarketStatus>([
	"PRE_OPEN", "OPEN", "LUNCH", "CLOSED", "HALTED", "SUSPENDED", "NOT_TRADED",
]);

export interface CanonicalQuote {
	symbol: string;
	price: number | null;
	prevClose: number | null;
	/** `change` và `change_pct` luôn là number hoặc null — không bao giờ string. */
	change: number | null;
	changePct: number | null;
	open: number | null;
	high: number | null;
	low: number | null;
	volume: number;
	turnover: number | null;
	ceiling: number | null;
	floor: number | null;
	marketStatus: MarketStatus;
	/** `stale` là bắt buộc — UI hiện badge dữ liệu cũ (field này đã có sẵn ở backend). */
	stale: boolean;
	source: string | null;
	fetchedAt: number | null;
}

/** Đọc field đầu tiên có mặt trong danh sách alias. */
function readAlias(rec: Record<string, unknown>, keys: readonly string[]): unknown {
	for (const key of keys) {
		if (rec[key] !== undefined && rec[key] !== null) return rec[key];
	}
	return null;
}

function readMarketStatus(value: unknown): MarketStatus {
	if (typeof value !== "string") return "UNKNOWN";
	const upper = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
	return MARKET_STATUSES.has(upper) ? (upper as MarketStatus) : "UNKNOWN";
}

/**
 * Chuẩn hóa 1 quote. Hấp thụ **cả hai** shape backend:
 *   - `price` là number (`change_pct: number`)
 *   - `price` là string-Decimal (`price_change_pct: string`) — `market_serving/native_views.py:54-121`
 * và bỏ cặp field trùng: `price`/`current_price`, `price_change`/`change_value`.
 */
export function normalizeQuote(raw: unknown): CanonicalQuote | null {
	const rec = readRecord(raw);
	if (!rec) return null;
	const symbol = typeof rec.symbol === "string" ? rec.symbol.trim().toUpperCase() : "";
	if (!symbol) return null;
	return {
		symbol,
		price: toNum(readAlias(rec, ["price", "current_price"])),
		prevClose: toNum(readAlias(rec, ["prev_close", "prevClose", "reference_price", "prev_price"])),
		change: toNum(readAlias(rec, ["change", "price_change", "change_value"])),
		changePct: toNum(readAlias(rec, ["change_pct", "price_change_pct", "changePercent"])),
		open: toNum(readAlias(rec, ["open", "open_price"])),
		high: toNum(readAlias(rec, ["high", "high_price"])),
		low: toNum(readAlias(rec, ["low", "low_price"])),
		volume: toNumOrZero(rec.volume),
		turnover: toNum(readAlias(rec, ["turnover", "value"])),
		ceiling: toNum(rec.ceiling),
		floor: toNum(rec.floor),
		marketStatus: readMarketStatus(rec.market_status ?? rec.marketStatus),
		stale: rec.stale === true,
		source: typeof rec.source === "string" ? rec.source : null,
		fetchedAt: toTimestampMs(readAlias(rec, ["fetched_at", "fetchedAt", "ts"])),
	};
}

/** Chuẩn hóa mảng quote (shape `{ quotes: [...] }` / `{ data: [...] }` hoặc mảng trần). */
export function normalizeQuotes(raw: unknown): CanonicalQuote[] {
	if (Array.isArray(raw)) {
		return raw.map(normalizeQuote).filter((q): q is CanonicalQuote => q !== null);
	}
	const rec = readRecord(raw);
	const list = rec?.quotes ?? rec?.data;
	if (!Array.isArray(list)) return [];
	return list.map(normalizeQuote).filter((q): q is CanonicalQuote => q !== null);
}
