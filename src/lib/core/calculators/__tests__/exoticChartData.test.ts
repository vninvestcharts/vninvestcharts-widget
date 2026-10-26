import { describe, expect, it } from "vitest";
import { PRIMARY_BASELINE_KEY } from "@vninvestcharts/engine-core";
import { applyExoticChartData, computeKagiStates, computeLineBreakLevels, computePointAndFigureColumns, computeRenkoBricks, resolveBrickStep } from "../exoticChartData";
import { enrichData } from "../enrichData";
import { resolveSeriesValue } from "../../seriesValueResolver";
import type { RawOHLCV } from "../types";
import type { SeriesConfig, SeriesTypeId } from "../../types/pane-descriptor";

/**
 * A3 Baseline / A11 Renko / Kagi / Point & Figure / Line Break — producer.
 *
 * Đây là tầng DUY NHẤT quyết định chart type này vẽ ra cái gì. `test ở
 * chartTypeContract.test.ts` chỉ chứng minh resolver không còn rơi về `close`;
 * nếu producer này im lặng thì resolver trả `undefined` và chart trống — cũng
 * sai, theo cách khác. Vì vậy mọi test ở đây chạy trên HÀM THẬT và kiểm giá trị
 * cụ thể, không kiểm "có gọi hay không".
 */

function bar(close: number): RawOHLCV {
	return {
		date: new Date(2026, 0, 1 + 0),
		open: close,
		high: close,
		low: close,
		close,
		volume: 1000,
	};
}

function bars(closes: readonly number[]): RawOHLCV[] {
	return closes.map((close, i) => ({ ...bar(close), date: new Date(2026, 0, 1 + i) }));
}

function series(type: SeriesTypeId, params?: Record<string, unknown>): SeriesConfig[] {
	return [{ type, yAxis: "right", ...(params ? { params } : {}) }];
}

function valueOn(enriched: readonly { normalizedPrices?: Record<string, number>; renkoClose?: number; current?: number }[], type: SeriesTypeId, index: number) {
	return resolveSeriesValue(enriched[index] as never, { type, yAxis: "right" });
}

describe("computeRenkoBricks — phát hiện bậc gạch từ biến động giá", () => {
	it("mỗi gạch có chiều cao đúng MỘT bậc, kể cả khi một bar nhảy xa hơn một bậc", () => {
		// 100 → 130 với bậc 10 là 3 gạch tăng, không phải 1 gạch cao 30.
		const bricks = computeRenkoBricks([100, 130], 10);
		expect(bricks[1]).toEqual({ open: 120, close: 130, up: true, fullyFormed: true });
	});

	it("một bar chỉ giữ gạch CUỐI (trục X là thời gian, gạch trong bar không có x riêng)", () => {
		const bricks = computeRenkoBricks([100, 130], 10);
		// Bar 1 tạo ra 3 gạch nhưng chỉ gạch cuối được ghi nhận.
		expect(bricks[0]).toBeUndefined();
		expect(bricks[1]?.close).toBe(130);
	});

	it("gạch tăng và gạch giảm nối tiếp nhau trên cùng một bậc", () => {
		// 100 → 110 (tăng 1 gạch) → 100 (giảm 1 gạch): neo không trôi.
		const bricks = computeRenkoBricks([100, 110, 100], 10);
		expect(bricks[1]).toEqual({ open: 100, close: 110, up: true, fullyFormed: true });
		expect(bricks[2]).toEqual({ open: 110, close: 100, up: false, fullyFormed: true });
	});

	it("bar chưa đủ một bậc thì không tạo gạch TRỌN VẸN nào", () => {
		// 100 → 105 với bậc 10: chưa đủ một gạch, nên không có gạch trọn vẹn. Nhưng
		// 5/10 = 50% ≥ ngưỡng 25% nên vẫn phải hiện GẠCH DANG DỞ, nếu không giá
		// hiện tại biến mất khỏi chart và user tưởng dữ liệu đứt.
		const bricks = computeRenkoBricks([100, 105], 10);
		expect(bricks[0]).toBeUndefined();
		expect(bricks[1]).toEqual({ open: 100, close: 105, up: true, fullyFormed: false });
		expect(bricks.some((b) => b?.fullyFormed === true)).toBe(false);
	});

	it("dưới ngưỡng 25% thì không vẽ gạch dang dở nào — tránh vẽ gạch quá mỏng", () => {
		// 100 → 101 với bậc 10 = 10% < 25%: một gạch 1/10 bậc là nhiễu, không phải tín hiệu.
		expect(computeRenkoBricks([100, 101], 10).every((b) => b === undefined)).toBe(true);
	});

	it("gạch dang dở ở cuối chuỗi được đánh dấu `fullyFormed: false`", () => {
		// 100 → 107 với bậc 10: chưa đủ bậc, nhưng đã đi 70% bậc nên phải hiện giá.
		const bricks = computeRenkoBricks([100, 107], 10);
		expect(bricks[1]).toEqual({ open: 100, close: 107, up: true, fullyFormed: false });
	});

	it("giá trị NaN / bậc không hợp lệ cho ra mảng rỗng, không throw", () => {
		expect(computeRenkoBricks([], 10)).toEqual([]);
		expect(computeRenkoBricks([Number.NaN, 1], 10).every((b) => b === undefined)).toBe(true);
		expect(computeRenkoBricks([100, 110], 0).every((b) => b === undefined)).toBe(true);
		expect(computeRenkoBricks([100, 110], Number.NaN).every((b) => b === undefined)).toBe(true);
	});
});

