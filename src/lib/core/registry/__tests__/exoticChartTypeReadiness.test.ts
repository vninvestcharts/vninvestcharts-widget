import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizePricesToBaseline } from "../../calculators/normalizePrices";
import { computeLineBreakLevels, computePointAndFigureColumns } from "../../calculators/exoticChartData";
import { resolveSeriesValue } from "../../seriesValueResolver";
import { listRegistered } from "../SeriesRegistry";
import { initRegistry } from "../registerAll";
import { getSeries, isSeriesAvailableForTier } from "../registryCore";
import { hasCapability, minTierFor, PRIMARY_BASELINE_KEY } from "@vninvestcharts/engine-core";
import type { EnrichedDatum } from "../../calculators/types";
import type { SeriesTypeId } from "../../types/pane-descriptor";

/**
 * Registry là singleton module-level và KHÔNG tự điền khi import. `SeriesRegistry.ts`
 * chỉ là barrel (`registerPhaseOneSeries` chỉ chạy khi được gọi). Không gọi
 * `initRegistry()` ở đây thì test này sẽ xanh-vì-thứ-tự-file, đúng loại bug mà
 * AGENT_PROTOCOL §7 nêu. Giống `SeriesRegistry.test.ts:8`.
 */
initRegistry();

/**
 * A3 Baseline + A11 Renko/Kagi — hợp đồng producer ↔ component ↔ resolver.
 *
 * File này sinh ra ở thời điểm Baseline/Renko/Kagi CHƯA có dữ liệu để vẽ, và mọi
 * assertion dưới đây lúc đó là bằng chứng "chưa xong". Sau khi ba tầng
 * (producer · resolver · render mode của engine) đã có, các assertion đó được
 * ĐẢO CHIỀU thành hợp đồng: chúng vẫn truy ra source thật và vẫn đỏ nếu ai đó
 * gỡ case hoặc gỡ field.
 *
 * ĐẢO CHIỀU, KHÔNG XOÁ: số assertion trong file không đổi, và mỗi assertion bị
 * đảo đều ghi lại lý do bằng `file:line` ngay tại chỗ.
 */

/** Datum OHLCV thường — không symbolData, không normalizedPrices, không indicator. */
function plainDatum(close: number): EnrichedDatum {
	return {
		date: new Date("2026-01-01T00:00:00Z"),
		open: close - 1,
		high: close + 1,
		low: close - 2,
		close,
		volume: 1000,
	};
}

function bar(close: number) {
	return { open: close, high: close, low: close, close, volume: 1000 };
}

