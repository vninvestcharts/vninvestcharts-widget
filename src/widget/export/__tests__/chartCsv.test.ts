import { describe, expect, it } from "vitest";
import {
	CSV_MAX_ROWS,
	buildBarsCsv,
	buildDrawingsCsv,
	csvFilename,
	downloadCsv,
	escapeCsvCell,
	estimateCsvBytes,
	splitBarsForCsv,
	type BarsCsvOptions,
} from "../chartCsv";
import type { CanonicalBar } from "../../data/DataEnvelope";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";

/**
 * W1.4/A5 — regression lock cho CSV export.
 *
 * Ba điều dễ sai nhất và đều làm người dùng mất dữ liệu hoặc tính sai:
 *  1. Escape sai ⇒ một ô có dấu phẩy làm hỏng cả hàng.
 *  2. Thiếu BOM ⇒ Excel mở tiếng Việt thành mojibake.
 *  3. `null` xuất thành "0" ⇒ chỉ báo tính sai (vi phạm Rule 15).
 */

const T0 = 1_758_000_000_000;

function bar(i: number, over: Partial<CanonicalBar> = {}): CanonicalBar {
	return {
		timestamp: T0 + i * 86_400_000,
		open: 1 + i, high: 2 + i, low: 0.5 + i, close: 1.5 + i,
		volume: 1000 + i,
		adjClose: null, adjFactor: null, isPartial: false, source: "bars",
		...over,
	};
}

const BARS = [bar(0), bar(1), bar(2)];

describe("escapeCsvCell: đúng chuẩn RFC 4180", () => {
	it("số và chuỗi thường không bọc", () => {
		expect(escapeCsvCell(42.35)).toBe("42.35");
		expect(escapeCsvCell("SMA20")).toBe("SMA20");
	});

	it("có dấu phẩy ⇒ bọc", () => {
		expect(escapeCsvCell("VNM, HOSE")).toBe('"VNM, HOSE"');
	});

	it("có xuống dòng ⇒ bọc", () => {
		expect(escapeCsvCell("a\nb")).toBe('"a\nb"');
		expect(escapeCsvCell("a\r\nb")).toBe('"a\r\nb"');
	});

	it("có dấu nháy ⇒ bọc VÀ nhân đôi", () => {
		expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
	});

	it("null/undefined ⇒ ô TRỐNG, KHÔNG phải 0", () => {
		expect(escapeCsvCell(null)).toBe("");
		expect(escapeCsvCell(undefined)).toBe("");
		expect(escapeCsvCell(null)).not.toBe("0");
	});

	it("0 thật vẫn là 0 (phân biệt với null)", () => {
		expect(escapeCsvCell(0)).toBe("0");
	});
});

