import { describe, expect, it } from "vitest";
import { getPointAndFigureColumns } from "../PointAndFigureSeries";
import { getLineBreakLegs } from "../LineBreakSeries";

/**
 * Component exotic — hợp đồng hình học mà ENGINE không kiểm được.
 *
 * Engine đã có `layoutPointAndFigure` và được test ở repo engine
 * (`pointAndFigureColumns.test.ts` + `exoticRenderRuntime.test.ts`). Hai hàm ở
 * đây là lớp recharts-style trong `src/lib/series/**` — `RegistryEntry.component`
 * trỏ tới chúng nhưng CHƯA có consumer nào đọc (xem `chartTypeContract.test.ts`
 * ghi chú về `registryCore.ts:34`/`:120`). Chúng vẫn phải ĐÚNG, vì "không ai
 * đọc" là tình trạng tạm thời chứ không phải giấy phép nói sai.
 *
 * Bản `PointAndFigureSeries` cũ đã hỏng theo hai cách đo được:
 *  1. THROW — `while (isNotDefined(anyBox)) { … anyBox = plotData[j].boxes[0]; }`
 *     không có điều kiện dừng, nên bar đầu không có `boxes` là `TypeError`; và
 *     `plotData` rỗng thì đo bề rộng trên `plotData[plotData.length - 1]`.
 *  2. SAI HÌNH HỌC — mỗi BAR thành một cột, nên một cột P&F gom nhiều bar bị
 *     nhoè ra nhiều ô. Đây chính là lý do `exoticSeriesModes.ts` (f2e78aa) ghi
 *     "không alias được P&F sang renko".
 */

/** `xAccessor` giả: trả chính index của bar. `xScale` giả: index → index*10. */
function harness(plotData: any[]) {
	return {
		plotData,
		xAccessor: (d: any) => d.index,
		xScale: (x: number) => x * 10,
		chartConfig: { yScale: (v: number) => 500 - v },
	};
}

function bar(index: number, close: number, extra: Record<string, unknown> = {}) {
	return { index, close, ...extra };
}

describe("getPointAndFigureColumns — một CỘT = một x", () => {
	it("nhiều bar của cùng một cột dán ở MỘT x, không phải mỗi bar một x", () => {
		const columns = getPointAndFigureColumns({}, harness([
			bar(0, 100),
			bar(1, 101, { boxes: [{ open: 100, close: 101 }], pnfColumnStart: 0, pnfDirection: "up" }),
			bar(2, 102, { boxes: [{ open: 101, close: 102 }], pnfColumnStart: 0, pnfDirection: "up" }),
		]));
		expect(columns).toHaveLength(1);
		expect(columns[0].columnStart).toBe(0);
		expect(columns[0].boxes).toHaveLength(2);
		// Một x ⇒ một `x` duy nhất. Nếu bản cũ (mỗi bar một cột) còn sống thì
		// đây là 2 cột ở x=10 và x=20.
		expect(new Set(columns.map((c) => c.x)).size).toBe(1);
	});

	it("cột thứ hai có x khác", () => {
		const columns = getPointAndFigureColumns({}, harness([
			bar(0, 100, { boxes: [{ open: 100, close: 101 }], pnfColumnStart: 0, pnfDirection: "up" }),
			bar(1, 99, { boxes: [{ open: 101, close: 100 }], pnfColumnStart: 1, pnfDirection: "down" }),
		]));
		expect(columns).toHaveLength(2);
		expect(new Set(columns.map((c) => c.x)).size).toBe(2);
		expect(columns.map((c) => c.direction)).toEqual([1, -1]);
	});

	it("một bar tạo N box ⇒ N rect CÙNG x", () => {
		const columns = getPointAndFigureColumns({}, harness([
			bar(0, 100, {
				boxes: [{ open: 100, close: 101 }, { open: 101, close: 102 }, { open: 102, close: 103 }],
				pnfColumnStart: 0,
				pnfDirection: "up",
			}),
		]));
		expect(columns[0].boxes).toHaveLength(3);
		expect(new Set(columns.map((c) => c.x)).size).toBe(1);
	});

	it("NEGATIVE CONTROL: producer chưa chạy thì KHÔNG throw — đây là lỗi của bản cũ", () => {
		// Bản cũ: vòng lặp dò `plotData[j].boxes[0]` không có điều kiện dừng ⇒
		// `TypeError` ngay khi bar đầu không có `boxes`. Ở đây phải trả `[]`.
		const empty = getPointAndFigureColumns({}, harness([bar(0, 100), bar(1, 101)]));
		expect(empty).toEqual([]);
		expect(() => getPointAndFigureColumns({}, harness([]))).not.toThrow();
		expect(getPointAndFigureColumns({}, harness([]))).toEqual([]);
		// `plotData` không phải mảng cũng không ném.
		expect(getPointAndFigureColumns({}, { ...harness([]), plotData: undefined })).toEqual([]);
	});

	it("`boxes` hỏng (không phải mảng / rỗng / phần tử null) ⇒ bỏ qua, không ném", () => {
		const columns = getPointAndFigureColumns({}, harness([
			bar(0, 100, { boxes: "nope", pnfColumnStart: 0 }),
			bar(1, 100, { boxes: [], pnfColumnStart: 0 }),
			bar(2, 100, { boxes: [null], pnfColumnStart: 0 }),
			bar(3, 100, { boxes: [{ open: 100 }], pnfColumnStart: 0 }),
			bar(4, 100, { boxes: [{ open: 100, close: 101 }], pnfColumnStart: 0, pnfDirection: "up" }),
		]));
		expect(columns).toHaveLength(1);
		expect(columns[0].boxes).toHaveLength(1);
	});

	it("bar thiếu `pnfColumnStart` bị BỎ, không đoán x từ bar bên cạnh", () => {
		// Fixture CỐ TÌNH đặt bar thiếu field vào GIỮA một cột có start khác 0.
		// Nếu component đoán (`?? 0`) thì bar đó rơi vào start 0 — khác 5 — nên nó
		// TỰ MÌNH THÀNH MỘT CỘT MỚI ở x của chính nó, và kết quả là 2 cột thay vì
		// 1. Fixture `pnfColumnStart: 0` ở bar 0 KHÔNG bắt được lỗi này: bar thiếu
		// field sẽ hợp nhất vào đúng cột đó và test vẫn xanh (mutation đã thử và bị
		// lọt — đây là bản sửa của nó, không phải sửa code cho vừa test).
		const columns = getPointAndFigureColumns({}, harness([
			bar(0, 100, { boxes: [{ open: 100, close: 101 }], pnfColumnStart: 5, pnfDirection: "up" }),
			bar(1, 101, { boxes: [{ open: 101, close: 102 }] }),
			bar(2, 102, { boxes: [{ open: 102, close: 103 }], pnfColumnStart: 5, pnfDirection: "up" }),
		]));
		expect(columns).toHaveLength(1);
		expect(columns[0].columnStart).toBe(5);
		expect(columns[0].boxes).toHaveLength(2);
	});

	it("bề rộng cột suy từ SỐ CỘT: 1 cột trên 3 bar rộng hơn 3 cột trên 3 bar", () => {
		const one = getPointAndFigureColumns({}, harness([
			bar(0, 100, { boxes: [{ open: 100, close: 101 }], pnfColumnStart: 0 }),
			bar(1, 101, { boxes: [{ open: 101, close: 102 }], pnfColumnStart: 0 }),
			bar(2, 102, { boxes: [{ open: 102, close: 103 }], pnfColumnStart: 0 }),
		]));
		const three = getPointAndFigureColumns({}, harness([
			bar(0, 100, { boxes: [{ open: 100, close: 101 }], pnfColumnStart: 0 }),
			bar(1, 101, { boxes: [{ open: 101, close: 102 }], pnfColumnStart: 1 }),
			bar(2, 102, { boxes: [{ open: 102, close: 103 }], pnfColumnStart: 2 }),
		]));
		expect(one[0].columnWidth).toBeGreaterThan(three[0].columnWidth);
	});
});

