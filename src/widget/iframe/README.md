# VNInvestCharts Iframe Embedding SDK

This package provides a secure, type-safe way to embed VNInvestCharts widget in an iframe with full Host ↔ Iframe communication via postMessage.

## Features

- **Secure postMessage communication** with origin validation
- **Type-safe API** with full TypeScript support
- **Request/Response pattern** with correlation IDs
- **Event streaming** for real-time updates
- **CSP frame-ancestors protection** against clickjacking
- **Automatic reconnection** and lifecycle management

## Installation

```bash
npm install @vninvestcharts/widget
```

## Quick Start

### 1. Host Page (Parent)

```html
<iframe
	id="chart-frame"
	src="https://cdn.vninvestcharts.com/iframe/index.html"
	style="width: 100%; height: 600px; border: none;"
	allow="fullscreen"
></iframe>

<script type="module">
import { createVNInvestChartsHost } from '@vninvestcharts/widget/iframe-host';

const sdk = await createVNInvestChartsHost({
	iframe: document.getElementById('chart-frame'),
	onReady: (info) => console.log('Widget ready:', info),
	onEvent: (event) => console.log('Widget event:', event.type),
	onError: (error) => console.error('Widget error:', error),
});

const chart = sdk.getController();

// Initialize widget
await chart.initialize({
	symbol: 'VNM',
	timeframe: '1D',
	theme: 'dark',
	range: '6M',
	drawingUiEnabled: true,
});

// Listen for events
chart.on('event:visibleRangeChanged', (payload) => {
	console.log('Visible range:', payload);
});

// Later: change symbol
await chart.setSymbol('FPT');
</script>
```

### 2. Iframe Page (Widget)

The iframe runtime is built as `vninvestchart.iframe.js` and served from your CDN next to `index.html`.

```html
<!-- iframe.html -->
<!DOCTYPE html>
<html>
<head>
	<meta http-equiv="Content-Security-Policy" content="frame-ancestors 'self' https://yourdomain.com;">
</head>
<body>
	<div id="root"></div>
	<script src="vninvestchart.iframe.js"></script>
</body>
</html>
```

## Architecture

```
┌─────────────────────┐     postMessage      ┌─────────────────────┐
│     Host Page       │ ◄──────────────────► │    Iframe Widget    │
│                     │                      │                     │
│  VNInvestChartsHost │                      │  VNInvestCharts     │
│  SDK (Controller)   │  Commands + Events   │  (React App)        │
└─────────────────────┘                      └─────────────────────┘
```

## Message Protocol

All communication uses typed messages with correlation IDs:

```typescript
// Host → Iframe Command
{
	type: "request:setSymbol",
	correlationId: "12345-abcde",
	timestamp: 1234567890,
	origin: "https://app.example.com",
	payload: { symbol: "VNM" }
}

// Iframe → Host Response
{
	type: "response:setSymbol",
	correlationId: "12345-abcde",
	timestamp: 1234567891,
	origin: "https://cdn.vninvestcharts.com",
	payload: { success: true },
	success: true
}

// Iframe → Host Event (fire-and-forget)
{
	type: "event:visibleRangeChanged",
	correlationId: "12345-fghij",
	timestamp: 1234567892,
	origin: "https://cdn.vninvestcharts.com",
	payload: { startIndex: 100, endIndex: 200, ... }
}
```

## Security

### Origin Validation

Both Host and Iframe validate message origins against an allowlist:

```typescript
const sdk = await createVNInvestChartsHost({
	iframe: document.getElementById('chart-frame'),
	allowedOrigins: [
		'https://cdn.vninvestcharts.com',
		'https://charts.example.com',
	],
});
```

### CSP frame-ancestors

The iframe page **must** include a CSP header:

```html
<meta http-equiv="Content-Security-Policy" content="frame-ancestors 'self' https://yourdomain.com;">
```

Or better, set via HTTP header:
```
Content-Security-Policy: frame-ancestors 'self' https://yourdomain.com;
```

This prevents clickjacking by controlling which pages can embed the iframe.