describe("A3 Baseline — normalizedPrices chỉ có khoá cho SYMBOL OVERLAY, không có cho symbol chính", () => {
	const PRIMARY = [bar(100), bar(110)];
	const OVERLAY = { VIC: [bar(50), bar(55)] };

	it("hàm thật không phát khoá nào cho symbol chính", () => {
		const { normalizedPrices } = normalizePricesToBaseline(PRIMARY, OVERLAY);
		expect(normalizedPrices).toHaveLength(2);
		// Chỉ "VIC". Không có "BTCUSDT"/tên symbol chính ở bất kỳ bar nào.
		expect(Object.keys(normalizedPrices[0])).toEqual(["VIC"]);
		expect(Object.keys(normalizedPrices[1])).toEqual(["VIC"]);
	});

	it("symbol chính chỉ xuất hiện với vai trò mẫu số (basePrice), không phải giá trị", () => {
		// ((55 - 100) / 100) * 100 = -45 ⇒ chứng minh basePrice lấy từ symbol chính.
		const { normalizedPrices } = normalizePricesToBaseline(PRIMARY, OVERLAY);
		expect(normalizedPrices[1].VIC).toBeCloseTo(-45, 6);
	});

	it("POSITIVE CONTROL: đọc được khi series CÓ overlaySymbolId + normalizeToBaseline", () => {
		// Nhánh đọc ở seriesValueResolver.ts:257-268 là thật và đúng. Nếu test này
		// đỏ thì chính nhánh đọc hỏng, không phải Baseline chưa có dữ liệu.
		// `normalizedPrices` của hàm là MẢNG theo bar; `EnrichedDatum.normalizedPrices`
		// là map của MỘT bar ⇒ phải lấy phần tử.
		const { normalizedPrices } = normalizePricesToBaseline(PRIMARY, OVERLAY);
		const datum: EnrichedDatum = { ...plainDatum(100), normalizedPrices: normalizedPrices[1] };
		const value = resolveSeriesValue(datum, {
			type: "Comparison" as SeriesTypeId,
			yAxis: "right",
			overlaySymbolId: "VIC",
			normalizeToBaseline: true,
		});
		expect(value).toBeCloseTo(-45, 6);
	});

	it("series pane từ picker KHÔNG có overlaySymbolId ⇒ Baseline KHÔNG rơi về datum.close", () => {
		// Đây là hình dạng series mà chart type picker tạo ra: `updateSeriesType`
		// chỉ gán `series.type` (useDynamicPanes.ts:557-567), nên KHÔNG có
		// `overlaySymbolId` và nhánh đọc overlay bị bỏ qua. Trước khi có case riêng,
		// series rơi xuống `default: return datum.close` ⇒ 100 (vẽ y hệt Line).
		// Nay `case "Baseline"` đọc khoá riêng của symbol chính, không đụng close.
		const { normalizedPrices } = normalizePricesToBaseline(PRIMARY, OVERLAY);
		const datum: EnrichedDatum = { ...plainDatum(100), normalizedPrices: normalizedPrices[1] };
		const value = resolveSeriesValue(datum, { type: "Baseline" as SeriesTypeId, yAxis: "right" });
		// Map này CHỈ có khoá overlay ("VIC") nên chưa có gì để vẽ: kết quả là
		// `undefined` (fail-closed), KHÔNG phải 100 và KHÔNG phải -45 (đó là giá
		// trị của VIC, không phải của symbol chính).
		expect(value).not.toBe(100);
		expect(value).not.toBe(-45);
		expect(value).toBeUndefined();
	});

	it("POSITIVE CONTROL: Baseline đọc đúng phần trăm của symbol chính khi producer đã ghi", () => {
		// Hình dạng datum sau `applyExoticChartData`: khoá `PRIMARY_BASELINE_KEY`
		// do chính `normalizePricesToBaseline` ghi vào, cùng overlay nếu có.
		const datum: EnrichedDatum = {
			...plainDatum(100),
			normalizedPrices: { [PRIMARY_BASELINE_KEY]: -45, VIC: -45 },
		};
		expect(resolveSeriesValue(datum, { type: "Baseline" as SeriesTypeId, yAxis: "right" })).toBeCloseTo(-45, 6);
	});

	it("`Baseline` đã là SeriesTypeId và đã đăng ký (kèm cổng render pro)", () => {
		expect(listRegistered() as string[]).toContain("Baseline");
		expect(getSeries("Baseline" as SeriesTypeId).renderMode).toBe("baseline");
		// Cổng RENDER, không chỉ cổng UI: `filterAvailableSeries` loại series này
		// ở tier thấp TRƯỚC khi nó tới engine.
		expect(isSeriesAvailableForTier("Baseline", "free")).toBe(false);
		expect(isSeriesAvailableForTier("Baseline", "pro")).toBe(true);
	});
});

/**
 * Field mà component recharts-style đọc trực tiếp từ datum: `d.<field>` /
 * `plotData[j].<field>`. Đây là dấu vết của transform `kagi`/`renko`/`pointAndFigure`
 * của recharts cũ, chạy TRƯỚC khi dữ liệu tới series.
 *
 * LỊCH SỬ (2026-09-29): engine của repo này không có transform đó —
 * `KernelEngine.resolveSeriesMode` chỉ trả `"line" | "area" | "bar"`
 * (`vn-kline-engine-core/src/engine/KernelEngine.ts:3256-3277`) và grep
 * `renko|kagi|pointAndFigure` trong toàn bộ `packages/vn-kline-engine-core/src`
 * không ra kết quả nào. Nay `exoticSeriesModes.ts` đã có mode `renko`/`kagi`,
 * và transform tương đương nằm ở `core/calculators/exoticChartData.ts`.
 */
const EXOTIC_DATUM_FIELDS = [
	"startAs", "changeTo", "changePoint", "reverseAt", "current", "fullyFormed", "boxes",
] as const;

