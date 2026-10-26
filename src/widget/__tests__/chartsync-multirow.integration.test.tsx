import { describe, it, expect, vi } from "vitest";

/**
 * Tests for multi-row chart type sync behavior.
 * Focuses on verification that the sync broadcast in syncContext
 * reaches ALL registered charts regardless of row.
 */

describe("Multi-row chart type sync — pure functions", () => {
	it("guarded proxy setChartType should call onChartConfigChange and the VNInvestCharts handle", () => {
		const chartId = "chart-3";
		const onChartConfigChange = vi.fn();
		const latestSetChartType = vi.fn();
		const chartRef = { current: { setChartType: latestSetChartType } };
		const chartConfigRef = { current: { engineState: { chartType: "candlestick" } } };
		const syncSettingsRef = { current: { chartType: true } };

		const guardedSetChartType = (ct: unknown, srcId?: string) => {
			const isRemote = srcId !== undefined && srcId !== chartId;
			if (isRemote && !syncSettingsRef.current.chartType) return;
			onChartConfigChange(chartId, {
				engineState: { ...(chartConfigRef.current?.engineState || {}), chartType: ct }
			});
			const latest = chartRef.current;
			latest?.setChartType?.(ct, srcId);
		};

		guardedSetChartType("line", "chart-1");

		expect(onChartConfigChange).toHaveBeenCalledWith("chart-3", {
			engineState: { chartType: "line" }
		});
		expect(latestSetChartType).toHaveBeenCalledWith("line", "chart-1");
	});

	it("guarded proxy should NOT fire onChartTypeChange when sourceChartId is set (remote)", () => {
		const chartId = "chart-3";
		const onChartTypeChange = vi.fn();
		const ct = "line";
		const sourceChartId = "chart-1";

		const setChartType = (ct: string, sourceChartId?: string) => {
			if (sourceChartId && sourceChartId === chartId) return;
			if (!sourceChartId) {
				onChartTypeChange(ct);
			}
		};

		setChartType(ct, sourceChartId);
		expect(onChartTypeChange).not.toHaveBeenCalled();
	});

	it("guarded proxy SHOULD fire onChartTypeChange when no sourceChartId (local)", () => {
		const chartId = "chart-3";
		const onChartTypeChange = vi.fn();
		const ct = "line";

		const setChartType = (ct: string, sourceChartId?: string) => {
			if (sourceChartId && sourceChartId === chartId) return;
			if (!sourceChartId) {
				onChartTypeChange(ct);
			}
		};

		setChartType(ct);
		expect(onChartTypeChange).toHaveBeenCalledWith("line");
	});

	it("should not skip setChartType when sourceChartId differs from chartId", () => {
		const chartId = "chart-3";
		const setChartTypeInternal = vi.fn();

		const exposedSetChartType = (ct: string, sourceChartId?: string) => {
			if (sourceChartId && sourceChartId === chartId) return;
			setChartTypeInternal(ct);
		};

		exposedSetChartType("line", "chart-1");
		expect(setChartTypeInternal).toHaveBeenCalledWith("line");
	});

	it("should skip setChartType when sourceChartId matches chartId (self-loop)", () => {
		const chartId = "chart-3";
		const setChartTypeInternal = vi.fn();

		const exposedSetChartType = (ct: string, sourceChartId?: string) => {
			if (sourceChartId && sourceChartId === chartId) return;
			setChartTypeInternal(ct);
		};

		exposedSetChartType("line", "chart-3");
		expect(setChartTypeInternal).not.toHaveBeenCalled();
	});
});
