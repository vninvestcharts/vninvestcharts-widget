# VNInvestCharts Widget — Hướng Dẫn Nhúng / Embedding Guide

> Hướng dẫn toàn diện tích hợp **VNInvestCharts Widget** vào mọi nền tảng web.
> Comprehensive guide for embedding **VNInvestCharts Widget** into any web platform.

---

## 1. Ba Phương Thức Nhúng / Three Delivery Modes

| Chế độ / Mode | Bundle | React Host | CSS Isolation | Use Case |
|---|---|---|---|---|
| **ESM (React)** | `dist/index.js` | Bắt buộc (React 18/19) | CSS file / Shadow DOM | Ứng dụng React SPA, Next.js, Vite |
| **IIFE (Script Tag)** | `dist/vninvestchart.iife.js` | Không cần (bundle sẵn) | Shadow DOM tự động | HTML thuần, WordPress, Webflow, PHP |
| **Iframe (Sandboxed)** | `dist/iframe/index.html` | Không cần | Iframe sandbox + Host SDK postMessage | Nhúng bên thứ 3, Ngân hàng, Security cao |

---

## 2. ESM Mode (React Application)

### Cài đặt / Installation

```bash
npm install vninvestcharts-widget
# hoặc yarn add / pnpm add
```

### Sử dụng Single-Chart (`VNInvestCharts`)

```tsx
import React from 'react';
import { VNInvestCharts } from 'vninvestcharts-widget';
import 'vninvestcharts-widget/dist/index.css';

export function ChartPage() {
  return (
    <div style={{ width: '100%', height: '600px' }}>
      <VNInvestCharts
        symbol="VCB"
        timeframe="1D"
        theme="dark"
        locale="vi"
        showHeader={true}
        showToolbar={true}
        onSymbolChange={(s) => console.log('Symbol changed:', s)}
      />
    </div>
  );
}
```

### Sử dụng Multi-Chart Workspace (`VNInvestMultiCharts`)

```tsx
import React from 'react';
import { VNInvestMultiCharts } from 'vninvestcharts-widget';
import 'vninvestcharts-widget/dist/index.css';

export function MultiChartPage() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <VNInvestMultiCharts
        layout={{ rows: 2, cols: 2 }}
        charts={[{ id: "chart-1", symbol: "FPT", timeframe: "1D" }]}
        syncVisibleRange={true}
        syncCrosshair={true}
        syncTime={true}
        syncTimeframe={true}
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

## 3. IIFE Mode (Script Tag — Bất kỳ website nào)

Chế độ IIFE nhúng biểu đồ qua một thẻ `<script>` duy nhất, không yêu cầu React hay build tool. Mặc định tự tạo **Shadow DOM** để cách ly 100% CSS.

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Biểu đồ chứng khoán VNInvest</title>
</head>
<body>
  <div id="chart-container" style="width: 100%; height: 650px;"></div>

  <!-- CDN Script Tag -->
  <script src="https://cdn.jsdelivr.net/npm/vninvestcharts-widget/dist/vninvestchart.iife.js"></script>
  <script>
    const { mount, unmount, widgetRef } = window.VNInvestCharts.mount({
      container: document.getElementById('chart-container'),
      props: {
        symbol: 'FPT',
        timeframe: '1D',
        theme: 'dark',
        locale: 'vi',
      },
      useShadowDOM: true, // Cô lập CSS tuyệt đối
    });

    // Điều khiển imperative sau khi mount
    // widgetRef.current?.setSymbol('SSI');
    // widgetRef.current?.setTimeframe('1H');
    // widgetRef.current?.toggleTheme();
  </script>
</body>
</html>
```

---

## 4. Iframe Mode (Sandbox cách ly tối đa)

Dành cho các hệ thống khắt khe về bảo mật (CSP nghiêm ngặt, ngân hàng, đối tác bên thứ ba) thông qua Host SDK giao tiếp 2 chiều:

```html
<iframe
  id="chart-iframe"
  src="https://your-domain.com/dist/iframe/index.html"
  style="width: 100%; height: 600px; border: none;"
></iframe>

<script type="module">
  import { createVNInvestChartsHost } from 'vninvestcharts-widget/iframe-host';

  const hostSDK = await createVNInvestChartsHost({
    iframe: document.getElementById('chart-iframe'),
  });

  const controller = hostSDK.getController();
  await controller.initialize({
    symbol: 'HPG',
    timeframe: '1D',
    theme: 'dark',
  });

  // Lắng nghe sự kiện từ iframe
  controller.on("event:symbolChanged", (payload) => console.log('Iframe symbol:', payload.symbol));
</script>
```

---

## 5. Pluggable Data Adapter (`StockDataAdapter`)

Widget không phụ thuộc vào bất kỳ backend nào. Bạn có thể cấp dữ liệu từ REST API, WebSocket, static data, hoặc backend tùy chỉnh thông qua interface `StockDataAdapter`:

```typescript
import type { StockDataAdapter, OHLCVBar } from 'vninvestcharts-widget/types';

export const customMarketAdapter: StockDataAdapter = {
  fetchBarsBefore: async (symbol, timeframe, beforeDate, limit): Promise<OHLCVBar[]> => {
    const res = await fetch(
      `/api/kline?symbol=${symbol}&tf=${timeframe}&before=${beforeDate.getTime()}&limit=${limit}`
    );
    const data = await res.json();
    return data.map((item: any) => ({
      date: new Date(item.time),
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
    }));
  },

  fetchBarsInRange: async (symbol, timeframe, fromDate, toDate): Promise<OHLCVBar[]> => {
    const res = await fetch(
      `/api/kline?symbol=${symbol}&tf=${timeframe}&from=${fromDate.getTime()}&to=${toDate.getTime()}`
    );
    return res.json();
  },
};
```


