// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OHLCVBar } from "../../lib/types/ohlcv";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../lib/core/hooks/useCanvasResize", () => {
	const ref = { current: null as HTMLDivElement | null };
	return {
		useCanvasResize: () => ({
			ref,
			size: { width: 1200, height: 720 },
		}),
	};
});

function createBar(timestamp: string, close: number, index: number): OHLCVBar {
	return {
		date: new Date(timestamp),
		open: close - 1,
		high: close + 1,
		low: close - 2,
		close,
		volume: 1000 + index,
		index,
		dataIndex: index,
	};
}

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe("VNInvestCharts canary rollback", () => {
	let VNInvestCharts: typeof import("../VNInvestCharts").VNInvestCharts;
	let container: HTMLDivElement | null = null;
	let root: Root | null = null;
	let restoreGetContext: (() => void) | null = null;

	beforeEach(async () => {
		vi.useFakeTimers();
		const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null as unknown as CanvasRenderingContext2D);
		restoreGetContext = () => getContextSpy.mockRestore();
		({ VNInvestCharts } = await import("../VNInvestCharts"));
		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		if (root) {
			await act(async () => {
				root?.unmount();
				await flushMicrotasks();
			});
		}
		root = null;
		container?.remove();
		container = null;
		restoreGetContext?.();
		restoreGetContext = null;
		vi.useRealTimers();
	});

	it("emits rollback events for 100% to 30% and 30% to 10% transitions", async () => {
		const data = Array.from({ length: 10 }, (_, index) => createBar(`2026-06-01T${String(index).padStart(2, "0")}:00:00Z`, 100 + index, index));
		const adapter = {
			fetchBarsInRange: vi.fn().mockResolvedValue(data),
			fetchBarsBefore: vi.fn().mockResolvedValue([]),
			subscribeToBar: vi.fn().mockReturnValue(() => undefined),
			subscribeToTrades: vi.fn().mockReturnValue(() => undefined),
			subscribeToOrderbook: vi.fn().mockReturnValue(() => undefined),
			searchSymbols: vi.fn().mockResolvedValue([]),
		};
		const handleRollback = vi.fn();

		const renderChart = async (canaryLevel: 10 | 30 | 100) => {
			await act(async () => {
				root?.render(
					<VNInvestCharts
						adapter={adapter as never}
						locale="vi"
						data={data}
						canaryLevel={canaryLevel}
						onCanaryRollbackEvent={handleRollback}
					/>,
				);
				for (let iteration = 0; iteration < 12; iteration += 1) {
					await flushMicrotasks();
				}
			});
			await act(async () => {
				vi.advanceTimersByTime(1000);
				for (let iteration = 0; iteration < 3; iteration += 1) {
					await flushMicrotasks();
				}
			});
		};

		await renderChart(10);
		expect(handleRollback).not.toHaveBeenCalled();

		handleRollback.mockClear();
		await renderChart(30);
		expect(handleRollback).not.toHaveBeenCalled();

		handleRollback.mockClear();
		await renderChart(100);
		expect(handleRollback).not.toHaveBeenCalled();

		handleRollback.mockClear();
		await renderChart(30);
		expect(handleRollback).toHaveBeenCalledTimes(1);
		const firstEvent = handleRollback.mock.calls[0]?.[0];
		expect(firstEvent).toMatchObject({
			previousLevel: 100,
			newLevel: 30,
			beforeMetrics: expect.objectContaining({ barCount: 10 }),
			afterMetrics: expect.objectContaining({ barCount: 3 }),
		});
		expect(firstEvent.severity).toBe("INFO");

		handleRollback.mockClear();
		await renderChart(10);
		expect(handleRollback).toHaveBeenCalledTimes(1);
		const secondEvent = handleRollback.mock.calls[0]?.[0];
		expect(secondEvent).toMatchObject({
			previousLevel: 30,
			newLevel: 10,
			beforeMetrics: expect.objectContaining({ barCount: 3 }),
			afterMetrics: expect.objectContaining({ barCount: 1 }),
		});
		expect(secondEvent.severity).toBe("HIGH");
	});
});