describe("resolveBrickStep — bậc suy ra từ dữ liệu, không phải hằng số", () => {
	it("mặc định là trung vị |Δclose|, làm tròn để neo không trôi", () => {
		// |Δ| = 1,1,1,3 ⇒ trung vị 1. Bậc phải là số "đẹp" (1), vì bậc lẻ nhân
		// lên hàng trăm gạch sẽ cộng dồn sai số và neo lệch khỏi bậc.
		expect(resolveBrickStep([10, 11, 12, 13, 16])).toBe(1);
	});

	it("`override` thắng — host truyền `params.brickSize` thì dùng số đó", () => {
		expect(resolveBrickStep([10, 11, 12], 5)).toBe(5);
	});

	it("dữ liệu phẳng (mọi Δ = 0) trả bậc tối thiểu, không phải 0", () => {
		// Bậc 0 ⇒ `close >= level + 0` luôn đúng ⇒ phát ra vô hạn gạch.
		expect(resolveBrickStep([10, 10, 10])).toBeGreaterThan(0);
	});
});

describe("computeKagiStates — hướng + mức đảo", () => {
	it("mức HẰNG cho tới khi giá đi đủ ngưỡng ⇒ engine có thể vẽ bằng step", () => {
		// 100, 102, 104 với ngưỡng 5: chưa bar nào đủ ngưỡng, nên `current` giữ nguyên.
		const states = computeKagiStates([100, 102, 104], 5);
		expect(states.map((s) => s?.current)).toEqual([100, 100, 100]);
		expect(states.every((s) => s?.startAs === "yang")).toBe(true);
		// Chưa đủ ngưỡng ⇒ KHÔNG có `changeTo`: kagi vẫn là MỘT đoạn.
		expect(states.some((s) => s?.changeTo !== undefined)).toBe(false);
	});

	it("giá đi đủ ngưỡng CÙNG hướng thì mức nhích lên nhưng KHÔNG đảo hướng", () => {
		// 100 → 110 với ngưỡng 5: vẫn là xu hướng tăng, kagi vẽ đoạn ngang mới ở
		// 110. Nếu set `changeTo` ở đây thì `KagiSeries` tách thành hai nhánh cùng
		// màu ⇒ đường thẳng bị phân đoạn vô nghĩa.
		const states = computeKagiStates([100, 110], 5);
		expect(states[1]?.current).toBe(110);
		expect(states[1]?.startAs).toBe("yang");
		expect(states[1]?.changeTo).toBeUndefined();
		// `reverseAt` = mức mà đoạn ngang mới bắt đầu (mức cũ).
		expect(states[1]?.reverseAt).toBe(100);
	});

	it("đảo xuống khi giá đi ngược đủ ngưỡng, và đánh dấu đúng bar đảo", () => {
		const states = computeKagiStates([100, 104, 90], 5);
		// 104 chưa đủ ngưỡng lên (cần ≥ 105) ⇒ chưa đảo. 90 thì đủ ngưỡng xuống.
		expect(states[1]?.changeTo).toBeUndefined();
		expect(states[2]?.changeTo).toBe("yin");
		expect(states[2]?.changePoint).toBe(90);
		expect(states[2]?.current).toBe(90);
		expect(states[2]?.reverseAt).toBe(90);
	});

	it("đảo lên lại được: sau khi `yin` thì một cú lên đủ ngưỡng phải đảo thành `yang`", () => {
		const states = computeKagiStates([100, 90, 100], 5);
		expect(states[1]?.startAs).toBe("yin");
		expect(states[2]?.changeTo).toBe("yang");
		expect(states[2]?.current).toBe(100);
	});

	it("`reverseAt` là mức mà đoạn ngang hiện tại bắt đầu", () => {
		const states = computeKagiStates([100, 90, 100], 5);
		expect(states[0]?.reverseAt).toBe(100);
		expect(states[1]?.reverseAt).toBe(90);
		expect(states[2]?.reverseAt).toBe(100);
	});
});

