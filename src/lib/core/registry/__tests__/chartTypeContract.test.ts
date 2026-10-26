import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRIMARY_BASELINE_KEY } from "@vninvestcharts/engine-core";
import { listRegistered } from "../SeriesRegistry";
import { resolveSeriesValue } from "../../seriesValueResolver";
import { initRegistry } from "../registerAll";
import type { EnrichedDatum } from "../../calculators/types";
import type { SeriesTypeId } from "../../types/pane-descriptor";

/**
 * Registry là singleton module-level, KHÔNG tự điền khi import. Không gọi
 * `initRegistry()` thì `listRegistered()` rỗng và mọi test "đã đăng ký" dưới đây
 * sẽ xanh-vì-thứ-tự-file — đúng loại bug AGENT_PROTOCOL §7 cảnh báo. Lý do này
 * chính là test `exoticChartTypeReadiness.test.ts` đã mắc phải (d1 chạy nó xanh
 * vì file khác đã gọi `initRegistry` trước trong cùng process).
 */
initRegistry();

/**
 * W1.3 - hợp đồng giữa picker chart type ↔ SeriesTypeId ↔ renderer.
 *
 * Bug gốc: `Bar` đã ở trong `SeriesTypeId`, đã được `registerSeries("Bar")`, engine
 * đã có mode "bar" (`KernelEngine.resolveSeriesMode`) - nhưng **thiếu key ở
 * `CHART_TYPE_MAP`** (nên chọn xong không đổi series) **và thiếu ở cả hai picker**
 * (nên không chọn được). Tính năng có đi nhưng vô hình.
 *
 * Phần II (2026-10-03): sau khi lộp lần trên đã gỡ `Bar` khỏi toàn bộ series type.
 * Lý do khác hẳn và nghiêm trọng hơn: tên `Bar` trùng với heuristic
 * `type.includes("bar")` của engine nên chart giá bị định tuyến vào mode
 * zero-based của **volume** — mọi cột vẽ từ 0 tới close, trục Y 0→100.000, biến
 * động giá nén ~8% trên cùng. `OHLC` đã cho đúng chart nến-tick. Ledger
 * `WA_BAR_RUNTIME_2026-10-03`.
 *
 * Test này **giữ nguyên** phần chung: **mọi giá trị trong picker phải ánh xạ tới
 * một SeriesTypeId đã đăng ký.** Đó là dòng luật đã bắt được bug hai lần; đừng xoá
 * khi thêm chart type mới.
 */

/** Cùng nội dung với bảng dùng chung `src/widget/utils/chartTypeOptions.ts`. */
const PICKER_VALUES = [
	"candlestick", "line", "area", "heikinAshi", "baseline", "renko", "kagi",
	"pointAndFigure", "lineBreak", "hollow", "ohlc",
] as const;

/**
 * Type CHƯA implement được phép quảng bá tên, nhưng UI phải đánh dấu
 * `comingSoon: true` (không âm thầm hứa). Rỗng sau A3/A11 (2026-09-29): cả ba
 * loại đã có producer + case resolver + render mode riêng ở engine.
 *
 * KHÔNG được thêm lại `renko`/`kagi` vào đây để "tạm khoá UI": khoá theo tier là
 * `capability` trong `chartTypeOptions.ts`, và `chartTypeContract.test.ts` kiểm
 * `minTierFor(capability)` khớp `RegistryEntry.tier`. Hai loại cổng khác nhau:
 * `comingSoon` = chưa làm, `capability` = đã làm nhưng bán.
 */
const COMING_SOON = new Set<string>([]);

/**
 * Mirror của `VNInvestCharts.CHART_TYPE_MAP`.
 *
 * ⚠️ Đây là bản SAO, và test drift bên dưới là thứ duy nhất giữ nó khớp với file thật.
 * Không tự thêm/sửa key ở đây rồi tưởng production đã đổi — nó sẽ không.
 */
const CHART_TYPE_MAP: Record<string, string> = {
	candlestick: "Candlestick",
	line: "Line",
	area: "Area",
	heikinAshi: "HeikinAshi",
	hollow: "HollowCandle",
	ohlc: "OHLC",

	baseline: "Baseline",
	renko: "Renko",
	kagi: "Kagi",
	pointAndFigure: "PointAndFigure",
	lineBreak: "LineBreak",
};

