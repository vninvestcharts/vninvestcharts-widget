import { describe, expect, it } from "vitest";
import {
	normalizeBar,
	normalizeBars,
	normalizeQuote,
	normalizeQuotes,
	toNum,
	toTimestampMs,
} from "../DataEnvelope";

/**
 * Regression lock cho lớp dữ liệu (W0.3 DoD §2.3).
 *
 * 4 shape backend thực tế (bằng chứng trong repo `vninvest`):
 *  A. `/bars/`  → `{ timestamp: <Unix ms int>, volume: <int> }`
 *     (`market_data/stock_mgmt_native_views.py:3665-3685`)
 *  B. `/chart/` → `{ date: <ISO string>, volume: <float> }`
 *     (`market_data/stock_mgmt_native_views.py:943-951`)
 *  C. quote `price` là **string** (Decimal) + `price_change_pct` là **string**
 *     (`market_serving/native_views.py:54-121`)
 *  D. quote `price` là **number** + `change_pct` là **number** (batch `:102-120`)
 */

const MS_2026_09_18 = Date.UTC(2026, 8, 18);

describe("toNum: chấp nhận string, từ chối rác", () => {
	it("parse number và numeric string", () => {
		expect(toNum(42.35)).toBe(42.35);
		expect(toNum("42.35")).toBe(42.35);
		expect(toNum(" 42.35 ")).toBe(42.35);
		expect(toNum("1.25e6")).toBe(1250000);
		expect(toNum(0)).toBe(0);
		expect(toNum("0")).toBe(0);
	});

	it("trả null cho giá trị không phải số — KHÔNG bịa 0", () => {
		for (const bad of [
			null, undefined, true, false, {}, [], NaN, Infinity, -Infinity,
			"", "  ", "-", "--", "N/A", "n/a", "null", "undefined", "NaN",
			"abc", "12px", "1,234.5",
		]) {
			expect(toNum(bad), `input=${String(bad)}`).toBeNull();
		}
	});
});

describe("toTimestampMs: 3 định dạng backend + heuristic epoch", () => {
	it("ISO date-only ⇒ UTC midnight (không lệch timezone máy)", () => {
		expect(toTimestampMs("2026-09-18")).toBe(MS_2026_09_18);
	});

	it("ISO date-time không offset ⇒ coi là UTC", () => {
		expect(toTimestampMs("2026-09-18T00:00:00")).toBe(MS_2026_09_18);
		expect(toTimestampMs("2026-09-18 00:00:00")).toBe(MS_2026_09_18);
		expect(toTimestampMs("2026-09-18T00:00")).toBe(MS_2026_09_18);
	});

	it("ISO có Z/offset ⇒ tôn trọng offset", () => {
		expect(toTimestampMs("2026-09-18T00:00:00Z")).toBe(MS_2026_09_18);
		expect(toTimestampMs("2026-09-18T07:00:00+07:00")).toBe(MS_2026_09_18);
	});

	it("epoch: < 1e11 coi là giây, >= 1e11 coi là ms", () => {
		expect(toTimestampMs(1758153600)).toBe(1758153600000);
		expect(toTimestampMs(1758153600000)).toBe(1758153600000);
		expect(toTimestampMs("1758153600")).toBe(1758153600000);
		expect(toTimestampMs("1758153600000")).toBe(1758153600000);
	});

	// Heuristic có ranh giới rõ ràng — khoá lại để không ai nới lỏng sau này.
	it("heuristic epoch chỉ đúng cho timestamp thực tế (>= năm 1973)", () => {
		// 1e11 ms ≈ 1973-03-03. Giá trị nhỏ hơn bị coi là GIÂY.
		expect(toTimestampMs(99_999_999_999)).toBe(99_999_999_999_000);
		expect(toTimestampMs(100_000_000_000)).toBe(100_000_000_000);
	});

	it("Date object", () => {
		expect(toTimestampMs(new Date(MS_2026_09_18))).toBe(MS_2026_09_18);
	});

	it("trả null cho giá trị không parse được", () => {
		for (const bad of [null, undefined, "", "N/A", "abc", 0, -1, NaN, {}, []]) {
			expect(toTimestampMs(bad), `input=${String(bad)}`).toBeNull();
		}
	});
});

