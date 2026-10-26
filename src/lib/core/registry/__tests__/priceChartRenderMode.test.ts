import { describe, expect, it } from "vitest";
import { isColumnStackMode, isRectangleMode, resolveSeriesRenderMode } from "@vninvestcharts/engine-core";
import { listRegistered } from "../SeriesRegistry";
import { initRegistry } from "../registerAll";
import { getSeries } from "../registryCore";
import type { SeriesTypeId } from "../../types/pane-descriptor";

/**
 * Registry khai `renderMode`; engine quyết định hình học. Hai bảng đó phải
 * giống nhau, và đây là chỗ duy nhất trong repo nói ra điều đó.
 *
 * Vì sao cần: `KernelEngine.resolveSeriesMode` tra cứu theo TÊN type
 * (`exoticSeriesModes.ts`). Nếu registry khai `renderMode: "kagi"` mà engine thực
 * tế trả `"line"` cho `Kagi`, không có gì hỏng ngay — chart vẽ ra một đường Line
 * dưới nhãn "Kagi", đúng cái bug mà cả hai file khoá này sinh ra để chặn.
 */
initRegistry();

describe("renderMode trong registry khớp engine", () => {
	it("mọi entry có khai `renderMode` đều được engine xác nhận", () => {
		const mismatches: string[] = [];
		for (const type of listRegistered() as SeriesTypeId[]) {
			const declared = getSeries(type).renderMode;
			if (declared === undefined) {
				continue;
			}
			const actual = resolveSeriesRenderMode({ type });
			if (actual !== declared) {
				mismatches.push(`${type}: registry khai "${declared}", engine trả "${actual}"`);
			}
		}
		expect(mismatches, mismatches.join("; ")).toEqual([]);
	});

	it("cả năm chart type loại đều khai render mode riêng, không phải mode line", () => {
		for (const [type, mode] of [
			["Baseline", "baseline"],
			["Renko", "renko"],
			["Kagi", "kagi"],
			["PointAndFigure", "pointandfigure"],
			["LineBreak", "linebreak"],
		] as const) {
			expect(getSeries(type).renderMode, type).toBe(mode);
			expect(resolveSeriesRenderMode({ type }), type).toBe(mode);
			// Chống hồi quy: nếu ai đó gỡ bản đồ exotic ở engine, các type này rơi về
			// "line" và chart vẽ y hệt Line.
			expect(resolveSeriesRenderMode({ type }), type).not.toBe("line");
		}
	});

	it("Point & Figure có mode xếp CỘT của riêng nó — không alias sang renko/bar", () => {
		// ĐẢO CHIỀU (2026-09-29, f2-pfn-linebreak). Latch cũ: `PointAndFigure` phải
		// resolve về "line" và không được đăng ký, vì "một cột P&F gom mọi box vào
		// cùng một x; `toBarPoints` đặt mỗi bar một x riêng". Lý do gốc vẫn đúng —
		// và nó là lý do mode PHẢI tách riêng, nên assertion bây giờ khoá chính điều
		// đó: mode của P&F không được là mode hộp của renko/bar, và nó phải đi qua
		// `isColumnStackMode` (predicate mà engine dùng cho cả hình học LẪN miền giá).
		expect(resolveSeriesRenderMode({ type: "PointAndFigure" })).toBe("pointandfigure");
		expect(resolveSeriesRenderMode({ type: "PointAndFigure" })).not.toBe("renko");
		expect(resolveSeriesRenderMode({ type: "PointAndFigure" })).not.toBe("bar");
		expect(isColumnStackMode("pointandfigure")).toBe(true);
		expect(isRectangleMode("pointandfigure")).toBe(false);
		expect(getSeries("PointAndFigure").renderMode).toBe("pointandfigure");
		expect(listRegistered() as string[]).toContain("PointAndFigure");
		expect(listRegistered() as string[]).toContain("LineBreak");
	});
});
