import type { ComponentType } from "react";

import { VNInvestCharts } from "../src/widget";
import { MockAdapter } from "../src/lib/adapters";
import type { OHLCVBar } from "../src/lib/types/ohlcv";
import { createStoryData } from "./support/storyData";

/* `mockData` is deliberately NOT deterministic: `Date.now()` and `Math.random()` mean two
 * loads of any story built on it render differently. That is fine for eyeballing a story
 * and useless for scripts/runtime-lane-smoke.cjs phase B, whose determinism check compares
 * the bytes of two loads. `DeterministicForkRuntime` below exists for that; do not point
 * BROWSER_STORY at a story using `mockData`. */
// `index` and `dataIndex` are required by OHLCVBar (engine-core). The object below
// omitted them, so it was not assignable - another error that stayed invisible because
// stories/ was outside tsconfig.
const mockData: OHLCVBar[] = Array.from({ length: 100 }, (_, i) => ({
  date: new Date(Date.now() - (99 - i) * 3600000),
  open: 100 + Math.sin(i * 0.1) * 10,
  high: 105 + Math.sin(i * 0.1) * 10,
  low: 95 + Math.sin(i * 0.1) * 10,
  close: 102 + Math.sin(i * 0.1) * 10,
  volume: 1000 + Math.random() * 500,
  index: i,
  dataIndex: i,
}));

// MockAdapter takes an options object, not a bar array: the constructor reads
// `options.bars`. Passing the array made `this.bars` undefined, so these stories ran on
// MockAdapter's own default bars rather than the data they display. Invisible until
// stories/ entered tsconfig - see plan S4.
const adapter = new MockAdapter({ bars: mockData });

/* Deterministic fixture for runtime-lane-smoke phase B.
 *
 * createStoryData builds bars from a fixed epoch (`baseTime + index * 3600_000`), so two
 * loads in the same process produce identical bytes. It is kept inside the
 * Widget/VNInvestCharts title rather than reusing stories/support/exampleStories.tsx
 * because phase B locates the canvas via `[data-testid="vninvest-charts"]`, and that
 * attribute exists only on VNInvestCharts' own root element - the example stories render
 * src/lib/ChartSurface and would make phase B time out on its locator.
 *
 * No dates in this fixture span a weekend gap, so this proves determinism, NOT the
 * showNonTradingDays gap behaviour. That is backlog B7. */
const deterministicData = createStoryData(240);
const deterministicAdapter = new MockAdapter({ bars: deterministicData });

export default {
  title: 'Widget/VNInvestCharts',
  component: VNInvestCharts,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    engineRuntime: {
      control: 'select',
      // The legacy lane was removed with DynamicChart (0.1.0). "auto" is still
      // accepted by the widget and resolves to fork, with a dev-only warning.
      options: ['fork', 'auto'],
      description: 'Runtime engine to use. "auto" is a deprecated alias of "fork".',
    },
    locale: {
      control: 'select',
      options: ['vi', 'en'],
      description: 'UI language',
    },
    drawingUiEnabled: {
      control: 'boolean',
      description: 'Enable drawing tools UI',
    },
  },
};

export const Default = {
  args: {
    adapter,
    data: mockData,
    engineRuntime: 'fork',
    locale: 'vi',
    drawingUiEnabled: true,
  },
};

export const ForkRuntime = {
  args: {
    adapter,
    data: mockData,
    engineRuntime: 'fork',
    locale: 'vi',
    drawingUiEnabled: true,
  },
};

export const DarkTheme = {
  args: {
    adapter,
    data: mockData,
    engineRuntime: 'fork',
    locale: 'vi',
    drawingUiEnabled: true,
  },
  decorators: [
    (Story: ComponentType) => (
      <div data-chart-theme="dark" style={{ width: '100%', height: '720px' }}>
        <Story />
      </div>
    ),
  ],
};

export const WithDrawings = {
  args: {
    adapter,
    data: mockData,
    engineRuntime: 'fork',
    locale: 'vi',
    drawingUiEnabled: true,
    drawings: [
      {
        id: 'trendline-1',
        tool: 'trendLine',
        points: [
          { x: mockData[10].date.getTime(), y: mockData[10].close },
          { x: mockData[50].date.getTime(), y: mockData[50].close },
        ],
        paneId: 'price',
        yScaleId: 'price-right',
      },
    ],
  },
};

export const EnglishLocale = {
  args: {
    adapter,
    data: mockData,
    engineRuntime: 'fork',
    locale: 'en',
    drawingUiEnabled: true,
  },
};

/**
 * The target for `BROWSER_STORY=widget-vninvestcharts--deterministic-fork-runtime`.
 *
 * Deterministic data, so phase B's byte-comparison across two loads is a real check
 * rather than a measure of network noise.
 *
 * The explicit height is REQUIRED, not decoration. `VNInvestCharts.tsx:2134` computes
 * `const ready = size.width > 0 && size.height > 0`, and at `:2154` an unready widget
 * renders a bare `<div>` with no canvas and no `data-testid`. With no height on the story
 * container the chain measures 0, so the widget stays on that placeholder forever and a
 * browser probe sees "0 page errors, 0 canvases" - a blank page that looks like a pass.
 * That is why every Widget story rendered blank before this decorator.
 */
export const DeterministicForkRuntime = {
  args: {
    adapter: deterministicAdapter,
    data: deterministicData,
    engineRuntime: 'fork',
    locale: 'vi',
    drawingUiEnabled: true,
  },
  decorators: [
    (Story: ComponentType) => (
      <div style={{ width: '100%', height: '720px' }}>
        <Story />
      </div>
    ),
  ],
};