describe("buildBarsCsv: cấu trúc + BOM", () => {
	const opts: BarsCsvOptions = { symbol: "VNM", timeframe: "1D", bars: BARS };
	const csv = buildBarsCsv(opts);
	// BOM nằm ở ký tự đầu ⇒ dòng đầu tiên mang BOM. Tách riêng để assert rõ.
	const lines = csv.split("\r\n");
	const HEADER_ROW = 3; // 0: meta header · 1: meta values · 2: blank · 3: header

	it("bắt đầu bằng UTF-8 BOM để Excel đọc đúng tiếng Việt", () => {
		expect(csv.charCodeAt(0)).toBe(0xfeff);
	});

	it("có dòng siêu dữ liệu nói rõ phạm vi dữ liệu", () => {
		expect(lines[0].replace(/^\uFEFF/, "")).toBe("symbol,timeframe,rows,scope");
		expect(lines[1].replace(/^\uFEFF/, "")).toBe("VNM,1D,3,loaded-in-memory");
	});

	it("KHÔNG lặp symbol/timeframe ở dòng dữ liệu (trông như dữ liệu bẩn)", () => {
		expect(lines[4].startsWith(new Date(T0).toISOString())).toBe(true);
	});

	it("header đủ cột OHLCV + adj + partial", () => {
		expect(lines[HEADER_ROW].replace(/^\uFEFF/, "")).toBe(
			"time,open,high,low,close,volume,adj_close,adj_factor,is_partial",
		);
	});

	it("mỗi bar thành một dòng, timestamp là ISO", () => {
		expect(lines[HEADER_ROW + 1]).toBe(`${new Date(T0).toISOString()},1,2,0.5,1.5,1000,,,false`);
		expect(lines.filter((l) => l.length > 0).length).toBe(3 + 3); // 3 meta + 3 bar
	});

	it("adj_close/adj_factor rỗng khi chưa có EP-1, KHÔNG ghi 0", () => {
		const data = lines[HEADER_ROW + 1];
		expect(data).toContain(",,,");
		expect(data).not.toContain(",0,0,");
	});

	it("bar thiếu giá ⇒ ô trống cho cột đó, KHÔNG phải 0", () => {
		const csv2 = buildBarsCsv({
			symbol: "X", timeframe: "1D",
			bars: [bar(0, { open: null, high: null, low: null, close: null })],
		});
		const cells = csv2.split("\r\n")[HEADER_ROW + 1].split(",");
		// time, open, high, low, close phải rỗng; volume 1000 là số thật, giữ nguyên.
		expect(cells[0]).toBe(new Date(T0).toISOString());
		expect(cells.slice(1, 5)).toEqual(["", "", "", ""]);
		expect(cells[5]).toBe("1000");
		// Ô rỗng KHÔNG được biến thành chuỗi "0" ở bất kỳ cột giá nào.
		for (const i of [1, 2, 3, 4, 6, 7]) expect(cells[i]).not.toBe("0");
	});

	it("adj có sẵn thì xuất ra", () => {
		const csv3 = buildBarsCsv({
			symbol: "X", timeframe: "1D",
			bars: [bar(0, { adjClose: 1.4, adjFactor: 0.93 })],
		});
		expect(csv3.split("\r\n")[HEADER_ROW + 1]).toContain(",1.4,0.93,");
	});

	it("thêm cột chỉ báo", () => {
		const csv4 = buildBarsCsv({
			...opts,
			series: [{ column: "SMA 20", values: [1, null, 3] }],
		});
		expect(csv4.split("\r\n")[HEADER_ROW].replace(/^\uFEFF/, "")).toContain("SMA 20");
		expect(csv4.split("\r\n")[HEADER_ROW + 1]).toMatch(/,1$/);
		expect(csv4.split("\r\n")[HEADER_ROW + 2]).toMatch(/,$/); // null => ô trống
	});

	it("tên cột có dấu phẩy được bọc đúng", () => {
		const csv5 = buildBarsCsv({ ...opts, series: [{ column: "SMA(20, close)", values: [1, 2, 3] }] });
		expect(csv5.split("\r\n")[HEADER_ROW].replace(/^\uFEFF/, "")).toContain('"SMA(20, close)"');
	});

	it("bars rỗng vẫn ra header hợp lệ", () => {
		const csv6 = buildBarsCsv({ symbol: "X", timeframe: "1D", bars: [] });
		expect(csv6.split("\r\n")[HEADER_ROW].replace(/^\uFEFF/, "")).toBe(
			"time,open,high,low,close,volume,adj_close,adj_factor,is_partial",
		);
	});
});

describe("splitBarsForCsv: cắt chunk không lệch cột chỉ báo", () => {
	const many = Array.from({ length: 7 }, (_, i) => bar(i));
	const series = [{ column: "V", values: many.map((_, i) => i) }];
	const HEADER_ROW = 3;

	it("tách đúng số chunk", () => {
		const chunks = splitBarsForCsv({ symbol: "X", timeframe: "1D", bars: many, series }, 3);
		expect(chunks).toHaveLength(3);
		expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2]);
		expect(chunks.every((c) => c.totalChunks === 3)).toBe(true);
	});

	it("chunk đầu giữ đủ 3 dòng dữ liệu", () => {
		const chunks = splitBarsForCsv({ symbol: "X", timeframe: "1D", bars: many }, 3);
		const dataRows = chunks[0].csv.split("\r\n").slice(HEADER_ROW + 1).filter((l) => l.length > 0);
		expect(dataRows).toHaveLength(3);
	});

	it("⛔ cột chỉ báo được cắt CÙNG chỉ số, không lệch (bắt buộc)", () => {
		const chunks = splitBarsForCsv({ symbol: "X", timeframe: "1D", bars: many, series }, 3);
		// Chunk 1 chứa bar index 3,4,5 ⇒ cột V phải là 3,4,5.
		const rows = chunks[1].csv.split("\r\n").slice(HEADER_ROW + 1).filter((l) => l.length > 0);
		expect(rows.map((r) => r.split(",").at(-1))).toEqual(["3", "4", "5"]);
	});

	it("bars rỗng vẫn ra ít nhất 1 chunk", () => {
		expect(splitBarsForCsv({ symbol: "X", timeframe: "1D", bars: [] }, 3)).toHaveLength(1);
	});

	it("mặc định dùng CSV_MAX_ROWS", () => {
		expect(CSV_MAX_ROWS).toBe(200_000);
	});
});