## Adapter Limitation

**Important**: Custom Data Adapters (callback functions) **cannot** be serialized over postMessage.

Iframe mode only supports **built-in adapters** configured via JSON:

```typescript
await chart.initialize({
	symbol: 'VNM',
	timeframe: '1D',
	adapter: {
		type: 'vninvest',  // Built-in adapter type
		options: { apiKey: '...' },
		token: 'pat_...'
	}
});
```

Currently only the `vninvest` built-in adapter is implemented. Other adapter types fall back to `ADAPTER_UNAVAILABLE` handling in `iframeEntry.tsx:502-523`.

For custom adapters, use the IIFE script-tag embedding instead.

## API Reference

### Host SDK

```typescript
const sdk = await createVNInvestChartsHost(config);
const chart = sdk.getController();

// Widget control
await chart.initialize(config);
await chart.setSymbol(symbol);
await chart.setTimeframe(timeframe);
await chart.setRange(range);
await chart.setTheme('light' | 'dark');
await chart.setDrawings(drawings);
await chart.addDrawing(drawing);
await chart.removeDrawing(drawingId);
await chart.updateDrawing(drawingId, updates);
await chart.setActiveTool(tool);
const drawings = await chart.exportDrawings();
const range = await chart.getVisibleRange();
const snapshots = await chart.getPaneSnapshots();
const dataUrl = await chart.captureSnapshot('png', 0.9);
await chart.toggleFullscreen();
await chart.setLocale(locale);
await chart.setTimezone(timezone);
await chart.destroy();

// Event subscriptions
const unsubscribe = chart.on('event:visibleRangeChanged', (payload) => {});
const unsubscribe = chart.on('event:drawingsChanged', (payload) => {});
const unsubscribe = chart.on('event:activeToolChanged', (payload) => {});
const unsubscribe = chart.on('event:themeChanged', (payload) => {});
const unsubscribe = chart.on('event:error', (payload) => {});
const unsubscribe = chart.on('event:snapshotCaptured', (payload) => {});
const unsubscribe = chart.on('event:fullscreenToggled', (payload) => {});
const unsubscribe = chart.on('event:saasError', (payload) => {});
const unsubscribe = chart.on('event:adapterError', (payload) => {});

// Status
chart.isReady();
chart.getVersion();
```

### Configuration Types

```typescript
interface WidgetConfig {
	symbol: string;
	timeframe: string;
	theme?: 'light' | 'dark';
	adapter?: AdapterConfig;
	range?: string;
	locale?: string;
	drawingUiEnabled?: boolean;
	drawingActiveTool?: string;
	drawings?: readonly any[];
	drawingStorageKey?: string;
	showHeader?: boolean;
	showFooter?: boolean;
	showToolbar?: boolean;
	measurementEnabled?: boolean;
	showNonTradingDays?: boolean;
	timezone?: string;
	panes?: readonly any[];
	tenantPat?: string;
	debugFeatures?: Record<string, boolean>;
}

interface AdapterConfig {
	type: BuiltInAdapterType;
	options?: Record<string, string | number | boolean | null>;
	token?: string;
}

type BuiltInAdapterType =
	| 'vninvest'
	| 'tvfeed'
	| 'yahoo'
	| 'binance'
	| 'coinbase'
	| 'twelvedata'
	| 'alphavantage'
	| 'finnhub'
	| 'polygon';
```

## Building

```bash
# Build all bundles including iframe
npm run build

# Output:
# dist/vnstockchart.iife.js          - Script tag embedding
# dist/iframe/vnstockchart.iframe.js - Iframe embedding
# dist/iframe/iframe.html            - Iframe entry page
```

## Deployment

1. Serve `dist/iframe/` from your CDN
2. Configure CSP `frame-ancestors` header on iframe page
3. Update `DEFAULT_ALLOWED_ORIGINS` in `iframeBridge.ts` for your domains
4. Use Host SDK from parent page

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

Requires `postMessage`, `Promise`, `Map`, `Set` support.