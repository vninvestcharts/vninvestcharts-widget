import { hasMinTier, type PatTier } from "@vninvestcharts/engine-core";
import type { ChartLayout, SymbolLinkGroupId } from "@vninvestcharts/engine-react";
import type { GridLayout, SlotConfig } from "./grid/types";
import type { MultiChartConfig } from "./VNInvestMultiCharts.types";

export const DEFAULT_LAYOUTS: Record<string, ChartLayout> = {
	"2x2": { rows: 2, cols: 2 },
	"2x4": { rows: 2, cols: 4 },
	"1x4": { rows: 1, cols: 4 },
	"4x1": { rows: 4, cols: 1 },
	"1x2": { rows: 1, cols: 2 },
	"2x1": { rows: 2, cols: 1 },
};

/**
 * S5a: số chart tối đa theo tier (ma trận chốt, sửa đổi 2026-09-24 theo quyết
 * định user: Free/Starter/unknown = 2 để nếm, Pro = 4 (mở 1x3 + 2x2),
 * Enterprise+ = full).
 * Enterprise KHÔNG kẹp 4–6 để giữ nguyên preset 8 ô (2x4) sẵn có cho khách trả phí.
 */
export function resolveMaxChartsForTier(tier: PatTier | undefined): number {
	if (tier && hasMinTier(tier, "enterprise")) return Number.POSITIVE_INFINITY;
	if (tier === "pro") return 4;
	return 2;
}

/** S5a: đếm chart của layout (slots tường minh, không thì rows*cols). */
export function countLayoutCharts(layout: ChartLayout): number {
	return layout.slots?.length ?? layout.rows * layout.cols;
}

/** S5a: kẹp layout về 1x2 khi vượt max (giữ nguyên khi đủ). */
export function clampChartLayoutToMax(layout: ChartLayout, maxCharts: number): ChartLayout {
	if (countLayoutCharts(layout) <= maxCharts) return layout;
	return { rows: 1, cols: 2 };
}

// Helper to convert ChartLayout to GridLayout with defaults
// TEST-1: exported (pure, no behavior change) so contract tests can lock the
// asymmetric save/load invariant without mounting the full grid.
export function chartLayoutToGridLayout(chartLayout: ChartLayout, charts: MultiChartConfig[]): GridLayout {
	const rows = chartLayout.rows;
	const cols = chartLayout.cols;
	// Use preserved slots from the original GridLayout if available (asymmetric presets)
	if (chartLayout.slots) {
		const chartMap = new Map(charts.map((c) => [c.id, c]));
		const mergedSlots: SlotConfig[] = chartLayout.slots.map((slot) => {
			const chart = chartMap.get(slot.id);
			return chart
				? { ...slot, symbol: chart.symbol, timeframe: chart.timeframe, symbolLinkGroup: chart.symbolLinkGroup }
				: { ...slot, symbolLinkGroup: slot.symbolLinkGroup as SymbolLinkGroupId | null | undefined };
		});

		return {
			rows,
			cols,
			slots: mergedSlots,
			rowSizes: chartLayout.rowSizes || Array(rows).fill('1fr'),
			colSizes: chartLayout.colSizes || Array(cols).fill('1fr'),
			templateAreas: chartLayout.templateAreas,
			areas: chartLayout.areas ? Object.fromEntries(
				Object.entries(chartLayout.areas).map(([key, value]) => [
					key,
					{
						...value,
						id: value.chartId,
						rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1
					}
				])
			) : undefined,
		};
	}

	const totalSlots = rows * cols;

	// Generate default slots based on grid dimensions
	const slots: SlotConfig[] = charts.slice(0, totalSlots).map((chart, index) => ({
		id: chart.id,
		rowStart: Math.floor(index / cols) + 1,
		rowEnd: Math.floor(index / cols) + 1,
		colStart: (index % cols) + 1,
		colEnd: (index % cols) + 1,
		symbol: chart.symbol,
		timeframe: chart.timeframe,
		symbolLinkGroup: chart.symbolLinkGroup,
	}));

	// If fewer charts than slots, fill remaining with empty slots
	for (let i = charts.length; i < totalSlots; i++) {
		slots.push({
			id: `chart-${i + 1}`,
			rowStart: Math.floor(i / cols) + 1,
			rowEnd: Math.floor(i / cols) + 1,
			colStart: (i % cols) + 1,
			colEnd: (i % cols) + 1,
		});
	}

	return {
		rows,
		cols,
		slots,
		rowSizes: chartLayout.rowSizes || Array(rows).fill('1fr'),
		colSizes: chartLayout.colSizes || Array(cols).fill('1fr'),
		templateAreas: chartLayout.templateAreas,
		areas: chartLayout.areas ? Object.fromEntries(
			Object.entries(chartLayout.areas).map(([key, value]) => [
				key,
				{
					...value,
					id: value.chartId,
					rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1
				}
			])
		) : undefined,
	};
}

// TEST-1: exported (pure, no behavior change) — see chartLayoutToGridLayout.
export function gridLayoutToChartLayout(gl: GridLayout): ChartLayout {
	return { rows: gl.rows, cols: gl.cols, templateAreas: gl.templateAreas,
		areas: gl.areas ? Object.fromEntries(Object.entries(gl.areas).map(([k, v]) => [k, { chartId: v.id, zIndex: v.zIndex }])) : undefined,
		rowSizes: gl.rowSizes, colSizes: gl.colSizes, slots: gl.slots };
}