/**
 * Bỏ COMMENT trước khi grep.
 *
 * VÌ SAO CẦN (đo được 2026-09-29): `PointAndFigureSeries.tsx` mới ghi lại đúng
 * dòng code cũ trong docblock của nó ("`anyBox = plotData[j].boxes[0]` ở `:144`").
 * Regex `plotData\[[^\]]+\]\.boxes\[0\]` vậy khớp CHÍNH CHỮ trong comment, và cả
 * hai hướng đều sai:
 *   - `.not.toMatch(...)` ĐỎ vì lý do không liên quan (chỉ vì có comment),
 *   - nếu ai đó KHÔNG quote dòng cũ thì `.toMatch(...)` lại XANH vì prop-types
 *     hoặc defaultProps chứ không phải vì chỗ đọc `boxes` còn tồn tại.
 * Tức là guard có thể bị vô hiệu hoá bằng một câu comment, và đó là cái bẫy
 * AGENT_PROTOCOL §7 cảnh báo. Grep trên CODE, không phải trên văn xuôi.
 */
function codeOnly(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Field nào trong `read` mà `EnrichedDatum` chưa khai báo. */
function fieldsAbsentFromEnrichedDatum(read: Set<string>): string[] {
	const have = enrichedDatumFields();
	return [...read].filter((f) => !have.has(f)).sort();
}

/** Tên field khai báo trong `interface EnrichedDatum` — đọc từ source, không hardcode. */
function enrichedDatumFields(): Set<string> {
	const src = readFileSync(resolve(process.cwd(), "src/lib/core/calculators/types.ts"), "utf8");
	const body = src.match(/interface EnrichedDatum extends RawOHLCV \{([\s\S]*?)\n\}/);
	if (!body) throw new Error("không tìm thấy interface EnrichedDatum trong calculators/types.ts");
	return new Set(
		[...body[1].matchAll(/^\s*(?:readonly\s+)?([A-Za-z_]\w*)\??\s*:/gm)].map((m) => m[1]),
	);
}

/**
 * Field exotic mà component thực sự đọc — đọc từ CODE của source component, không
 * hardcode danh sách.
 *
 * `\??\.` chấp nhận cả `d.box` lẫn `d?.box`: optional chaining là cách viết
 * fail-đúng trong các component này (`readBoxes` trong `PointAndFigureSeries`), và
 * nếu regex chỉ nhận `d.` thì một component an toàn sẽ bị báo là "không đọc gì".
 */
function exoticFieldsReadByComponent(file: string): Set<string> {
	const src = codeOnly(readFileSync(resolve(process.cwd(), file), "utf8"));
	const wanted = new Set<string>();
	for (const m of src.matchAll(/\b(?:d|plotData\[[^\]]+\])\??\.([A-Za-z_]\w*)/g)) {
		if ((EXOTIC_DATUM_FIELDS as readonly string[]).includes(m[1])) wanted.add(m[1]);
	}
	return wanted;
}