describe("normalizeBar: shape A — /bars/ (timestamp int ms)", () => {
	it("parse bar chuẩn", () => {
		const bar = normalizeBar({
			timestamp: MS_2026_09_18,
			open: 42.35, high: 43.1, low: 42.2, close: 42.9,
			volume: 1250000,
		});
		expect(bar).not.toBeNull();
		expect(bar?.timestamp).toBe(MS_2026_09_18);
		expect(bar?.close).toBe(42.9);
		expect(bar?.volume).toBe(1250000);
		expect(bar?.source).toBe("bars");
	});

	it("adjClose/adjFactor luôn có key, null tới khi EP-1 tới — KHÔNG tự tính", () => {
		const bar = normalizeBar({ timestamp: MS_2026_09_18, close: 42.9, volume: 1 });
		expect(bar).toHaveProperty("adjClose", null);
		expect(bar).toHaveProperty("adjFactor", null);
	});

	it("đọc được adj_* khi backend đã trả", () => {
		const bar = normalizeBar({
			timestamp: MS_2026_09_18, close: 42.9, volume: 1,
			adj_close: 40.5, adj_factor: 0.944,
		});
		expect(bar?.adjClose).toBe(40.5);
		expect(bar?.adjFactor).toBe(0.944);
	});
});

describe("normalizeBar: shape B — /chart/ (date ISO, volume float)", () => {
	it("parse được cùng dữ liệu như shape A", () => {
		const viaChart = normalizeBar({
			date: "2026-09-18", open: 42.35, high: 43.1, low: 42.2, close: 42.9,
			volume: 1250000.0,
		});
		const viaBars = normalizeBar({
			timestamp: MS_2026_09_18, open: 42.35, high: 43.1, low: 42.2, close: 42.9,
			volume: 1250000,
		});
		expect(viaChart?.timestamp).toBe(viaBars?.timestamp);
		expect(viaChart?.close).toBe(viaBars?.close);
		expect(viaChart?.volume).toBe(viaBars?.volume);
		expect(viaChart?.source).toBe("chart");
	});
});

describe("normalizeBar: dữ liệu bẩn — không vẽ giá 0 giả", () => {
	it("field thiếu/null ⇒ null (không phải 0)", () => {
		const bar = normalizeBar({ timestamp: MS_2026_09_18, close: null, open: undefined });
		expect(bar?.close).toBeNull();
		expect(bar?.open).toBeNull();
		expect(bar?.high).toBeNull();
	});

	it("volume null/rác ⇒ 0 (0 volume là hợp lệ)", () => {
		expect(normalizeBar({ timestamp: 1, close: 1, volume: null })?.volume).toBe(0);
		expect(normalizeBar({ timestamp: 1, close: 1, volume: "N/A" })?.volume).toBe(0);
		expect(normalizeBar({ timestamp: 1, close: 1, volume: "1250000" })?.volume).toBe(1250000);
	});

	it("bar không đọc được timestamp ⇒ loại, không tạo bar rỗng", () => {
		expect(normalizeBar({ close: 42.9 })).toBeNull();
		expect(normalizeBar({ timestamp: "N/A", close: 42.9 })).toBeNull();
		expect(normalizeBar(null)).toBeNull();
		expect(normalizeBar("x")).toBeNull();
		expect(normalizeBar(42.9)).toBeNull();
	});

	it("isPartial được giữ", () => {
		expect(normalizeBar({ timestamp: 1, close: 1, is_partial: true })?.isPartial).toBe(true);
		expect(normalizeBar({ timestamp: 1, close: 1, isPartial: true })?.isPartial).toBe(true);
		expect(normalizeBar({ timestamp: 1, close: 1 })?.isPartial).toBe(false);
	});
});

describe("normalizeBars: bỏ bar hỏng, giữ thứ tự", () => {
	it("lọc bar hỏng và giữ thứ tự backend trả về", () => {
		const t0 = 1_758_000_000_000; // timestamp ms thực tế
		const bars = normalizeBars([
			{ timestamp: t0 + 3000, close: 3 },
			{ close: 2 },
			{ timestamp: t0, close: 1 },
			null,
			"x",
			{ timestamp: t0 + 2000, close: 2.5 },
		]);
		expect(bars.map((b) => b.timestamp)).toEqual([t0 + 3000, t0, t0 + 2000]);
		expect(bars.map((b) => b.close)).toEqual([3, 1, 2.5]);
	});

	it("input không phải mảng ⇒ mảng rỗng", () => {
		expect(normalizeBars(null)).toEqual([]);
		expect(normalizeBars({ bars: [] })).toEqual([]);
		expect(normalizeBars("x")).toEqual([]);
	});
});

