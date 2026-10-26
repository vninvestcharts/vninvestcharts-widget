/**
 * Sắp series theo thứ tự phụ thuộc (indicator-on-indicator).
 *
 * Tách riêng (split 2026-09-30) vì nó là hàm thuần tuý không phụ thuộc gì, và
 * `buildIndicatorComputationPlan` chỉ gọi nó đúng một lần ở cuối — giữ riêng
 * giúp thứ tự luôn là hợp đồng: thứ tự này quyết định thứ tự ghi `valuesByKey`
 * (lần lượt: series gốc trước, rồi series con), không phải thứ tự khai báo.
 */
import type { SeriesConfig } from "../types/pane-descriptor";

/**
 * Trả về `indicators` đã sắp lại sao cho mọi series cha luôn nằm trước series con.
 *
 * Duyệt theo `forEach` nên thứ tự vào giữ nguyên với thứ tự đã sắp; chỉ chuỗi hậu
 * duyệt là đảo chiều khi phụ thuộc. `visited` chống hồi quy vô hạn khi ba series
 * trỏ vòng lại nhau.
 */
export function resolveCalculationOrder(indicators: readonly SeriesConfig[]): SeriesConfig[] {
	const visited = new Set<string>();
	const order: SeriesConfig[] = [];

	function getSeriesId(s: SeriesConfig): string {
		return s.id || `${s.type}:${JSON.stringify(s.params || {})}:${s.sourceType || ""}:${s.sourceId || ""}:${s.sourceKey || ""}`;
	}

	function visit(instance: SeriesConfig) {
		const id = getSeriesId(instance);
		if (visited.has(id)) return;

		if (instance.sourceType === "indicator" && instance.sourceId) {
			const parent = indicators.find(ind => ind.id === instance.sourceId);
			if (parent) {
				visit(parent);
			}
		}

		visited.add(id);
		order.push(instance);
	}

	indicators.forEach(instance => visit(instance));
	return order;
}