describe("A11 Renko/Kagi/PointAndFigure — hợp đồng component ↔ EnrichedDatum", () => {
	it("KagiSeries đọc `changeTo`/`changePoint`/`startAs` — EnrichedDatum đã khai báo đủ", () => {
		const read = exoticFieldsReadByComponent("src/lib/series/KagiSeries.tsx");
		// Guard bằng chứng: regex hỏng ⇒ tìm ra rỗng ⇒ test này phải đỏ.
		expect(Array.from(read).sort()).toEqual(["changePoint", "changeTo", "current", "reverseAt", "startAs"]);
		// ĐẢO CHIỀU (2026-09-29): trước đây kỳ vọng cả 5 field đều THIẾU. Nay
		// `types.ts` khai báo cả 5 và `exoticChartData.ts` sản xuất chúng
		// (`computeKagiStates`). Assertion này giờ bắt được việc xoá field khỏi
		// `EnrichedDatum` — thứ khiến `KagiSeries` đọc `undefined` lúc runtime.
		expect(fieldsAbsentFromEnrichedDatum(read)).toEqual([]);
	});

	it("RenkoSeries đọc `fullyFormed` — EnrichedDatum đã khai báo", () => {
		const read = exoticFieldsReadByComponent("src/lib/series/RenkoSeries.tsx");
		expect(Array.from(read)).toEqual(["fullyFormed"]);
		// ĐẢO CHIỀU (2026-09-29): `computeRenkoBricks` ghi `fullyFormed` cho mọi
		// gạch, kể cả gạch dang dở ở cuối chuỗi.
		expect(fieldsAbsentFromEnrichedDatum(read)).toEqual([]);
	});

	it("PointAndFigureSeries đã thay bản ném `boxes[0]`, và `boxes` đã có producer", () => {
		// ĐẢO CHIỀU (2026-09-29, f2-pfn-linebreak). Latch cũ khẳng định
		//   (a) `src` khớp /plotData\[[^\]]+\]\.boxes\[0\]/   ← bản cũ THROW ở :144
		//   (b) `boxes` CÐANG THIẾU trên `EnrichedDatum`
		// và cả hai là BẰNG CHỨNG "chưa xong". Nay Point & Figure đủ ba tầng:
		// `computePointAndFigureColumns` sản `boxes` + `pnfColumnStart`, engine có
		// `layoutPointAndFigure` xếp cột, `case "PointAndFigure"` đọc field. Latch
		// đảo thành hợp đồng, KHÔNG xoá.
		const src = codeOnly(readFileSync(resolve(process.cwd(), "src/lib/series/PointAndFigureSeries.tsx"), "utf8"));
		// (a) đảo: KHÔNG được đọc `boxes[0]` mù quáng nữa. Bản cũ là
		//     `while (isNotDefined(anyBox)) { … anyBox = plotData[j].boxes[0]; }` —
		//     vòng lặp không có điều kiện dừng, nên bar đầu không có `boxes` là
		//     `TypeError`, và `plotData` rỗng thì `xScale(undefined)` ở :136.
		expect(src, "component vẫn đọc boxes[0] mù quáng ⇒ vẫn throw khi producer chưa chạy")
			.not.toMatch(/plotData\[[^\]]+\]\.boxes\[0\]/);
		// Mọi lần đọc `boxes` phải đi qua một hàm kiểm tra trước.
		expect(src).toMatch(/readBoxes/);
		expect(src, "phải xếp theo pnfColumnStart, không theo bar — nếu không một cột bị nhoè ra N ô")
			.toMatch(/pnfColumnStart/);

		const read = exoticFieldsReadByComponent("src/lib/series/PointAndFigureSeries.tsx");
		expect(Array.from(read)).toEqual(["boxes"]);
		// (b) đảo: `boxes` ĐÃ được khai báo trên `EnrichedDatum` và có producer.
		expect(fieldsAbsentFromEnrichedDatum(read)).toEqual([]);
		const produced = computePointAndFigureColumns([100, 101, 102], 1, 3);
		expect(produced[1]?.boxes.length, "producer phải thật sự ghi `boxes`").toBe(1);
	});

	it("`EnrichedDatum` cung cấp MỌI field exotic — không còn field nào thiếu", () => {
		// ĐẢO CHIỀU (2026-09-29, f2-pfn-linebreak). Latch cũ: `missing` bằng đúng
		// `["boxes"]` — phần còn lại của P&F. Nay Point & Figure đã build nên danh
		// sách field exotic là 7/7. Bộ này vẫn là hợp đồng: ai xoá `boxes` (hoặc
		// bất kỳ field nào) khỏi `EnrichedDatum` thì test này đỏ trước khi
		// `KagiSeries`/`RenkoSeries` đọc `undefined` lúc runtime.
		const have = enrichedDatumFields();
		const missing = EXOTIC_DATUM_FIELDS.filter((f) => !have.has(f));
		expect(missing.sort()).toEqual([]);
	});

	it("`Renko`/`Kagi` đã đăng ký và KHÔNG resolve ra close thô nữa", () => {
		// ĐẢO CHIỀU (2026-09-29). Trước đây: chưa đăng ký + resolve ra 1234 ⇒
		// chọn xong thấy đường Line. Nay đăng ký với `renderMode` riêng, và trên
		// một datum KHÔNG có dữ liệu exotic thì resolver trả `undefined`
		// (fail-closed) chứ không thay bằng `close`.
		const registered = listRegistered() as string[];
		expect(registered).toContain("Renko");
		expect(registered).toContain("Kagi");
		expect(getSeries("Renko" as SeriesTypeId).renderMode).toBe("renko");
		expect(getSeries("Kagi" as SeriesTypeId).renderMode).toBe("kagi");

		const datum = plainDatum(1234);
		expect(resolveSeriesValue(datum, { type: "Renko" as SeriesTypeId, yAxis: "right" })).toBeUndefined();
		expect(resolveSeriesValue(datum, { type: "Kagi" as SeriesTypeId, yAxis: "right" })).toBeUndefined();
		// …và khi producer ĐÃ ghi dữ liệu thì đọc đúng field đó, không phải close.
		const withBricks: EnrichedDatum = { ...plainDatum(1234), renkoOpen: 1200, renkoClose: 1250, renkoUp: true };
		expect(resolveSeriesValue(withBricks, { type: "Renko" as SeriesTypeId, yAxis: "right" })).toBe(1250);
		const withKagi: EnrichedDatum = { ...plainDatum(1234), current: 1240, startAs: "yang" };
		expect(resolveSeriesValue(withKagi, { type: "Kagi" as SeriesTypeId, yAxis: "right" })).toBe(1240);
	});

	it("`Renko`/`Kagi` bị khoá ở tier thấp — cổng render, không chỉ cổng UI", () => {
		for (const type of ["Renko", "Kagi"] as const) {
			expect(isSeriesAvailableForTier(type, "free"), `${type}@free`).toBe(false);
			expect(isSeriesAvailableForTier(type, "pro"), `${type}@pro`).toBe(true);
			expect(isSeriesAvailableForTier(type, "enterprise"), `${type}@enterprise`).toBe(true);
		}
		// Tier `starter` của PAT không tồn tại trong `SeriesTier` 3 mức
		// (`registryCore.ts:198`); nó được ánh xạ về `free` bởi `toSeriesTier`,
		// nên khoá ở `starter` cũng là khoá ở `free` — xem
		// `widget/utils/__tests__/chartTypeCapability.test.tsx` cho đường UI.
	});

	it("Line Break ĐÃ có component, producer và case — không được gom vào những cái đã có", () => {
		// ĐẢO CHIỀU (2026-09-29, f2-pfn-linebreak). Latch cũ: `src/lib/series/index.ts`
		// KHÔNG được chứa `LineBreak`, tức bằng chứng "chưa có component nào".
		// Cùng capability `chart_exotic`, cùng câu upsell, nhưng grep `LineBreak`
		// trong toàn `src/` chỉ ra đúng dòng này. Nay:
		//   1. `LineBreakSeries.tsx` (mới) xuất ở `series/index.ts`;
		//   2. `computeLineBreakLevels` sản `lineBreakOpen/Close/Up`;
		//   3. `case "LineBreak"` đọc `lineBreakClose` trong `seriesValueResolver`.
		// Câu upsell (`capability.messages.en.ts:33` "Renko, Kagi, Line Break, Point &
		// Figure") từng nói 4 loại trong khi chỉ 2 loại có — nay 4/4.
		const hits = readFileSync(resolve(process.cwd(), "src/lib/series/index.ts"), "utf8");
		expect(hits).toMatch(/LineBreak/);

		const levels = computeLineBreakLevels([100, 110, 120], 10);
		expect(levels[2]).toEqual({ open: 100, close: 120, up: true });
		// Trên datum trống thì fail-closed: `undefined`, KHÔNG phải `close`.
		const plain: EnrichedDatum = plainDatum(1234);
		expect(resolveSeriesValue(plain, { type: "LineBreak" as SeriesTypeId, yAxis: "right" })).toBeUndefined();
		// Khi producer đã ghi thì đọc đúng field đó.
		const produced: EnrichedDatum = { ...plainDatum(1234), lineBreakOpen: 1240, lineBreakClose: 1250, lineBreakUp: true };
		expect(resolveSeriesValue(produced, { type: "LineBreak" as SeriesTypeId, yAxis: "right" })).toBe(1250);
	});

	it("`PointAndFigure`/`LineBreak` đã đăng ký, có render mode riêng, và bị khoá ở tier thấp", () => {
		// Cổng RENDER cho hai loại mới phải y hệt renko/kagi: `filterAvailableSeries`
		// loại chúng ở tier thấp TRƯỚC khi tới engine, không chỉ ẩn nút UI.
		const registered = listRegistered() as string[];
		expect(registered).toContain("PointAndFigure");
		expect(registered).toContain("LineBreak");
		expect(getSeries("PointAndFigure" as SeriesTypeId).renderMode).toBe("pointandfigure");
		expect(getSeries("LineBreak" as SeriesTypeId).renderMode).toBe("linebreak");

		for (const type of ["PointAndFigure", "LineBreak"] as const) {
			expect(isSeriesAvailableForTier(type, "free"), `${type}@free`).toBe(false);
			expect(isSeriesAvailableForTier(type, "pro"), `${type}@pro`).toBe(true);
			expect(isSeriesAvailableForTier(type, "enterprise"), `${type}@enterprise`).toBe(true);
		}
	});

	it("`resolveSeriesValue` của P&F đọc box CUỐI, không phải `boxes[0]`", () => {
		// `PointAndFigureSeries.tsx` bản cũ đọc `boxes[0]` (`plotData[j].boxes[0]`
		// ở :144) để đo chiều cao box. Ở tầng resolver thì đọc `boxes[0]` là SAI giá
		// trị: một bar có thể tạo nhiều box (gap lớn), và box đầu là mép DƯỚI của
		// phần vừa hình thành — tức đáy cột, không phải giá hiện tại. Đọc nó sẽ báo
		// giá thấp hơn thực tế tới cả một bậc, và Y domain sai theo.
		const datum: EnrichedDatum = {
			...plainDatum(1234),
			boxes: [{ open: 100, close: 101 }, { open: 101, close: 102 }, { open: 102, close: 103 }],
			pnfColumnStart: 4,
			pnfDirection: "up",
		};
		expect(resolveSeriesValue(datum, { type: "PointAndFigure" as SeriesTypeId, yAxis: "right" })).toBe(103);
		// Bar không tạo box nào ⇒ không vẽ, KHÔNG rơi về `close`.
		const noBoxes: EnrichedDatum = { ...plainDatum(1234) };
		expect(resolveSeriesValue(noBoxes, { type: "PointAndFigure" as SeriesTypeId, yAxis: "right" })).toBeUndefined();
	});
});