/**
 * Đọc `CHART_TYPE_MAP` thật từ source thay vì tin bản mirror.
 *
 * Lý do tồn tại: mirror ở trên là một bản sao, và test "mọi giá trị CHART_TYPE_MAP đều
 * tới được SeriesTypeId đã đăng ký" **chỉ kiểm bản sao**. Mutation thử nghiệm: thêm
 * `baseline: "Baseline"` vào `VNInvestCharts.tsx` thật thì 6/6 test vẫn xanh. Đúng cái
 * bug "picker hứa, không render" mà bộ test này tưởng đang chặn.
 *
 * Đọc file bằng `readFileSync` thay vì `import` vì `VNInvestCharts.tsx` kéo theo cả
 * component nặng và side effect; import ở đây sẽ biến một unit test của registry thành
 * test tích hợp 2s+. Bù lại ta phải chấp nhận rằng đây là kiểm tra ở mức text.
 */
function readChartTypeMapSource(): string {
	// `import.meta.url` không phải scheme `file` dưới vitest (ERR_INVALID_URL_SCHEME),
	// nên đi từ cwd — vitest chạy ở repo root.
	return readFileSync(resolve(process.cwd(), "src/widget/VNInvestCharts.tsx"), "utf8");
}

function readRealChartTypeMapKeys(): string[] {
	const src = readChartTypeMapSource();
	const body = src.match(/CHART_TYPE_MAP: Record<string, SeriesTypeId> = \{([\s\S]*?)\n\s*\};/);
	if (!body) throw new Error("không tìm thấy literal CHART_TYPE_MAP trong VNInvestCharts.tsx");
	return [...body[1].matchAll(/^\s*([A-Za-z_][\w]*):\s*"[^"]+",/gm)].map((m) => m[1]);
}

/** Cùng nguồn với `readRealChartTypeMapKeys` nhưng trả cả value — [pickerKey, SeriesTypeId]. */
function readRealChartTypeMapEntries(): Array<[string, string]> {
	const src = readChartTypeMapSource();
	const body = src.match(/CHART_TYPE_MAP: Record<string, SeriesTypeId> = \{([\s\S]*?)\n\s*\};/);
	if (!body) throw new Error("không tìm thấy literal CHART_TYPE_MAP trong VNInvestCharts.tsx");
	return [...body[1].matchAll(/^\s*([A-Za-z_][\w]*):\s*"([^"]+)",/gm)].map((m) => [m[1], m[2]] as [string, string]);
}

/**
 * Chart primitive nào được phép resolve ra `datum.close` — vì đó ĐÚNG là thứ nó
 * phải vẽ (nến đọc close, line đọc close). Mọi type KHÔNG nằm trong danh sách này
 * mà cũng rơi vào `datum.close` là loại chart type không khác gì `Line` ⇒ cấm quảng
 * bá. Danh sách này là "allowlist của primitive đã biết", không phải "danh sách
 * loại trừ": thêm chart type mới thì phải chứng minh được nó vẽ khác Line.
 */
const CLOSE_VALUED_CHART_PRIMITIVES: ReadonlySet<string> = new Set([
	"Candlestick", "HollowCandle", "OHLC", "HeikinAshi", "Line", "Area",
]);

/** Datum OHLCV thường — không `symbolData`, không `normalizedPrices`, không indicator. */
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

/** Giá trị mà engine sẽ vẽ cho `type` trên một datum OHLCV thường. */
function resolveOnPlainDatum(type: string): number | undefined {
	return resolveSeriesValue(plainDatum(1234), { type: type as SeriesTypeId, yAxis: "right" });
}

describe("drift: mirror của test phải khớp CHART_TYPE_MAP thật", () => {
	it("không có key nào trong map thật mà mirror thiếu", () => {
		const real = readRealChartTypeMapKeys();
		const mirrored = Object.keys(CHART_TYPE_MAP);
		const missing = real.filter((k) => !mirrored.includes(k));
		expect(
			missing,
			`VNInvestCharts.CHART_TYPE_MAP đã có key mới (${missing.join(", ")}) nhưng mirror trong test chưa cập nhật — test đang kiểm bản sao cũ nên không bắt được gì`,
		).toEqual([]);
	});

	it("không có key nào trong mirror mà map thật không có", () => {
		const real = readRealChartTypeMapKeys();
		const extra = Object.keys(CHART_TYPE_MAP).filter((k) => !real.includes(k));
		expect(extra, `mirror có key không tồn tại trong production: ${extra.join(", ")}`).toEqual([]);
	});

	it("mọi key trong map THẬT đều trỏ tới SeriesTypeId đã đăng ký", () => {
		const registered = new Set(listRegistered());
		const body = readChartTypeMapSource().match(/CHART_TYPE_MAP: Record<string, SeriesTypeId> = \{([\s\S]*?)\n\s*\};/);
		const entries = [...(body?.[1] ?? "").matchAll(/^\s*[A-Za-z_][\w]*:\s*"([^"]+)",/gm)].map((m) => m[1]);
		const unregistered = entries.filter((t) => !registered.has(t as never));
		expect(
			unregistered,
			`map thật trỏ tới SeriesTypeId chưa đăng ký: ${unregistered.join(", ")} — picker sẽ hứa nhưng không render`,
		).toEqual([]);
	});
});

describe("W1.3: chart type trong picker phải chọn được và render được", () => {
	// `bar` đã bị gỡ 2026-10-03: tên `Bar` trùng heuristic `type.includes("bar")`
	// của engine nên chart giá rơi vào mode zero-based của volume. Không có
	// assertion nào ở đây bảo vệ `bar` nữa — hãy để vậy. Nếu ai đó thêm lại
	// `bar` vào picker, dòng luật chung ở trên ("mọi giá trị trong picker phải
	// ánh xạ tới một SeriesTypeId đã đăng ký") sẽ bắt, nhưng KHÔNG bắt được vì
	// sao nó sai. Vì vậy comment này mới là phần quan trọng.
	it("`bar` KHÔNG còn trong picker hay CHART_TYPE_MAP", () => {
		expect(PICKER_VALUES).not.toContain("bar");
		expect(CHART_TYPE_MAP["bar"]).toBeUndefined();
	});

	it("`ohlc` thay thế: có ở picker, có trong map, và là primitive close-valued", () => {
		expect(PICKER_VALUES).toContain("ohlc");
		expect(CHART_TYPE_MAP["ohlc"]).toBe("OHLC");
		expect(CLOSE_VALUED_CHART_PRIMITIVES.has("OHLC")).toBe(true);
	});

	it("mọi loại KHÔNG comingSoon đều có trong CHART_TYPE_MAP", () => {
		const missing: string[] = [];
		for (const v of PICKER_VALUES) {
			if (COMING_SOON.has(v)) continue;
			if (!CHART_TYPE_MAP[v]) missing.push(v);
		}
		expect(missing, `thiếu trong CHART_TYPE_MAP: ${missing.join(", ")}`).toEqual([]);
	});

	it("mọi loại KHÔNG comingSoon đều có SeriesTypeId đã đăng ký", () => {
		const registered = new Set<string>(listRegistered());
		const missing: string[] = [];
		for (const v of PICKER_VALUES) {
			if (COMING_SOON.has(v)) continue;
			const seriesType = CHART_TYPE_MAP[v];
			if (!seriesType || !registered.has(seriesType)) missing.push(`${v}→${seriesType}`);
		}
		expect(missing, `chưa registerSeries: ${missing.join(", ")}`).toEqual([]);
	});

	it("mọi giá trị CHART_TYPE_MAP đều tới được SeriesTypeId đăng ký", () => {
		const registered = new Set<string>(listRegistered());
		for (const [picker, seriesType] of Object.entries(CHART_TYPE_MAP)) {
			expect(Array.from(registered), `${picker} → ${seriesType}`).toContain(seriesType);
		}
	});

	it("mọi loại comingSoon KHÔNG có trong CHART_TYPE_MAP (đừng hứa rồi im lặng)", () => {
		// Nếu sau này implement renko thì xoá khỏi COMING_SOON và thêm map.
		const promised = [...COMING_SOON].filter((v) => CHART_TYPE_MAP[v]);
		expect(promised, `đã có trong map thì phải bỏ comingSoon: ${promised.join(", ")}`).toEqual([]);
	});
});

/**
 * A3/A11 — lớp bug mới, do 2026-09-29 phát hiện: `registerSeries` + key trong
 * `CHART_TYPE_MAP` **không đủ** để một chart type vẽ ra thứ khác `Line`.
 *
 * Bằng chứng đã truy (không phải suy đoán):
 *  - `resolveSeriesValue` chạy `resolveOverlayValue` trước; hàm đó trả `undefined`
 *    ngay nếu `!series.overlaySymbolId` (`seriesValueResolver.ts:258-260`). Series sinh
 *    ra từ picker không có field đó: `updateSeriesType` chỉ gán `series.type`
 *    (`useDynamicPanes.ts:557-567`).
 *  - Không có nhánh nào cho type lạ ⇒ rơi vào `default: return datum.close`
 *    (`seriesValueResolver.ts:387-388`).
 *  - `RegistryEntry.component` được khai báo (`registryCore.ts:34`) và gán
 *    (`registryCore.ts:120`) nhưng **không consumer nào đọc** — grep toàn `src/**` chỉ ra
 *    đúng hai chỗ đó. Renderer trong registry hiện là dữ liệu chết.
 *
 * Nghĩa là: nếu ai đó làm đúng y hướng dẫn cũ (thêm `Baseline`/`Renko`/`Kagi` vào
 * `SeriesTypeId`, `registerSeries`, map, 2 picker, i18n) thì chart sẽ hiện lên và vẽ
 * y hệt đường Line dưới nhãn khác. Các test dưới đây biến lỗi đó từ "sẽ phát hiện lúc
 * chạy" thành "CI đỏ".
 */
describe("A3/A11: chart type mới phải vẽ được thứ khác Line", () => {
	it("mọi key trong map THẬT đều không rơi vào `default: datum.close` (trừ primitive đã biết)", () => {
		const indistinguishable = readRealChartTypeMapEntries()
			.filter(([, seriesType]) => !CLOSE_VALUED_CHART_PRIMITIVES.has(seriesType))
			.filter(([, seriesType]) => resolveOnPlainDatum(seriesType) === 1234)
			.map(([picker, seriesType]) => `${picker}→${seriesType}`);
		expect(
			indistinguishable,
			`chart type này resolve ra datum.close trên datum OHLCV thường ⇒ render y hệt Line dưới nhãn khác: ${indistinguishable.join(", ")}. Cần case riêng trong seriesValueResolver trước khi quảng bá.`,
		).toEqual([]);
	});

	it("`baseline` resolve ra dữ liệu riêng, KHÔNG phải close thô", () => {
		// ĐẢO CHIỀU (2026-09-29). Trước A3: `resolveOnPlainDatum("Baseline")` =
		// 1234, tức chọn Baseline ra đường Line y hệt. Nay `case "Baseline"` đọc
		// `normalizedPrices[PRIMARY_BASELINE_KEY]`; trên datum trống (chưa có producer)
		// kết quả là `undefined` — fail-closed, không phải giá bịa. Và khi producer ĐÃ
		// ghi thì resolver trả đúng phần trăm — chứng minh bằng hàm thật.
		expect(resolveOnPlainDatum("Baseline")).toBeUndefined();
		const produced: EnrichedDatum = {
			...plainDatum(1234),
			normalizedPrices: { [PRIMARY_BASELINE_KEY]: -12.5 },
		};
		expect(resolveSeriesValue(produced, { type: "Baseline" as SeriesTypeId, yAxis: "right" })).toBe(-12.5);
	});

	it("`baseline` CÓ trong CHART_TYPE_MAP thật", () => {
		// ĐẢO CHIỀU (2026-09-29): trước đây là `not.toContain("baseline")`. Nay key
		// tồn tại vì cả ba tầng đã có; test drift ở trên bắt được chiều ngược lại
		// (thêm key mà quên `registerSeries`).
		expect(readRealChartTypeMapKeys()).toContain("baseline");
		expect(CHART_TYPE_MAP["baseline"]).toBe("Baseline");
	});

	it("`baseline` CÓ trong picker", () => {
		// ĐẢO CHIỀU (2026-09-29): trước đây là `not.toContain("baseline")`. Bảng
		// picker dùng chung: `src/widget/utils/chartTypeOptions.ts`.
		expect(PICKER_VALUES).toContain("baseline");
	});

	it("`renko`/`kagi` KHÔNG còn phải ở trạng thái comingSoon", () => {
		// ĐẢO CHIỀU (2026-09-29). `comingSoon` là CỜ KỸ THUẬT bắt buộc vì
		// `registerSeries` + map key mà không có case riêng thì vẽ thành đường Line.
		// Nay `seriesValueResolver.ts` có `case "Renko"` đọc `renkoClose` và
		// `case "Kagi"` đọc `current`, nên cờ phải hạ xuống. Cổng còn lại là capability
		// pro, kiểm ở `chartTypeCapability.test.tsx`.
		expect(resolveOnPlainDatum("Renko")).toBeUndefined();
		expect(resolveOnPlainDatum("Kagi")).toBeUndefined();
		expect([...COMING_SOON]).toEqual([]);
		expect(readRealChartTypeMapKeys()).toEqual(expect.arrayContaining(["renko", "kagi"]));
	});

	it("`pointAndFigure`/`lineBreak` KHÔNG còn phải ở trạng thái comingSoon", () => {
		// ĐẢO CHIỀU (2026-09-29, f2-pfn-linebreak): hai loại cuối của `chart_exotic`.
		// Cùng lý do với renko/kagi — cờ kỹ thuật phải hạ khi đã đủ ba tầng. Chứng
		// minh bằng hàm thật chứ không chỉ bằng việc key có trong map: trên một datum
		// OHLCV thường (chưa có producer) cả hai phải trả `undefined` (fail-closed),
		// và khi producer ĐÃ ghi thì phải đọc đúng field của nó chứ không phải close.
		expect(resolveOnPlainDatum("PointAndFigure")).toBeUndefined();
		expect(resolveOnPlainDatum("LineBreak")).toBeUndefined();
		expect([...COMING_SOON]).toEqual([]);
		expect(readRealChartTypeMapKeys()).toEqual(expect.arrayContaining(["pointAndFigure", "lineBreak"]));
		expect(PICKER_VALUES).toEqual(expect.arrayContaining(["pointAndFigure", "lineBreak"]));

		const pnf: EnrichedDatum = { ...plainDatum(1234), boxes: [{ open: 100, close: 101 }, { open: 101, close: 102 }], pnfColumnStart: 0 };
		expect(resolveSeriesValue(pnf, { type: "PointAndFigure" as SeriesTypeId, yAxis: "right" })).toBe(102);
		const lb: EnrichedDatum = { ...plainDatum(1234), lineBreakOpen: 1240, lineBreakClose: 1250 };
		expect(resolveSeriesValue(lb, { type: "LineBreak" as SeriesTypeId, yAxis: "right" })).toBe(1250);
	});

	it("drift: mirror PICKER_VALUES khớp bảng picker thật", () => {
		// `PICKER_VALUES` là một BẢN SAO, và trước đây không có gì giữ nó khớp
		// `src/widget/utils/chartTypeOptions.ts` — cùng lớp bug mà `CHART_TYPE_MAP`
		// từng mắc (picker hứa, không render). Đọc source thật thay vì import để
		// không kéo `hasCapability` của engine vào một unit test của registry.
		const src = readFileSync(resolve(process.cwd(), "src/widget/utils/chartTypeOptions.ts"), "utf8");
		const body = src.match(/CHART_TYPE_OPTIONS: readonly ChartTypeOption\[\] = \[([\s\S]*?)\n\];/);
		if (!body) throw new Error("không tìm thấy literal CHART_TYPE_OPTIONS trong chartTypeOptions.ts");
		const real = [...body[1].matchAll(/value:\s*"([^"]+)"/g)].map((m) => m[1]);
		const missing = real.filter((v) => !(PICKER_VALUES as readonly string[]).includes(v));
		expect(missing, `chartTypeOptions.ts có ${missing.join(", ")} mà mirror thiếu`).toEqual([]);
		const extra = (PICKER_VALUES as readonly string[]).filter((v) => !real.includes(v));
		expect(extra, `mirror có ${extra.join(", ")} mà chartTypeOptions.ts không có`).toEqual([]);
	});
});