describe("getLineBreakLegs — tách đoạn theo lần ĐẢO hướng", () => {
	function harnessLb(plotData: any[]) {
		return { plotData, xAccessor: (d: any) => d.index };
	}

	it("một đường đi lên liên tục = MỘT leg", () => {
		const legs = getLineBreakLegs(harnessLb([
			bar(0, 100, { lineBreakOpen: 100, lineBreakClose: 100, lineBreakUp: true }),
			bar(1, 110, { lineBreakOpen: 100, lineBreakClose: 110, lineBreakUp: true }),
			bar(2, 120, { lineBreakOpen: 100, lineBreakClose: 120, lineBreakUp: true }),
		]));
		expect(legs).toHaveLength(1);
		expect(legs[0].up).toBe(true);
		// Plot bắt đầu từ MỨC MỞ của đường, không phải từ mức đóng leg trước.
		expect(legs[0].plot[0]).toEqual([0, 100]);
		expect(legs[0].plot).toHaveLength(3);
	});

	it("đảo hướng ⇒ tách leg, và leg mới bắt đầu từ MỨC ĐÓNG của leg cũ", () => {
		const legs = getLineBreakLegs(harnessLb([
			bar(0, 100, { lineBreakOpen: 100, lineBreakClose: 100, lineBreakUp: true }),
			bar(1, 110, { lineBreakOpen: 100, lineBreakClose: 110, lineBreakUp: true }),
			bar(2, 110, { lineBreakOpen: 110, lineBreakClose: 100, lineBreakUp: false }),
		]));
		expect(legs).toHaveLength(2);
		expect(legs[1].up).toBe(false);
		// Nhịp nối nằm ở 110. Vẽ thẳng từ 100 xuống 100 sẽ thêm một đoạn dốc
		// không tồn tại giữa hai mức chưa bao giờ cùng tồn tại.
		expect(legs[1].plot[0]).toEqual([2, 110]);
	});

	it("producer chưa chạy ⇒ `[]`, KHÔNG throw", () => {
		expect(getLineBreakLegs(harnessLb([bar(0, 100), bar(1, 110)]))).toEqual([]);
		expect(getLineBreakLegs(harnessLb([]))).toEqual([]);
		expect(getLineBreakLegs({ plotData: undefined, xAccessor: () => 0 })).toEqual([]);
	});

	it("bar thiếu `lineBreakClose` bị bỏ qua, không làm hỏng leg đang chạy", () => {
		const legs = getLineBreakLegs(harnessLb([
			bar(0, 100, { lineBreakOpen: 100, lineBreakClose: 100, lineBreakUp: true }),
			bar(1, 105),
			bar(2, 110, { lineBreakOpen: 100, lineBreakClose: 110, lineBreakUp: true }),
		]));
		expect(legs).toHaveLength(1);
		expect(legs[0].plot).toEqual([[0, 100], [2, 110]]);
	});

	it("thiếu `lineBreakOpen` vẫn dựng được leg (chỉ mất điểm neo)", () => {
		const legs = getLineBreakLegs(harnessLb([
			bar(0, 100, { lineBreakClose: 100, lineBreakUp: true }),
			bar(1, 110, { lineBreakClose: 110, lineBreakUp: true }),
		]));
		expect(legs).toHaveLength(1);
		expect(legs[0].plot).toEqual([[0, 100], [1, 110]]);
	});
});