describe("buildDrawingsCsv", () => {
	const drawings = [
		{ id: "d1", type: "trendLine", points: [{ x: 1, y: 2 }], style: {}, createdAt: 1, updatedAt: 2, paneId: "price", visible: true, locked: false, zIndex: 3 } as unknown as DrawingObject,
		{ id: "d2", type: "hLine", points: [], style: {}, createdAt: 1, updatedAt: 2, visible: false, locked: true } as unknown as DrawingObject,
	];

	it("header + 1 dòng mỗi drawing", () => {
		const lines = buildDrawingsCsv({ drawings }).split("\r\n");
		expect(lines[0].replace(/^\uFEFF/, "")).toBe("id,type,symbol,timeframe,paneId,visible,locked,zIndex,json");
		expect(lines[1]).toContain("d1");
		expect(lines[1]).toContain("trendLine");
		expect(lines[2]).toContain("d2");
	});

	it("visible mặc định true, locked phải là true khi có", () => {
		const lines = buildDrawingsCsv({ drawings }).split("\r\n");
		expect(lines[1]).toContain(",true,false,3,");
		expect(lines[2]).toContain(",false,true,");
	});

	it("JSON drawing được escape nên không phá CSV", () => {
		const withComma = [
			{ id: "d", type: "text", points: [], style: {}, createdAt: 1, updatedAt: 2,
				extra: { text: 'a,b "c"' } } as unknown as DrawingObject,
		];
		const line = buildDrawingsCsv({ drawings: withComma }).split("\r\n")[1];
		// JSON chứa dấu phẩy ⇒ cột cuối phải được bọc.
		expect(line.endsWith('"')).toBe(true);
	});

	it("drawings rỗng vẫn ra header", () => {
		expect(buildDrawingsCsv({ drawings: [] }).split("\r\n")[0].replace(/^\uFEFF/, "")).toContain("zIndex");
	});
});

describe("downloadCsv", () => {
	// jsdom không có createObjectURL ⇒ mock trước mỗi test. Đây là giới hạn của môi
	// trường test, không phải của trình duyệt.
	function mockObjectUrl() {
		const created: string[] = [];
		const revoked: string[] = [];
		URL.createObjectURL = vi.fn(() => {
			created.push("blob:x");
			return "blob:x";
		}) as unknown as typeof URL.createObjectURL;
		URL.revokeObjectURL = vi.fn((u: string) => {
			revoked.push(u);
		}) as unknown as typeof URL.revokeObjectURL;
		return { created, revoked };
	}

	it("trả null khi không có document (SSR) thay vì ném", () => {
		expect(downloadCsv("a", "x,y", null)).toBeNull();
	});

	it("tạo <a download> rồi dọn khỏi DOM", () => {
		mockObjectUrl();
		const events: string[] = [];
		const fakeDoc = {
			createElement: (tag: string) =>
				({ tag, rel: "", download: "", href: "", click: () => events.push("click") }) as unknown as HTMLAnchorElement,
			body: { appendChild: () => {}, removeChild: () => events.push("removed") },
		} as unknown as Document;

		const res = downloadCsv("my-data", "a,b\r\n", fakeDoc);
		expect(res?.filename).toBe("my-data.csv");
		expect(events).toEqual(["click", "removed"]);
	});

	it("giữ đuôi .csv nếu đã có", () => {
		mockObjectUrl();
		const fakeDoc = {
			createElement: () => ({ click: () => {}, rel: "" }) as unknown as HTMLAnchorElement,
			body: { appendChild: () => {}, removeChild: () => {} },
		} as unknown as Document;
		expect(downloadCsv("x.csv", "a", fakeDoc)?.filename).toBe("x.csv");
	});

	it("URL.createObjectURL không có ⇒ ném lỗi RÕ, không phải TypeScript TypeError", () => {
		const saved = URL.createObjectURL;
		// @ts-expect-error cố tình xoá để mô phỏng môi trường thiếu API
		URL.createObjectURL = undefined;
		const fakeDoc = {
			createElement: () => ({ click: () => {}, rel: "" }) as unknown as HTMLAnchorElement,
			body: { appendChild: () => {}, removeChild: () => {} },
		} as unknown as Document;
		try {
			expect(() => downloadCsv("a", "b", fakeDoc)).toThrow(/createObjectURL/);
		} finally {
			URL.createObjectURL = saved;
		}
	});
});

describe("helpers", () => {
	it("estimateCsvBytes ước lượng cao hơn cho ký tự nhiều byte", () => {
		const ascii = estimateCsvBytes("abc");
		const viet = estimateCsvBytes("ábc");
		expect(ascii).toBe(3);
		expect(viet).toBeGreaterThan(ascii);
	});

	it("csvFilename có timestamp và đuôi đúng", () => {
		const name = csvFilename("VNM-1D");
		expect(name).toMatch(/^VNM-1D-\d{8}-\d{4}\.csv$/);
	});
});