describe("normalizeQuote: shape C — price là STRING (Decimal)", () => {
	it("parse được số dạng string thành number", () => {
		const q = normalizeQuote({
			symbol: "VNM",
			price: "42.90",
			price_change: "0.55",
			price_change_pct: "1.2987",
			prev_price: "42.35",
			volume: 1250000,
			market_status: "closed",
			stale: false,
			source: "vnbroker",
			fetched_at: "2026-09-18T00:00:00Z",
		});
		expect(q).not.toBeNull();
		expect(q?.price).toBe(42.9);
		expect(typeof q?.price).toBe("number");
		expect(q?.change).toBe(0.55);
		expect(q?.changePct).toBe(1.2987);
		expect(q?.prevClose).toBe(42.35);
		expect(q?.symbol).toBe("VNM");
		expect(q?.marketStatus).toBe("CLOSED");
		expect(q?.stale).toBe(false);
		expect(q?.fetchedAt).toBe(MS_2026_09_18);
	});

	it("chống lỗi âm thầm: '0.0' === 0 trong JS là false", () => {
		// Đây là lý do phải ép về number ở ranh giới.
		expect(("0.0" as unknown) === (0 as unknown)).toBe(false);
		const price = normalizeQuote({ symbol: "VNM", price: "0.0" })?.price;
		expect(price).toBe(0);
		expect((price as unknown) === (0 as unknown)).toBe(true);
	});
});

describe("normalizeQuote: shape D — price là NUMBER", () => {
	it("cho kết quả giống hệt shape C", () => {
		const strShape = normalizeQuote({
			symbol: "vnm", price: "42.90", price_change: "0.55", price_change_pct: "1.2987",
		});
		const numShape = normalizeQuote({
			symbol: "VNM", price: 42.9, change: 0.55, change_pct: 1.2987,
		});
		expect(numShape?.price).toBe(strShape?.price);
		expect(numShape?.change).toBe(strShape?.change);
		expect(numShape?.changePct).toBe(strShape?.changePct);
		expect(numShape?.symbol).toBe(strShape?.symbol);
	});
});

describe("normalizeQuote: bỏ field trùng + market status + batch", () => {
	it("current_price / change_value là alias, không tạo field mới", () => {
		const q = normalizeQuote({ symbol: "VNM", current_price: "40", change_value: "1.5" });
		expect(q?.price).toBe(40);
		expect(q?.change).toBe(1.5);
		expect(q).not.toHaveProperty("current_price");
		expect(q).not.toHaveProperty("change_value");
	});

	it("market_status lạ ⇒ UNKNOWN (không đoán)", () => {
		expect(normalizeQuote({ symbol: "VNM", market_status: "weird" })?.marketStatus).toBe("UNKNOWN");
		expect(normalizeQuote({ symbol: "VNM" })?.marketStatus).toBe("UNKNOWN");
		expect(normalizeQuote({ symbol: "VNM", market_status: "pre-open" })?.marketStatus).toBe("PRE_OPEN");
	});

	it("thiếu symbol ⇒ loại", () => {
		expect(normalizeQuote({ price: 1 })).toBeNull();
		expect(normalizeQuote({ symbol: "  " })).toBeNull();
		expect(normalizeQuote(null)).toBeNull();
	});

	it("batch: nhận cả mảng trần lẫn { quotes: [] } / { data: [] }", () => {
		const item = { symbol: "VNM", price: "42.90" };
		expect(normalizeQuotes([item])).toHaveLength(1);
		expect(normalizeQuotes({ quotes: [item] })).toHaveLength(1);
		expect(normalizeQuotes({ data: [item] })).toHaveLength(1);
		expect(normalizeQuotes(null)).toEqual([]);
		expect(normalizeQuotes({ nope: 1 })).toEqual([]);
	});
});
