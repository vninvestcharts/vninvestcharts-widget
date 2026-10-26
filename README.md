# VNInvestCharts Widget

> **Enterprise-grade financial charting engine & commercial-grade multi-chart workspace for web applications.**
> Built for precision, backend optional (fallback data available), 76 precision drawing tools, 59 technical indicators, in-memory simulated paper trading, and seamless 3-mode embedding.
>
> **Bộ công cụ biểu đồ kỹ thuật tài chính & không gian làm việc đa biểu đồ đẳng cấp phần mềm thương mại quốc tế.**
> Dựng hình tốc độ cao, backend tuỳ chọn (có dữ liệu mẫu), 76 công cụ vẽ chuẩn xác, hơn 60 chỉ báo kỹ thuật, mô phỏng khớp lệnh Paper Trading thời gian thực và 3 chế độ nhúng linh hoạt.

<div align="center">

[![version](https://img.shields.io/badge/version-0.4.0-blue.svg?style=flat-square)](https://www.npmjs.com/package/@vninvestcharts/widget)
[![license](https://img.shields.io/badge/license-Apache--2.0-green.svg?style=flat-square)](./LICENSE)
[![React](https://img.shields.io/badge/React-18%20%7C%2019-61DAFB.svg?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-2350%2B%20passing-brightgreen.svg?style=flat-square)](https://vitest.dev)
[![Rendering](https://img.shields.io/badge/rendering-WebGL%2FCanvas-orange.svg?style=flat-square)](#core-architecture)

[🌐 **Live Demo (Trải nghiệm trực tiếp)**](https://stockchart.edusuccess.vn) •
[🏛️ **Product Portal (Cổng sản phẩm)**](https://vninvest.edusuccess.vn) •
[📖 **Integration Guide (Hướng dẫn nhúng)**](./WIDGET_EMBED_GUIDE.md) •
[👥 **Community (Facebook)**](https://www.facebook.com/vninvestframework)

</div>

---

## 🌐 Language Navigation / Chuyển đổi ngôn ngữ

- 🇬🇧 **[English Documentation](#english)** — Technical Overview, Multi-Chart Sync, Architecture & API
- 🇻🇳 **[Tài liệu Tiếng Việt](#tieng-viet)** — Tổng quan kỹ thuật, Không gian đa biểu đồ, Kiến trúc & API

---

## 📸 Production Previews / Ảnh chụp thực tế

<div align="center">
  <table>
    <tr>
      <td align="center" width="33%">
        <img src="images/Screenshot%202026-07-15%20213405.png" width="100%" alt="Chart & 76 Drawing Tools"/>
        <br/><b>Precision Charting & 76 Drawing Tools</b>
      </td>
      <td align="center" width="33%">
        <img src="images/Screenshot%202026-07-12%20162137.png" width="100%" alt="Bar Replay & Paper Trading"/>
        <br/><b>Bar Replay & Real-time Paper Trading</b>
      </td>
      <td align="center" width="33%">
        <img src="images/Screenshot%202026-07-06%20163620.png" width="100%" alt="Vietnamese Symbol Search"/>
        <b>Vietnamese Ticker Search</b>
      </td>
    </tr>
    <tr>
      <td align="center" width="33%">
        <img src="images/Screenshot%202026-07-12%20162231.png" width="100%" alt="Multi-Chart Workspace"/>
        <br/><b>Multi-Chart Workspace (Commercial-grade 6-way sync)</b>
      </td>
      <td align="center" width="33%">
        <img src="images/Screenshot%202026-07-12%20162503.png" width="100%" alt="Dynamic Theme & Status Bar"/>
        <br/><b>Responsive Dark/Light Themes & Status Bar</b>
      </td>
      <td align="center" width="33%">
        <img src="images/Screenshot%202026-07-12%20160523.png" width="100%" alt="Drawing Inspector & Dock"/>
        <br/><b>Drawing Inspector, Style Dock & Layer Tree</b>
      </td>
    </tr>
    <tr>
      <td align="center" width="33%">
        <img src="images/Screenshot%202026-07-15%20213356.png" width="100%" alt="Technical Indicators & Overlays"/>
        <br/><b>59 SSOT Indicators & Custom Overlays</b>
      </td>
      <td align="center" width="67%" colspan="2">
        <b>Enterprise Capabilities:</b> large historical datasets (unbenchmarked — measure against your own volume), CRDT cross-tab drawing synchronization (implemented in the engine, **not verified** by this repo's tests), Shadow DOM CSS encapsulation, and typed <code>StockDataAdapter</code> integration.
      </td>
    </tr>
  </table>
</div>

---

# English

<a id="english"></a>

## Why VNInvestCharts Widget?

**VNInvestCharts Widget** is an enterprise-grade financial charting library and multi-chart workspace engineered specifically for modern capital markets and fintech applications. It combines a **WebGL/Canvas hybrid engine** with a modular, **zero-backend-coupling** architecture.

> **Not yet benchmarked.** No frame-rate or throughput benchmark ships with this package. `npm run benchmark:backfill` points at a test file that does not exist, and the only performance test (`tests/soak/render_heavy.test.ts`) times `computeScales` in isolation — no render loop, no FPS assertion. If you need a number for procurement, measure it against your own data volume; treat any FPS figure you find elsewhere about this package as unverified.

Whether you are building a React-based institutional trading terminal, embedding a single market chart into a WordPress/Shopify portal, or deploying sandboxed charting inside an enterprise banking app, VNInvestCharts provides 3 native delivery modes (ESM, IIFE, Iframe) with zero style pollution.

| Key Capability | Technical Distinction & Value Proposition |
|---|---|
| **Backend Optional (Fallback Data)** | Fully client-side execution. All data flows through a typed `StockDataAdapter` interface — connect to any REST, WebSocket, GraphQL, or gRPC backend without altering charting code. |
| **Commercial-Grade Multi-Chart Workspace** | First-class `VNInvestMultiCharts` component supporting flexible grid layouts (1×1, 1×2, 2×1, 2×2, 1×3, 3×1, 6-chart) with 6-way synchronized states (Visible Range, Crosshair, Time-anchor, Symbol, Timeframe, Drawings, Replay). |
| **76 Precision Drawing Tools** | 14 mathematical and geometric categories (Fibonacci, Gann, Pitchfork, Harmonic, Elliott Wave, Prediction/Measurement, Annotation) with multi-point transform and CRDT conflict-free cross-tab sync. |
| **59 High-Performance Indicators** | Single Source of Truth (SSOT) mathematical kernel computing indicators in single-pass O(N) complexity — zero redundant calculations, instant timeframe switches. |
| **Real-time Paper Trading & Replay** | In-memory simulated order execution (Market, Limit, Stop, Take-Profit) with realistic fee/slippage modeling, paired with a historical tick-by-tick bar replay engine. |
| **Encapsulated 3-Mode Delivery** | Native React 18/19 ESM package, zero-dependency IIFE bundle with automated Shadow DOM CSS isolation, and a postMessage-secured sandboxed Iframe with typed Host SDK. |
| **Vietnamese Market Native** | Built-in ergonomics for HOSE/HNX/UPCoM exchanges, VN30 derivatives, reference/ceiling/floor price bands, T+2 settlement cycles, VND currency formatting, and full VI/EN localization. |

![Drawing tools](images/Screenshot%202026-07-15%20213405.png)

## Quick Start

### 1. React Application (ESM) — Single Chart

Install the package via npm or yarn:

```bash
npm install @vninvestcharts/widget
```

> **Upgrading from `vninvestcharts-widget` 1.x?** The package moved to the
> `@vninvestcharts/` scope and changed licence from MPL-2.0 to Apache-2.0.
> Read **[the 0.2.0 migration guide](./MIGRATION_0_2_0.md)** before upgrading —
> the import specifier changes, and `debugFeatures` is now ignored outside
> `NODE_ENV=development`.

Render an isolated, interactive chart in seconds:

```tsx
import React from 'react';
import { VNInvestCharts } from '@vninvestcharts/widget';
import '@vninvestcharts/widget/dist/index.css';

export function StockView() {
  return (
    <div style={{ width: '100%', height: '650px' }}>
      <VNInvestCharts
        symbol="VCB"
        timeframe="1D"
        theme="dark"
        locale="en"
        drawingUiEnabled={true}
        showHeader={true}
        showToolbar={true}
        showFooter={true}
        onSymbolChange={(s) => console.log('Selected symbol:', s)}
        onTimeframeChange={(tf) => console.log('Active timeframe:', tf)}
      />
    </div>
  );
}
```

---

### 2. React Application (ESM) — Multi-Chart Synchronized Workspace

Instantiate a multi-chart workspace with commercial-grade cross-chart synchronization:

```tsx
import React from 'react';
import { VNInvestMultiCharts } from '@vninvestcharts/widget';
import '@vninvestcharts/widget/dist/index.css';

export function ProTradingWorkspace() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <VNInvestMultiCharts
        layout={{ rows: 2, cols: 2 }}
        charts={[{ id: "chart-1", symbol: "FPT", timeframe: "1D" }]}
        syncVisibleRange={true}
        syncCrosshair={true}
        syncSymbolLinks={false}
        syncTimeframe={false}
        syncDrawings={true}
        defaultChartProps={{
          theme: "dark",
          locale: "en",
        }}
      />
    </div>
  );
}
```

---

### 3. Script Tag (IIFE) — Any Website or CMS

Embed directly into vanilla HTML, WordPress, Webflow, or PHP apps without any build step or React dependencies:

```html
<!-- Load CSS & Bundle -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@vninvestcharts/widget/dist/index.css" />
<script src="https://cdn.jsdelivr.net/npm/@vninvestcharts/widget/dist/vninvestchart.iife.js"></script>

<div id="chart-root" style="width: 100%; height: 600px;"></div>

<script>
  const { unmount, widgetRef } = window.VNInvestCharts.mount({
    container: document.getElementById('chart-root'),
    props: {
      layout: { rows: 1, cols: 1 },
      defaultChartProps: {
        symbol: 'HPG',
        timeframe: '1D',
        theme: 'dark',
        locale: 'en',
        drawingUiEnabled: true,
      },
    },
    useShadowDOM: true, // Complete CSS encapsulation — zero style bleeding
  });

  // Imperative runtime controls. The IIFE mounts a MULTI-chart workspace, so
  // every single-chart method targets the ACTIVE chart. Symbol/timeframe changes
  // reach linked charts only when the matching sync flag is enabled
  // (syncSymbolLinks / syncTimeframe).
  // widgetRef.current?.setActiveSymbol('SSI');
  // widgetRef.current?.setActiveTimeframe('1H');
  // widgetRef.current?.exportActiveDrawings();
  // widgetRef.current?.setActiveChart('chart-1');
</script>
```

---

### 4. Sandboxed Iframe with Host SDK — Isolated Embedding

Embed inside third-party portals, banking applications, or strict CSP environments:

```html
<iframe
  id="chart-frame"
  src="https://your-cdn.com/iframe/vninvestchart.iframe.html"
  style="width: 100%; height: 650px; border: none;"
></iframe>

<script type="module">
  import { createVNInvestChartsHost } from '@vninvestcharts/widget/iframe-host';

  const host = await createVNInvestChartsHost({
    iframe: document.getElementById('chart-frame'),
  });

  const controller = host.getController();
  await controller.initialize({ symbol: 'VNM', timeframe: '1D', theme: 'dark' });
  
  // Bi-directional RPC communication
  controller.on('event:symbolChanged', (payload) => console.log('Iframe switched to:', payload.symbol));
</script>
```

---

## Core Architecture

### Pluggable Data Pipeline (`StockDataAdapter`)

The chart engine is strictly decoupled from your backend. All historical candles, real-time WebSocket ticks, and symbol metadata pass through the `StockDataAdapter` interface:

```
┌─────────────────────────────────────────────────────────────┐
│                    Host Web Application                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │             VNInvestCharts Presentation Layer         │  │
│  │  ┌──────────────┐  ┌───────────────┐  ┌────────────┐  │  │
│  │  │  React (ESM) │  │  IIFE Wrapper │  │ Iframe SDK │  │  │
│  │  └──────┬───────┘  └───────┬───────┘  └─────┬──────┘  │  │
│  │         │                  │                │         │  │
│  │         └──────────┬───────┴────────────────┘         │  │
│  │                    │                                  │  │
│  │     ┌──────────────▼─────────────┐                    │  │
│  │     │   Typed StockDataAdapter   │ ← Pluggable Bridge │  │
│  │     └──────────────┬─────────────┘                    │  │
│  └────────────────────┼──────────────────────────────────┘  │
└───────────────────────┼─────────────────────────────────────┘
                        │ HTTP / WebSocket / gRPC
┌───────────────────────▼─────────────────────────────────────┐
│           Your Backend API (Node / Python / Go / Java)       │
└─────────────────────────────────────────────────────────────┘
```

#### Custom Adapter Example

`StockDataAdapter` has **6 required members** (the engine's own interface, `packages/vn-kline-engine-core/src/types.ts`). An earlier version of this example listed three and used a `subscribeRealtime` method that exists nowhere in the repository, so it could not compile. Here is the full required surface:

```typescript
import type {
  StockDataAdapter, OHLCVBar, Unsubscribe, SymbolInfo,
} from '@vninvestcharts/widget';

export const customFintechAdapter: StockDataAdapter = {
  // 1. required - the initial/backfill window
  fetchBarsInRange: async (symbol, timeframe, from, to): Promise<OHLCVBar[]> => {
    const res = await fetch(
      `/api/range?symbol=${symbol}&tf=${timeframe}&from=${from.getTime()}&to=${to.getTime()}`,
    );
    return res.json();
  },

  // 2. required - paginating backwards past the initial window
  fetchBarsBefore: async (symbol, timeframe, before, limit): Promise<OHLCVBar[]> => {
    const res = await fetch(
      `/api/history?symbol=${symbol}&tf=${timeframe}&to=${before.getTime()}&limit=${limit}`,
    );
    return res.json();
  },

  // 3. required - live bar updates
  subscribeToBar: (symbol, timeframe, onBar): Unsubscribe => {
    const ws = new WebSocket(`wss://api.yourbroker.com/bar?symbol=${symbol}&tf=${timeframe}`);
    ws.onmessage = (e) => onBar(JSON.parse(e.data));
    return () => ws.close();
  },

  // 4. required
  subscribeToTrades: (symbol, onTrade): Unsubscribe => {
    const ws = new WebSocket(`wss://api.yourbroker.com/trades?symbol=${symbol}`);
    ws.onmessage = (e) => onTrade(JSON.parse(e.data));
    return () => ws.close();
  },

  // 5. required
  subscribeToOrderbook: (symbol, onUpdate): Unsubscribe => {
    const ws = new WebSocket(`wss://api.yourbroker.com/depth?symbol=${symbol}`);
    ws.onmessage = (e) => onUpdate(JSON.parse(e.data));
    return () => ws.close();
  },

  // 6. required
  searchSymbols: async (query): Promise<SymbolInfo[]> => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    return res.json();
  },
};
```

Five further members are **optional** and can be omitted entirely: `getSourceSemantics`, `fetchCorporateEvents`, `getLastBackfillCoverage`, `getLastRangeCoverage`, `fetchCoverageBulk`. Declaring them is how you tell the engine what your data actually is (adjusted prices, snapshot vs. tick, gaps) — omitting them is legal, not a bug.

The contract is type-checked by the consumer smoke test: `npm run verify:consumer`.

---

### Commercial-Grade Multi-Chart Synchronization

The `VNInvestMultiCharts` engine orchestrates multiple dynamic chart instances using a centralized sync coordinator:

1. **Visible Range Synchronization**: Smooth panning and zooming across multiple charts with sub-millisecond throttle windows, zero echo loops, and content-based suppression.
2. **Crosshair & Tooltip Sync**: Cursor position and time-price projections mirror seamlessly across active and passive viewports.
3. **Symbol & Timeframe Linking**: Group charts by symbol or timeframe for multi-timeframe analysis (e.g. 1M / 1W / 1D / 1H on a single screen).
4. **Conflict-Free Drawing Synchronization (CRDT)**: Vector drawings replicate across multi-chart panes and browser tabs with tombstone-based deletion and symbol-scoped persistence.
5. **Replay State Sync**: Step through market history synchronously across all linked timeframes.

---

### Mathematical SSOT Indicator Engine

- **Single Calculation Pass**: Technical indicators (RSI, MACD, Bollinger Bands, Ichimoku, Volume Profile) are calculated once by the `@vninvestcharts/engine-core` kernel in $O(N)$ complexity.
- **Reactive Presentation Projections**: Overlays, secondary panes, and measurement tools consume computed buffers without re-triggering calculations.
- **Twin-Repo Decoupling**: High-performance Canvas/WebGL computation is encapsulated in `vn-kline-engine-core`, keeping the widget bundle lean and portable.

---

### Delivery Matrix Comparison

| Distribution Mode | Target File | CSS Encapsulation | React Required | Ideal Use Case |
|---|---|---|---|---|
| **ESM Module** | `dist/index.js` | Direct bundle import / CSS Modules | Yes (v18 / v19) | Modern React SPAs, Next.js, Vite |
| **IIFE Bundle** | `dist/vninvestchart.iife.js` | Built-in Shadow DOM (automatic) | **No** (Zero deps) | WordPress, Shopify, Laravel, HTML |
| **Sandboxed Iframe** | `dist/iframe/index.html` | Iframe sandbox + postMessage Host SDK | **No** | Enterprise portals, Banking, strict CSP |

> For complete embedding documentation and prop references, consult [`WIDGET_EMBED_GUIDE.md`](./WIDGET_EMBED_GUIDE.md).

---

## Technical Features Matrix

| Category | Features & Technical Specifications |
|---|---|
| **Chart Types** | Standard Japanese Candlesticks, Hollow Candlesticks, OHLC Bars, Heikin-Ashi, Area / Baseline, Renko, Kagi, Point & Figure. |
| **Drawing Tools (76 Tools)** | **14 Dedicated Categories**: Trend Lines, Fibonacci (Retracement, Extension, Spiral, Wedge), Geometric Shapes, Channels, Pitchforks, Gann, Harmonic Patterns (Gartley, Bat, Butterfly, Crab), Elliott Waves, Cyclic Lines, Measurement & Prediction tools. |
| **Technical Indicators (59)** | Moving Averages (SMA, EMA, WMA, DEMA, TEMA), Oscillators (RSI, Stochastic, CCI, Williams %R), Trend (MACD, SuperTrend, Parabolic SAR, ADX), Volatility (Bollinger Bands, ATR, Keltner), Volume (VWAP, Anchored VWAP, Volume Profile, CVD, OBV), Ichimoku Kinko Hyo. |
| **Multi-Chart Grids** | Dynamic grid container (1×1, 1×2, 2×1, 2×2, 1×3, 3×1, 6-chart) with responsive draggable splitters and per-pane toolbar/legend. |
| **Drawing Lifecycle** | Interactive canvas transform, floating context toolbar, Inspector property sheet, JSON import/export, local storage persistence, CRDT multi-tab sync. |
| **Simulation & Testing** | Interactive Bar Replay (step forward/backward, seek, jump-to-bar), integrated Paper Trading order ticket (Market, Limit, Stop orders, position tracking, PnL calculation). |
| **Theming & Localization** | Native Dark / Light themes with CSS variables, full Vietnamese & English localization (`vi` / `en`). |
| **Market Customization** | VN30 derivative tick size rules, reference/ceiling/floor limit lines, T+2 settlement markers, automatic trading session boundary rendering. |

![Multi-pane layout](images/Screenshot%202026-07-12%20162231.png)

---

## Widget API & Standalone Components

### Standalone Component Exports

For modular integration, `@vninvestcharts/widget` exports focused components that can be used standalone or within custom workspace layouts:

```typescript
import {
  VNInvestCharts,             // Core single-chart widget
  VNInvestMultiCharts,        // Full commercial-grade multi-chart workspace
  DrawingDock,                // Standalone 76-tool drawing sidebar
  DrawingInspector,           // Selected drawing property inspector
  DrawingListPanel,           // Drawing tree & layer management panel
  PaperTradePanel,            // Real-time order entry and position ledger
  SettingsModal,              // Chart configuration & styling modal
  MeasurementOverlay,         // Interactive price/bars measurement tool
  WidgetErrorBoundary,        // Enterprise error boundary container
  WidgetEmptyState,           // Graceful data-loading fallback state
} from "@vninvestcharts/widget";
```

### Subpath Utilities

```typescript
// Specialized data adapters
import { VNInvestDataAdapter, MultiSourceDataAdapter } from "@vninvestcharts/widget/adapters";

// Drawing storage controllers
import { createLocalStorageAdapter, type DrawingWorkspaceController } from "@vninvestcharts/widget/drawing";

// Shared TypeScript contracts
import type { StockDataAdapter, Timeframe, OHLCVBar } from "@vninvestcharts/widget/types";
```

---

## Local Development & Testing

```bash
# Clone and install dependencies
git clone https://github.com/vietdungiitb/vninvestcharts-widget.git
cd vninvestcharts-widget
npm install

# Start development demo server (runs on port 3000)
npm run watch          # http://localhost:3000

# Strict type verification
npm run type-check

# Run test suite (2350+ unit and integration tests)
npm test

# Build production bundles (ESM, CJS, IIFE, Iframe)
npm run build
```

---

## Ecosystem Packages

| Package | Role & Responsibility |
|---|---|
| `@vninvestcharts/widget` | High-level embeddable widget, multi-chart workspace, drawing UI, and delivery wrappers. |
| `@vninvestcharts/engine-core` | Low-level WebGL/Canvas rendering pipeline, mathematical SSOT indicator calculators, camera engine. |
| `@vninvestcharts/engine-react` | React component hooks and render bindings for the engine kernel. |

---

## License & Intellectual Property

Licensed under the **Apache License 2.0**.
Copyright © 2026 Pham Viet Dung.
See [LICENSE](./LICENSE) for full terms and conditions, and [NOTICE.md](./NOTICE.md) for the
bundled third-party works.

The widget bundles `@vninvestcharts/engine-core`, `-engine-drawing` and `-engine-react`
(all Apache-2.0), which incorporate a controlled fork of KLineCharts (Apache-2.0).
Apache-2.0 permits embedding in a closed-source product and white-labelling, and it
grants a patent licence with a patent-termination clause.

# Tiếng Việt

<a id="tieng-viet"></a>

> ← [Về đầu trang / Back to top](#vninvestcharts-widget) • [English Documentation](#english)

## Tại sao chọn VNInvestCharts Widget?

**VNInvestCharts Widget** là bộ thư viện biểu đồ kỹ thuật tài chính và không gian làm việc đa biểu đồ (multi-chart workspace), được thiết kế chuyên biệt cho thị trường chứng khoán hiện đại và các ứng dụng Fintech. Sản phẩm kết hợp giữa **động cơ kết xuất đồ họa hybrid WebGL/Canvas** và kiến trúc **backend tuỳ chọn (có dữ liệu mẫu)**.

> **Chưa có benchmark.** Gói này **không** kèm số đo khung hình hay thông lượng. Lệnh `npm run benchmark:backfill` trỏ tới một file test **không tồn tại**; test hiệu năng duy nhất (`tests/soak/render_heavy.test.ts`) chỉ đo `computeScales` độc lập — không có vòng render, không assert FPS. Nếu cần con số để đánh giá, hãy tự đo trên khối dữ liệu của bạn.

Dù bạn đang xây dựng một trạm giao dịch chuyên nghiệp cho khối tổ chức trên nền tảng React, nhúng một biểu đồ thị trường đơn lẻ vào hệ thống CMS/WordPress/Shopify, hay triển khai biểu đồ đóng gói sandbox an toàn trong ứng dụng ngân hàng, VNInvestCharts cung cấp 3 chế độ phân phối linh hoạt (ESM, IIFE, Iframe) mà không gây bất kỳ xung đột kiểu dáng (CSS bleed) nào.

| Năng lực cốt lõi | Giá trị kỹ thuật & Lợi thế vượt trội |
|---|---|
| **Backend tuỳ chọn (có dữ liệu mẫu)** | Vận hành 100% phía client. Toàn bộ dữ liệu được kết nối qua interface chuẩn kiểu `StockDataAdapter` — tích hợp dễ dàng với bất kỳ backend REST, WebSocket, GraphQL hay gRPC nào mà không cần sửa đổi mã nguồn biểu đồ. |
| **Không gian đa biểu đồ đẳng cấp quốc tế** | Cung cấp component cao cấp `VNInvestMultiCharts` hỗ trợ đa dạng bố cục lưới (1×1, 1×2, 2×1, 2×2, 1×3, 3×1, 6 biểu đồ) cùng cơ chế đồng bộ hóa 6 chiều (Vùng hiển thị, Con trỏ Crosshair, Trục thời gian, Mã cổ phiếu, Khung thời gian, Bản vẽ hình học, Replay). |
| **76 Công cụ vẽ kỹ thuật chuẩn xác** | 14 danh mục toán học và hình học chuyên sâu (Fibonacci, Gann, Mô hình Harmonic, Sóng Elliott, Pitchfork, Kênh giá, Đo lường & Dự đoán) kèm khả năng biến đổi đa điểm và đồng bộ CRDT xuyên tab không xung đột. |
| **Hơn 60 Chỉ báo hiệu năng cao** | Động cơ tính toán toán học Single Source of Truth (SSOT) thực hiện tính toán độ phức tạp $O(N)$ trong đúng một lượt quét dữ liệu — triệt tiêu tính toán dư thừa, chuyển đổi khung thời gian tức thì. |
| **Mô phỏng Paper Trading & Replay** | Khớp lệnh mô phỏng theo sổ lệnh thời gian thực (Market, Limit, Stop, Take-Profit) với mô hình tính phí và trượt giá (slippage) thực tế, kết hợp bộ máy Replay tua lại lịch sử từng tick giá. |
| **3 Chế độ nhúng đóng gói hoàn chỉnh** | Module ESM chuẩn cho React 18/19, gói script tag IIFE không phụ thuộc thư viện ngoài với Shadow DOM tự động cô lập CSS, và phiên bản Iframe sandbox bảo mật cao kèm Host SDK có định kiểu. |
| **Tối ưu bản địa cho thị trường VN** | Tích hợp sẵn cơ chế khớp lệnh của HOSE, HNX, UPCoM, chỉ số phái sinh VN30, dải biên độ giá Trần/Sàn/Tham chiếu, chu kỳ thanh toán T+2, định dạng tiền tệ VNĐ và bản địa hóa song ngữ Việt - Anh. |

![Công cụ vẽ](images/Screenshot%202026-07-15%20213405.png)

## Bắt đầu nhanh

### 1. Ứng dụng React (ESM) — Biểu đồ đơn lẻ

Cài đặt gói thư viện qua npm hoặc yarn:

```bash
npm install @vninvestcharts/widget
```

> **Nâng cấp từ `vninvestcharts-widget` 1.x?** Package đã chuyển sang scope
> `@vninvestcharts/` và đổi giấy phép từ MPL-2.0 sang Apache-2.0. Đọc
> **[hướng dẫn migration 0.2.0](./MIGRATION_0_2_0.md)** trước khi nâng cấp —
> import specifier thay đổi, và `debugFeatures` nay bị bỏ qua ngoài
> `NODE_ENV=development`.

Khởi tạo biểu đồ tương tác độc lập trong ứng dụng React:

```tsx
import React from 'react';
import { VNInvestCharts } from '@vninvestcharts/widget';
import '@vninvestcharts/widget/dist/index.css';

export function StockView() {
  return (
    <div style={{ width: '100%', height: '650px' }}>
      <VNInvestCharts
        symbol="VCB"
        timeframe="1D"
        theme="dark"
        locale="vi"
        drawingUiEnabled={true}
        showHeader={true}
        showToolbar={true}
        showFooter={true}
        onSymbolChange={(s) => console.log('Mã đã chọn:', s)}
        onTimeframeChange={(tf) => console.log('Khung thời gian:', tf)}
      />
    </div>
  );
}
```

---

### 2. Ứng dụng React (ESM) — Không gian làm việc đa biểu đồ đồng bộ

Tạo không gian làm việc đa biểu đồ với cơ chế đồng bộ hóa đẳng cấp phần mềm thương mại:

```tsx
import React from 'react';
import { VNInvestMultiCharts } from '@vninvestcharts/widget';
import '@vninvestcharts/widget/dist/index.css';

export function ProTradingWorkspace() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <VNInvestMultiCharts
        layout={{ rows: 2, cols: 2 }}
        charts={[{ id: "chart-1", symbol: "FPT", timeframe: "1D" }]}
        syncVisibleRange={true}
        syncCrosshair={true}
        syncSymbolLinks={false}
        syncTimeframe={false}
        syncDrawings={true}
        defaultChartProps={{
          theme: "dark",
          locale: "vi",
        }}
      />
    </div>
  );
}
```

---

### 3. Thẻ Script (IIFE) — Mọi Website, CMS hoặc Trang tĩnh

Nhúng trực tiếp vào website HTML thuần, WordPress, Webflow, Laravel hoặc PHP mà không cần bước build phức tạp hay cài đặt React:

```html
<!-- Nhúng tệp kiểu dáng và mã nguồn đóng gói -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@vninvestcharts/widget/dist/index.css" />
<script src="https://cdn.jsdelivr.net/npm/@vninvestcharts/widget/dist/vninvestchart.iife.js"></script>

<div id="chart-root" style="width: 100%; height: 600px;"></div>

<script>
  const { unmount, widgetRef } = window.VNInvestCharts.mount({
    container: document.getElementById('chart-root'),
    props: {
      layout: { rows: 1, cols: 1 },
      defaultChartProps: {
        symbol: 'HPG',
        timeframe: '1D',
        theme: 'dark',
        locale: 'vi',
        drawingUiEnabled: true,
      },
    },
    useShadowDOM: true, // Kích hoạt Shadow DOM cô lập hoàn toàn CSS với trang mẹ
  });

  // Điều khiển lập trình sau khi khởi tạo. IIFE mount workspace MULTI chart nên
  // các method single-chart nhắm vào chart ACTIVE. Đổi symbol/timeframe chỉ lan
  // sang chart liên kết khi bật syncSymbolLinks / syncTimeframe.
  // widgetRef.current?.setActiveSymbol('SSI');
  // widgetRef.current?.setActiveTimeframe('1H');
  // widgetRef.current?.exportActiveDrawings();
</script>
```

---

### 4. Iframe Cách ly Sandbox với Host SDK — Môi trường bảo mật cao

Nhúng vào các cổng thông tin đối tác, ứng dụng ngân hàng hoặc môi trường tuân thủ chính sách CSP nghiêm ngặt:

```html
<iframe
  id="chart-frame"
  src="https://your-cdn.com/iframe/vninvestchart.iframe.html"
  style="width: 100%; height: 650px; border: none;"
></iframe>

<script type="module">
  import { createVNInvestChartsHost } from '@vninvestcharts/widget/iframe-host';

  const host = await createVNInvestChartsHost({
    iframe: document.getElementById('chart-frame'),
  });

  const controller = host.getController();
  await controller.initialize({ symbol: 'VNM', timeframe: '1D', theme: 'dark' });
  
  // Lắng nghe sự kiện RPC hai chiều
  controller.on('event:symbolChanged', (payload) => console.log('Biểu đồ đã đổi mã sang:', payload.symbol));
</script>
```

---

## Kiến trúc hệ thống chuyên sâu

### Luồng tích hợp dữ liệu cắm rút (`StockDataAdapter`)

Động cơ biểu đồ được tách rời hoàn toàn khỏi backend. Mọi thanh nến lịch sử, dữ liệu khớp lệnh real-time qua WebSocket và siêu dữ liệu cổ phiếu đều đi qua interface `StockDataAdapter`:

```
┌─────────────────────────────────────────────────────────────┐
│                   Ứng dụng Web / Cổng thông tin             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │             Tầng hiển thị VNInvestCharts              │  │
│  │  ┌──────────────┐  ┌───────────────┐  ┌────────────┐  │  │
│  │  │  React (ESM) │  │  IIFE Wrapper │  │ Iframe SDK │  │  │
│  │  └──────┬───────┘  └───────┬───────┘  └─────┬──────┘  │  │
│  │         │                  │                │         │  │
│  │         └──────────┬───────┴────────────────┘         │  │
│  │                    │                                  │  │
│  │     ┌──────────────▼─────────────┐                    │  │
│  │     │   Typed StockDataAdapter   │ ← Cầu nối cắm rút  │  │
│  │     └──────────────┬─────────────┘                    │  │
│  └────────────────────┼──────────────────────────────────┘  │
└───────────────────────┼─────────────────────────────────────┘
                        │ HTTP REST / WebSocket / gRPC
┌───────────────────────▼─────────────────────────────────────┐
│          Backend API của bạn (Node / Python / Go / Java)    │
└─────────────────────────────────────────────────────────────┘
```

#### Ví dụ thiết lập Adapter tùy biến

```typescript
import type {
  StockDataAdapter, OHLCVBar, Unsubscribe, SymbolInfo,
} from '@vninvestcharts/widget';

export const customFintechAdapter: StockDataAdapter = {
  // 1. required - the initial/backfill window
  fetchBarsInRange: async (symbol, timeframe, from, to): Promise<OHLCVBar[]> => {
    const res = await fetch(
      `/api/range?symbol=${symbol}&tf=${timeframe}&from=${from.getTime()}&to=${to.getTime()}`,
    );
    return res.json();
  },

  // 2. required - paginating backwards past the initial window
  fetchBarsBefore: async (symbol, timeframe, before, limit): Promise<OHLCVBar[]> => {
    const res = await fetch(
      `/api/history?symbol=${symbol}&tf=${timeframe}&to=${before.getTime()}&limit=${limit}`,
    );
    return res.json();
  },

  // 3. required - live bar updates
  subscribeToBar: (symbol, timeframe, onBar): Unsubscribe => {
    const ws = new WebSocket(`wss://api.yourbroker.com/bar?symbol=${symbol}&tf=${timeframe}`);
    ws.onmessage = (e) => onBar(JSON.parse(e.data));
    return () => ws.close();
  },

  // 4. required
  subscribeToTrades: (symbol, onTrade): Unsubscribe => {
    const ws = new WebSocket(`wss://api.yourbroker.com/trades?symbol=${symbol}`);
    ws.onmessage = (e) => onTrade(JSON.parse(e.data));
    return () => ws.close();
  },

  // 5. required
  subscribeToOrderbook: (symbol, onUpdate): Unsubscribe => {
    const ws = new WebSocket(`wss://api.yourbroker.com/depth?symbol=${symbol}`);
    ws.onmessage = (e) => onUpdate(JSON.parse(e.data));
    return () => ws.close();
  },

  // 6. required
  searchSymbols: async (query): Promise<SymbolInfo[]> => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    return res.json();
  },
};
```

Interface `StockDataAdapter` có **6 thành phần bắt buộc**. Bản ví dụ trước chỉ liệt kê 3 và dùng một method `subscribeRealtime` **không tồn tại** trong repo, nên không thể biên dịch. Năm thành phần còn lại là **tuỳ chọn**: `getSourceSemantics`, `fetchCorporateEvents`, `getLastBackfillCoverage`, `getLastRangeCoverage`, `fetchCoverageBulk`.

---

### Cơ chế đồng bộ đa biểu đồ đẳng cấp phần mềm thương mại quốc tế

Bộ điều phối `VNInvestMultiCharts` quản lý tập trung trạng thái các biểu đồ con trong cùng không gian làm việc:

1. **Đồng bộ vùng hiển thị (Visible Range Sync)**: Cuộn và thu phóng mượt mà giữa các biểu đồ con với cửa sổ điều tiết tính theo mili-giây, ngăn chặn vòng lặp phản hồi (echo loop) và nén nội dung trùng lặp.
2. **Đồng bộ con trỏ Crosshair**: Tọa độ chuột và nhãn chiếu trục thời gian - mức giá được phản chiếu tức thì trên mọi khung nhìn.
3. **Liên kết mã cổ phiếu & Khung thời gian**: Gom nhóm biểu đồ linh hoạt để thực hiện phân tích đa khung thời gian (Multi-Timeframe Analysis) trên cùng một mã hoặc so sánh nhiều mã trên cùng một khung giờ.
4. **Đồng bộ hóa bản vẽ không xung đột (CRDT)**: Các đối tượng vẽ kỹ thuật được đồng bộ hóa xuyên biểu đồ và xuyên tab trình duyệt theo thuật toán CRDT với cơ chế đánh dấu xóa tombstone và phân vùng dữ liệu theo mã cổ phiếu.
5. **Đồng bộ trạng thái Bar Replay**: Điều khiển tua nến lịch sử đồng thời trên toàn bộ các khung thời gian liên kết.

---

### Mô hình dữ liệu SSOT tính toán chỉ báo một lượt

- **Tính toán tối ưu một lượt**: Mọi chỉ báo kỹ thuật (RSI, MACD, Bollinger Bands, Ichimoku, Volume Profile) đều được nhân xử lý `@vninvestcharts/engine-core` tính toán theo độ phức tạp $O(N)$ trong 1 chu kỳ duy nhất.
- **Phản chiếu giao diện linh hoạt**: Các đồ thị phụ, dải màu và công cụ đo lường tái sử dụng trực tiếp bộ nhớ đệm kết quả mà không phải tính lại.
- **Tách tầng twin-repo**: Lõi dựng hình WebGL/Canvas được đóng gói tách bạch trong `vn-kline-engine-core`, đảm bảo tầng widget nhẹ và dễ dàng phân phối.

---

### Bảng so sánh 3 chế độ nhúng

| Chế độ phân phối | Tệp đầu ra | Cơ chế cô lập CSS | Yêu cầu React | Trường hợp ứng dụng tối ưu |
|---|---|---|---|---|
| **ESM Module** | `dist/index.js` | Import trực tiếp / CSS Modules | Có (v18 / v19) | Ứng dụng SPA hiện đại, Next.js, Vite |
| **IIFE Bundle** | `dist/vninvestchart.iife.js` | Tự động qua Shadow DOM | **Không** (Thuần JS) | WordPress, Shopify, Laravel, HTML |
| **Sandboxed Iframe** | `dist/iframe/index.html` | Iframe sandbox + Host SDK postMessage | **Không** | Cổng tài chính bên thứ 3, Ngân hàng, CSP khắt khe |

> Để xem hướng dẫn tích hợp chi tiết và tài liệu thuộc tính props, vui lòng đọc [`WIDGET_EMBED_GUIDE.md`](./WIDGET_EMBED_GUIDE.md).

---

## Bảng ma trận tính năng kỹ thuật

| Danh mục | Tính năng & Thông số kỹ thuật |
|---|---|
| **Kiểu biểu đồ** | Nến Nhật tiêu chuẩn, Nến rỗng (Hollow Candles), Nến thanh OHLC, Heikin-Ashi, Biểu đồ vùng (Area / Baseline), Renko, Kagi, Point & Figure. |
| **Công cụ vẽ (76 công cụ)** | **14 Nhóm chuyên biệt**: Đường xu hướng (Trend Lines), Fibonacci (Thoái lui, Mở rộng, Xoắn ốc, Quạt), Hình học kỹ thuật, Kênh giá, Mô hình Gann, Pitchfork, Mô hình Harmonic (Gartley, Bat, Butterfly, Crab), Sóng Elliott, Chu kỳ thời gian, Đo lường & Dự đoán giá. |
| **Chỉ báo kỹ thuật (59)** | Đường trung bình (SMA, EMA, WMA, DEMA, TEMA), Chỉ báo dao động (RSI, Stochastic, CCI, Williams %R), Chỉ báo xu hướng (MACD, SuperTrend, Parabolic SAR, ADX), Dải biến động (Bollinger Bands, ATR, Keltner), Chỉ báo khối lượng (VWAP, Anchored VWAP, Volume Profile, CVD, OBV), Mây Ichimoku Kinko Hyo. |
| **Lưới đa biểu đồ động** | Bố cục lưới linh hoạt (1×1, 1×2, 2×1, 2×2, 1×3, 3×1, 6 biểu đồ) kèm thanh trượt chia khung hình (splitter) kéo thả mượt mà và thanh công cụ độc lập từng ô. |
| **Vòng đời đối tượng vẽ** | Tương tác trực tiếp trên canvas, thanh công cụ ngữ cảnh nổi, bảng thuộc tính Inspector chi tiết, xuất/nhập tệp JSON, lưu trữ trình duyệt và đồng bộ CRDT xuyên tab. |
| **Mô phỏng & Kiểm thử** | Bar Replay tua lại dữ liệu lịch sử từng nến (tùy chỉnh tốc độ, bước tới/lùi), giao diện Paper Trading khớp lệnh giả lập (Market, Limit, Stop, theo dõi vị thế và PnL). |
| **Giao diện & Ngôn ngữ** | Chủ đề Sáng / Tối với các biến CSS linh hoạt, bản địa hóa trọn vẹn tiếng Việt và tiếng Anh (`vi` / `en`). |
| **Đặc thù thị trường VN** | Tích hợp quy tắc bước giá phái sinh VN30, dải đường giới hạn giá Trần/Sàn/Tham chiếu, mốc chu kỳ thanh toán T+2 và tự động hiển thị phiên giao dịch. |

![Bố cục đa pane](images/Screenshot%202026-07-12%20162231.png)

---

## Tài liệu API & Components độc lập

### Danh mục Component độc lập xuất xưởng

Để phục vụ tích hợp dạng module hóa, `@vninvestcharts/widget` xuất xưởng sẵn các component độc lập có thể sử dụng riêng biệt hoặc tùy biến layout:

```typescript
import {
  VNInvestCharts,             // Widget biểu đồ đơn lẻ hoàn chỉnh
  VNInvestMultiCharts,        // Không gian làm việc đa biểu đồ đồng bộ đẳng cấp quốc tế
  DrawingDock,                // Thanh dock chứa 76 công cụ vẽ độc lập
  DrawingInspector,           // Bảng điều khiển thuộc tính công cụ vẽ đang chọn
  DrawingListPanel,           // Cây quản lý các lớp đối tượng vẽ
  PaperTradePanel,            // Sổ lệnh và bảng theo dõi danh mục Paper Trading
  SettingsModal,              // Hộp thoại tùy chỉnh cấu hình và kiểu dáng biểu đồ
  MeasurementOverlay,         // Lớp đo lường khoảng cách thời gian và bước giá
  WidgetErrorBoundary,        // Khung bắt lỗi an toàn cấp doanh nghiệp
  WidgetEmptyState,           // Trạng thái chờ tải dữ liệu thanh lịch
} from "@vninvestcharts/widget";
```

### Đường dẫn phụ (Subpaths)

```typescript
// Các bộ chuyển đổi dữ liệu chuyên sâu
import { VNInvestDataAdapter, MultiSourceDataAdapter } from "@vninvestcharts/widget/adapters";

// Bộ điều phối lưu trữ đối tượng vẽ
import { createLocalStorageAdapter, type DrawingWorkspaceController } from "@vninvestcharts/widget/drawing";

// Định nghĩa giao diện TypeScript dùng chung
import type { StockDataAdapter, Timeframe, OHLCVBar } from "@vninvestcharts/widget/types";
```

---

## Phát triển và kiểm thử nội bộ

```bash
# Tải mã nguồn và cài đặt dependencies
git clone https://github.com/vietdungiitb/vninvestcharts-widget.git
cd vninvestcharts-widget
npm install

# Khởi chạy máy chủ phát triển demo (chạy tại cổng 3000)
npm run watch          # http://localhost:3000

# Kiểm tra kiểu dữ liệu TypeScript nghiêm ngặt
npm run type-check

# Chạy toàn bộ bộ test kiểm thử (2350+ unit và integration tests)
npm test

# Đóng gói xuất xưởng (ESM, CJS, IIFE, Iframe)
npm run build
```

---

## Hệ sinh thái gói phần mềm

| Tên gói | Vai trò & Trách nhiệm kiến trúc |
|---|---|
| `@vninvestcharts/widget` | Thư viện widget cấp cao có thể nhúng, workspace đa biểu đồ, giao diện công cụ vẽ và các lớp đóng gói phân phối. |
| `@vninvestcharts/engine-core` | Động cơ kết xuất WebGL/Canvas tầng thấp, bộ vi tính toán chỉ báo kỹ thuật SSOT và quản lý camera. |
| `@vninvestcharts/engine-react` | Các hook và bindings liên kết tầng React với động cơ kết xuất đồ họa lõi. |

---

## Giấy phép & Bản quyền sở hữu

Phát hành theo **Apache License 2.0**.
Bản quyền © 2026 Phạm Việt Dũng.
Xem [LICENSE](./LICENSE) để biết điều khoản đầy đủ và [NOTICE.md](./NOTICE.md) cho các
tác phẩm bên thứ ba được đóng gói.

Widget đóng gói `@vninvestcharts/engine-core`, `-engine-drawing` và `-engine-react`
(tất cả Apache-2.0), vốn chứa một bản fork được kiểm soát của KLineCharts (Apache-2.0).