describe("applyExoticChartData — chỉ tính loại chart type thật sự được yêu cầu", () => {
	const closes = [100, 112, 124, 118, 106, 94, 100];

	it("không có chart type loại nào ⇒ trả về CHÍNH mảng cũ (không cấp phát lại)", () => {
		const enriched = [{ ...bar(100) }];
		expect(applyExoticChartData(enriched, bars(closes), series("Line"))).toBe(enriched);
	});

	it("Baseline ghi phần trăm vào khoá riêng của symbol chính, giá trị 0 tại bar mốc", () => {
		const raw = bars(closes);
		const out = applyExoticChartData(raw.map((b) => ({ ...b })), raw, series("Baseline"));
		// 100 → 112 là +12%. Đây là PHẦN TRĂM, không phải giá 112: cùng công thức
		// `normalizePricesToBaseline` dùng cho overlay so sánh.
		expect(valueOn(out, "Baseline", 0)).toBe(0);
		expect(valueOn(out, "Baseline", 1)).toBeCloseTo(12, 6);
		expect(valueOn(out, "Baseline", 2)).toBeCloseTo(24, 6);
	});

	it("Baseline không ghi đè giá trị của overlay cùng nằm trên datum", () => {
		const raw = bars(closes);
		const out = applyExoticChartData(
			raw.map((b, i) => (i === 1 ? { ...b, normalizedPrices: { VIC: -45 } } : { ...b })),
			raw,
			series("Baseline"),
		);
		expect(out[1]?.normalizedPrices?.[PRIMARY_BASELINE_KEY]).toBeCloseTo(12, 6);
		expect(out[1]?.normalizedPrices?.VIC).toBe(-45);
	});

	it("Renko ghi đủ 4 field mà engine + component đọc", () => {
		const raw = bars(closes);
		const out = applyExoticChartData(raw.map((b) => ({ ...b })), raw, series("Renko", { brickSize: 10 }));
		const withBrick = out.find((d) => d.renkoClose !== undefined);
		expect(withBrick).toBeDefined();
		expect(typeof withBrick?.renkoOpen).toBe("number");
		expect(typeof withBrick?.renkoUp).toBe("boolean");
		expect(typeof withBrick?.fullyFormed).toBe("boolean");
		// `renkoClose` là giá trị resolver đọc ⇒ KHÔNG phải `close` thô.
		expect(withBrick?.renkoClose).not.toBe(withBrick?.close);
	});

	it("Kagi ghi đủ 5 field mà `KagiSeries` đọc", () => {
		const raw = bars(closes);
		const out = applyExoticChartData(raw.map((b) => ({ ...b })), raw, series("Kagi", { reversal: 10 }));
		for (const datum of out) {
			expect(typeof datum.current).toBe("number");
			expect(["yang", "yin"]).toContain(datum.startAs);
			expect(typeof datum.reverseAt).toBe("number");
		}
		expect(out.some((d) => d.changeTo !== undefined)).toBe(true);
	});

	it("cả ba loại cùng lúc: mỗi datum mang dữ liệu của chính nó, không trộn", () => {
		const raw = bars(closes);
		const out = applyExoticChartData(
			raw.map((b) => ({ ...b })),
			raw,
			[...series("Baseline"), ...series("Renko"), ...series("Kagi")],
		);
		expect(valueOn(out, "Kagi", 0)).toBe(100);
		expect(valueOn(out, "Baseline", 0)).toBe(0);
	});

	it("PointAndFigure ghi `boxes` + `pnfColumnStart` + `pnfDirection`; bar không tạo box thì KHÔNG ghi", () => {
		const raw = bars([100, 101, 102, 101, 100]);
		const out = applyExoticChartData(raw.map((b) => ({ ...b })), raw, series("PointAndFigure", { boxSize: 1, reversalBoxes: 2 }));
		const boxy = out.filter((d) => d.boxes !== undefined);
		expect(boxy.length).toBeGreaterThan(0);
		for (const datum of boxy) {
			expect(typeof datum.pnfColumnStart, "pnfColumnStart phải là số").toBe("number");
			expect(["up", "down"]).toContain(datum.pnfDirection);
			// Mỗi box cao đúng MỘT bậc, và các box trong một bar liền nhau.
			for (const box of datum.boxes ?? []) {
				expect(Math.abs(box.close - box.open)).toBe(1);
			}
		}
		// Bar 0 là mốc: không có box nào, nên `boxes` vắng — ghi `boxes: []` sẽ làm
		// engine tính sai số cột.
		expect(out[0].boxes).toBeUndefined();
	});

	it("LineBreak ghi `lineBreakOpen`/`lineBreakClose`/`lineBreakUp` cho MỌI bar", () => {
		const raw = bars([100, 110, 120, 105]);
		const out = applyExoticChartData(raw.map((b) => ({ ...b })), raw, series("LineBreak", { lineSize: 10 }));
		for (const datum of out) {
			expect(typeof datum.lineBreakClose, "lineBreakClose phải có ở mọi bar").toBe("number");
			expect(typeof datum.lineBreakOpen).toBe("number");
			expect(typeof datum.lineBreakUp).toBe("boolean");
		}
		// Giá 100→110→120: hai bước lên 10, cùng một đường ⇒ `open` giữ nguyên 100.
		expect(out[2].lineBreakOpen).toBe(100);
		expect(out[2].lineBreakClose).toBe(120);
	});

	it("P&F + LineBreak không ghi khi pane KHÔNG yêu cầu chúng (chi phí O(n) mỗi lần dữ liệu đổi)", () => {
		const raw = bars(closes);
		const out = applyExoticChartData(raw.map((b) => ({ ...b })), raw, series("Line"));
		expect(out.every((d) => d.boxes === undefined && d.lineBreakClose === undefined)).toBe(true);
	});
});