/**
 * Cổng capability — công thức để implement chart type loại này.
 *
 * `chart_exotic` và `chart_baseline` đã có sẵn trong SSOT và đều là `pro`
 * (vn-kline-engine-core/src/capabilities.ts:125-126). Hàm quyết định duy nhất là
 * `hasCapability` (capabilities.ts:173) — cùng hàm `resolveDockAccess` dùng cho
 * `dock_pro` (src/widget/components/dock/dockAccess.ts:29). Đây là test để chặt
 * việc ai đó hạ tier trong lúc đang thêm chart type, không phải để gate UI: UI
 * sẽ gọi `hasCapability(tier, "chart_exotic")` khi render picker.
 */
describe("cổng capability cho chart type loại exotic", () => {
	it("`chart_exotic` và `chart_baseline` đều là pro, fail-closed khi chưa biết tier", () => {
		expect(minTierFor("chart_exotic")).toBe("pro");
		expect(minTierFor("chart_baseline")).toBe("pro");

		for (const cap of ["chart_exotic", "chart_baseline"] as const) {
			expect(hasCapability("free", cap), `${cap} @free`).toBe(false);
			expect(hasCapability("starter", cap), `${cap} @starter`).toBe(false);
			expect(hasCapability("pro", cap), `${cap} @pro`).toBe(true);
			expect(hasCapability("enterprise", cap), `${cap} @enterprise`).toBe(true);
			// tier null = CHƯA BIẾT ⇒ phải khoá, không phải mở (capabilities.ts:170-180).
			expect(hasCapability(null, cap), `${cap} @null`).toBe(false);
			expect(hasCapability(undefined, cap), `${cap} @undefined`).toBe(false);
		}
	});

	it("cả hai capability đều chạy 100% client-side (không cần backend)", () => {
		// BACKEND_REQUIREMENT trong src/widget/capabilities/CapabilityResolver.ts:85-86.
		const src = readFileSync(resolve(process.cwd(), "src/widget/capabilities/CapabilityResolver.ts"), "utf8");
		expect(src).toMatch(/chart_baseline:\s*"none"/);
		expect(src).toMatch(/chart_exotic:\s*"none"/);
	});

	it("copy upsell đã có sẵn ở cả hai ngôn ngữ", () => {
		// Đọc bằng text chứ không import: `src/lib/**` không được import xuống tầng
		// widget/demo, và một test ở `src/lib/core` mà kéo i18n của widget vào là đảo
		// chiều phụ thuộc. Cùng cách với assertion BACKEND_REQUIREMENT ở trên.
		for (const file of ["capability.messages.en.ts", "capability.messages.vi.ts"]) {
			const src = readFileSync(resolve(process.cwd(), "src/widget/i18n", file), "utf8");
			expect(src, `${file} thiếu upsell chart_exotic`).toMatch(
				/"capability\.upsell\.chart_exotic\.title":\s*"[^"]+"/,
			);
			expect(src, `${file} thiếu upsell chart_exotic`).toMatch(
				/"capability\.upsell\.chart_exotic\.benefit":\s*"[^"]+"/,
			);
		}
	});
});
