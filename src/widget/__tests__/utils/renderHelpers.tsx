import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import { flushMicrotasks, waitForTruthyValue } from "./mockAdapter";
import { mockEngineInstance, engineHostPropsHistory, mockVisibleRange } from "./mockEngine";
import type { ResolvedWidgetRuntime } from "../../runtimePolicy";

let act: typeof import("react").act;
let createDrawingObject: typeof import("@vninvestcharts/engine-drawing").createDrawingObject;
let chartPointToPixelWithBridge: typeof import("@vninvestcharts/engine-drawing").chartPointToPixelWithBridge;
let measurementPointToPixelWithBridge: typeof import("@vninvestcharts/engine-drawing").measurementPointToPixelWithBridge;
let resolveChartPointWithBridge: typeof import("@vninvestcharts/engine-drawing").resolveChartPointWithBridge;
let resolveMeasurementPointWithBridge: typeof import("@vninvestcharts/engine-drawing").resolveMeasurementPointWithBridge;
let VNInvestCharts: typeof import("../../VNInvestCharts").VNInvestCharts;
let WidgetErrorBoundary: typeof import("../../WidgetErrorBoundary").WidgetErrorBoundary;
let WidgetI18nProvider: typeof import("../../context/WidgetI18nContext").WidgetI18nProvider;

export async function initializeTestImports() {
	({ act } = await import("react"));
	({ createDrawingObject } = await import("@vninvestcharts/engine-drawing"));
	({
		chartPointToPixelWithBridge,
		measurementPointToPixelWithBridge,
		resolveChartPointWithBridge,
		resolveMeasurementPointWithBridge,
	} = await import("@vninvestcharts/engine-drawing"));
	({ VNInvestCharts } = await import("../../VNInvestCharts"));
	({ WidgetErrorBoundary } = await import("../../WidgetErrorBoundary"));
	({ WidgetI18nProvider } = await import("../../context/WidgetI18nContext"));
}

export interface RenderVNInvestChartsOptions {
  adapter: ReturnType<typeof import("./mockAdapter").createAdapter>;
  data?: any[];
  engineRuntime?: ResolvedWidgetRuntime | "auto";
  drawingUiEnabled?: boolean;
  drawingActiveTool?: string;
  drawings?: any[];
  selectedDrawing?: any;
  onDrawingsChange?: ReturnType<typeof import("vitest").vi.fn>;
  onDrawingWorkspaceChange?: ReturnType<typeof import("vitest").vi.fn>;
  locale?: string;
  children?: ReactElement;
  [key: string]: any;
}

export interface RenderResult {
  container: HTMLDivElement;
  root: ReturnType<typeof createRoot>;
  unmount: () => Promise<void>;
}

export async function renderVNInvestCharts(options: RenderVNInvestChartsOptions): Promise<RenderResult> {
	const container = document.createElement("div");
	container.style.width = "1200px";
	container.style.height = "720px";
	document.body.appendChild(container);
	const root = createRoot(container);

	await act(async () => {
		root.render(<VNInvestCharts {...(options as any)} adapter={options.adapter as never} />);
		await flushMicrotasks();
	});

	return {
		container,
		root,
		unmount: async () => {
			await act(async () => {
				await flushMicrotasks();
				root.unmount();
				await flushMicrotasks();
			});
		},
	};
}

export async function waitForEngineHost() {
	return waitForTruthyValue(() => {
		const host = document.querySelector('[data-vn-kline-engine-host="true"]') as HTMLDivElement | null;
		return host;
	});
}

export function getLatestHostProps() {
	return engineHostPropsHistory[engineHostPropsHistory.length - 1] as {
    overlayInputs?: any;
    [key: string]: any;
  } | undefined;
}

export function getMockEngineInstance() {
	return mockEngineInstance;
}

export function getMockVisibleRange() {
	return mockVisibleRange;
}

export function setMockVisibleRange(range: { from: number; to: number }) {
	Object.assign(mockVisibleRange, range);
}

export function clearEngineHostPropsHistory() {
	engineHostPropsHistory.length = 0;
}

export { act, createDrawingObject, chartPointToPixelWithBridge, measurementPointToPixelWithBridge, resolveChartPointWithBridge, resolveMeasurementPointWithBridge, VNInvestCharts, WidgetErrorBoundary, WidgetI18nProvider };