describe("computePointAndFigureColumns — cột xếp box, `columnStart` là bar MỞ ĐẦU cột", () => {
	it("một cột gom nhiều box qua nhiều bar, TẤT CẢ cùng `columnStart`", () => {
		// Đây là bất biến cốt lõi: engine lấy x của CẢ CỘT từ `columnStart`. Nếu nó
		// đổi theo bar thì một cột bị nhoè ra N ô — đúng lý do P&F không thể alias
		// sang đường vẽ hộp của renko.
		const columns = computePointAndFigureColumns([100, 101, 102, 103], 1, 3);
		const drawn = columns.filter((c) => c !== undefined);
		expect(drawn.length).toBe(3);
		expect(new Set(drawn.map((c) => c.columnStart))).toEqual(new Set([0]));
		expect(drawn.every((c) => c.direction === "up")).toBe(true);
	});

	it("bar đi ngang không tạo box nào, và KHÔNG mở cột mới", () => {
		// 100, 101, 101, 101, 102: bar 1 tạo box, bar 2-3 đứng yên, bar 4 tạo box
		// tiếp. Cột vẫn là MỘT (bắt đầu ở bar 0), và bar 2-3 không có entry.
		const columns = computePointAndFigureColumns([100, 101, 101, 101, 102], 1, 3);
		expect(columns[2]).toBeUndefined();
		expect(columns[3]).toBeUndefined();
		expect(columns[4]?.columnStart).toBe(0);
	});

	it("giá đi ngược đủ `reversalBoxes` thì hướng đảo và cột MỚI mở tại bar đảo chiều", () => {
		// bậc 1, đảo sau 2 bậc: lên 100→101→102 rồi rớt 99 (≤ 102-2) ⇒ cột giảm
		// mở tại bar 3, đi xuống. Cột MỚI phải có `columnStart` = 3, không phải 0.
		const columns = computePointAndFigureColumns([100, 101, 102, 99], 1, 2);
		expect(columns[2]?.direction).toBe("up");
		expect(columns[3]?.direction).toBe("down");
		expect(columns[3]?.columnStart).toBe(3);
		expect(columns[3]?.boxes).toEqual([
			{ open: 102, close: 101 },
			{ open: 101, close: 100 },
			{ open: 100, close: 99 },
		]);
	});

	it("một bar nhảy xa tạo N box cùng cột, xếp dọc LIỀN NHAU", () => {
		// Gap lớn: bar 1 đi từ 100 lên 110 với bậc 1 ⇒ 10 box, tất cả cùng x.
		const columns = computePointAndFigureColumns([100, 110], 1, 3);
		const boxes = columns[1]?.boxes ?? [];
		expect(boxes).toHaveLength(10);
		// Chỉ xét các bar THỰC SỰ tạo box — bar 0 là bar mốc nên `undefined`, và đó
		// là hành vi đúng (ghi `boxes: []` cho nó sẽ làm engine tính sai số cột).
		const drawn = columns.filter((c) => c !== undefined);
		expect(new Set(drawn.map((c) => c.columnStart))).toEqual(new Set([0]));
		for (let i = 1; i < boxes.length; i++) {
			expect(boxes[i].open, `box ${i} phải nối liền box trước`).toBe(boxes[i - 1].close);
		}
	});

	it("bậc ≤ 0 hoặc `reversalBoxes` ≤ 0 ⇒ không box nào, không throw", () => {
		expect(computePointAndFigureColumns([100, 110], 0, 3).every((c) => c === undefined)).toBe(true);
		expect(computePointAndFigureColumns([100, 110], -1, 3).every((c) => c === undefined)).toBe(true);
		// `reversalBoxes = 0` bị chặn ở param, nhưng hàm phải an toàn nếu ai đó gọi
		// trực tiếp: quy đổi thành tối thiểu 1 bậc chứ không phải 0 (0 ⇒ đảo chiều
		// ở mọi bar, tức cột lật lên xuống liên tục).
		const columns = computePointAndFigureColumns([100, 101, 100], 1, 0);
		expect(columns[1]?.direction).toBe("up");
		expect(columns[2]?.direction).toBe("down");
	});

	it("chuỗi rỗng hoặc toàn NaN ⇒ mảng undefined, không throw", () => {
		expect(computePointAndFigureColumns([], 1, 3)).toEqual([]);
		expect(computePointAndFigureColumns([Number.NaN, Number.NaN], 1, 3).every((c) => c === undefined)).toBe(true);
	});
});

describe("computeLineBreakLevels — mức HẰNG trong một đường, đường MỚI khi đảo", () => {
	it("đi đúng bước thì `open` giữ nguyên (đường bậc thang đi lên, không phải một đoạn ngang)", () => {
		// Bug thật đã gặp ở kagi: nếu `open` đổi mỗi bước thì component vẽ hai
		// nhánh cùng màu — tức một đường thẳng bị phân đoạn vô nghĩa.
		const levels = computeLineBreakLevels([100, 110, 120, 130], 10);
		expect(levels.map((l) => l?.open)).toEqual([100, 100, 100, 100]);
		expect(levels.map((l) => l?.close)).toEqual([100, 110, 120, 130]);
		expect(levels.every((l) => l?.up)).toBe(true);
	});

	it("đi ngược đủ `n` thì đường KẾT THÚC: `open` mới = mức đóng của đường cũ", () => {
		const levels = computeLineBreakLevels([100, 110, 120, 110], 10);
		expect(levels[2]?.up).toBe(true);
		expect(levels[3]?.up).toBe(false);
		// Nhịp nối giữa hai đường nằm ở mức đóng của đường cũ (120), không phải ở
		// mức thấp hơn: vẽ thẳng qua nó sẽ thêm một đoạn dốc không tồn tại.
		expect(levels[3]?.open).toBe(120);
		expect(levels[3]?.close).toBe(110);
	});

	it("dưới ngưỡng: mức giữ nguyên, `open` KHÔNG đổi (không tách đường vô nghĩa)", () => {
		const levels = computeLineBreakLevels([100, 105, 108], 10);
		expect(levels[1]).toEqual({ open: 100, close: 100, up: true });
		expect(levels[2]).toEqual({ open: 100, close: 100, up: true });
	});

	it("một bước nhảy dài kéo dài đường nhiều bậc, không tạo đường mới", () => {
		// 100 → 150 với n = 10: cùng một đường, mức đóng nhảy thẳng lên 150.
		const levels = computeLineBreakLevels([100, 150], 10);
		expect(levels[1]).toEqual({ open: 100, close: 150, up: true });
	});

	it("`lineSize` ≤ 0 hoặc chuỗi rỗng ⇒ không throw, không phát dữ liệu", () => {
		expect(computeLineBreakLevels([100, 110], 0)).toEqual([undefined, undefined]);
		expect(computeLineBreakLevels([], 10)).toEqual([]);
	});
});

describe("enrichData — đường không có canonical store vẫn phải sản dữ liệu exotic", () => {
	it("Baseline đi qua `enrichData` cũng ra phần trăm, không phải close", () => {
		// Đường cũ gọi `enrichData(raw, …)` khi không có canonical store; nếu chỉ
		// `enrichDataWithCanonicalStore` gọi producer thì mọi phiên chạy đường này
		// sẽ có chart Baseline trống mà không ai biết vì sao.
		const enriched = enrichData(bars([100, 150]), { series: series("Baseline") });
		expect(resolveSeriesValue(enriched[1], { type: "Baseline" as SeriesTypeId, yAxis: "right" })).toBeCloseTo(50, 6);
	});
});
